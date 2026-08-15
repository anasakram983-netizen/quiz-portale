require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { initDatabase } = require('./server/database');
const { sanitizeInputs } = require('./server/middleware/auth');

const authRoutes = require('./server/routes/authRoutes');
const quizRoutes = require('./server/routes/quizRoutes');
const questionRoutes = require('./server/routes/questionRoutes');
const resultRoutes = require('./server/routes/resultRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Auto-initialize DB middleware (for Vercel serverless cold starts)
let dbInitPromise = null;
app.use(async (req, res, next) => {
  try {
    if (!dbInitPromise) {
      dbInitPromise = initDatabase();
    }
    await dbInitPromise;
  } catch (err) {
    console.error('Database init error:', err);
  }
  next();
});

// Security Middlewares
app.use(helmet({
  contentSecurityPolicy: false, // Allowed inline styles/scripts for demo flexibility
}));
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeInputs);

// Serve Static Frontend Files & JS Directory Alias
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/css/js', express.static(path.join(__dirname, 'js')));
app.use(express.static(path.join(__dirname)));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/results', resultRoutes);

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'QuizPortal Backend API is running securely! 🚀' });
});

// Fallback to index.html for root navigation if static file not explicitly named
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize Database & Start Server for local execution
async function startServer() {
  try {
    await initDatabase();
    if (require.main === module) {
      app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`🎯 QuizPortal Backend API running on http://localhost:${PORT}`);
        console.log(`🛡️  Security: JWT Auth, Bcrypt Hashing, Anti-Cheat Active`);
        console.log(`====================================================`);
      });
    }
  } catch (err) {
    console.error('Failed to start server:', err);
  }
}

startServer();

module.exports = app;
