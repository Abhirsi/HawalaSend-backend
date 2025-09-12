<<<<<<< HEAD
// pool.js - Load environment variables first
// pool.js - Load environment variables first
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
  max: process.env.DB_POOL_MAX || 10,
  min: process.env.DB_POOL_MIN || 2,
  idleTimeoutMillis: process.env.DB_POOL_IDLE_TIMEOUT || 30000,
  connectionTimeoutMillis: process.env.DB_POOL_CONN_TIMEOUT || 5000,
});

// Debug: Log the database user
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err);
    return;
  }
  client.query('SELECT current_user;', (err, result) => {
    if (err) {
      console.error('Error querying current_user:', err);
    } else {
      console.log('Database connected as user:', result.rows[0].current_user);
    }
    release();
  });
});

export default pool;
=======
// backend/pool.js
// Load environment variables based on NODE_ENV
if (process.env.NODE_ENV === 'development') {
  require('dotenv').config({ path: '.env.local' });
} else {
  require('dotenv').config(); // Load .env for production
}

const { Pool } = require('pg');
let pool;

console.log('🔍 Database Environment Check:', {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL ? '✅ Present' : '❌ Missing',
  PGHOST: process.env.PGHOST || 'Not set',
  PGDATABASE: process.env.PGDATABASE || 'Not set',
  DB_NAME: process.env.DB_NAME || 'Not set',
});

// Determine connection method based on available variables
const useConnectionString = process.env.DATABASE_URL && process.env.DATABASE_URL !== 'postgresql://postgres:your_local_password@localhost:5432/money_transfer_app';

if (useConnectionString) {
  // Production (Railway) or valid DATABASE_URL - Use connection string
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: false
    } : false,
    // Connection pool settings
    max: parseInt(process.env.DB_POOL_MAX) || 10,
    min: parseInt(process.env.DB_POOL_MIN) || 2,
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONN_TIMEOUT) || 5000,
  });
  console.log('✅ Using DATABASE_URL for PostgreSQL connection');
  console.log('🔗 Connection string format:', process.env.DATABASE_URL.replace(/:[^:@]*@/, ':****@'));
} else {
  // Local development - Use individual parameters
  const dbConfig = {
    user: process.env.DB_USER || process.env.PGUSER || 'postgres',
    host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
    database: process.env.DB_NAME || process.env.PGDATABASE || 'money_transfer_app', // Fixed case
    password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
    port: parseInt(process.env.DB_PORT || process.env.PGPORT) || 5432,
    ssl: false,
    // Connection pool settings
    max: parseInt(process.env.DB_POOL_MAX) || 10,
    min: parseInt(process.env.DB_POOL_MIN) || 2,
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONN_TIMEOUT) || 5000,
  };

  pool = new Pool(dbConfig);
  console.log('✅ Using individual parameters for PostgreSQL connection');
  console.log('🔗 Connection config:', {
    user: dbConfig.user,
    host: dbConfig.host,
    database: dbConfig.database,
    port: dbConfig.port,
    password: dbConfig.password ? '****' : 'Missing!',
  });
}

// Enhanced connection testing
const testConnection = async () => {
  try {
    const client = await pool.connect();
    
    // Test basic connectivity
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Database connected successfully');
    console.log('📅 Current time:', result.rows[0].current_time);
    console.log('🗄️  PostgreSQL version:', result.rows[0].pg_version.split(' ')[0]);
    
    // Test if database exists and has tables
    const tableCheck = await client.query(`
      SELECT schemaname, tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      LIMIT 5
    `);
    
    if (tableCheck.rows.length > 0) {
      console.log('📋 Found tables:', tableCheck.rows.map(row => row.tablename).join(', '));
    } else {
      console.log('⚠️  No tables found in public schema - database might be empty');
    }
    
    client.release();
  } catch (err) {
    console.error('❌ Database connection failed:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint
    });
    
    // Provide helpful error messages
    if (err.code === 'ENOTFOUND') {
      console.error('💡 DNS resolution failed - check your host address');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('💡 Connection refused - check if PostgreSQL is running and port is correct');
    } else if (err.code === '3D000') {
      console.error('💡 Database does not exist - create the database first');
    } else if (err.code === '28P01') {
      console.error('💡 Authentication failed - check username/password');
    }
  }
};

// Test connection on startup with a small delay to ensure env vars are loaded
setTimeout(testConnection, 100);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Closing database pool...');
  await pool.end();
  console.log('✅ Database pool closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Closing database pool...');
  await pool.end();
  console.log('✅ Database pool closed');
  process.exit(0);
});

module.exports = pool;
>>>>>>> e8c6be4989d9efa8c534a7b77d7270faaa60128d
