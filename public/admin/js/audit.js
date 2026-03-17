(function() {
  const PAGE_SIZE = 50;
  let offset = 0;
  let total = 0;

  async function loadSidebar() {
    const res = await fetch('/admin/components/sidebar.html');
    document.getElementById('sidebar').outerHTML = await res.text();
    document.getElementById('logoutBtn')?.addEventListener('click', Shared.logout);
    const user = Shared.getUser();
    if (user) {
      document.getElementById('userName').textContent = user.username;
      document.getElementById('userEmail').textContent = user.email;
      document.getElementById('userAvatar').textContent = user.username.charAt(0).toUpperCase();
      document.getElementById('userRole').textContent = 'Administrator';
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
      document.querySelector('.nav-link[data-page="audit"]')?.classList.add('active');
    }
  }

  async function loadPage() {
    const tbody = document.getElementById('auditBody');
    tbody.innerHTML = '<tr><td colspan="5" class="loading">Loading...</td></tr>';
    try {
      const data = await Shared.api(`/api/audit-logs?limit=${PAGE_SIZE}&offset=${offset}`);
      total = data.total;
      if (!data.rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No activity yet</td></tr>';
      } else {
        tbody.innerHTML = data.rows.map(row => `
          <tr>
            <td><strong>${Shared.escapeHtml(row.action)}</strong></td>
            <td>${Shared.escapeHtml(row.entityType || '-')}${row.entityId ? ' #' + row.entityId : ''}</td>
            <td>${Shared.escapeHtml(row.username || 'System')}</td>
            <td style="font-size:12px;color:var(--gray-400)">${Shared.escapeHtml(row.ipAddress || '-')}</td>
            <td>${Shared.formatRelativeTime(row.createdAt)}</td>
          </tr>
        `).join('');
      }
      const pageNum = Math.floor(offset / PAGE_SIZE) + 1;
      const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
      document.getElementById('pageInfo').textContent = `Page ${pageNum} of ${pageCount} (${total} total)`;
      document.getElementById('prevBtn').disabled = offset === 0;
      document.getElementById('nextBtn').disabled = offset + PAGE_SIZE >= total;
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Failed to load</td></tr>';
    }
  }

  async function init() {
    const user = await Shared.checkAuth();
    if (!user || user.role !== 'admin') {
      window.location.href = '/admin/';
      return;
    }
    await loadSidebar();
    await loadPage();

    document.getElementById('prevBtn').addEventListener('click', () => { offset -= PAGE_SIZE; loadPage(); });
    document.getElementById('nextBtn').addEventListener('click', () => { offset += PAGE_SIZE; loadPage(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
