import pool from '../pool.js';

export const transferMoney = async (req, res) => {
  let client;
  try {
    const { recipientEmail, amount } = req.body;
    const senderId = req.user.id; // From JWT middleware
    const trimmedRecipientEmail = recipientEmail?.trim();

    // Log transfer attempt
    console.log(`Transfer attempt from user ${senderId} to ${trimmedRecipientEmail} for amount ${amount}`);

    // Validation
    if (!trimmedRecipientEmail || !amount) {
      return res.status(400).json({
        error: 'Recipient email and amount are required',
        code: 'MISSING_FIELDS',
      });
    }

    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        error: 'Amount must be a positive number',
        code: 'INVALID_AMOUNT',
      });
    }

    // Start transaction
    client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Find sender
      const senderResult = await client.query(
        'SELECT balance FROM users WHERE id = $1',
        [senderId]
      );
      if (senderResult.rows.length === 0) {
        throw new Error('Sender not found');
      }
      const senderBalance = senderResult.rows[0].balance;

      // Check sufficient balance
      if (senderBalance < amount) {
        throw new Error('Insufficient balance');
      }

      // Find recipient
      const recipientResult = await client.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
        [trimmedRecipientEmail]
      );
      if (recipientResult.rows.length === 0) {
        throw new Error('Recipient not found');
      }
      const recipientId = recipientResult.rows[0].id;

      // Prevent self-transfer
      if (senderId === recipientId) {
        throw new Error('Cannot transfer to yourself');
      }

      // Update sender balance
      await client.query(
        'UPDATE users SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
        [amount, senderId]
      );

      // Update recipient balance
      await client.query(
        'UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
        [amount, recipientId]
      );

      // Log transaction
      const transactionResult = await client.query(
        `INSERT INTO transactions (sender_id, receiver_id, amount, status, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id, created_at`,
        [senderId, recipientId, amount, 'pending']
      );

      await client.query('COMMIT');

      console.log(`Transfer successful: ${amount} from user ${senderId} to ${recipientId}`);

      return res.status(201).json({
        message: 'Transfer successful',
        transaction: {
          id: transactionResult.rows[0].id,
          senderId,
          recipientId,
          amount,
          created_at: transactionResult.rows[0].created_at,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Transfer error:', error);
      return res.status(400).json({
        error: error.message,
        code: 'TRANSFER_FAILED',
      });
    }
  } catch (err) {
    console.error('Transfer error:', err);
    return res.status(500).json({
      error: 'Transfer failed. Please try again.',
      code: 'TRANSFER_FAILED',
      ...(process.env.NODE_ENV === 'development' && { debug: err.message }),
    });
  } finally {
    if (client) {
      client.release();
    }
  }
};