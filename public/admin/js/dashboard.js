(function() {
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
      document.querySelector('.nav-link[data-page="index"]')?.classList.add('active');
    }
  }

  async function init() {
    const user = await Shared.checkAuth();
    if (!user) return;
    await loadSidebar();

    // Load stats in parallel
    const [tvs, media] = await Promise.all([
      Shared.api('/api/tvs').catch(() => []),
      Shared.api('/api/media').catch(() => []),
    ]);

    document.getElementById('statTVs').textContent = tvs?.length ?? '—';
    document.getElementById('statActiveTVs').textContent = tvs?.filter(t => t.isActive).length ?? '—';
    document.getElementById('statMedia').textContent = media?.length ?? '—';

    if (user.role === 'admin') {
      const users = await Shared.api('/api/admin/users').catch(() => []);
      const el = document.getElementById('statUsers');
      if (el) el.textContent = users?.length ?? '—';

      // Audit log
      const audit = await Shared.api('/api/audit-logs?limit=20').catch(() => null);
      const tbody = document.getElementById('auditBody');
      if (audit?.rows?.length) {
        tbody.innerHTML = audit.rows.map(row => `
          <tr>
            <td><strong>${Shared.escapeHtml(row.action)}</strong></td>
            <td>${Shared.escapeHtml(row.entityType || '-')}${row.entityId ? ' #' + row.entityId : ''}</td>
            <td>${Shared.escapeHtml(row.username || 'System')}</td>
            <td>${Shared.formatRelativeTime(row.createdAt)}</td>
          </tr>
        `).join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">No activity yet</td></tr>';
      }
    } else {
      document.getElementById('auditBody').innerHTML = '<tr><td colspan="4" class="empty-cell">Admin only</td></tr>';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
