<<<<<<< HEAD
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

// ✅ Step 1: Trust Proxy (for deployments like Railway, Render or Heroku)
app.set('trust proxy', 1);

// ✅ Step 2: Secure CORS Configuration
// FRONTEND_URLS should be comma-separated like:
// https://hawalasend.vercel.app,http://localhost:3000
const allowedOrigins = process.env.FRONTEND_URLS?.split(',').map(origin => origin.trim()) || [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://hawalasend.vercel.app'
];

console.log('✅ Allowed Origins:', allowedOrigins);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error('❌ CORS blocked origin:', origin);
      callback(new Error('CORS policy does not allow this origin.'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count']
};

app.use(cors(corsOptions));

// ✅ Step 3: Security Headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false // Allow for Railway deployment
}));

// ✅ Step 4: Rate Limiting (max 100 requests per 15 mins per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: 15 * 60 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  }
});
app.use(limiter);

// ✅ Step 5: Serve Public Files (for manifest.json, service-worker.js, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Step 6: Body Parsers (JSON and URL-encoded)
app.use(express.json({ 
  limit: '10kb', 
  strict: true,
  type: 'application/json'
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10kb' 
}));

// ✅ Step 7: Enhanced Request Logger
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const userAgent = req.get('User-Agent') || 'Unknown';
  const ip = req.ip || req.connection.remoteAddress;
  
  console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${ip} - UA: ${userAgent.substring(0, 50)}`);
  
  // Log request body for POST/PUT (excluding sensitive data)
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    const safeBody = { ...req.body };
    if (safeBody.password) safeBody.password = '[REDACTED]';
    if (safeBody.confirmPassword) safeBody.confirmPassword = '[REDACTED]';
    console.log(`  Body:`, safeBody);
  }
  
  next();
});

// ✅ Step 8: Database Connection Check (moved here for early validation)
const { pool, testConnection } = require('./pool');

// Test database connection on startup
testConnection().then(isConnected => {
  if (!isConnected) {
    console.error('❌ Critical: Database connection failed on startup');
    if (process.env.NODE_ENV === 'production') {
      console.error('💥 Exiting due to database connection failure in production');
      process.exit(1);
    }
  }
}).catch(err => {
  console.error('❌ Database connection test failed:', err);
});

// ✅ Step 9: API Routes
app.use('/auth', authRoutes);

// ✅ Step 10: Health Check Route (Enhanced)
app.get('/health', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Test database connection
    const dbTest = await pool.query('SELECT NOW() as current_time');
    const dbResponseTime = Date.now() - startTime;
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      database: {
        status: 'connected',
        responseTime: `${dbResponseTime}ms`,
        currentTime: dbTest.rows[0].current_time
      },
      server: {
        port: PORT,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
        }
      }
    });
  } catch (dbError) {
    console.error('Health check database error:', dbError);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      database: {
        status: 'disconnected',
        error: dbError.message
      },
      server: {
        port: PORT,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
        }
      }
    });
  }
});

// ✅ Step 11: API Info Route
app.get('/', (req, res) => {
  res.json({
    name: 'HawalaSend API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/auth (POST /register, POST /login, POST /logout)',
      health: '/health (GET)',
    },
    documentation: 'https://github.com/your-repo/hawalasend-api'
  });
});

// ✅ Step 12: 404 Handler for Unknown Routes
app.use('*', (req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Route not found',
    code: 'ROUTE_NOT_FOUND',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// ✅ Step 13: Global Error Handler
app.use(errorHandler);

// 🔥 CRITICAL FIX: Railway needs 0.0.0.0 binding
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log("🚀 HawalaSend backend server running...");
  console.log(`• Port: ${PORT}`);
  console.log(`• Host: 0.0.0.0 (Railway compatible)`);
  console.log(`• Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`• CORS Origins: ${allowedOrigins.join(', ')}`);
  console.log(`• Database: ${process.env.PGDATABASE || 'Not configured'}`);
  console.log(`• JWT Secret: ${process.env.JWT_SECRET ? '✅ Configured' : '❌ Missing'}`);
  console.log("📡 Server ready to accept connections");
});

// ✅ Step 14: Graceful Shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  // Stop accepting new connections
  server.close(async () => {
    console.log('✅ HTTP server closed');
    
    try {
      // Close database connections
      if (pool && typeof pool.end === 'function') {
        await pool.end();
        console.log('✅ Database connections closed');
      }
      
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  console.error('Stack:', err.stack);
  
  if (process.env.NODE_ENV === 'production') {
    shutdown('UNCAUGHT_EXCEPTION');
  } else {
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  
  if (process.env.NODE_ENV === 'production') {
    // Log but don't shutdown in production - let the app recover
    console.log('🔄 Continuing in production mode...');
  } else {
    shutdown('UNHANDLED_REJECTION');
  }
});

// Export app for testing
module.exports = app;#   F o r c e   r e d e p l o y   0 7 / 2 6 / 2 0 2 5   0 2 : 3 0 : 1 0  
 
=======
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
>>>>>>> 2f7a1654cf4d92d16f7d23c258d88da1dc3367da
