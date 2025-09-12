import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://hawala_user:securepassword123@localhost:5432/money_transfer_app'
});

async function checkAndUpdateUsers() {
  try {
    // First, check what users exist
    console.log('📋 Checking existing users...\n');
    const existingUsers = await pool.query(`
      SELECT id, username, email, balance 
      FROM users 
      ORDER BY id
    `);
    
    console.log('Existing users in database:');
    console.log('=====================================');
    existingUsers.rows.forEach(user => {
      console.log(`ID: ${user.id} | Username: ${user.username} | Email: ${user.email} | Balance: $${user.balance}`);
    });
    console.log('=====================================\n');
    
    // Update password for test@example.com if it exists
    const newPassword = 'password123';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update the testuser account
    const updateResult = await pool.query(`
      UPDATE users 
      SET password_hash = $1, salt = $2, updated_at = NOW()
      WHERE email IN ('test@example.com', 'testuser@example.com', 'john@example.com')
      OR username IN ('testuser', 'johndoe')
      RETURNING id, username, email
    `, [hashedPassword, salt]);
    
    if (updateResult.rows.length > 0) {
      console.log('✅ Updated passwords for the following users:');
      updateResult.rows.forEach(user => {
        console.log(`   - ${user.email} (username: ${user.username})`);
      });
      console.log('\n🔑 All updated users can now login with password: password123\n');
    }
    
    // Try to create john@example.com if it doesn't exist
    try {
      const johnResult = await pool.query(`
        INSERT INTO users (
          username, email, password_hash, salt, balance, 
          created_at, updated_at, status, login_attempts, two_factor_enabled
        )
        VALUES ('johndoe', 'john@example.com', $1, $2, 500.00, NOW(), NOW(), 'active', 0, false)
        ON CONFLICT (email) DO NOTHING
        RETURNING id, username, email
      `, [hashedPassword, salt]);
      
      if (johnResult.rows.length > 0) {
        console.log('✅ Created additional user: john@example.com');
      }
    } catch (e) {
      // User might already exist, that's okay
    }
    
    // Show final list of users you can login with
    console.log('\n🎉 YOU CAN NOW LOGIN WITH ANY OF THESE USERS:');
    console.log('=====================================');
    const finalUsers = await pool.query(`
      SELECT username, email FROM users WHERE email LIKE '%@example.com'
    `);
    finalUsers.rows.forEach(user => {
      console.log(`Email: ${user.email}`);
      console.log(`Password: password123`);
      console.log('---');
    });
    console.log('=====================================');
    
    pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    pool.end();
    process.exit(1);
  }
}

checkAndUpdateUsers();