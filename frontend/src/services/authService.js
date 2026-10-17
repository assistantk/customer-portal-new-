/**
 * Authentication — Frontend API Service
 *
 * Calls the Oracle authentication backend at /api/auth.
 * Maintains secure server-side session credentials.
 */

const API = '/api/auth';

/* ---------- helpers ---------- */

async function request(url, options = {}) {
  let res;
  try {
    res = await fetch(url, {
      ...options,
      credentials: 'include', // Ensure session cookies (JSESSIONID) are sent with every request
    });
  } catch (networkErr) {
    throw new Error('Unable to authenticate at this time. Please try again later.');
  }

  // Handle non-JSON responses
  let body = {};
  let text = '';

  try {
    text = await res.text();
    if (text && text.trim()) {
      body = JSON.parse(text);
    }
  } catch (parseErr) {
    if (!res.ok) {
      throw new Error(`Server error (${res.status}). Unable to authenticate at this time.`);
    }
    console.error('Response parse error:', parseErr, 'Response text:', text);
    throw new Error('Invalid response format from server.');
  }

  // Check if response indicates an error
  if (!res.ok) {
    const msg = body?.message || body?.error || `Request failed with status ${res.status}`;
    throw new Error(msg);
  }

  return body;
}

/* ---------- Login ---------- */

export async function loginUser({ username, password }) {
  return request(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: username, password }),
  });
}

/* ---------- Logout ---------- */

export async function logoutUser() {
  return request(`${API}/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

/* ---------- Check Current Session ---------- */

export async function checkSession() {
  return request(`${API}/session`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
}
