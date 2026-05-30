const mongoose = require('mongoose');

const PromptTemplateSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  systemPrompt: { type: String, required: true }
});

const PromptTemplate = mongoose.model('PromptTemplate', PromptTemplateSchema);

const seedTemplates = async () => {
  try {
    const presets = [
      {
        id: 'ecommerce_support',
        title: 'E-Commerce Support',
        description: 'Designed for managing orders, shipping concerns, returns, and inventory queries.',
        systemPrompt: 'You are an elite E-Commerce Support agent. Provide empathetic, accurate, and concise tracking details, solution paths, and checkout guidance.'
      },
      {
        id: 'corporate_lead_gen',
        title: 'Corporate Lead Gen',
        description: 'Qualifies business opportunities and captures relevant corporate client data points.',
        systemPrompt: 'You are an aggressive yet highly sophisticated corporate lead generator. Direct queries toward scheduling consultation calls, assessing budget alignment, and establishing operational scale.'
      },
      {
        id: 'appointment_setter',
        title: 'Appointment Setter',
        description: 'Optimized to look for specific booking parameters and handle availability objections.',
        systemPrompt: 'You are a streamlined calendar coordination assistant. Focus on securing micro-commitments, validating time zones, and closing scheduling openings.'
      }
    ];

    for (const preset of presets) {
      await PromptTemplate.updateOne({ id: preset.id }, { $set: preset }, { upsert: true });
    }
    console.log('[System Initialization]: Database Prompt Templates seeded successfully.');
  } catch (error) {
    console.error(`[Seeding Error]: Failed to write configurations: ${error.message}`);
  }
};

module.exports = { PromptTemplate, seedTemplates };