// backend/pool.js
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

let pool;

if (process.env.DATABASE_URL) {
  // ✅ For production (Render, Railway)
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false, // Required for Render/Railway's self-signed certs
    },
  });
  console.log('✅ Connected to PostgreSQL via DATABASE_URL');
} else {
  // ✅ For local development
  pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'money_transfer',
    password: process.env.DB_PASSWORD || 'yourpassword',
    port: process.env.DB_PORT || 5432,
  });
  console.log('✅ Connected to local PostgreSQL database');
}

module.exports = pool;
