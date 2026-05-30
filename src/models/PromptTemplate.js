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
        title: 'Customer Support',
        description: 'Best for product questions, delivery updates, refunds, and general help.',
        systemPrompt: 'You are a friendly customer support assistant. Keep replies short, clear, and helpful. Explain delivery, refunds, order status, and general product questions in plain language.'
      },
      {
        id: 'corporate_lead_gen',
        title: 'Sales Assistant',
        description: 'Best for pricing requests, service questions, and lead capture.',
        systemPrompt: 'You are a polite sales assistant. Focus on pricing, service details, and booking a follow-up. Ask for only the key details needed to continue the conversation.'
      },
      {
        id: 'appointment_setter',
        title: 'Booking Assistant',
        description: 'Best for appointments, demos, consultations, and scheduling.',
        systemPrompt: 'You are a booking assistant. Help people choose a time, confirm availability, and keep the booking process simple and easy.'
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
