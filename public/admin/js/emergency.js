(function() {
  const TYPE_TITLES = {
    fire:       '🔥 Fire Alert',
    weather:    '🌪 Weather Alert',
    security:   '🔒 Security Alert',
    evacuation: '🚪 Evacuation Alert',
    custom:     '',
  };

  const TYPE_BADGE_CLASS = {
    fire:       'badge-fire',
    weather:    'badge-weather',
    security:   'badge-security',
    evacuation: 'badge-evacuation',
    custom:     'badge-custom',
  };

  async function loadSidebar() {
    const res = await fetch('/admin/components/sidebar.html');
    document.getElementById('sidebar').outerHTML = await res.text();
    document.getElementById('logoutBtn')?.addEventListener('click', Shared.logout);
    const user = Shared.getUser();
    if (user) {
      document.getElementById('userName').textContent = user.username;
      document.getElementById('userEmail').textContent = user.email;
      document.getElementById('userAvatar').textContent = user.username.charAt(0).toUpperCase();
      if (user.role === 'admin') {
        document.getElementById('userRole').textContent = 'Administrator';
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
      }
      document.querySelector('.nav-link[data-page="emergency"]')?.classList.add('active');
    }
  }

  async function fetchStatus() {
    try {
      const alert = await Shared.api('/api/emergency/current');
      const panel = document.getElementById('emergencyPanel');
      const banner = document.getElementById('statusBanner');
      const activateForm = document.getElementById('activateForm');
      const activeState = document.getElementById('activeState');

      if (alert) {
        panel.classList.add('active');
        banner.className = 'emergency-status-banner active-alert';
        banner.textContent = '🚨 ACTIVE: ' + alert.title;
        activateForm.style.display = 'none';
        activeState.style.display = '';
        document.getElementById('activeTitle').textContent = alert.title;
        document.getElementById('activeMessage').textContent = alert.message;
        const badge = document.getElementById('activeTypeBadge');
        badge.textContent = alert.type;
        badge.className = 'badge-type ' + (TYPE_BADGE_CLASS[alert.type] || 'badge-custom');
        document.getElementById('activeTime').textContent = Shared.formatDate(alert.createdAt);
      } else {
        panel.classList.remove('active');
        banner.className = 'emergency-status-banner inactive';
        banner.textContent = '⚠ No Active Alert';
        activateForm.style.display = '';
        activeState.style.display = 'none';
      }
    } catch (e) {}
  }

  async function fetchHistory() {
    try {
      const history = await Shared.api('/api/emergency/history');
      const tbody = document.getElementById('historyBody');
      if (!history.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No alerts yet</td></tr>';
        return;
      }
      tbody.innerHTML = history.map(a => `
        <tr>
          <td><span class="badge-type ${TYPE_BADGE_CLASS[a.type] || 'badge-custom'}">${Shared.escapeHtml(a.type)}</span></td>
          <td><strong>${Shared.escapeHtml(a.title)}</strong></td>
          <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Shared.escapeHtml(a.message)}</td>
          <td>${Shared.formatDate(a.createdAt)}</td>
          <td>
            <button class="btn btn-sm btn-danger-outline" data-delete="${a.id}">Delete</button>
          </td>
        </tr>
      `).join('');
      tbody.querySelectorAll('[data-delete]').forEach(btn =>
        btn.addEventListener('click', () => deleteAlert(btn.dataset.delete)));
    } catch (e) {}
  }

  async function activateAlert() {
    const type = document.getElementById('alertType').value;
    const rawTitle = document.getElementById('alertTitle').value.trim();
    const message = document.getElementById('alertMessage').value.trim();
    const title = rawTitle || TYPE_TITLES[type] || 'Emergency Alert';

    if (!message) return Shared.showToast('Message is required', 'error');

    try {
      await Shared.api('/api/emergency/activate', {
        method: 'POST',
        body: JSON.stringify({ type, title, message }),
      });
      await fetchStatus();
      await fetchHistory();
      Shared.showToast('Emergency alert activated', 'success');
    } catch (e) {}
  }

  async function deactivateAlert() {
    try {
      await Shared.api('/api/emergency/deactivate', { method: 'POST' });
      await fetchStatus();
      await fetchHistory();
      Shared.showToast('Alert cleared');
    } catch (e) {}
  }

  async function deleteAlert(id) {
    if (!confirm('Delete this alert from history?')) return;
    try {
      await Shared.api(`/api/emergency/${id}`, { method: 'DELETE' });
      await fetchHistory();
    } catch (e) {}
  }

  // Auto-fill title when type changes
  function wireTypeSelect() {
    const sel = document.getElementById('alertType');
    const titleInput = document.getElementById('alertTitle');
    sel.addEventListener('change', () => {
      if (!titleInput.dataset.userEdited) {
        titleInput.value = TYPE_TITLES[sel.value] || '';
      }
    });
    titleInput.addEventListener('input', () => {
      titleInput.dataset.userEdited = titleInput.value ? '1' : '';
    });
    // Set initial value
    titleInput.value = TYPE_TITLES[sel.value] || '';
  }

  async function init() {
    const user = await Shared.checkAuth();
    if (!user || user.role !== 'admin') {
      window.location.href = '/admin/';
      return;
    }
    await loadSidebar();
    wireTypeSelect();
    await fetchStatus();
    await fetchHistory();

    document.getElementById('activateBtn').addEventListener('click', activateAlert);
    document.getElementById('deactivateBtn').addEventListener('click', deactivateAlert);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
