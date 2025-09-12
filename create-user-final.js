import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;
dotenv.config();

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

    // Generate salt and hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(testUser.password, salt);

    // Insert user with all required fields
    const query = `
      INSERT INTO users (
        username, 
        email, 
        password_hash, 
        salt,
        balance, 
        created_at, 
        updated_at,
        status,
        login_attempts,
        two_factor_enabled
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), 'active', 0, false)
      ON CONFLICT (email) DO UPDATE 
      SET password_hash = $3, 
          salt = $4,
          updated_at = NOW()
      RETURNING id, username, email, balance
    `;

    const result = await pool.query(query, [
      testUser.username,
      testUser.email,
      hashedPassword,
      salt,  // Include the salt
      testUser.balance
    ]);

    console.log('\n✅ Test user created successfully!');
    console.log('=====================================');
    console.log('📧 Email:', testUser.email);
    console.log('🔑 Password:', testUser.password);
    console.log('💰 Balance: $', testUser.balance);
    console.log('=====================================\n');
    console.log('User details:', result.rows[0]);
    
    // Also create a second test user for testing transfers
    const secondUser = {
      username: 'johndoe',
      email: 'john@example.com',
      password: 'password123',
      balance: 500.00
    };
    
    const salt2 = await bcrypt.genSalt(10);
    const hashedPassword2 = await bcrypt.hash(secondUser.password, salt2);
    
    await pool.query(query, [
      secondUser.username,
      secondUser.email,
      hashedPassword2,
      salt2,
      secondUser.balance
    ]);
    
    console.log('\n📧 Second user also created:');
    console.log('Email: john@example.com');
    console.log('Password: password123');
    
    pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test user:', error.message);
    pool.end();
    process.exit(1);
  }
}

createTestUser();