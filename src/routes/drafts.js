const express = require('express');
const router = express.Router();
const DraftQueue = require('../models/DraftQueue');
const bot = require('../services/telegramBot');

router.get('/:userId', async (req, res) => {
  try {
    const drafts = await DraftQueue.find({ 
      telegramUserId: req.params.userId, 
      status: 'pending_approval' 
    }).sort({ createdAt: -1 });
    return res.json({ success: true, drafts });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/action', async (req, res) => {
  try {
    const { draftId, action, modifiedText } = req.body;
    const draft = await DraftQueue.findById(draftId);

    if (!draft || draft.status !== 'pending_approval') {
      return res.status(404).json({ success: false, error: 'Draft record is unavailable or processed' });
    }

    if (action === 'approved') {
      const finalReply = modifiedText || draft.aiSuggestedReply;
      await bot.api.sendMessage(draft.customerChatId, finalReply, {
        business_connection_id: draft.businessConnectionId
      });
      draft.status = 'approved';
      draft.aiSuggestedReply = finalReply;
    } else {
      draft.status = 'rejected';
    }

    await draft.save();
    return res.json({ success: true, draft });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;