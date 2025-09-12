
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

