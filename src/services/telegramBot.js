const { Bot } = require('grammy');
const UserConfig = require('../models/UserConfig');
const DraftQueue = require('../models/DraftQueue');
const { generateSmartReply } = require('./geminiService');

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  throw new Error('TELEGRAM_BOT_TOKEN is required');
}

const bot = new Bot(botToken);
let botUsername = process.env.TELEGRAM_BOT_USERNAME || '';

const DEFAULT_REPLY = 'Thanks for reaching out. A human agent will review this shortly.';

bot.catch((err) => {
  console.error('[Telegram Bot Error]', err.error || err);
});

const normalizeArray = (value, fallback = []) => {
  if (!Array.isArray(value) || value.length === 0) {
    return fallback;
  }

  return value;
};

const matchesKeywordReply = (text, customKeywordReplies = []) => {
  const normalizedText = String(text || '').toLowerCase();

  for (const pair of customKeywordReplies) {
    const keyword = String(pair?.keyword || '').trim().toLowerCase();
    const reply = String(pair?.reply || '').trim();

    if (keyword && reply && normalizedText.includes(keyword)) {
      return reply;
    }
  }

  return null;
};

const getKeywordRoute = (text, routingKeywords = []) => {
  const input = String(text || '').toLowerCase();

  if (routingKeywords.some((keyword) => input.includes(keyword.toLowerCase()))) {
    return 'escalation';
  }

  if (input.includes('human') || input.includes('agent') || input.includes('help') || input.includes('live support')) {
    return 'escalation';
  }

  if (input.includes('price') || input.includes('cost') || input.includes('pricing')) return 'pricing';
  if (input.includes('return') || input.includes('refund')) return 'faq';
  return null;
};

const isWithinBusinessHours = (config) => {
  const hours = config.businessHours || {};
  const activeDays = normalizeArray(config.automationDays, [0, 1, 2, 3, 4, 5, 6]);
  const now = new Date();

  if (!activeDays.includes(now.getDay())) {
    return false;
  }

  const start = Number.isFinite(hours.start) ? hours.start : 0;
  const end = Number.isFinite(hours.end) ? hours.end : 24;
  const hour = now.getHours();
  return hour >= start && hour < end;
};

const buildGuestResult = (text) => ({
  type: 'article',
  id: `guest-${Date.now()}`,
  title: 'AI reply',
  input_message_content: {
    message_text: text
  }
});

const sendReply = async ({ ctx, customerChatId, businessConnectionId, guestQueryId, text }) => {
  if (guestQueryId) {
    try {
      if (typeof ctx.api.answerGuestQuery === 'function') {
        await ctx.api.answerGuestQuery({
          guest_query_id: guestQueryId,
          result: buildGuestResult(text)
        });
      } else {
        await ctx.api.raw.answerGuestQuery({
          guest_query_id: guestQueryId,
          result: buildGuestResult(text)
        });
      }
      return;
    } catch (error) {
      console.warn('[Guest Reply Fallback]', error.message);
    }
  }

  if (businessConnectionId && customerChatId) {
    await ctx.api.sendMessage(customerChatId, text, {
      business_connection_id: businessConnectionId
    });
    return;
  }

  await ctx.reply(text);
};

const persistDraft = async ({
  config,
  customerChatId,
  businessConnectionId,
  customerName,
  incomingText,
  aiResult
}) => {
  await DraftQueue.create({
    telegramUserId: config.telegramUserId,
    customerChatId,
    businessConnectionId,
    customerName,
    incomingMessage: incomingText,
    aiSuggestedReply: aiResult.suggestedReply,
    category: aiResult.category
  });
};

const findActiveConfig = async ({ telegramUserId, businessConnectionId }) => {
  if (businessConnectionId) {
    const businessConfig = await UserConfig.findOne({ businessConnectionId });
    if (businessConfig && businessConfig.hasAcceptedTerms) {
      return businessConfig;
    }
  }

  if (telegramUserId) {
    const directConfig = await UserConfig.findOne({ telegramUserId });
    if (directConfig && directConfig.hasAcceptedTerms) {
      return directConfig;
    }
  }

  return UserConfig.findOne({ hasAcceptedTerms: true }).sort({ updatedAt: -1 });
};

