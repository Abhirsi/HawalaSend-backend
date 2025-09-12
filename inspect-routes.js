import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

// Import your actual app or routes
import('./index.js').then(module => {
  console.log('\n📋 Checking imported module structure:');
  console.log('Module exports:', Object.keys(module));
}).catch(err => {
  console.log('Could not import index.js:', err.message);
});

// Simple test server to verify structure
const testApp = express();
testApp.use(express.json());

// Log all incoming requests
testApp.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

testApp.post('/test', (req, res) => {
  console.log('Test endpoint hit with body:', req.body);
  res.json({ success: true });
});

console.log('\n🔍 Backend structure check:');
console.log('Current working directory:', process.cwd());
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Database URL exists:', !!process.env.DATABASE_URL);