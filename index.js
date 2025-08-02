// index.js - HawalaSend Backend
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

// Trust proxy for Railway deployment
app.set('trust proxy', 1);

// CORS Configuration - FIXED
const allowedOrigins = process.env.FRONTEND_URLS?.split(',').map(origin => origin.trim()) || [
  'http://localhost:3000',
  'https://hawalasend.vercel.app'
];

console.log('✅ Allowed Origins:', allowedOrigins);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error('❌ CORS blocked origin:', origin);
      callback(new Error('CORS policy does not allow this origin.'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'x-api-version',
    'X-Requested-With',
    'x-request-timestamp', // FIXED: Added missing header
    'Accept',
    'Origin',
    'x-api-key',
    'x-client-version'
  ],
  exposedHeaders: [
    'Authorization',
    'x-request-id',
    'x-response-time'
  ],
  optionsSuccessStatus: 200 // Support legacy browsers
};

app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Security Headers - Enhanced
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false // Allow embedding for development
}));

// Rate Limiting - More flexible
const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message, code: 'RATE_LIMIT_EXCEEDED' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  }
});

// General API rate limiting
app.use(createRateLimit(15 * 60 * 1000, 100, 'Too many requests, please try again later'));

// Stricter rate limiting for auth routes
app.use('/auth', createRateLimit(15 * 60 * 1000, 20, 'Too many authentication attempts'));

// Body Parsers with better validation
app.use(express.json({ 
  limit: '10kb', 
  strict: true,
  type: ['application/json', 'text/plain']
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10kb',
  parameterLimit: 20
}));

// Request ID middleware for tracking
app.use((req, res, next) => {
  req.id = Math.random().toString(36).substring(7);
  res.setHeader('x-request-id', req.id);
  next();
});

// Enhanced Request Logger
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${ip} - ID: ${req.id}`);
  
  // Log body for POST requests (excluding sensitive data)
  if (req.method === 'POST' && req.body) {
    const logBody = { ...req.body };
    // Hide sensitive fields
    if (logBody.password) logBody.password = '***';
    if (logBody.confirmPassword) logBody.confirmPassword = '***';
    console.log(`[${req.id}] Request body:`, logBody);
  }
  
  next();
});

// Response time tracking
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    res.setHeader('x-response-time', `${duration}ms`);
    console.log(`[${req.id}] Response: ${res.statusCode} - ${duration}ms`);
  });
  
  next();
});

// Database connection is handled in pool.js (no need to test here)
const pool = require('./pool');

// Routes
app.use('/auth', authRoutes);

// Enhanced Health Check Route
app.get('/health', async (req, res) => {
  try {
    const dbStartTime = Date.now();
    const result = await pool.query('SELECT NOW() as current_time, version() as version');
    const dbResponseTime = Date.now() - dbStartTime;
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: '1.0.0',
      environment: process.env.NODE_ENV,
      database: {
        status: 'connected',
        responseTime: `${dbResponseTime}ms`,
        currentTime: result.rows[0].current_time,
        version: result.rows[0].version.split(' ')[0]
      },
      cors: {
        allowedOrigins: allowedOrigins.length
      }
    });
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: {
        status: 'disconnected',
        error: error.message
      }
    });
  }
});

// API Info Route - Enhanced
app.get('/', (req, res) => {
  res.json({
    name: 'HawalaSend API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    endpoints: {
      auth: {
        register: 'POST /auth/register',
        login: 'POST /auth/login',
        verify: 'GET /auth/verify-session'
      },
      health: 'GET /health',
      documentation: 'GET /'
    },
    cors: {
      enabled: true,
      allowedOrigins: allowedOrigins
    }
  });
});

// Catch-all for undefined routes
app.use('*', (req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Route not found',
    code: 'ROUTE_NOT_FOUND',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: ['/auth', '/health', '/'],
    timestamp: new Date().toISOString(),
    requestId: req.id
  });
});

// Global Error Handler
app.use(errorHandler);

// Start Server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log("🚀 HawalaSend backend server running...");
  console.log(`• Port: ${PORT}`);
  console.log(`• Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`• Database: ${process.env.PGDATABASE || 'Not configured'}`);
  console.log(`• CORS Origins: ${allowedOrigins.length} configured`);
  console.log("📡 Server ready to accept connections");
});

// Enhanced Graceful Shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  // Stop accepting new connections
  server.close(async () => {
    console.log('✅ HTTP server closed');
    
    try {
      // Close database connections
      await pool.end();
      console.log('✅ Database connections closed');
      
      // Exit successfully
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after 10s timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;