const isReplyWindowOpen = (config) => {
  const mode = config.replyWindowMode || 'draft';
  if (mode === 'both') {
    return true;
  }

  const withinHours = isWithinBusinessHours(config);
  if (mode === 'online') {
    return withinHours;
  }

  if (mode === 'offline') {
    return !withinHours;
  }

  return false;
};

const processIncomingMessage = async ({
  ctx,
  telegramUserId,
  incomingText,
  customerChatId,
  customerName,
  businessConnectionId = '',
  guestQueryId = '',
  businessUserId = null,
  allowDrafts = true
}) => {
  const config = await findActiveConfig({ telegramUserId, businessConnectionId });

  if (!config || !config.hasAcceptedTerms) {
    return;
  }

  if (config.pausedUntil && config.pausedUntil > new Date()) {
    return;
  }

  const customKeywordReply = matchesKeywordReply(incomingText, config.customKeywordReplies);
  if (customKeywordReply) {
    await sendReply({
      ctx,
      customerChatId,
      businessConnectionId,
      guestQueryId,
      text: customKeywordReply
    });
    return;
  }

  const replyWindowOpen = isReplyWindowOpen(config);
  const route = getKeywordRoute(incomingText, config.routingKeywords);
  if (route === 'escalation') {
    await UserConfig.updateOne(
      { telegramUserId: config.telegramUserId },
      { $set: { pausedUntil: new Date(Date.now() + 60 * 60 * 1000) } }
    );

    if (businessConnectionId) {
      await ctx.api.sendMessage(
        config.telegramUserId,
        `Manual handoff triggered for ${customerName}. The chat is paused for one hour.`
      );
    } else {
      await sendReply({
        ctx,
        customerChatId,
        businessConnectionId,
        guestQueryId,
        text: 'Thanks for reaching out. A human agent will jump in shortly.'
      });
    }
    return;
  }

  if (!replyWindowOpen && config.isAwayMessageEnabled && config.awayMessageText) {
    await sendReply({
      ctx,
      customerChatId,
      businessConnectionId,
      guestQueryId,
      text: config.awayMessageText
    });
    return;
  }

  const aiResult = await generateSmartReply(
    incomingText,
    config.aiTone,
    config.customSystemPrompt,
    customerName
  );

  const suggestedReply = aiResult.suggestedReply || DEFAULT_REPLY;
  const automationMode = config.automationMode || 'draft';
  const isAutoMode = automationMode === 'auto';
  const isHybridMode = automationMode === 'hybrid';
  const allowedCategories = normalizeArray(config.autoReplyCategories, ['faq', 'pricing']);
  const categoryAllowed = allowedCategories.includes(aiResult.category);
  const canAutoReply = replyWindowOpen && categoryAllowed && (isAutoMode || (isHybridMode && !aiResult.isEscalationRequired));
  const shouldDraft = allowDrafts && (automationMode === 'draft' || !replyWindowOpen || !canAutoReply) && businessConnectionId;

  if (shouldDraft) {
    await persistDraft({
      config,
      customerChatId,
      businessConnectionId,
      customerName,
      incomingText,
      aiResult: {
        category: aiResult.category || 'custom_inquiry',
        suggestedReply
      }
    });

    await ctx.api.sendMessage(
      config.telegramUserId,
      `New draft reply generated for ${customerName}.\n\nIncoming: ${incomingText}\n\nReview the response in the dashboard.`
    );
    return;
  }

  await sendReply({
    ctx,
    customerChatId,
    businessConnectionId,
    guestQueryId,
    text: suggestedReply
  });
};

bot.command('start', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || '';
  botUsername = ctx.me?.username || botUsername;

  let config = await UserConfig.findOne({ telegramUserId: userId });
  if (!config) {
    config = await UserConfig.create({ telegramUserId: userId, username });
  }

  await ctx.reply(
    [
      'Pixelz Automation is ready.',
      '',
      'Connect the bot from Telegram Business or tag it in chats to let it respond.',
      'Open the dashboard to tune automation mode, away replies, and keyword routing.'
    ].join('\n'),
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Open Dashboard', web_app: { url: process.env.WEBAPP_URL } }]
        ]
      }
    }
  );
});

