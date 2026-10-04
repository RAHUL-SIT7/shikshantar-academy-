import nodemailer from 'nodemailer';

async function testControlledEmailDispatch() {
  console.log('================================================================');
  console.log('🚀 TASK 5: CONTROLLED REAL EMAIL DISPATCH TEST');
  console.log('================================================================');

  const smtpUser = process.env.SMTP_USER || process.env.SMTP_EMAIL || process.env.VITE_SMTP_EMAIL;
  const smtpPass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.VITE_SMTP_PASSWORD;
  const targetRecipient = 'rahulsah4534@gmail.com'; // Authorized admin/dev test recipient

  if (!smtpUser || !smtpPass) {
    console.error('❌ Cannot perform real email dispatch: SMTP credentials missing.');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: smtpUser, pass: smtpPass }
  });

  // Verify connection configuration
  console.log('Verifying SMTP connection...');
  try {
    await transporter.verify();
    console.log('✅ SMTP Connection & Authentication Successful!');
  } catch (verifyErr: any) {
    console.error('❌ SMTP Verification failed:', verifyErr.message);
    return;
  }

  const msgToken = `sec-test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const messageId = `<${msgToken}@shikshantaracademy.edu.np>`;

  const mailOptions = {
    from: `"Shikshantar Academy Security" <${smtpUser}>`,
    to: targetRecipient,
    replyTo: 'academyshikshantar@gmail.com',
    subject: 'Security Alert: New Sign-in to Shikshantar Academy Portal [Verification]',
    text: `Security Alert: New Sign-in Detected

Hello Rahul Sah,

A new login to your Shikshantar Academy Portal account was recorded:

• Account: Rahul Sah (Administrator)
• Device: Apple Mac / Chrome
• Operating System: macOS
• Location: Siraha, Nepal
• IP Address: 27.34.48.12
• Date & Time: 18 Ashwin 2083, 09:15 AM (B.S.)

If this was you, no action is required.

Portal URL: https://www.shikshantaracademy.edu.np/

--
Shikshantar Academy Administration
Karjanha-05, Bastipur, Siraha, Nepal
Contact: academyshikshantar@gmail.com | +977 9709867048`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Security Alert</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; line-height: 1.5;">
        <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          
          <div style="background-color: #0f172a; padding: 20px 24px; border-bottom: 3px solid #2563eb;">
            <div style="font-size: 16px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px; text-transform: uppercase;">
              SHIKSHANTAR ACADEMY
            </div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
              School Information & Account Security System
            </div>
          </div>

          <div style="padding: 24px;">
            <div style="display: inline-block; padding: 4px 10px; background-color: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 700; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
              Account Security Alert
            </div>
            <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #0f172a;">
              New sign-in detected for Rahul Sah
            </h2>
            <p style="font-size: 13px; color: #475569; margin: 0 0 18px 0;">
              Your Shikshantar Academy Portal account was accessed from a verified session:
            </p>

            <table style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 20px; font-size: 13px;">
              <tr>
                <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600; width: 38%;">Account</td>
                <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 700;">Rahul Sah</td>
              </tr>
              <tr>
                <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600;">Device</td>
                <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #334155; font-weight: 600;">Apple Mac / Chrome</td>
              </tr>
              <tr>
                <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600;">Location</td>
                <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #334155; font-weight: 600;">Siraha, Nepal</td>
              </tr>
              <tr>
                <td style="padding: 10px 14px; color: #64748b; font-weight: 600;">Date & Time (B.S.)</td>
                <td style="padding: 10px 14px; color: #334155; font-weight: 600;">18 Ashwin 2083, 09:15 AM</td>
              </tr>
            </table>

            <div style="text-align: center; margin: 24px 0 16px 0;">
              <a href="https://www.shikshantaracademy.edu.np/profile" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; font-size: 13px; font-weight: 700; text-decoration: none; border-radius: 8px; letter-spacing: 0.2px;">
                Review Account Security
              </a>
            </div>
          </div>

          <div style="background-color: #f1f5f9; padding: 16px 24px; font-size: 11px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0;">
            <div><strong>Shikshantar Academy</strong> • Karjanha-05, Bastipur, Siraha, Nepal</div>
            <div style="margin-top: 4px;">This automated notification was delivered to ${targetRecipient} for security monitoring.</div>
          </div>

        </div>
      </body>
      </html>
    `,
    messageId,
    headers: {
      'X-Auto-Response-Suppress': 'OOF, AutoReply',
      'Auto-Submitted': 'auto-generated',
      'X-Entity-Ref-ID': msgToken,
      'X-Report-Abuse-To': 'academyshikshantar@gmail.com',
    }
  };

  console.log(`Dispatching real email via Gmail SMTP to: ${targetRecipient}...`);
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Real Email Transmitted Successfully!');
    console.log(`- Message ID : ${info.messageId}`);
    console.log(`- Response   : ${info.response}`);
    console.log(`- Accepted   : ${info.accepted.join(', ')}`);
    console.log(`- Rejected   : ${info.rejected.length > 0 ? info.rejected.join(', ') : 'None'}`);
  } catch (sendErr: any) {
    console.error('❌ Email dispatch failed:', sendErr.message);
  }
}

testControlledEmailDispatch().catch(console.error);
