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

  await ctx.reply(
    `Welcome to *Pixelz Automation*\n\n` +
    `Deploying AI pipeline structures across connected business endpoints.\n\n` +
    `[Open Dashboard](${process.env.WEBAPP_URL})`,
    { parse_mode: 'Markdown' }
  );
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