bot.command('status', async (ctx) => {
  const config = await UserConfig.findOne({ telegramUserId: ctx.from.id });
  if (!config) {
    await ctx.reply('No automation profile found yet. Use /start first.');
    return;
  }

  await ctx.reply(
    [
      `Mode: ${config.automationMode || 'draft'}`,
      `Accepted terms: ${config.hasAcceptedTerms ? 'yes' : 'no'}`,
      `Business linked: ${config.businessConnectionId ? 'yes' : 'no'}`,
      `Away reply: ${config.isAwayMessageEnabled ? 'on' : 'off'}`
    ].join('\n')
  );
});

bot.on('business_connection', async (ctx) => {
  const connection = ctx.businessConnection;
  if (!connection) {
    return;
  }

  await UserConfig.updateOne(
    { telegramUserId: connection.user.id },
    {
      $set: {
        businessConnectionId: connection.id,
        businessConnectionUserId: connection.user.id,
        businessConnectionUserChatId: connection.user_chat_id || null,
        businessConnectionRights: connection.rights || {},
        businessConnectionEnabled: Boolean(connection.is_enabled)
      }
    },
    { upsert: true }
  );
});

bot.use(async (ctx, next) => {
  if (ctx.update?.guest_message) {
    const guestMessage = ctx.update.guest_message;
    const text = guestMessage.text || guestMessage.caption || '';

    if (!text) {
      return;
    }

    const customerName = guestMessage.from?.first_name || guestMessage.from?.username || 'Guest';
    await processIncomingMessage({
      ctx,
      telegramUserId: guestMessage.from?.id || guestMessage.chat?.id,
      incomingText: text,
      customerChatId: guestMessage.chat?.id,
      customerName,
      guestQueryId: guestMessage.guest_query_id || '',
      allowDrafts: false
    });
    return;
  }

  if (ctx.update?.business_message) {
    const businessMessage = ctx.update.business_message;
    const text = businessMessage.text || businessMessage.caption || '';

    if (!text) {
      return;
    }

    const businessConnectionId = businessMessage.business_connection_id || ctx.businessConnectionId || '';
    const customerChatId = businessMessage.chat?.id;
    const customerName = businessMessage.from?.first_name || businessMessage.from?.username || 'Customer';
    const isBusinessOwnerMessage = businessMessage.from?.id && businessMessage.from.id === businessMessage.chat?.id;

    if (isBusinessOwnerMessage) {
      await UserConfig.updateOne(
        { businessConnectionId },
        { $set: { pausedUntil: new Date(Date.now() + 30 * 60 * 1000) } }
      );
      return;
    }

    const config = await UserConfig.findOne({ businessConnectionId });
    if (config?.businessConnectionUserId && businessMessage.from?.id === config.businessConnectionUserId) {
      await UserConfig.updateOne(
        { telegramUserId: config.telegramUserId },
        { $set: { pausedUntil: new Date(Date.now() + 30 * 60 * 1000) } }
      );
      return;
    }

    await processIncomingMessage({
      ctx,
      telegramUserId: config?.telegramUserId || businessMessage.from?.id,
      incomingText: text,
      customerChatId,
      customerName,
      businessConnectionId,
      businessUserId: config?.businessConnectionUserId,
      allowDrafts: true
    });
    return;
  }

  return next();
});

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;
  const chatType = ctx.chat?.type;
  const hasBotUsername = Boolean(botUsername);

  if (text.startsWith('/')) {
    return;
  }

  const shouldHandle =
    ((chatType === 'group' || chatType === 'supergroup') && hasBotUsername
      ? text.toLowerCase().includes(`@${botUsername.toLowerCase()}`) || Boolean(ctx.message.reply_to_message?.from?.is_bot)
      : false);

  if (!shouldHandle) {
    return;
  }

  const customerName = ctx.from.first_name || ctx.from.username || 'User';
  const telegramUserId = ctx.from.id;
  const strippedText = hasBotUsername
    ? text.replace(new RegExp(`@${botUsername}`, 'ig'), '').trim()
    : text;

  await processIncomingMessage({
    ctx,
    telegramUserId,
    incomingText: strippedText || text,
    customerChatId: ctx.chat.id,
    customerName,
    allowDrafts: false
  });
});

bot.api.getMe()
  .then((me) => {
    botUsername = me.username || botUsername;
  })
  .catch((error) => {
    console.warn('[Telegram Metadata Warning]', error.message);
  });

module.exports = bot;
