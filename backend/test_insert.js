async function run() {
  try {
    console.log('Creating new customer...');
    const postRes = await fetch('http://localhost:4000/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Test Company ' + Date.now(),
        city: 'Mumbai',
        pincode: '400001',
        email: 'test@example.com',
        activeFlag: 'Y',
        pan: 'ABCDE1234F',
        address: 'Test Address',
        globalCustomerCode: 'GLB1',
        mobile: '9876543210'
      })
    });
    const postData = await postRes.json();
    console.log('Create response:', JSON.stringify(postData, null, 2));
  } catch (err) {
    console.error('Error in test:', err);
  }
}
run();
