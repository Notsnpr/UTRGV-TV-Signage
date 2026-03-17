(function() {
  let tvs = [];

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
      document.querySelector('.nav-link[data-page="tvs"]')?.classList.add('active');
    }
  }

  async function loadTVs() {
    try {
      tvs = await Shared.api('/api/tvs');
      const grid = document.getElementById('tvGrid');
      if (!tvs.length) {
        grid.innerHTML = '<p style="color:var(--gray-400);grid-column:1/-1;padding:48px;text-align:center">No TVs yet. Add one to get started.</p>';
        return;
      }
      grid.innerHTML = tvs.map(tv => `
        <a href="/admin/tv-detail.html?id=${tv.id}" class="tv-card fade-in">
          <div class="tv-card-header">
            <span class="tv-card-icon">📺</span>
            <span class="tv-card-status ${tv.isActive ? 'active' : ''}" title="${tv.isActive ? 'Active' : 'Inactive'}"></span>
          </div>
          <h3>${Shared.escapeHtml(tv.name)}</h3>
          <div class="tv-card-meta">${Shared.escapeHtml(tv.location || 'No location')}</div>
          <div class="tv-card-footer">
            <span>${tv.itemCount} item${tv.itemCount !== 1 ? 's' : ''}${tv.activeItemCount === 0 && tv.itemCount > 0 ? ' <span style="color:#ef4444;font-size:11px">(none active)</span>' : ''}</span>
            <span>${tv.cycleIntervalSeconds}s cycle</span>
          </div>
        </a>
      `).join('');
    } catch (e) {}
  }

  async function addTV() {
    const name     = document.getElementById('tvName').value.trim();
    const location = document.getElementById('tvLocation').value.trim();
    const interval = parseInt(document.getElementById('tvInterval').value) || 10;
    if (!name) return Shared.showToast('Name is required', 'error');
    try {
      await Shared.api('/api/tvs', {
        method: 'POST',
        body: JSON.stringify({ name, location: location || undefined, cycleIntervalSeconds: interval }),
      });
      Shared.closeModal('addTVModal');
      document.getElementById('tvName').value = '';
      document.getElementById('tvLocation').value = '';
      document.getElementById('tvInterval').value = '10';
      await loadTVs();
      Shared.showToast('TV created', 'success');
    } catch (e) {}
  }

  async function init() {
    const user = await Shared.checkAuth();
    if (!user) return;
    await loadSidebar();
    await loadTVs();

    document.getElementById('addTVBtn')?.addEventListener('click', () => Shared.openModal('addTVModal'));
    document.getElementById('closeAddTV').addEventListener('click', () => Shared.closeModal('addTVModal'));
    document.getElementById('cancelAddTV').addEventListener('click', () => Shared.closeModal('addTVModal'));
    document.getElementById('confirmAddTV').addEventListener('click', addTV);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
