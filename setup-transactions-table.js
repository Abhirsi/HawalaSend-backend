import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://hawala_user:securepassword123@localhost:5432/money_transfer_app'
});

async function createTransactionsTable() {
  try {
    // Create transactions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        type VARCHAR(20) NOT NULL CHECK (type IN ('send', 'receive', 'deposit', 'withdraw')),
        amount DECIMAL(10, 2) NOT NULL,
        sender_id INTEGER REFERENCES users(id),
        recipient_id INTEGER REFERENCES users(id),
        description TEXT,
        status VARCHAR(20) DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Transactions table created successfully');
    
    // Create indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)');
    
    console.log('✅ Indexes created successfully');
    
    // Check if table is empty
    const result = await pool.query('SELECT COUNT(*) FROM transactions');
    console.log(`📊 Current transactions in database: ${result.rows[0].count}`);
    
    pool.end();
  } catch (error) {
    console.error('❌ Error creating table:', error.message);
    pool.end();
  }
}

createTransactionsTable();