require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { seedTemplates } = require('./models/PromptTemplate');
const bot = require('./services/telegramBot');

const authRoutes = require('./routes/auth.js');
const privacyRoutes = require('./routes/privacy.js');
const draftsRoutes = require('./routes/drafts.js');
const configRoutes = require('./routes/config.js');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Setup Routes
app.use('/api/auth', authRoutes);
app.use('/api/privacy', privacyRoutes);
app.use('/api/drafts', draftsRoutes);
app.use('/api/config', configRoutes);

const runSystemBoot = async () => {
  await connectDB();
  await seedTemplates();

  // Initialize Long Polling interface for Telegram Engine
  bot.start({
    onStart: (botInfo) => console.log(`[GrammY Bot Pipeline Online]: @${botInfo.username}`)
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[Express Interface Matrix Online]: Running on port ${PORT}`);
  });
};

runSystemBoot();