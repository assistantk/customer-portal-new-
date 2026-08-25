/**
 * Customer Registration — Frontend API Service
 *
 * Calls the Node.js/Express backend at /api (proxied by Vite to :4000).
 * Never exposes Oracle credentials or direct DB access.
 */

const API = '/api';

export async function scanDocument(kind, file) {
  const form = new FormData();
  form.append('document', file);
  return request(`${API}/documents/${kind}/scan`, { method: 'POST', body: form });
}

/* ---------- helpers ---------- */

async function request(url, options = {}) {
  const res = await fetch(url, options);
  // For file downloads, return raw response
  if (options.rawResponse) return res;

  // Handle non-JSON responses (e.g. empty body, proxy errors, HTML error pages)
  let body = {};
  let text = '';

  try {
    text = await res.text();
    if (text && text.trim()) {
      body = JSON.parse(text);
    }
  } catch (parseErr) {
    // If response is not OK and we have a parsing error, it's likely an error from the server
    if (!res.ok) {
      throw new Error(`Server error (${res.status}). Please ensure the backend is running.`);
    }
    // For successful responses with invalid JSON, this is still an error
    console.error('Response parse error:', parseErr, 'Response text:', text);
    throw new Error('Invalid response format from server.');
  }

  if (!res.ok) {
    const msg =
      body?.message ||
      body?.error ||
      (body?.details?.errors
        ? body.details.errors.map((e) => e.message).join('; ')
        : `Request failed with status ${res.status}`);
    throw new Error(msg);
  }
  if (!responseText.trim()) throw new Error('The document scan service returned an empty response. Please try again.');
  return body;
}

/* ---------- Master Data (static, no backend endpoint needed) ---------- */

export async function getMasterData() {
  return {
    cities: {
      Delhi: ['110001', '110002'],
      Mumbai: ['400001', '400002'],
      Kolkata: ['700001', '700002'],
      Chennai: ['600001', '600002'],
      Noida: ['201301', '201303'],
      Bengaluru: ['560001', '560100'],
      Jaipur: ['302001', '302020'],
    },
  };
}

/* ---------- Customer Lookup (Old User) ---------- */

export async function lookupCustomer(code) {
  const trimmed = code.trim().toUpperCase();
  const [custResp, gstinResp] = await Promise.all([
    request(`${API}/customers/${encodeURIComponent(trimmed)}`),
    request(`${API}/customers/${encodeURIComponent(trimmed)}/gstins`),
  ]);

  const c = custResp.data;
  const gstins = (gstinResp.data || []).map((g) => ({
    gstinId: g.gstinId,
    state: g.state || '',
    stateCode: g.stateCode || '',
    gstin: g.gstinNumber || '',
    gstinFileName: g.fileName || '',
    registeredAddress: g.registeredAddress || '',
    gstinStatus: g.gstinStatus || '',
    addressStatus: g.addressStatus || '',
    hasFile: g.hasFile || false,
    file: null,
    existingFileName: g.fileName || '',
    activeFlag: g.activeFlag || 'Y',
  }));

  return {
    customerCode: c.customerCode || '',
    companyName: c.customerName || '',
    address: c.address || '',
    city: c.city || '',
    pincode: c.pincode || '',
    pcoCode: c.pcoCode || '',
    panNumber: c.pan || '',
    panVerificationStatus: c.panVerificationStatus || '',
    email: c.email || '',
    mobile: c.mobile || '',
    globalCustomerCode: c.globalCustomerCode || '',
    handlingAgentCode: c.handlingAgentCode || '',
    activeFlag: c.activeFlag || 'Y',
    gstins,
  };
}

/* ---------- Code Generation (New User) ---------- */

export async function generateUniqueCode(companyName, codeType = 'GLOBAL') {
  const endpoint =
    codeType === 'HANDLING_AGENT'
      ? `${API}/codes/generate-handling`
      : `${API}/codes/generate-global`;

  const resp = await request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyName, reserve: false }),
  });

  return resp.data?.code || '';
}

/* ---------- New Customer Registration ---------- */

