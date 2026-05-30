require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { seedTemplates } = require('./models/PromptTemplate');
const bot = require('./services/telegramBot');

const authRoutes = require('./routes/auth.js');
const privacyRoutes = require('./routes/privacy.js');
const draftsRoutes = require('./routes/drafts.js');
const analyticsRoutes = require('./routes/analytics.js');
const configRoutes = require('./routes/config.js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

app.use('/api/auth', authRoutes);
app.use('/api/privacy', privacyRoutes);
app.use('/api/drafts', draftsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/config', configRoutes);

const isServerlessRuntime = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const shouldSkipBoot = process.env.SKIP_APP_BOOT === 'true';
const webhookPath = '/api/telegram/webhook';

const trimTrailingSlash = (value = '') => String(value).replace(/\/+$/, '');

const getWebhookUrl = () => {
  const explicitWebhook = process.env.TELEGRAM_WEBHOOK_URL;
  const webAppUrl = process.env.WEBAPP_URL;
  const shouldPreferWebhook = Boolean(explicitWebhook) || isServerlessRuntime || process.env.NODE_ENV === 'production';
  const baseUrl = shouldPreferWebhook && webAppUrl
    ? explicitWebhook || `${trimTrailingSlash(webAppUrl)}${webhookPath}`
    : explicitWebhook || '';
  return trimTrailingSlash(baseUrl);
};

const ensureTelegramWebhook = async () => {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    return { configured: false };
  }

  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET || undefined;
  const webhookInfo = await bot.api.getWebhookInfo();

  if (webhookInfo.url !== webhookUrl) {
    await bot.api.setWebhook(webhookUrl, {
      secret_token: secretToken,
      drop_pending_updates: false
    });
  }

  return {
    configured: true,
    url: webhookUrl
  };
};

app.get('/api/system/status', async (req, res) => {
  try {
    const [me, webhookInfo] = await Promise.all([
      bot.api.getMe(),
      bot.api.getWebhookInfo()
    ]);

    return res.json({
      success: true,
      bot: {
        username: me.username,
        canConnectToBusiness: Boolean(me.can_connect_to_business),
        supportsGuestQueries: Boolean(me.supports_guest_queries)
      },
      webhook: webhookInfo
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/system/register-webhook', async (req, res) => {
  try {
    const result = await ensureTelegramWebhook();
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post(webhookPath, async (req, res) => {
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
  const receivedSecret = req.get('X-Telegram-Bot-Api-Secret-Token');

  if (secretToken && receivedSecret !== secretToken) {
    return res.sendStatus(403);
  }

  try {
    await bot.handleUpdate(req.body);
  } catch (error) {
    console.error('[Telegram Webhook Error]', error);
  }

  return res.sendStatus(200);
});

const bootSystem = async () => {
  await connectDB();
  await seedTemplates();

  const webhookUrl = getWebhookUrl();
  if (webhookUrl) {
    await ensureTelegramWebhook();
    console.log(`[Telegram Webhook Online]: ${webhookUrl}`);
  } else if (!isServerlessRuntime) {
    bot.start({
      onStart: (botInfo) => console.log(`[GrammY Bot Pipeline Online]: @${botInfo.username}`)
    }).catch((error) => {
      console.error('[Telegram Polling Error]', error);
    });
  } else {
    console.warn('[Telegram Bot Warning]: No webhook URL configured. Telegram updates will not arrive until webhook registration is completed.');
  }
};

if (!shouldSkipBoot) {
  bootSystem().catch((error) => {
    console.error('[System Boot Failure]', error);
    process.exit(1);
  });
}

if (!isServerlessRuntime && !shouldSkipBoot) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[Express Interface Matrix Online]: Running on port ${PORT}`);
  });
}

module.exports = app;
