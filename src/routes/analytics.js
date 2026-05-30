const express = require('express');
const router = express.Router();
const DraftQueue = require('../models/DraftQueue');

const formatMinutes = (minutes) => {
  if (!Number.isFinite(minutes) || minutes < 1) {
    return '<1m';
  }

  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }

  return `${(minutes / 60).toFixed(1)}h`;
};

router.get('/:userId', async (req, res) => {
  try {
    const drafts = await DraftQueue.find({ telegramUserId: req.params.userId }).sort({ createdAt: -1 });
    const totalInteractions = drafts.length;
    const approved = drafts.filter((draft) => draft.status === 'approved').length;
    const rejected = drafts.filter((draft) => draft.status === 'rejected').length;
    const pending = drafts.filter((draft) => draft.status === 'pending_approval').length;
    const timedResponses = drafts
      .filter((draft) => draft.status !== 'pending_approval' && draft.createdAt && draft.updatedAt)
      .map((draft) => (new Date(draft.updatedAt).getTime() - new Date(draft.createdAt).getTime()) / 60000)
      .filter((value) => Number.isFinite(value) && value >= 0);

    const avgResponseTime = timedResponses.length
      ? formatMinutes(timedResponses.reduce((sum, value) => sum + value, 0) / timedResponses.length)
      : '<1m';

    const resolutionRate = totalInteractions
      ? Math.round((approved / totalInteractions) * 100)
      : 0;

    const escalationRate = totalInteractions
      ? Math.round((rejected / totalInteractions) * 100)
      : 0;

    return res.json({
      success: true,
      stats: {
        resolutionRate,
        avgResponseTime,
        totalInteractions,
        escalationRate,
        activeThreads: pending
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