export async function registerCustomer(payload, gstinEntries) {
  // Step 1: Create customer + reserve code + insert GSTIN metadata (no files)
  const codeType = payload.codeType === 'HANDLING_AGENT' ? 'handling' : 'global';

  const customerBody = {
    customerName: payload.companyName,
    customerCode: payload.customerCode || undefined,
    address: payload.address,
    city: payload.city,
    pincode: payload.pincode,
    pcoCode: payload.pcoCode || undefined,
    pan: payload.panNumber,
    panFileName: payload.panFile ? payload.panFile.name : '',
    panFileType: payload.panFile ? payload.panFile.type : '',
    email: payload.email,
    mobile: payload.mobile,
    globalCustomerCode:
      codeType === 'global' ? payload.customerCode : undefined,
    handlingAgentCode:
      codeType === 'handling' ? payload.customerCode : undefined,
    activeFlag: 'Y',
    codeType,
    gstins: gstinEntries.map((g) => ({
      state: g.state,
      stateCode: g.stateCode || '',
      gstinNumber: g.gstin,
      fileName: g.file ? g.file.name : '',
      fileType: g.file ? g.file.type : '',
    })),
  };

  const formData = new FormData();
  Object.entries(customerBody).forEach(([key, value]) => {
    if (key !== 'gstins') formData.append(key, value == null ? '' : String(value));
  });
  formData.set('gstins', JSON.stringify(customerBody.gstins));
  if (payload.panFile) formData.append('panFile', payload.panFile);
  gstinEntries.forEach(entry => { if (entry.file) formData.append('gstinFiles', entry.file); });
  const createResp = await request(`${API}/customers`, { method: 'POST', body: formData });

  const savedCode = createResp.data?.customerCode;

  return {
    success: true,
    message: 'Customer registration submitted successfully',
    customerCode: savedCode,
  };
}

/* ---------- Update Existing Customer (Old User) ---------- */

export async function updateCustomer(code, payload, gstinEntries) {
  const trimmedCode = code.trim().toUpperCase();

  // Step 1: Update customer master
  const updateBody = {
    customerName: payload.companyName,
    address: payload.address,
    city: payload.city,
    pincode: payload.pincode,
    pcoCode: payload.pcoCode || undefined,
    pan: payload.panNumber,
    email: payload.email,
    mobile: payload.mobile,
    activeFlag: 'Y',
  };

  await request(`${API}/customers/${encodeURIComponent(trimmedCode)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updateBody),
  });

  // Upload PAN card file if a new one was provided
  if (payload.panFile) {
    const panFd = new FormData();
    panFd.append('panFile', payload.panFile);
    panFd.append('panNumber', payload.panNumber || '');
    await request(
      `${API}/customers/${encodeURIComponent(trimmedCode)}/pan-file`,
      { method: 'PUT', body: panFd }
    );
  }

  // Step 2: Handle GSTINs — add new ones, update existing ones with files
  for (const g of gstinEntries) {
    if (g.gstinId) {
      // Existing GSTIN — update it (with optional new file)
      const fd = new FormData();
      fd.append('state', g.state);
      fd.append('stateCode', g.stateCode || '');
      fd.append('gstinNumber', g.gstin);
      fd.append('address', payload.address || '');
      if (g.file) {
        fd.append('gstinFile', g.file);
      }

      await request(
        `${API}/customers/${encodeURIComponent(trimmedCode)}/gstins/${g.gstinId}`,
        { method: 'PUT', body: fd }
      );
    } else {
      // New GSTIN — insert it
      const fd = new FormData();
      fd.append('state', g.state);
      fd.append('stateCode', g.stateCode || '');
      fd.append('gstinNumber', g.gstin);
      fd.append('address', payload.address || '');
      if (g.file) {
        fd.append('gstinFile', g.file);
      }

      await request(
        `${API}/customers/${encodeURIComponent(trimmedCode)}/gstins`,
        { method: 'POST', body: fd }
      );
    }
  }

  return {
    success: true,
    message: 'Customer updated successfully',
  };
}

/* ---------- Delete GSTIN ---------- */

export async function deleteGstin(customerCode, gstinId) {
  return request(
    `${API}/customers/${encodeURIComponent(customerCode)}/gstins/${gstinId}`,
    { method: 'DELETE' }
  );
}
