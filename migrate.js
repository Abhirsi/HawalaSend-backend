// migrate.js - Enhanced with password reset tokens and improved structure
import { config } from 'dotenv';
config({ path: '.env' }); // Use .env instead of .env.local

import { Pool } from 'pg';

// Use Railway connection for production, local for development
// Replace the Pool configuration with:
const pool = new Pool({
  connectionString: 'postgresql://postgres:OAFetGoCWUcPdEeMVGcJyszzPVWOxKKQ@shortline.proxy.rlwy.net:10328/railway',
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.info('Starting database migrations...');

    // ================== CORE TABLES ==================
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        phone_number VARCHAR(20),
        balance DECIMAL(15,2) DEFAULT 1000.00 CHECK (balance >= 0),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        last_login TIMESTAMPTZ,
        login_attempts INT DEFAULT 0 CHECK (login_attempts >= 0),
        locked_until TIMESTAMPTZ,
        two_factor_enabled BOOLEAN DEFAULT false,
        two_factor_secret VARCHAR(255),
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
        avatar_url TEXT,
        timezone VARCHAR(50) DEFAULT 'UTC',
        email_verified BOOLEAN DEFAULT false,
        email_verification_token VARCHAR(255),
        email_verification_expires TIMESTAMPTZ
      );
    `);
    console.info('✅ Users table created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        sender_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
        recipient_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
        type VARCHAR(20) NOT NULL CHECK (type IN ('send', 'receive', 'deposit', 'withdraw', 'transfer')),
        amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
        fee DECIMAL(15,2) DEFAULT 0.00 CHECK (fee >= 0),
        currency VARCHAR(3) DEFAULT 'CAD' CHECK (currency IN ('CAD', 'KES', 'USD')),
        exchange_rate DECIMAL(10,4),
        recipient_amount DECIMAL(15,2),
        recipient_currency VARCHAR(3) DEFAULT 'KES',
        description TEXT,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'reversed')),
        reference_id VARCHAR(100) UNIQUE,
        external_reference VARCHAR(255),
        payment_method VARCHAR(50) DEFAULT 'card',
        recipient_info JSONB,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        processed_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        failure_reason TEXT,
        CONSTRAINT chk_sender_recipient_diff CHECK (sender_id != recipient_id OR sender_id IS NULL OR recipient_id IS NULL),
        CONSTRAINT chk_completion_status CHECK (
          (status = 'completed' AND completed_at IS NOT NULL) OR
          (status != 'completed')
        )
      );
    `);
    console.info('✅ Transactions table created');

    // ================== PASSWORD RESET TOKENS TABLE (NEW) ==================
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(64) NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        used BOOLEAN DEFAULT FALSE,
        used_at TIMESTAMPTZ,
        ip_address VARCHAR(45),
        user_agent TEXT,
        CONSTRAINT unique_user_token UNIQUE (user_id),
        CONSTRAINT chk_token_expiry CHECK (expires_at > created_at),
        CONSTRAINT chk_used_at CHECK (
          (used = true AND used_at IS NOT NULL) OR
          (used = false AND used_at IS NULL)
        )
      );
    `);
    console.info('✅ Password reset tokens table created');

    // ================== SECURITY TABLES ==================
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(512) NOT NULL UNIQUE,
        ip_address VARCHAR(45) NOT NULL,
        user_agent TEXT,
        device_id VARCHAR(255),
        device_name VARCHAR(100),
        location VARCHAR(100),
        is_mobile BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        is_active BOOLEAN DEFAULT true,
        last_activity TIMESTAMPTZ DEFAULT NOW(),
        logout_at TIMESTAMPTZ,
        CONSTRAINT chk_session_expiry CHECK (expires_at > created_at)
      );
    `);
    console.info('✅ Sessions table created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS security_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(50) NOT NULL CHECK (length(action) <= 50),
        ip_address VARCHAR(45) NOT NULL,
        user_agent TEXT,
        device_fingerprint TEXT,
        status VARCHAR(20) CHECK (status IN ('success', 'failed', 'pending', 'blocked')),
        details TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        severity VARCHAR(10) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical'))
      );
    `);
    console.info('✅ Security logs table created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        id SERIAL PRIMARY KEY,
        identifier VARCHAR(255) NOT NULL, -- IP address or user ID
        action VARCHAR(50) NOT NULL,
        attempts INTEGER DEFAULT 1,
        window_start TIMESTAMPTZ DEFAULT NOW(),
        blocked_until TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(identifier, action)
      );
    `);
    console.info('✅ Rate limits table created');

    // ================== TRANSACTION RELATED TABLES ==================
    await client.query(`
      CREATE TABLE IF NOT EXISTS recipients (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(20),
        country VARCHAR(2) DEFAULT 'KE',
        bank_name VARCHAR(255),
        account_number VARCHAR(100),
        mobile_money_provider VARCHAR(100),
        mobile_money_number VARCHAR(20),
        address TEXT,
        relationship VARCHAR(100),
        is_verified BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        last_used_at TIMESTAMPTZ
      );
    `);
    console.info('✅ Recipients table created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS exchange_rates (
        id SERIAL PRIMARY KEY,
        from_currency VARCHAR(3) NOT NULL,
        to_currency VARCHAR(3) NOT NULL,
        rate DECIMAL(10,6) NOT NULL CHECK (rate > 0),
        margin DECIMAL(5,4) DEFAULT 0.0250, -- 2.5% default margin
        effective_rate DECIMAL(10,6) NOT NULL CHECK (effective_rate > 0),
        source VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        is_active BOOLEAN DEFAULT true,
        UNIQUE(from_currency, to_currency, created_at)
      );
    `);
    console.info('✅ Exchange rates table created');

    // ================== INDEXES FOR PERFORMANCE ==================
    
    // Users indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
      CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
    `);

    // Transactions indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_sender_id ON transactions(sender_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_recipient_id ON transactions(recipient_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
      CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
      CREATE INDEX IF NOT EXISTS idx_transactions_reference_id ON transactions(reference_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_currency ON transactions(currency);
    `);

    // Password reset tokens indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_used ON password_reset_tokens(used);
    `);

    // Sessions indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions(is_active);
    `);

    // Security logs indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_security_logs_user_id ON security_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_security_logs_action ON security_logs(action);
      CREATE INDEX IF NOT EXISTS idx_security_logs_created_at ON security_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_security_logs_ip_address ON security_logs(ip_address);
    `);

    // Rate limits indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier_action ON rate_limits(identifier, action);
      CREATE INDEX IF NOT EXISTS idx_rate_limits_blocked_until ON rate_limits(blocked_until);
    `);

    // Recipients indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_recipients_user_id ON recipients(user_id);
      CREATE INDEX IF NOT EXISTS idx_recipients_country ON recipients(country);
    `);

    // Exchange rates indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_exchange_rates_currencies ON exchange_rates(from_currency, to_currency);
      CREATE INDEX IF NOT EXISTS idx_exchange_rates_created_at ON exchange_rates(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_exchange_rates_is_active ON exchange_rates(is_active);
    `);

    console.info('✅ All indexes created');

    // ================== FUNCTIONS & TRIGGERS ==================
    await client.query(`
      CREATE OR REPLACE FUNCTION update_modified_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Users table triggers
      DROP TRIGGER IF EXISTS update_users_modtime ON users;
      CREATE TRIGGER update_users_modtime
      BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_modified_column();

      -- Transactions table triggers
      DROP TRIGGER IF EXISTS update_transactions_modtime ON transactions;
      CREATE TRIGGER update_transactions_modtime
      BEFORE UPDATE ON transactions
      FOR EACH ROW EXECUTE FUNCTION update_modified_column();

      -- Recipients table triggers
      DROP TRIGGER IF EXISTS update_recipients_modtime ON recipients;
      CREATE TRIGGER update_recipients_modtime
      BEFORE UPDATE ON recipients
      FOR EACH ROW EXECUTE FUNCTION update_modified_column();

      -- Rate limits table triggers
      DROP TRIGGER IF EXISTS update_rate_limits_modtime ON rate_limits;
      CREATE TRIGGER update_rate_limits_modtime
      BEFORE UPDATE ON rate_limits
      FOR EACH ROW EXECUTE FUNCTION update_modified_column();
    `);
    console.info('✅ Functions and triggers created');

    // ================== CLEANUP FUNCTION ==================
    await client.query(`
      CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
      RETURNS void AS $$
      BEGIN
        -- Clean up expired password reset tokens
        DELETE FROM password_reset_tokens 
        WHERE expires_at < NOW() - INTERVAL '7 days';

        -- Clean up expired sessions
        DELETE FROM sessions 
        WHERE expires_at < NOW();

        -- Clean up old security logs (keep 90 days)
        DELETE FROM security_logs 
        WHERE created_at < NOW() - INTERVAL '90 days';

        -- Clean up old rate limit entries
        DELETE FROM rate_limits 
        WHERE window_start < NOW() - INTERVAL '24 hours' 
        AND blocked_until IS NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.info('✅ Cleanup functions created');

    // ================== INSERT SAMPLE DATA ==================
    await client.query(`
      -- Insert sample exchange rates
      INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_rate, source, expires_at)
      VALUES 
        ('CAD', 'KES', 107.50, 104.81, 'system', NOW() + INTERVAL '1 hour'),
        ('KES', 'CAD', 0.0093, 0.0091, 'system', NOW() + INTERVAL '1 hour')
      ON CONFLICT DO NOTHING;
    `);
    console.info('✅ Sample data inserted');

    await client.query('COMMIT');
    console.info('✅ Database migrations completed successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database migration failed', {
      error: error.message,
      stack: error.stack,
    });
    throw new Error('Database initialization failed');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => {
    console.log('✅ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });