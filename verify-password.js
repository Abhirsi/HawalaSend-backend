import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://hawala_user:securepassword123@localhost:5432/money_transfer_app'
});

async function verifyPassword() {
  try {
    // Get the user from database
    const result = await pool.query(
      'SELECT id, email, password_hash, salt FROM users WHERE email = $1',
      ['testuser@example.com']
    );
    
    if (result.rows.length === 0) {
      console.log('❌ User not found');
      process.exit(1);
    }
    
    const user = result.rows[0];
    console.log('Found user:', user.email);
    console.log('Password hash in DB:', user.password_hash);
    console.log('Salt in DB:', user.salt);
    
    // Test password
    const testPassword = 'password123';
    
    // Try comparing with bcrypt
    const isValid = await bcrypt.compare(testPassword, user.password_hash);
    console.log('\nPassword "password123" is valid:', isValid);
    
    if (!isValid) {
      // Generate a new hash and update
      console.log('\n🔧 Generating new password hash...');
      const newSalt = await bcrypt.genSalt(10);
      const newHash = await bcrypt.hash(testPassword, newSalt);
      
      await pool.query(
        'UPDATE users SET password_hash = $1, salt = $2 WHERE email = $3',
        [newHash, newSalt, 'testuser@example.com']
      );
      
      console.log('✅ Password updated! Try logging in again.');
    }
    
    pool.end();
  } catch (error) {
    console.error('Error:', error);
    pool.end();
  }
}

verifyPassword();