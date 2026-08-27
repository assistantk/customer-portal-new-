async function run() {
  try {
    // 1. Fetch customers to get a valid customerCode
    const getRes = await fetch('http://localhost:4000/api/customers');
    const getData = await getRes.json();
    if (!getData || !getData.data || getData.data.length === 0) {
      console.log('No customers found to update');
      return;
    }
    const customer = getData.data[0];
    const customerCode = customer.customerCode;
    console.log(`Updating customer: ${customerCode}`);

    // 2. Perform an update
    const putRes = await fetch(`http://localhost:4000/api/customers/${customerCode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: customer.customerName + ' Updated',
        city: 'New City',
      })
    });
    const putData = await putRes.json();
    console.log('Update response:', putData);
  } catch (err) {
    console.error('Error in test:', err);
  }
}
run();
