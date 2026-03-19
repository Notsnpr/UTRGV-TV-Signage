// Shared functionality for all admin pages
const Shared = (function() {
  let currentUser = null;

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      const data = await res.json();
      if (!data) {
        window.location.href = '/';
        return null;
      }
      currentUser = data;
      updateUserUI();
      return data;
    } catch (e) {
      window.location.href = '/';
      return null;
    }
  }

  function updateUserUI() {
    const userName   = document.getElementById('userName');
    const userEmail  = document.getElementById('userEmail');
    const userAvatar = document.getElementById('userAvatar');
    const userRole   = document.getElementById('userRole');

    if (userName)   userName.textContent  = currentUser.username;
    if (userEmail)  userEmail.textContent = currentUser.email;
    if (userAvatar) userAvatar.textContent = currentUser.username.charAt(0).toUpperCase();

    if (currentUser.role === 'admin') {
      if (userRole) { userRole.textContent = 'Administrator'; userRole.style.color = '#667eea'; }
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
    } else {
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    }
  }

  function getUser() { return currentUser; }
  function isAdmin() { return currentUser?.role === 'admin'; }

  function showToast(message, type = '') {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
  }

  async function api(url, options = {}) {
    try {
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        ...options,
      });
      if (res.status === 401) { window.location.href = '/'; return null; }
      if (res.status === 204) return null;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Request failed');
      return data;
    } catch (err) {
      showToast(err.message, 'error');
      throw err;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatRelativeTime(dateStr) {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  function openModal(id)  { const m = document.getElementById(id); if (m) m.style.display = 'flex'; }
  function closeModal(id) { const m = document.getElementById(id); if (m) m.style.display = 'none'; }

  function init() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', () => {
        backdrop.closest('.modal').style.display = 'none';
      });
    });

    const path = window.location.pathname;
    document.querySelectorAll('.nav-link').forEach(btn => {
      const href = btn.getAttribute('href') || btn.dataset.page;
      if (href && path.includes(href.replace('.html', ''))) btn.classList.add('active');
    });

  }

  // Mobile sidebar toggle — event delegation so it works after dynamic sidebar injection
  document.addEventListener('click', e => {
    if (e.target.closest('#sidebarToggle')) {
      document.body.classList.toggle('sidebar-open');
    } else if (e.target.closest('#sidebarOverlay')) {
      document.body.classList.remove('sidebar-open');
    } else if (e.target.closest('.nav-link')) {
      document.body.classList.remove('sidebar-open');
    }
  });

  return { checkAuth, getUser, isAdmin, showToast, api, escapeHtml, formatDate, formatRelativeTime, logout, openModal, closeModal, init };
})();
