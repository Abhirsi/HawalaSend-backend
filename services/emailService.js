import nodemailer from 'nodemailer';

// Create transporter
const transporter = nodemailer.createTransporter({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify connection configuration
transporter.verify(function (error, success) {
  if (error) {
    console.log('Email service error:', error);
  } else {
    console.log('Email service ready');
  }
});

// Send transfer confirmation email to sender
export const sendTransferConfirmation = async (senderEmail, senderName, recipientEmail, amount, description, transactionId, fee, newBalance) => {
  try {
    const kesAmount = (amount * 110.45).toFixed(2);
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: senderEmail,
      subject: 'Transfer Confirmation - HawalaSend',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1976D2; color: white; padding: 20px; text-align: center;">
            <h1>Transfer Successful!</h1>
          </div>
          <div style="padding: 20px; background-color: #f5f5f5;">
            <h2>Hi ${senderName},</h2>
            <p>Your money transfer has been completed successfully!</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #1976D2; margin-top: 0;">Transaction Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Amount Sent:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">$${amount.toFixed(2)} CAD</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Recipient Receives:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; color: #2E7D32;">KSh ${kesAmount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Recipient:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${recipientEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Description:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${description}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Transfer Fee:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">$${fee.toFixed(2)} CAD</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Transaction ID:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">#${transactionId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Remaining Balance:</strong></td>
                  <td style="padding: 8px 0; text-align: right; font-weight: bold;">$${newBalance.toFixed(2)} CAD</td>
                </tr>
              </table>
            </div>
            
            <div style="background-color: #e8f5e8; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #2E7D32;"><strong>✓ Transfer Complete!</strong></p>
              <p style="margin: 5px 0 0 0;">The money will be available in the recipient's account shortly.</p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="https://hawalasend.vercel.app/dashboard" 
                 style="background-color: #1976D2; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">
                View Dashboard
              </a>
            </div>
          </div>
          <div style="background-color: #333; color: white; padding: 15px; text-align: center; font-size: 12px;">
            <p>© 2025 HawalaSend. Secure money transfers Canada ↔ Kenya.</p>
            <p>Questions? Contact support@hawalasend.com</p>
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
        
        The money will be available in the recipient's account shortly.
        
        View your dashboard: https://hawalasend.vercel.app/dashboard
        
        © 2025 HawalaSend
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Transfer confirmation email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending transfer confirmation email:', error);
    return { success: false, error: error.message };
  }
};

// Send recipient notification email
export const sendRecipientNotification = async (recipientEmail, recipientName, senderEmail, senderName, amount, description) => {
  try {
    const kesAmount = (amount * 110.45).toFixed(2);
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: recipientEmail,
      subject: 'Money Received - HawalaSend',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #2E7D32; color: white; padding: 20px; text-align: center;">
            <h1>Money Received!</h1>
          </div>
          <div style="padding: 20px; background-color: #f5f5f5;">
            <h2>Hi ${recipientName || recipientEmail},</h2>
            <p>You've received money through HawalaSend!</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #2E7D32; margin-top: 0;">Transfer Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>From:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${senderName || senderEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Amount Received:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; color: #2E7D32; font-weight: bold;">KSh ${kesAmount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Original Amount:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">$${amount.toFixed(2)} CAD</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Description:</strong></td>
                  <td style="padding: 8px 0; text-align: right;">${description}</td>
                </tr>
              </table>
            </div>
            
            <div style="background-color: #e8f5e8; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #2E7D32;"><strong>✓ The money has been added to your account!</strong></p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="https://hawalasend.vercel.app/auth/register" 
                 style="background-color: #2E7D32; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Create Your Account
              </a>
            </div>
          </div>
          <div style="background-color: #333; color: white; padding: 15px; text-align: center; font-size: 12px;">
            <p>© 2025 HawalaSend. Secure money transfers Canada ↔ Kenya.</p>
            <p>Questions? Contact support@hawalasend.com</p>
          </div>
        </div>
      `,
      text: `
        Money Received!
        
        Hi ${recipientName || recipientEmail},
        
        You've received money through HawalaSend!
        
        Transfer Details:
        - From: ${senderName || senderEmail}
        - Amount Received: KSh ${kesAmount}
        - Original Amount: $${amount.toFixed(2)} CAD
        - Description: ${description}
        
        The money has been added to your account!
        
        Create your HawalaSend account: https://hawalasend.vercel.app/auth/register
        
        © 2025 HawalaSend
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Recipient notification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending recipient notification email:', error);
    return { success: false, error: error.message };
  }
};