const mongoose = require('mongoose');

const DraftQueueSchema = new mongoose.Schema({
  telegramUserId: { type: Number, required: true },
  customerChatId: { type: Number, required: true },
  businessConnectionId: { type: String, required: true },
  customerName: { type: String, default: 'Customer' },
  incomingMessage: { type: String, required: true },
  aiSuggestedReply: { type: String, required: true },
  category: { type: String, required: true },
  status: { type: String, enum: ['pending_approval', 'approved', 'rejected'], default: 'pending_approval' }
}, { timestamps: true });

module.exports = mongoose.model('DraftQueue', DraftQueueSchema);