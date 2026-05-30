const mongoose = require('mongoose');

const UserConfigSchema = new mongoose.Schema({
  telegramUserId: { type: Number, required: true, unique: true },
  username: { type: String, default: '' },
  automationMode: { type: String, enum: ['auto', 'draft', 'hybrid'], default: 'draft' },
  autoReplyCategories: { type: [String], default: ['faq', 'pricing'] },
  aiTone: { type: String, default: 'Professional' },
  customSystemPrompt: { type: String, default: '' },
  hasAcceptedTerms: { type: Boolean, default: false },
  acceptedTermsAt: { type: Date, default: null },
  isDataLearningEnabled: { type: Boolean, default: false },
  pausedUntil: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('UserConfig', UserConfigSchema);