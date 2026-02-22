import sgMail from '@sendgrid/mail';


// Send transfer confirmation email to sender
export const sendTransferConfirmation = async (
  senderEmail,
  senderName,
  recipientEmail,
  amount,
  description,
  transactionId,
  fee,
  newBalance
) => {
  try {
    const kesAmount = (amount * 110.45).toFixed(2);

    const msg = {
      to: senderEmail,
      from: process.env.EMAIL_FROM,
      subject: 'Transfer Confirmation - Hawala Send',
      html: `<!-- YOUR ORIGINAL HTML HERE (unchanged) -->`,
      text: `Transfer Successful!
Amount Sent: $${amount.toFixed(2)} CAD
Recipient Receives: KSh ${kesAmount}
Transaction ID: #${transactionId}`
    };

    const response = await sgMail.send(msg);

    console.log('✅ Transfer confirmation email sent to:', senderEmail);
    console.log('📧 SendGrid Response Status:', response[0].statusCode);

    return { success: true };

  } catch (error) {
    console.error('❌ Error sending transfer confirmation email:', error.response?.body || error.message);
    return { success: false, error: error.message };
  }
};


// Send recipient notification email
export const sendRecipientNotification = async (
  recipientEmail,
  recipientName,
  senderEmail,
  senderName,
  amount,
  description
) => {
  try {
    const kesAmount = (amount * 110.45).toFixed(2);

    const msg = {
      to: recipientEmail,
      from: process.env.EMAIL_FROM,
      subject: 'Money Received - Hawala Send 💰',
      html: `<!-- YOUR ORIGINAL HTML HERE (unchanged) -->`,
      text: `Money Received!
From: ${senderName || senderEmail}
Amount Received: KSh ${kesAmount}`
    };

    const response = await sgMail.send(msg);

    console.log('✅ Recipient notification email sent to:', recipientEmail);
    console.log('📧 SendGrid Response Status:', response[0].statusCode);

    return { success: true };

  } catch (error) {
    console.error('❌ Error sending recipient notification email:', error.response?.body || error.message);
    return { success: false, error: error.message };
  }
};


// Send password reset email
export const sendPasswordResetEmail = async (email, resetToken) => {
  try {
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const msg = {
      to: email,
      from: process.env.EMAIL_FROM,
      subject: 'Password Reset Request - Hawala Send',
      html: `
        <h2>Password Reset</h2>
        <p>You requested a password reset.</p>
        <a href="${resetLink}">Reset Password</a>
      `,
      text: `Reset your password here: ${resetLink}`
    };

    const response = await sgMail.send(msg);

    console.log('✅ Password reset email sent to:', email);
    console.log('📧 SendGrid Response Status:', response[0].statusCode);

    return { success: true };

  } catch (error) {
    console.error('❌ Error sending password reset email:', error.response?.body || error.message);
    return { success: false, error: error.message };
  }
};