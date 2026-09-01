import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

interface AuditEmailOptions {
  page: 'Old User' | 'New Entry';
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  customerCode?: string | null;
  globalCode?: string | null;
  handlingAgentCode?: string | null;
  changes: Array<{ fieldName: string; oldValue: any; newValue: any }>;
  executedQuery: string;
  timestamp: string;
  submittedBy?: string;
}

export async function sendAuditEmail(options: AuditEmailOptions) {
  const { page, operation, table, customerCode, globalCode, handlingAgentCode, changes, executedQuery, timestamp, submittedBy } = options;

  // Determine recipients
  const dbaEmail = env.DBA_EMAIL || 'sura767848@gmail.com'; // fallback for demo
  console.log('[EMAIL AUDIT] Preparing to send email to:', dbaEmail);
  console.log('[EMAIL AUDIT] SMTP_HOST:', env.SMTP_HOST ? 'set' : 'not set');
  console.log('[EMAIL AUDIT] SMTP_PORT:', env.SMTP_PORT ? 'set' : 'not set');
  console.log('[EMAIL AUDIT] SMTP_USER:', env.SMTP_USER ? 'set' : 'not set');
  console.log('[EMAIL AUDIT] SMTP_PASS:', env.SMTP_PASS ? 'set' : 'not set');

  // If email credentials are not configured, use a mock transporter that logs
  const useMockTransporter = !env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS;

  let transporter;
  if (useMockTransporter) {
    // Mock transporter that logs email to console
    console.log('[EMAIL AUDIT] Using MOCK transporter (email will be logged to console)');
    transporter = {
      sendMail: async (mailOptions: nodemailer.SendMailOptions) => {
        console.log('[EMAIL AUDIT MOCK] Sending email:');
        console.log('To:', mailOptions.to);
        console.log('Subject:', mailOptions.subject);
        console.log('Body:', mailOptions.text);
        console.log('[EMAIL AUDIT MOCK] Email logged above.');
        return { messageId: 'mock-message-id' };
      }
    } as nodemailer.Transporter;
  } else {
    console.log('[EMAIL AUDIT] Using REAL transporter (attempting to send actual email)');
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT),
      secure: Number(env.SMTP_PORT) === 465, // true for 465, false for other ports
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }

  // Build email body
  const lines: string[] = [];
  lines.push(`Date & Time: ${timestamp}`);
  if (submittedBy) {
    lines.push(`User/Account: ${submittedBy}`);
  }
  lines.push(`Page: ${page}`);
  lines.push(`Operation: ${operation}`);
  lines.push(`Table: ${table}`);
  if (customerCode) {
    lines.push(`Customer Code: ${customerCode}`);
  }
  if (globalCode) {
    lines.push(`Global Code: ${globalCode}`);
  }
  if (handlingAgentCode) {
    lines.push(`Handling Agent Code: ${handlingAgentCode}`);
  }
  lines.push('');
  lines.push('Changed Fields:');
  if (changes.length === 0) {
    lines.push('  (No changes)');
  } else {
    for (const change of changes) {
      lines.push(`  ${change.fieldName}:`);
      lines.push(`    Old: ${change.oldValue === null ? 'NULL' : change.oldValue}`);
      lines.push(`    New: ${change.newValue === null ? 'NULL' : change.newValue}`);
    }
  }
  lines.push('');
  lines.push('Executed Query:');
  lines.push(`  ${executedQuery}`);

  const mailOptions = {
    from: `"Customer Portal Audit" <${env.SMTP_USER || 'audit@customerportal.com'}>`,
    to: dbaEmail,
    subject: 'Database Change Notification - Customer Portal',
    text: lines.join('\n'),
  };

  try {
    console.log('[EMAIL AUDIT] Attempting to send email via transporter...');
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL AUDIT] Email sent successfully: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('[EMAIL AUDIT] Failed to send email:', error);
    throw error;
  }
}