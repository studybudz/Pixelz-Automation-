const express = require('express');
const router = express.Router();
const UserConfig = require('../models/UserConfig');
const { PromptTemplate } = require('../models/PromptTemplate');

router.get('/templates', async (req, res) => {
  try {
    const templates = await PromptTemplate.find({});
    return res.json({ success: true, templates });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/update', async (req, res) => {
  try {
    const { telegramUserId, isDataLearningEnabled, aiTone, customSystemPrompt } = req.body;
    
    const updatedConfig = await UserConfig.findOneAndUpdate(
      { telegramUserId },
      { 
        $set: { 
          isDataLearningEnabled, 
          aiTone, 
          customSystemPrompt 
        } 
      },
      { new: true }
    );

    return res.json({ success: true, config: updatedConfig });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;