// ============================
// index.js - Main Backend Server
// ============================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet'; // Adds security headers
import morgan from 'morgan'; // Logs requests
import { config } from 'dotenv'; // Named import for dotenv
import pool from './pool.js'; // PostgreSQL connection pool
import authRoutes from './routes/auth.js'; // Authentication routes
import transferRoutes from './routes/transfers.js'; // Money transfer routes
import cookieParser from 'cookie-parser';
import { sanitizeInput, generalRateLimit } from './middleware/security.js'; // Add your security file

// -----------------------------
// Load environment variables
// -----------------------------
config({ path: './.env' }); // Specify the .env file location

// Ensure critical env variables exist
  
if (!process.env.JWT_SECRET || !process.env.DATABASE_URL) {
  throw new Error('❌ Missing critical environment variables: JWT_SECRET or DATABASE_URL');
}
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`📂 Loaded env file: ${process.env.NODE_ENV === 'production' ? '.env.production' : '.env'}`);
console.log(`📋 Env check: JWT_SECRET=${!!process.env.JWT_SECRET}, DATABASE_URL=${!!process.env.DATABASE_URL}`);

// -----------------------------
// Initialize Express app
// -----------------------------
const app = express();

// -----------------------------
// Middleware setup
// -----------------------------
app.use(helmet()); // Protects against common attacks
app.use(express.json()); // Parse JSON request body
app.use(morgan('dev')); // Log requests in development
app.use(cookieParser()); // Parse cookies for credentials
app.use(sanitizeInput); // Prevent XSS/SQL injection
app.use(generalRateLimit); // Protect against brute force

// -----------------------------
// Configure CORS (frontend access control)
// -----------------------------
const allowedOrigins = [
  'http://localhost:3000',              // Local dev frontend
  'https://localhost:3000',             // Secure local dev
  /\.vercel\.app$/                      // Any deployed Vercel frontend
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Allow Postman/mobile clients
    if (
      allowedOrigins.some(pattern =>
        typeof pattern === 'string'
          ? pattern === origin
          : pattern.test(origin)
      )
    ) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

// -----------------------------
// Routes
// -----------------------------
app.use('/auth', authRoutes);        // Authentication endpoints
app.use('/transfers', transferRoutes); // Money transfer endpoints
// Health check (useful for monitoring / Vercel probes)
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()'); // Simple DB check
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// Development-only routes (never exposed in production!)
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  app.get('/setup-database', async (req, res) => {
    res.json({ message: 'Dev-only database setup endpoint' });
  });
  app.post('/fix-database', (req, res) => {
    res.json({ message: 'Dev-only schema fix endpoint' });
  });
  app.post('/fix-constraint', (req, res) => {
    res.json({ message: 'Dev-only constraint fix endpoint' });
  });
}

// -----------------------------
// Error handling middleware
// -----------------------------
app.use((req, res) => { // 404 handler
  res.status(404).json({ error: 'Route not found' });
});
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.stack); // Full stack in dev
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    error: isDev ? err.message : 'Internal server error'
  });
});

// -----------------------------
// Start server
// -----------------------------
const PORT = process.env.PORT || 5000; // Vercel provides PORT dynamically
const startServer = async () => {
  await testDatabaseConnection();
  const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
  return server;
};

const testDatabaseConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW(), version()');
    console.log('🔗 Database connected:', result.rows[0].now);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1); // Exit on failure in any env
  }
};

const server = startServer();

// -----------------------------
// Graceful shutdown
// -----------------------------
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    pool.end(err => {
      if (err) console.error('❌ Error closing DB pool:', err);
      process.exit(0);
    });
  });
});

process.on('uncaughtException', err => {
  console.error('❌ Uncaught exception:', err);
  process.exit(1); // Exit immediately (avoid unknown state)
});