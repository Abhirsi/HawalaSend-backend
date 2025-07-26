// backend/pool.js
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

let pool;

console.log('🔍 Database Environment Check:', {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL ? '✅ Present' : '❌ Missing',
  PGHOST: process.env.PGHOST || 'Not set',
});

if (process.env.DATABASE_URL) {
  // Production (Railway) - Use DATABASE_URL
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: false
    } : false,
  });
  console.log('✅ Using DATABASE_URL for PostgreSQL connection');
} else {
  // Local development
  pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'Money_transfer_app',
    password: process.env.DB_PASSWORD || 'yourpassword',
    port: parseInt(process.env.DB_PORT) || 5432,
    ssl: false,
  });
  console.log('✅ Using local PostgreSQL connection');
}

// Test connection on startup
pool.connect()
  .then(client => {
    console.log('✅ Database connected successfully');
    client.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
  });

module.exports = pool;