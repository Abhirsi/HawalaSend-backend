import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;
dotenv.config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://hawala_user:securepassword123@localhost:5432/money_transfer_app'
});

async function createTestUser() {
  try {
    // Test user credentials
    const testUser = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
      balance: 1000.00
    };

    console.log('Creating test user...');

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(testUser.password, salt);

    // Insert user into database
    const query = `
      INSERT INTO users (username, email, password, balance, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE 
      SET password = $3, updated_at = NOW()
      RETURNING id, username, email, balance
    `;

    const result = await pool.query(query, [
      testUser.username,
      testUser.email,
      hashedPassword,
      testUser.balance
    ]);

    console.log('\n✅ Test user created successfully!');
    console.log('=====================================');
    console.log('📧 Email:', testUser.email);
    console.log('🔑 Password:', testUser.password);
    console.log('💰 Balance: $', testUser.balance);
    console.log('=====================================\n');
    console.log('User details:', result.rows[0]);
    
    pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test user:', error.message);
    console.error('Full error:', error);
    pool.end();
    process.exit(1);
  }
}

createTestUser();