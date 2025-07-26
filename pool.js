// backend/pool.js
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

let pool;

// Log environment for debugging
console.log('🔍 Environment Check:', {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL ? '✅ Present' : '❌ Missing',
  PGHOST: process.env.PGHOST || 'Not set',
  PGPORT: process.env.PGPORT || 'Not set',
  PGDATABASE: process.env.PGDATABASE || 'Not set'
});

if (process.env.DATABASE_URL) {
  // ✅ For production (Railway/Render) - Use DATABASE_URL
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: false, // Required for Railway's self-signed certs
    } : false,
    max: 20, // Maximum connections in pool
    idleTimeoutMillis: 30000, // Close idle connections after 30s
    connectionTimeoutMillis: 5000, // Timeout after 5s if can't connect
    statement_timeout: 60000, // 60s query timeout
    query_timeout: 60000,
    allowExitOnIdle: true
  });
  console.log('✅ Connected to PostgreSQL via DATABASE_URL (Production)');
} else if (process.env.PGHOST && process.env.PGHOST !== 'localhost') {
  // ✅ For Railway using individual PG variables
  pool = new Pool({
    user: process.env.PGUSER || 'postgres',
    host: process.env.PGHOST,
    database: process.env.PGDATABASE || 'railway',
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT) || 5432,
    ssl: {
      rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 60000,
    query_timeout: 60000,
    allowExitOnIdle: true
  });
  console.log('✅ Connected to Railway PostgreSQL via PG variables');
} else {
  // ✅ For local development
  pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'Money_transfer_app', // Match your local DB name
    password: process.env.DB_PASSWORD || 'yourpassword',
    port: parseInt(process.env.DB_PORT) || 5432,
    ssl: false, // No SSL for local development
    max: 10, // Fewer connections for local
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  });
  console.log('✅ Connected to local PostgreSQL database');
}

// Connection event handlers
pool.on('connect', (client) => {
  console.log('🔗 New database connection established');
});

pool.on('error', (err) => {
  console.error('🚨 Database pool error:', err);
  // Don't exit the process, let the app handle the error
});

pool.on('acquire', (client) => {
  console.log('📥 Connection acquired from pool');
});

pool.on('release', (err, client) => {
  if (err) {
    console.error('🚨 Error releasing client:', err);
  } else {
    console.log('📤 Connection released back to pool');
  }
});

// Test connection function
const testConnection = async () => {
  let client;
  try {
    console.log('🧪 Testing database connection...');
    client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as postgres_version');
    console.log('✅ Database connection successful!');
    console.log('⏰ Current time:', result.rows[0].current_time);
    console.log('🐘 PostgreSQL version:', result.rows[0].postgres_version.split(' ')[0]);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('🔍 Error details:', {
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
      address: error.address,
      port: error.port
    });
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
};

// Test connection immediately
testConnection().then(success => {
  if (!success && process.env.NODE_ENV === 'production') {
    console.error('💥 Critical: Database connection failed in production!');
    // In production, you might want to exit if DB is not available
    // process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, closing database pool...');
  await pool.end();
  console.log('✅ Database pool closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, closing database pool...');
  await pool.end();
  console.log('✅ Database pool closed');
  process.exit(0);
});

// Export pool and test function
module.exports = {
  pool,
  testConnection,
  // For backward compatibility
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
  end: () => pool.end()
};

// Also export pool as default for existing imports
module.exports.default = pool;