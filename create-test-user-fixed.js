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
    // First, check what columns exist
    const schemaCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    
    const columns = schemaCheck.rows.map(row => row.column_name);
    console.log('Available columns:', columns);
    
    // Determine password column name
    const passwordColumn = columns.includes('password') ? 'password' : 
                          columns.includes('password_hash') ? 'password_hash' : 
                          columns.includes('hashed_password') ? 'hashed_password' : null;
    
    if (!passwordColumn) {
      throw new Error('No password column found in users table');
    }
    
    console.log(`Using password column: ${passwordColumn}`);
    
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

    // Build dynamic query based on available columns
    let insertColumns = ['email', passwordColumn];
    let insertValues = [testUser.email, hashedPassword];
    let placeholders = ['$1', '$2'];
    let valueIndex = 3;
    
    if (columns.includes('username')) {
      insertColumns.push('username');
      insertValues.push(testUser.username);
      placeholders.push(`$${valueIndex}`);
      valueIndex++;
    }
    
    if (columns.includes('balance')) {
      insertColumns.push('balance');
      insertValues.push(testUser.balance);
      placeholders.push(`$${valueIndex}`);
      valueIndex++;
    }
    
    if (columns.includes('created_at')) {
      insertColumns.push('created_at');
      insertValues.push(new Date());
      placeholders.push(`$${valueIndex}`);
      valueIndex++;
    }
    
    if (columns.includes('updated_at')) {
      insertColumns.push('updated_at');
      insertValues.push(new Date());
      placeholders.push(`$${valueIndex}`);
      valueIndex++;
    }
    
    const query = `
      INSERT INTO users (${insertColumns.join(', ')})
      VALUES (${placeholders.join(', ')})
      ON CONFLICT (email) DO UPDATE 
      SET ${passwordColumn} = EXCLUDED.${passwordColumn}, 
          updated_at = ${columns.includes('updated_at') ? 'NOW()' : 'DEFAULT'}
      RETURNING id, email${columns.includes('username') ? ', username' : ''}${columns.includes('balance') ? ', balance' : ''}
    `;
    
    console.log('Query:', query);
    const result = await pool.query(query, insertValues);

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