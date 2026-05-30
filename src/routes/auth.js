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

module.exports = router;