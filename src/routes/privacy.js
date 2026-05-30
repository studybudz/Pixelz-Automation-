const express = require('express');
const router = express.Router();
const UserConfig = require('../models/UserConfig');

router.post('/accept', async (req, res) => {
  try {
    const { telegramUserId } = req.body;
    
    const updatedConfig = await UserConfig.findOneAndUpdate(
      { telegramUserId },
      { 
        $set: { 
          hasAcceptedTerms: true,
          acceptedTermsAt: new Date()
        } 
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (!updatedConfig) {
      return res.status(404).json({ success: false, error: 'User configuration profile missing' });
    }

    return res.json({ success: true, config: updatedConfig });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
