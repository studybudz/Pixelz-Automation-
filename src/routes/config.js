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
    const {
      telegramUserId,
      isDataLearningEnabled,
      aiTone,
      customSystemPrompt,
      automationMode,
      autoReplyCategories,
      businessHours,
      automationDays,
      routingKeywords,
      customKeywordReplies,
      isAwayMessageEnabled,
      awayMessageText
    } = req.body;

    const normalizedCategories = Array.isArray(autoReplyCategories)
      ? autoReplyCategories.filter(Boolean)
      : undefined;

    const normalizedDays = Array.isArray(automationDays) && automationDays.length > 0
      ? automationDays.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      : [0, 1, 2, 3, 4, 5, 6];

    const normalizedRoutingKeywords = Array.isArray(routingKeywords)
      ? routingKeywords.map((keyword) => String(keyword).trim().toLowerCase()).filter(Boolean)
      : String(routingKeywords || '')
          .split(',')
          .map((keyword) => keyword.trim().toLowerCase())
          .filter(Boolean);

    const normalizedKeywordReplies = Array.isArray(customKeywordReplies)
      ? customKeywordReplies
          .map((pair) => ({
            keyword: String(pair.keyword || '').trim().toLowerCase(),
            reply: String(pair.reply || '').trim()
          }))
          .filter((pair) => pair.keyword && pair.reply)
      : [];

    const updatedConfig = await UserConfig.findOneAndUpdate(
      { telegramUserId },
      { 
        $set: { 
          isDataLearningEnabled, 
          aiTone, 
          customSystemPrompt,
          automationMode,
          businessHours: {
            start: Number(businessHours?.start ?? 0),
            end: Number(businessHours?.end ?? 24)
          },
          automationDays: normalizedDays,
          routingKeywords: normalizedRoutingKeywords,
          customKeywordReplies: normalizedKeywordReplies,
          isAwayMessageEnabled: Boolean(isAwayMessageEnabled),
          awayMessageText: String(awayMessageText || ''),
          ...(normalizedCategories ? { autoReplyCategories: normalizedCategories } : {})
        } 
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.json({ success: true, config: updatedConfig });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
