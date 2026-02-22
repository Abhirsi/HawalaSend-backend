import nodemailer from 'nodemailer';

// Create transporter with better error handling
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  // Add these for better compatibility
  tls: {
    rejectUnauthorized: false
  }
});

// Verify connection configuration
transporter.verify(function (error, success) {
  if (error) {
    console.error('❌ Email service error:', error.message);
  } else {
    console.log('✅ Email service ready');
    console.log('📧 Sending from:', process.env.EMAIL_FROM);
  }
});

// Send transfer confirmation email to sender
export const sendTransferConfirmation = async (senderEmail, senderName, recipientEmail, amount, description, transactionId, fee, newBalance) => {
  try {
    const kesAmount = (amount * 110.45).toFixed(2);
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'Hawala Send <noreply@Hawalasend.com>',
      to: senderEmail,
      subject: 'Transfer Confirmation - Hawala Send',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <div style="font-size: 48px; margin-bottom: 12px;">✅</div>
            <h1 style="margin: 0; font-size: 28px;">Transfer Successful!</h1>
          </div>
          <div style="padding: 30px; background-color: #f9fafb;">
            <h2 style="color: #1f2937; margin-top: 0;">Hi ${senderName},</h2>
            <p style="color: #6b7280; font-size: 16px; line-height: 1.6;">Your money transfer has been completed successfully!</p>
            
            <div style="background-color: white; padding: 24px; border-radius: 12px; margin: 24px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <h3 style="color: #667eea; margin-top: 0; font-size: 18px;">Transaction Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong style="color: #374151;">Amount Sent:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right; color: #1f2937;">$${amount.toFixed(2)} CAD</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong style="color: #374151;">Recipient Receives:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right; color: #10b981; font-weight: bold;">KSh ${kesAmount}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong style="color: #374151;">Recipient:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right; color: #1f2937;">${recipientEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong style="color: #374151;">Description:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right; color: #1f2937;">${description}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong style="color: #374151;">Transfer Fee:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right; color: #10b981; font-weight: bold;">$${fee.toFixed(2)} CAD</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong style="color: #374151;">Transaction ID:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right; color: #6b7280; font-family: monospace;">#${transactionId}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0;"><strong style="color: #374151;">Remaining Balance:</strong></td>
                  <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #667eea; font-size: 18px;">$${newBalance.toFixed(2)} CAD</td>
                </tr>
              </table>
            </div>
            
            <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); padding: 16px; border-radius: 10px; border-left: 4px solid #10b981; margin: 24px 0;">
              <p style="margin: 0; color: #15803d; font-weight: 600;">✓ Transfer Complete!</p>
              <p style="margin: 8px 0 0 0; color: #15803d;">The money will be available in the recipient's account within minutes.</p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL}/dashboard" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 10px; display: inline-block; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                View Dashboard
              </a>
            </div>
          </div>
          <div style="background-color: #1f2937; color: white; padding: 20px; text-align: center; font-size: 13px; border-radius: 0 0 12px 12px;">
            <p style="margin: 0 0 8px 0;">© 2025 Hawala Send. All rights reserved.</p>
            <p style="margin: 0; color: #9ca3af;">Licensed money service business. Your funds are protected.</p>
          </div>
        </div>
      `,
      text: `
Transfer Successful!

Hi ${senderName},

Your money transfer has been completed successfully!

Transaction Details:
- Amount Sent: $${amount.toFixed(2)} CAD
- Recipient Receives: KSh ${kesAmount}
- Recipient: ${recipientEmail}
- Description: ${description}
- Transfer Fee: $${fee.toFixed(2)} CAD
- Transaction ID: #${transactionId}
- Remaining Balance: $${newBalance.toFixed(2)} CAD

The money will be available in the recipient's account within minutes.

View your dashboard: ${process.env.FRONTEND_URL}/dashboard

© 2025 Hawala Send
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Transfer confirmation email sent to:', senderEmail);
    console.log('📧 Message ID:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending transfer confirmation email:', error.message);
    return { success: false, error: error.message };
  }
};

