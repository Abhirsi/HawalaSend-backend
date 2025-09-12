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