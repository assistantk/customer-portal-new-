const BASE='http://localhost:8080/api/customers';
export async function getMasterData(){const r=await fetch(`${BASE}/master-data`);if(!r.ok)throw new Error('Could not load form data');return r.json();}
export async function registerCustomer(data,file){const fd=new FormData();fd.append('customer',new Blob([JSON.stringify(data)],{type:'application/json'}));fd.append('gstinFile',file);const r=await fetch(`${BASE}/register`,{method:'POST',body:fd});const body=await r.json();if(!r.ok)throw new Error(body.message||'Registration failed');return body;}
