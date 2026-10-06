// app.js - shared helpers for all pages (no frameworks)

const TOKEN_KEY = 'ccs_token';
const USER_KEY = 'ccs_user';
const CATEGORIES = ['Hostel', 'Academics', 'Canteen', 'Infrastructure', 'Other'];
const STATUSES = ['Pending', 'In Progress', 'Resolved', 'Rejected'];

// fetch helper: adds JWT from localStorage, parses JSON, handles 401
async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  let data = null;
  try { data = await res.json(); } catch { /* no body */ }

  if (res.status === 401) {           // token missing/expired -> back to login
    clearSession();
    location.href = 'index.html';
    throw new Error('Not authenticated');
  }
  if (!res.ok) throw new Error((data && data.error) || 'Request failed');
  return data;
}

// session helpers
function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}
function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
function logout() {
  clearSession();
  location.href = 'index.html';
}

// redirect to login if not signed in, or to the wrong page for the role
function requireRole(role) {
  const user = getUser();
  if (!localStorage.getItem(TOKEN_KEY) || !user) { location.href = 'index.html'; return null; }
  if (user.role !== role) { location.href = user.role === 'admin' ? 'admin.html' : 'student.html'; return null; }
  return user;
}

// small UI helpers
function showMsg(el, text, isError) {
  el.textContent = text;
  el.className = 'msg ' + (isError ? 'error' : 'ok');
}
function badge(status) {
  return `<span class="badge s-${status.toLowerCase().replace(/\s+/g, '-')}">${status}</span>`;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
