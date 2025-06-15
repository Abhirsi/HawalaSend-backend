// backend/migrations/initDB.js
const pool = require('../config/database');
const logger = require('./logger');
const { InternalServerError } = require('../errors');

const runMigrations = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    logger.info('Starting database migrations...');

    // ================== CORE TABLES ==================
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        salt VARCHAR(255) NOT NULL,
        balance DECIMAL(15,2) DEFAULT 0.00 CHECK (balance >= 0),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        last_login TIMESTAMPTZ,
        last_password_change TIMESTAMPTZ,
        login_attempts INT DEFAULT 0 CHECK (login_attempts >= 0),
        locked_until TIMESTAMPTZ,
        two_factor_enabled BOOLEAN DEFAULT false,
        two_factor_secret VARCHAR(255),
        two_factor_recovery_codes TEXT[],
        password_reset_token VARCHAR(255),
        password_reset_expires TIMESTAMPTZ,
        first_name VARCHAR(50),
        last_name VARCHAR(50),
        phone VARCHAR(20) CHECK (phone ~ '^\+?[0-9\s\-]+$'),
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
        avatar_url TEXT CHECK (avatar_url ~ '^https?://'),
        timezone VARCHAR(50) DEFAULT 'UTC',
        CONSTRAINT chk_password_length CHECK (length(password_hash) >= 60)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
        fee DECIMAL(15,2) DEFAULT 0.00 CHECK (fee >= 0),
        currency VARCHAR(3) DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
        description TEXT,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
        reference_id VARCHAR(100) UNIQUE,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        CONSTRAINT chk_sender_receiver_diff CHECK (sender_id != receiver_id),
        CONSTRAINT chk_completion_status CHECK (
          (status = 'completed' AND completed_at IS NOT NULL) OR
          (status != 'completed' AND completed_at IS NULL)
        )
      );
    `);

    // ================== SECURITY TABLES ==================
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(512) NOT NULL,
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
        CONSTRAINT unique_device_session UNIQUE(user_id, device_id),
        CONSTRAINT chk_session_expiry CHECK (expires_at > created_at)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS password_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        password_hash VARCHAR(255) NOT NULL,
        salt VARCHAR(255) NOT NULL,
        changed_at TIMESTAMPTZ DEFAULT NOW(),
        changed_by_ip VARCHAR(45),
        CONSTRAINT chk_history_password_length CHECK (length(password_hash) >= 60)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS security_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(50) NOT NULL CHECK (length(action) <= 50),
        ip_address VARCHAR(45) NOT NULL,
        user_agent TEXT,
        device_fingerprint TEXT,
        status VARCHAR(20) CHECK (status IN ('success', 'failed', 'pending')),
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_attempts (
        id SERIAL PRIMARY KEY,
        ip_address VARCHAR(45) NOT NULL,
        attempt_count INT DEFAULT 1 CHECK (attempt_count >= 0),
        last_attempt TIMESTAMPTZ DEFAULT NOW(),
        is_blocked BOOLEAN DEFAULT false,
        blocked_until TIMESTAMPTZ,
        CONSTRAINT chk_block_time CHECK (
          (is_blocked = true AND blocked_until IS NOT NULL) OR
          (is_blocked = false AND blocked_until IS NULL)
        )
      );
    `);

    // ================== INDEXES ==================
    await client.query(`
      -- User indexes
      CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
      
      -- Transaction indexes
      CREATE INDEX IF NOT EXISTS idx_transactions_sender_status ON transactions(sender_id, status);
      CREATE INDEX IF NOT EXISTS idx_transactions_receiver_status ON transactions(receiver_id, status);
      CREATE INDEX IF NOT EXISTS idx_transactions_created_currency ON transactions(created_at, currency);
      CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference_id);
      
      -- Session indexes (partial for active sessions)
      CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON sessions(user_id) WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(encode(sha256(token::bytea), 'hex'));
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_active ON sessions(expires_at) WHERE is_active = true;
      
      -- Security indexes
      CREATE INDEX IF NOT EXISTS idx_security_logs_user_action ON security_logs(user_id, action);
      CREATE INDEX IF NOT EXISTS idx_security_logs_created_status ON security_logs(created_at, status);
      
      -- Auth attempt indexes (partial for blocked IPs)
      CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip_blocked ON auth_attempts(ip_address) WHERE is_blocked = true;
    `);

    // ================== FUNCTIONS & TRIGGERS ==================
    await client.query(`
      CREATE OR REPLACE FUNCTION update_modified_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER update_user_modtime
      BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_modified_column();

      CREATE TRIGGER update_transaction_modtime
      BEFORE UPDATE ON transactions
      FOR EACH ROW EXECUTE FUNCTION update_modified_column();
    `);

    await client.query('COMMIT');
    logger.info('✅ Database migrations completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Database migration failed', {
      error: error.message,
      stack: error.stack
    });
    throw new InternalServerError('Database initialization failed');
  } finally {
    client.release();
  }
};

// Export with version tracking
module.exports = {
  version: 1,
  run: runMigrations,
  description: 'Initial database schema setup'
};