/**
 * Authentication — Frontend API Service
 *
 * Calls the Node.js/Express backend at /api/auth (proxied by Vite to :4000).
 */

const API = '/api/auth';

/* ---------- helpers ---------- */

async function request(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (networkErr) {
    throw new Error('Cannot connect to server. Please ensure the backend is running.');
  }

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

  // Check if the response indicates an error
  if (!res.ok) {
    const msg = body?.message || body?.error || `Request failed with status ${res.status}`;
    throw new Error(msg);
  }
  
  return body;
}

/* ---------- Register ---------- */

export async function registerUser({ email, username, password, confirmPassword }) {
  return request(`${API}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, username, password, confirmPassword }),
  });
}

/* ---------- Login ---------- */

export async function loginUser({ username, password }) {
  return request(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}
