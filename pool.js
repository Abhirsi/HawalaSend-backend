// backend/pool.js - Improved configuration for Railway database
import dotenv from 'dotenv';

// Load environment variables before creating the pool
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env', override: false });

import { Pool } from 'pg';

// Debug: Show DATABASE_URL is loaded
console.log('🔍 Pool.js - DATABASE_URL loaded:', process.env.DATABASE_URL ? 'YES' : 'NO');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  
  // Connection pool settings optimized for Railway
  max: 5, // Reduced from 10 - Railway free tier has connection limits
  min: 1, // Keep at least 1 connection alive
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 10000, // 10 second timeout for new connections
  acquireTimeoutMillis: 10000, // 10 second timeout to acquire connection from pool
  
  // Handle connection errors gracefully
  keepAlive: true,
  keepAliveInitialDelayMillis: 0,
  
  // Query timeout
  query_timeout: 30000,
  
  // Connection retry settings
  options: '--client_encoding=UTF8',
  
  // Application name for debugging
  application_name: 'HawalaSend_Backend'
});

// Enhanced connection error handling
pool.on('connect', (client) => {
  console.log('🔗 New database connection established');
});

pool.on('acquire', (client) => {
  console.log('📋 Connection acquired from pool');
});

pool.on('error', (err, client) => {
  console.error('🚨 Database pool error:', {
    message: err.message,
    code: err.code,
    timestamp: new Date().toISOString()
  });
  
  // Don't exit the process, let the pool handle reconnection
  if (err.code === 'ECONNRESET' || err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
    console.log('🔄 Connection error detected, pool will attempt to reconnect...');
  }
});

pool.on('remove', (client) => {
  console.log('🗑️ Connection removed from pool');
});

// Test connection on startup with retry logic
const testDatabaseConnection = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      const result = await client.query('SELECT NOW(), version()');
      client.release();
      
      console.log('✅ Database connected successfully');
      console.log('📊 Database info:', result.rows[0].version.split(' ')[0]);
      return true;
    } catch (error) {
      console.error(`❌ Connection attempt ${i + 1}/${retries} failed:`, error.message);
      
      if (i === retries - 1) {
        console.error('💥 All connection attempts failed');
        return false;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
};

// Test connection immediately
testDatabaseConnection();

// Graceful shutdown handling
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

export default pool;