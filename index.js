// index.js - Production-Ready Backend Server
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const authRoutes = require('./routes/auth');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

// =======================
// Security Middleware
// =======================
app.use(helmet()); // Security headers (XSS, HSTS, etc.)
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));

// =======================
// Rate Limiting
// =======================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests
  message: 'Too many requests, please try again later',
  standardHeaders: true
});
app.use(limiter);

// =======================
// Body Parsing
// =======================
app.use(express.json({ 
  limit: '10kb', // Prevent large payload attacks
  strict: true // Only accept arrays/objects
}));
app.use(express.urlencoded({ extended: true }));

// =======================
// Request Logging
// =======================
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// =======================
// Routes
// =======================
app.use('/auth', authRoutes);

// =======================
// Health Check
// =======================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// =======================
// Error Handling
// =======================
app.use((req, res, next) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use(errorHandler); // Your custom error handler

// =======================
// Server Startup
// =======================
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`• Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`• Database: ${process.env.DB_NAME}`);
});

// =======================
// Graceful Shutdown
// =======================
const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  shutdown('UNHANDLED_REJECTION');
});