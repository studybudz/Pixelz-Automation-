const { Bot } = require('grammy');
const UserConfig = require('../models/UserConfig');
const DraftQueue = require('../models/DraftQueue');
const { generateSmartReply } = require('./geminiService');

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

bot.command('start', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || '';

  let config = await UserConfig.findOne({ telegramUserId: userId });
  if (!config) {
    config = await UserConfig.create({ telegramUserId: userId, username });
  }

  const welcomeImage = 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=1000&auto=format&fit=crop';

  await ctx.replyWithPhoto(welcomeImage, {
    caption: 
      `🚀 *Pixelz Automation: AI Proxy Online*\n\n` +
      `High-performance AI pipeline architecture for your Telegram Business account.\n\n` +
      `🛠 *Mandatory Setup Instructions:*\n` +
      `To enable automated replies, you must link this bot:\n` +
      `1. Open *Settings* > *Telegram Business*\n` +
      `2. Tap *Chat Automation* > *Manage*\n` +
      `3. Add *@${ctx.me.username}* to the allowed list.\n\n` +
      `Use the button below to monitor drafts and configure your AI.`,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 Open Dashboard', web_app: { url: process.env.WEBAPP_URL } }]
      ]
    }
  });
});

// Intercept Outbound Content (Manual Takeover Detection)
bot.on('message:text', async (ctx, next) => {
  if (ctx.message.business_connection_id && ctx.message.from.id === ctx.chat.id) {
    const windowTime = new Date(Date.now() + 30 * 60 * 1000);
    await UserConfig.updateOne(
      { telegramUserId: ctx.from.id },
      { $set: { pausedUntil: windowTime } }
    );
    console.log(`[Manual Override Triggered]: Halted automated hooks for thread: ${ctx.chat.id}`);
  }
  await next();
});

// Business Logic Helpers
const isWithinBusinessHours = (config) => {
  if (!config.businessHours) return true;
  const now = new Date();
  const hour = now.getHours();
  return hour >= (config.businessHours.start || 0) && hour < (config.businessHours.end || 24);
};

const getKeywordRoute = (text) => {
  const input = text.toLowerCase();
  if (input.includes('human') || input.includes('agent') || input.includes('help')) return 'escalation';
  if (input.includes('price') || input.includes('cost')) return 'pricing';
  if (input.includes('return') || input.includes('refund')) return 'faq';
  return null;
};

// Intercept Inbound Business Data Stream
bot.on('business_message:text', async (ctx) => {
  const businessConnectionId = ctx.businessConnectionId;
  const incomingText = ctx.businessMessage.text;
  const customerChatId = ctx.businessMessage.chat.id;
  const customerName = ctx.businessMessage.from.first_name || 'Client';

  // Identify internal endpoint mapping via connected system
  const config = await UserConfig.findOne({ username: ctx.businessMessage.via_bot?.username }); 
  if (!config || !config.hasAcceptedTerms) return;

  // Enforce evaluation lockout checks
  if (config.pausedUntil && config.pausedUntil > new Date()) {
    console.log('[System Filter]: Bypassing processing sequence; automated timeline paused.');
    return;
  }

  // Execute Gemini contextual analytical rendering
  const aiResult = await generateSmartReply(incomingText, config.aiTone, config.customSystemPrompt);

  if (config.automationMode === 'auto' && config.autoReplyCategories.includes(aiResult.category)) {
    await bot.api.sendMessage(customerChatId, aiResult.suggestedReply, {
      business_connection_id: businessConnectionId
    });
    console.log(`[Automation Executed]: Sent reply to chat ${customerChatId}`);
  } else {
    await DraftQueue.create({
      telegramUserId: config.telegramUserId,
      customerChatId,
      businessConnectionId,
      customerName,
      incomingMessage: incomingText,
      aiSuggestedReply: aiResult.suggestedReply,
      category: aiResult.category
    });

    await bot.api.sendMessage(config.telegramUserId, 
      `📥 *New Draft Reply Generated*\n\n` +
      `*From:* ${customerName}\n` +
      `*Message:* "${incomingText}"\n` +
      `*AI Output:* "${aiResult.suggestedReply}"\n\n` +
      `Review this draft directly within your Mini App.`,
      { parse_mode: 'Markdown' }
    );
  }
});

module.exports = bot;