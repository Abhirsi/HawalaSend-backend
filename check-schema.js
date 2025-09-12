import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://hawala_user:securepassword123@localhost:5432/money_transfer_app'
});

async function checkSchema() {
  try {
    // Check the columns in the users table
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `);
    
    console.log('\n📋 Users table structure:');
    console.log('=====================================');
    result.rows.forEach(col => {
      console.log(`Column: ${col.column_name} | Type: ${col.data_type} | Nullable: ${col.is_nullable}`);
    });
    console.log('=====================================\n');
    
    pool.end();
  } catch (error) {
    console.error('Error checking schema:', error.message);
    pool.end();
  }
}

checkSchema();