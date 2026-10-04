import dns from 'dns';
import { promises as dnsPromises } from 'dns';
import nodemailer from 'nodemailer';

async function checkDnsRecords(domain: string) {
  console.log(`\n--- DNS AUTHENTICATION INSPECTION FOR: ${domain} ---`);
  
  // 1. Check SPF
  try {
    const txtRecords = await dnsPromises.resolveTxt(domain);
    const spfRecord = txtRecords.flat().find(r => r.startsWith('v=spf1'));
    if (spfRecord) {
      console.log(`SPF Record found: "${spfRecord}"`);
    } else {
      console.log(`SPF Record: None found for ${domain}`);
    }
  } catch (err: any) {
    console.log(`SPF Query failed for ${domain}: ${err.message}`);
  }

  // 2. Check DMARC
  try {
    const dmarcRecords = await dnsPromises.resolveTxt(`_dmarc.${domain}`);
    const dmarcRecord = dmarcRecords.flat().find(r => r.startsWith('v=DMARC1'));
    if (dmarcRecord) {
      console.log(`DMARC Record found: "${dmarcRecord}"`);
    } else {
      console.log(`DMARC Record: None found for _dmarc.${domain}`);
    }
  } catch (err: any) {
    console.log(`DMARC Query failed for _dmarc.${domain}: ${err.message}`);
  }

  // 3. Check Google Workspace MX
  try {
    const mxRecords = await dnsPromises.resolveMx(domain);
    console.log(`MX Records:`, mxRecords.map(m => `${m.priority} ${m.exchange}`).join(', '));
  } catch (err: any) {
    console.log(`MX Query failed for ${domain}: ${err.message}`);
  }
}

async function inspectSmtpEnvironment() {
  console.log('================================================================');
  console.log('🔍 TASK 1 & 2: INSPECTING SMTP RUNTIME CONFIGURATION');
  console.log('================================================================');

  const smtpHost = process.env.SMTP_HOST || 'Not Set (Defaulting to service: gmail)';
  const smtpPort = process.env.SMTP_PORT || '587 (Default)';
  const smtpSecure = process.env.SMTP_SECURE || 'false (STARTTLS)';
  const smtpUser = process.env.SMTP_USER || process.env.SMTP_EMAIL || process.env.VITE_SMTP_EMAIL || '';
  const hasPassword = Boolean(process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.VITE_SMTP_PASSWORD);
  const smtpFrom = process.env.SMTP_FROM || `"Shikshantar Academy Security" <${smtpUser || 'security@shikshantaracademy.edu.np'}>`;
  const smtpReplyTo = process.env.SMTP_REPLY_TO || 'academyshikshantar@gmail.com';

  console.log(`SMTP_HOST      : ${smtpHost}`);
  console.log(`SMTP_PORT      : ${smtpPort}`);
  console.log(`SMTP_SECURE    : ${smtpSecure}`);
  console.log(`SMTP_USER      : ${smtpUser ? (smtpUser.includes('@') ? smtpUser.replace(/(.{2})(.*)(@.*)/, '$1***$3') : '***') : 'NOT CONFIGURED'}`);
  console.log(`SMTP_PASSWORD  : ${hasPassword ? 'CONFIGURED (Present)' : 'NOT CONFIGURED (Missing)'}`);
  console.log(`SMTP_FROM      : ${smtpFrom}`);
  console.log(`SMTP_REPLY_TO  : ${smtpReplyTo}`);

  const isConfigured = Boolean(smtpUser && hasPassword && smtpUser !== 'school@gmail.com');
  console.log(`SMTP Ready for Real Delivery : ${isConfigured ? 'YES (Live Transport)' : 'NO (Simulation Fallback Mode)'}`);

  // Inspect DNS for institutional domain
  await checkDnsRecords('shikshantaracademy.edu.np');
  
  if (smtpUser && smtpUser.includes('@')) {
    const senderDomain = smtpUser.split('@')[1];
    if (senderDomain !== 'shikshantaracademy.edu.np') {
      await checkDnsRecords(senderDomain);
    }
  }

  return { isConfigured, smtpUser, hasPassword };
}

inspectSmtpEnvironment().catch(console.error);
