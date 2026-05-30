const mongoose = require('mongoose');

const KeywordReplySchema = new mongoose.Schema({
  keyword: { type: String, default: '' },
  reply: { type: String, default: '' }
}, { _id: false });

const UserConfigSchema = new mongoose.Schema({
  telegramUserId: { type: Number, required: true, unique: true },
  username: { type: String, default: '' },
  businessConnectionId: { type: String, default: '' },
  businessConnectionUserId: { type: Number, default: null },
  businessConnectionUserChatId: { type: Number, default: null },
  businessConnectionRights: { type: mongoose.Schema.Types.Mixed, default: {} },
  businessConnectionEnabled: { type: Boolean, default: false },
  automationMode: { type: String, enum: ['auto', 'draft', 'hybrid'], default: 'draft' },
  autoReplyCategories: { type: [String], default: ['faq', 'pricing'] },
  aiTone: { type: String, default: 'Professional' },
  customSystemPrompt: { type: String, default: '' },
  businessHours: {
    start: { type: Number, default: 0 },
    end: { type: Number, default: 24 }
  },
  automationDays: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
  replyWindowMode: { type: String, enum: ['draft', 'online', 'offline', 'both'], default: 'draft' },
  routingKeywords: { type: [String], default: ['human', 'agent', 'help'] },
  customKeywordReplies: { type: [KeywordReplySchema], default: [] },
  isAwayMessageEnabled: { type: Boolean, default: false },
  awayMessageText: { type: String, default: '' },
  hasAcceptedTerms: { type: Boolean, default: false },
  acceptedTermsAt: { type: Date, default: null },
  isDataLearningEnabled: { type: Boolean, default: false },
  pausedUntil: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('UserConfig', UserConfigSchema);
