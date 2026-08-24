/**
 * Authentication — Frontend API Service
 *
 * Calls the Node.js/Express backend at /api/auth (proxied by Vite to :4000).
 */

const API = '/api/auth';

/* ---------- helpers ---------- */

async function request(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json();
  if (!res.ok) {
    const msg = body.message || 'Request failed';
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
