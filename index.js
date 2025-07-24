// index.js - HawalaSend Backend (CORS + Security Fixed ✅)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');

const authRoutes = require('./routes/auth');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Step 1: Trust Proxy (for deployments like Render or Heroku)
app.set('trust proxy', 1);

// ✅ Step 2: CORS Configuration (Only allow your frontend domains)
// ✅ Step 2: Secure CORS Configuration
// FRONTEND_URLS should be comma-separated like:
// https://hawalasend.vercel.app, http://localhost:3000

const allowedOrigins = process.env.FRONTEND_URLS?.split(',').map(origin => origin.trim()) || [];

console.log('✅ Allowed Origins:', allowedOrigins);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true); // Allow if in whitelist or if origin is undefined (Postman, curl)
    } else {
      console.error('❌ CORS blocked origin:', origin);
      callback(new Error('CORS policy does not allow this origin.'));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

// ✅ Step 3: Security Headers with Helmet
app.use(helmet());

// ✅ Step 4: Rate Limiting (max 100 requests per 15 mins per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
});
app.use(limiter);

// ✅ Step 5: Serve Public Files (for manifest.json, service-worker.js, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Step 6: Body Parsers (JSON and URL-encoded)
app.use(express.json({ limit: '10kb', strict: true }));
app.use(express.urlencoded({ extended: true }));

// ✅ Step 7: Simple Request Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ✅ Step 8: Public Routes (like /auth/login, /auth/register)
app.use('/auth', authRoutes);

// ✅ Step 9: Health Check Route
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ✅ Step 10: 404 Handler for Unknown Routes
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ✅ Step 11: Global Error Handler
app.use(errorHandler);

// 🔥 CRITICAL FIX: Railway needs 0.0.0.0 binding
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log("🚀 HawalaSend backend server running...");
  console.log(`• Port: ${PORT}`);
  console.log(`• Host: 0.0.0.0 (Railway compatible)`);
  console.log(`• Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`• Database: ${process.env.DB_NAME}`);
});

// ✅ Database Connection Check (moved after server start)
const pool = require('./pool');

pool.query('SELECT NOW()')
  .then(res => {
    console.log('✅ DB Connected:', res.rows[0]);
  })
  .catch(err => {
    console.error('❌ DB connection failed:', err.message);
    // Don't exit process here - let Railway handle it
  });

// ✅ Step 13: Graceful Shutdown
const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('✅ Server closed gracefully');
    if (pool && pool.end) {
      pool.end().then(() => {
        console.log('✅ Database connections closed');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
  // Don't shutdown on unhandled rejection in production
  if (process.env.NODE_ENV !== 'production') {
    shutdown('UNHANDLED_REJECTION');
  }
});
