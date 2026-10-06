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
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// create an element; user text goes in via textContent (never innerHTML)
function el(tag, opts = {}, kids = []) {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text != null) node.textContent = opts.text;
  Object.entries(opts.attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
  (Array.isArray(kids) ? kids : [kids]).forEach(k => k && node.append(k));
  return node;
}

// status badge element (class names: badge s-pending | s-in-progress | s-resolved | s-rejected)
function badge(status) {
  return el('span', {
    class: 'badge s-' + String(status).toLowerCase().replace(/\s+/g, '-'),
    text: status
  });
}

// static inline SVG icons (trusted markup only, never user data)
const ICONS = {
  logo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`,
  doc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>`
};
function icon(name, cls) {
  const box = document.createElement('span');
  box.className = 'icon' + (cls ? ' ' + cls : '');
  box.innerHTML = ICONS[name] || '';   // static, developer-authored markup
  return box;
}

// disable a button + show a spinner while a request runs
async function busy(btn, fn) {
  if (!btn || btn.disabled) return;
  const kids = Array.from(btn.childNodes);
  btn.disabled = true;
  btn.classList.add('is-busy');
  btn.replaceChildren(el('span', { class: 'spinner' }));
  btn.append(...kids);
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.classList.remove('is-busy');
    btn.replaceChildren(...kids);
  }
}
