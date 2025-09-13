import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import transferRoutes from './routes/transfer.js';
import transactionRoutes from './routes/transactions.js';

// Load environment variables from .env.local
dotenv.config({ path: './.env.local' });

const app = express();

// Keep YOUR working CORS configuration
const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:3000', 'https://hawalasend.vercel.app'];
console.log('✅ Allowed Origins:', allowedOrigins);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// Add this route BEFORE your existing routes
app.get('/setup-database', async (req, res) => {
  try {
    console.log('Creating database tables...');
    
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        balance DECIMAL(15,2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('Users table created');
    
    // Create transactions table  
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        fee DECIMAL(15,2) DEFAULT 0.00,
        currency VARCHAR(3) DEFAULT 'USD',
        description TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      )
    `);
    console.log('Transactions table created');
    
    // Insert test users
    await pool.query(`
      INSERT INTO users (email, username, password_hash, first_name, last_name, phone, balance) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (email) DO NOTHING
    `, ['testuser@example.com', 'testuser', '$2b$10$CwTycUXWue0Thq9StjUM0uehufrkKbXnq3wi5qCa6ZAQLn1s6Vhwi', 'Test', 'User', '+1234567890', 2500.00]);
    
    await pool.query(`
      INSERT INTO users (email, username, password_hash, first_name, last_name, phone, balance) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (email) DO NOTHING  
    `, ['recipientuser@example.com', 'recipientuser', '$2b$10$CwTycUXWue0Thq9StjUM0uehufrkKbXnq3wi5qCa6ZAQLn1s6Vhwi', 'Recipient', 'User', '+0987654321', 1000.00]);
    
    // Verify tables were created
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    const transactionsCount = await pool.query('SELECT COUNT(*) FROM transactions');
    
    console.log('Database setup complete');
    res.json({ 
      message: 'Database setup complete!',
      users: usersCount.rows[0].count,
      transactions: transactionsCount.rows[0].count
    });
  } catch (error) {
    console.error('Database setup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Keep YOUR working routes (this is what makes your app work!)
app.use('/auth', authRoutes);
app.use('/api', transferRoutes);
app.use('/transfers', transferRoutes);
app.use('/transactions', transactionRoutes);

// Keep YOUR working health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      status: 'connected',
      currentTime: new Date().toISOString(),
    },
  });
});

// Keep YOUR working port configuration
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('🚀 HawalaSend backend server running...');
  console.log(`• Port: ${PORT}`);
  console.log(`• Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`• Database: ${process.env.PGDATABASE || 'money_transfer_app'}`);
  console.log('📡 Server ready to accept connections');
});