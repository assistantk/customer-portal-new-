import { sendAuditEmail } from './src/utils/email.js';

async function run() {
  console.log('Testing sendAuditEmail...');
  try {
    await sendAuditEmail({
      page: 'Old User',
      operation: 'UPDATE',
      table: 'customers',
      customerCode: 'CUST-1234',
      changes: [{ fieldName: 'test', oldValue: 'old', newValue: 'new' }],
      executedQuery: 'SELECT 1',
      timestamp: new Date().toISOString(),
    });
    console.log('Finished sendAuditEmail');
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
