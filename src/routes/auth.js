const express = require('express');
const router = express.Router();
const { verifyTelegramAuth } = require('../utils/cryptoAuth');
const UserConfig = require('../models/UserConfig');

router.post('/verify', async (req, res) => {
  try {
    const { initData } = req.body;
    const authResult = verifyTelegramAuth(initData, process.env.TELEGRAM_BOT_TOKEN);

    if (!authResult.isValid || !authResult.user) {
      return res.status(401).json({ success: false, error: 'Cryptographic authentication failed' });
    }

    let config = await UserConfig.findOne({ telegramUserId: authResult.user.id });
    if (!config) {
      config = await UserConfig.create({
        telegramUserId: authResult.user.id,
        username: authResult.user.username || ''
      });
    }

    return res.json({ success: true, config });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/bootstrap', async (req, res) => {
  try {
    if (process.env.ALLOW_WEBAPP_DEMO === 'false') {
      return res.status(403).json({ success: false, error: 'Demo access is disabled' });
    }

    const telegramUserId = Number(process.env.DEMO_WEBAPP_USER_ID || 999999);
    const username = process.env.DEMO_WEBAPP_USERNAME || 'demo_user';

    let config = await UserConfig.findOne({ telegramUserId });
    if (!config) {
      config = await UserConfig.create({
        telegramUserId,
        username,
        hasAcceptedTerms: false
      });
    }

    return res.json({
      success: true,
      demo: true,
      config
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