// Send recipient notification email
export const sendRecipientNotification = async (recipientEmail, recipientName, senderEmail, senderName, amount, description) => {
  try {
    const kesAmount = (amount * 110.45).toFixed(2);
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'Hawala Send <noreply@Hawalasend.com>',
      to: recipientEmail,
      subject: 'Money Received - Hawala Send 💰',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <div style="font-size: 48px; margin-bottom: 12px;">💰</div>
            <h1 style="margin: 0; font-size: 28px;">Money Received!</h1>
          </div>
          <div style="padding: 30px; background-color: #f9fafb;">
            <h2 style="color: #1f2937; margin-top: 0;">Hi ${recipientName || recipientEmail.split('@')[0]},</h2>
            <p style="color: #6b7280; font-size: 16px; line-height: 1.6;">Great news! You've received money through Hawala Send!</p>
            
            <div style="background-color: white; padding: 24px; border-radius: 12px; margin: 24px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <h3 style="color: #10b981; margin-top: 0; font-size: 18px;">Transfer Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong style="color: #374151;">From:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right; color: #1f2937;">${senderName || senderEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong style="color: #374151;">Amount Received:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right; color: #10b981; font-weight: bold; font-size: 20px;">KSh ${kesAmount}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong style="color: #374151;">Original Amount:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right; color: #1f2937;">$${amount.toFixed(2)} CAD</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0;"><strong style="color: #374151;">Description:</strong></td>
                  <td style="padding: 10px 0; text-align: right; color: #1f2937;">${description}</td>
                </tr>
              </table>
            </div>
            
            <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); padding: 16px; border-radius: 10px; border-left: 4px solid #10b981; margin: 24px 0;">
              <p style="margin: 0; color: #15803d; font-weight: 600;">✓ The money has been added to your account!</p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL}/register" 
                 style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 10px; display: inline-block; font-weight: 600; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);">
                Create Your Account
              </a>
            </div>
          </div>
          <div style="background-color: #1f2937; color: white; padding: 20px; text-align: center; font-size: 13px; border-radius: 0 0 12px 12px;">
            <p style="margin: 0 0 8px 0;">© 2025 Hawala Send. All rights reserved.</p>
            <p style="margin: 0; color: #9ca3af;">Licensed money service business. Your funds are protected.</p>
          </div>
        </div>
      `,
      text: `
Money Received!

Hi ${recipientName || recipientEmail.split('@')[0]},

Great news! You've received money through Hawala Send!

Transfer Details:
- From: ${senderName || senderEmail}
- Amount Received: KSh ${kesAmount}
- Original Amount: $${amount.toFixed(2)} CAD
- Description: ${description}

The money has been added to your account!

Create your Hawala Send account: ${process.env.FRONTEND_URL}/register

© 2025 Hawala Send
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Recipient notification email sent to:', recipientEmail);
    console.log('📧 Message ID:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending recipient notification email:', error.message);
    return { success: false, error: error.message };
  }
};

// Send password reset email
export const sendPasswordResetEmail = async (email, resetToken) => {
  try {
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'Hawala Send <noreply@Hawalasend.com>',
      to: email,
      subject: 'Password Reset Request - Hawala Send',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <div style="font-size: 48px; margin-bottom: 12px;">🔐</div>
            <h1 style="margin: 0; font-size: 28px;">Password Reset Request</h1>
          </div>
          <div style="padding: 30px; background-color: #f9fafb;">
            <p style="color: #6b7280; font-size: 16px; line-height: 1.6;">You requested to reset your password for your Hawala Send account.</p>
            <p style="color: #6b7280; font-size: 16px; line-height: 1.6;">Click the button below to create a new password:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 10px; display: inline-block; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                Reset Password
              </a>
            </div>
            
            <div style="background-color: #fef2f2; padding: 16px; border-radius: 10px; border-left: 4px solid #ef4444; margin: 24px 0;">
              <p style="margin: 0; color: #dc2626; font-weight: 600;">⚠️ Security Notice</p>
              <p style="margin: 8px 0 0 0; color: #dc2626;">This link will expire in 1 hour for your security.</p>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
            
            <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin-top: 24px;">
              <p style="color: #6b7280; font-size: 12px; margin: 0;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="margin: 8px 0 0 0;"><a href="${resetLink}" style="color: #667eea; word-break: break-all; font-size: 12px;">${resetLink}</a></p>
            </div>
          </div>
          <div style="background-color: #1f2937; color: white; padding: 20px; text-align: center; font-size: 13px; border-radius: 0 0 12px 12px;">
            <p style="margin: 0 0 8px 0;">© 2025 Hawala Send. All rights reserved.</p>
            <p style="margin: 0; color: #9ca3af;">Licensed money service business. Your funds are protected.</p>
          </div>
        </div>
      `,
      text: `
Password Reset Request

You requested to reset your password for your Hawala Send account.

Click this link to create a new password: ${resetLink}

This link will expire in 1 hour for your security.

If you didn't request this password reset, please ignore this email. Your password will remain unchanged.

© 2025 Hawala Send
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Password reset email sent to:', email);
    console.log('📧 Message ID:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending password reset email:', error.message);
    return { success: false, error: error.message };
  }
};
