-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('send', 'receive', 'deposit', 'withdraw')),
    amount DECIMAL(10, 2) NOT NULL,
    sender_id INTEGER REFERENCES users(id),
    recipient_id INTEGER REFERENCES users(id),
    description TEXT,
    status VARCHAR(20) DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX idx_transactions_type ON transactions(type);

-- Add some test transactions for existing users
INSERT INTO transactions (user_id, type, amount, recipient_id, description, status)
VALUES 
    (1, 'send', 50.00, 2, 'Test transfer', 'completed'),
    (2, 'receive', 50.00, 1, 'Test transfer', 'completed');