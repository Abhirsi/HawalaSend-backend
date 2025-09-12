import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;
dotenv.config();

// Try connecting with postgres superuser if available
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://hawala_user:securepassword123@localhost:5432/money_transfer_app'
});

async function createTransactionsTable() {
  const client = await pool.connect();
  
  try {
    // First check if table already exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'transactions'
      );
    `);
    
    if (tableExists.rows[0].exists) {
      console.log('✅ Transactions table already exists');
      
      // Show current transactions count
      const result = await client.query('SELECT COUNT(*) FROM transactions');
      console.log(`📊 Current transactions in database: ${result.rows[0].count}`);
    } else {
      console.log('Table does not exist. Please create it with superuser privileges.');
      console.log('\nRun this SQL as postgres user:');
      console.log(`
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('send', 'receive', 'deposit', 'withdraw')),
    amount DECIMAL(10, 2) NOT NULL,
    sender_id INTEGER REFERENCES users(id),
    recipient_id INTEGER REFERENCES users(id),
    description TEXT,
    status VARCHAR(20) DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);

-- Grant permissions
GRANT ALL ON transactions TO hawala_user;
GRANT USAGE, SELECT ON SEQUENCE transactions_id_seq TO hawala_user;
      `);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    
    if (error.message.includes('permission denied')) {
      console.log('\n⚠️ Permission denied. You need to:');
      console.log('1. Connect to PostgreSQL as the postgres superuser');
      console.log('2. Grant permissions to hawala_user');
      console.log('3. Create the transactions table');
    }
  } finally {
    client.release();
    pool.end();
  }
}

createTransactionsTable();