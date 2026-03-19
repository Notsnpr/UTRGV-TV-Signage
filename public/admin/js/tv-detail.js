(function() {
  const params = new URLSearchParams(window.location.search);
  const tvId = params.get('id');
  if (!tvId) { window.location.href = '/admin/tvs.html'; }

  let tv = null;
  let allMedia = [];
  let selectedMediaId = null;

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

  function renderItems(items) {
    const list = document.getElementById('itemsList');
    const now = new Date();
    const currentUser = Shared.getUser();
    const isAdmin = currentUser.role === 'admin';
    const visibleItems = isAdmin
      ? items
      : items.filter(item => item.isActive && (!item.endAt || new Date(item.endAt) >= now));
    if (!visibleItems.length) {
      list.innerHTML = '<p style="color:var(--gray-400);text-align:center;padding:24px">No items yet. Add media to start.</p>';
      return;
    }
    list.innerHTML = visibleItems.map((item, i) => {
      const isYoutube = item.mimeType === 'youtube';
      const isVideo   = item.mimeType?.startsWith('video/');
      const icon = isYoutube ? '▶️' : isVideo ? '🎬' : '🖼️';
      const dur = item.durationSeconds ? `${item.durationSeconds}s` : 'TV default';
      const isExpired = item.endAt && new Date(item.endAt) < now;
      const canEdit = isAdmin || item.uploadedBy === currentUser.id;
      const uploader = item.uploaderUsername ?? 'unknown';
      let subLine;
      if (isAdmin) {
        subLine = isExpired
          ? `Duration: ${dur} · Expired: ${Shared.formatDate(item.endAt)} · Added by ${uploader}`
          : `Duration: ${dur} · Added by ${uploader} on ${Shared.formatDate(item.createdAt)}`;
      } else {
        subLine = `Duration: ${dur} · Order: ${item.sortOrder}`;
      }
      return `
        <div class="item-row ${item.isActive ? '' : 'inactive'} ${isExpired ? 'expired' : ''}" data-item-id="${item.id}">
          <div class="item-thumb">
            ${item.mimeType?.startsWith('image/') ? `<img src="${Shared.escapeHtml(item.mediaUrl)}" alt="">` : `<span>${icon}</span>`}
          </div>
          <div class="item-info">
            <div class="item-name">
              ${Shared.escapeHtml(item.originalFilename)}
              ${isExpired ? '<span class="badge badge-danger" style="margin-left:8px;font-size:11px">Expired</span>' : ''}
            </div>
            <div class="item-sub">${subLine}</div>
          </div>
          <div class="item-actions">
            ${canEdit ? `
              <button class="btn-icon ${item.isActive ? '' : 'danger'}" data-toggle="${item.id}" title="${item.isActive ? 'Disable' : 'Enable'}">
                ${item.isActive ? '✓' : '○'}
              </button>
              ${i > 0 ? `<button class="btn-icon" data-move-up="${item.id}" title="Move up">↑</button>` : ''}
              ${i < items.length - 1 ? `<button class="btn-icon" data-move-down="${item.id}" title="Move down">↓</button>` : ''}
              <button class="btn-icon danger" data-delete-item="${item.id}" title="Remove">✕</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-toggle]').forEach(btn =>
      btn.addEventListener('click', () => toggleItem(btn.dataset.toggle, visibleItems.find(i => i.id == btn.dataset.toggle))));
    list.querySelectorAll('[data-delete-item]').forEach(btn =>
      btn.addEventListener('click', () => deleteItem(btn.dataset.deleteItem)));
    list.querySelectorAll('[data-move-up]').forEach(btn =>
      btn.addEventListener('click', () => moveItem(btn.dataset.moveUp, visibleItems, -1)));
    list.querySelectorAll('[data-move-down]').forEach(btn =>
      btn.addEventListener('click', () => moveItem(btn.dataset.moveDown, visibleItems, 1)));
  }

  async function toggleItem(itemId, item) {
    try {
      await Shared.api(`/api/tvs/${tvId}/items/${itemId}`, {
        method: 'PATCH', body: JSON.stringify({ isActive: !item.isActive }),
      });
      await loadTV();
    } catch (e) {}
  }

  async function deleteItem(itemId) {
    if (!confirm('Remove this item?')) return;
    try {
      await Shared.api(`/api/tvs/${tvId}/items/${itemId}`, { method: 'DELETE' });
      await loadTV();
      Shared.showToast('Item removed');
    } catch (e) {}
  }

  async function moveItem(itemId, items, dir) {
    const idx = items.findIndex(i => i.id == itemId);
    if (idx < 0) return;
    const other = items[idx + dir];
    if (!other) return;
    const reordered = [...items];
    const tmpOrder = reordered[idx].sortOrder;
    reordered[idx] = { ...reordered[idx], sortOrder: other.sortOrder };
    reordered[idx + dir] = { ...other, sortOrder: tmpOrder };
    try {
      await Shared.api(`/api/tvs/${tvId}/items/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ items: reordered.map(i => ({ id: i.id, sortOrder: i.sortOrder })) }),
      });
      await loadTV();
    } catch (e) {}
  }

  async function loadTV() {
    try {
      tv = await Shared.api(`/api/tvs/${tvId}`);
      document.getElementById('tvTitle').textContent = tv.name;
      document.getElementById('tvSubtitle').textContent = tv.location || tv.slug;
      document.getElementById('displayToken').textContent = tv.displayToken;
      document.getElementById('playerLink').href = `/player.html?token=${tv.displayToken}`;
      renderItems(tv.items || []);
      renderAccess(tv.access || []);
    } catch (e) {
      if (e.status === 403 || (e.message && e.message.includes('403'))) {
        Shared.showToast('Access to this TV is not granted', 'error');
        setTimeout(() => { window.location.href = '/admin/tvs.html'; }, 1500);
      } else {
        document.getElementById('tvTitle').textContent = 'TV not found';
      }
    }
  }

  function renderAccess(access) {
    const tbody = document.getElementById('accessBody');
    if (!tbody) return;
    if (!access.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">No users with access</td></tr>';
      return;
    }
    tbody.innerHTML = access.map(a => `
      <tr>
        <td><strong>${Shared.escapeHtml(a.username)}</strong></td>
        <td>${Shared.escapeHtml(a.email)}</td>
        <td>${Shared.formatRelativeTime(a.createdAt)}</td>
        <td><button class="btn-icon danger" data-revoke="${a.userId}" title="Revoke">✕</button></td>
      </tr>
    `).join('');
    tbody.querySelectorAll('[data-revoke]').forEach(btn =>
      btn.addEventListener('click', () => revokeAccess(btn.dataset.revoke)));
  }

  async function revokeAccess(userId) {
    if (!confirm('Revoke access for this user?')) return;
    try {
      await Shared.api(`/api/tvs/${tvId}/access/${userId}`, { method: 'DELETE' });
      await loadTV();
      Shared.showToast('Access revoked');
    } catch (e) {}
  }

  async function openAddItemModal() {
    selectedMediaId = null;
    document.getElementById('itemDuration').value = '';
    document.getElementById('itemStartAt').value = '';
    document.getElementById('itemEndAt').value = '';
    const isActiveEl = document.getElementById('itemIsActive');
    if (isActiveEl) isActiveEl.checked = true;
    Shared.openModal('addItemModal');

    const grid = document.getElementById('modalMediaGrid');
    grid.innerHTML = '<p style="color:var(--gray-400);grid-column:1/-1">Loading...</p>';
    try {
      allMedia = await Shared.api('/api/media');
      if (!allMedia.length) {
        grid.innerHTML = '<p style="color:var(--gray-400);grid-column:1/-1">No media uploaded yet.</p>';
        document.getElementById('confirmAddItem').disabled = true;
        return;
      }
      document.getElementById('confirmAddItem').disabled = true;
      grid.innerHTML = allMedia.map(m => {
        const isImage   = m.mimeType?.startsWith('image/');
        const isYoutube = m.mimeType === 'youtube';
        const icon = isYoutube ? '▶️' : m.mimeType?.startsWith('video/') ? '🎬' : '🖼️';
        return `
          <div class="media-card" data-media-id="${m.id}" style="cursor:pointer">
            <div class="media-thumb">
              ${isImage ? `<img src="${Shared.escapeHtml(m.url)}" alt="">` : `<span>${icon}</span>`}
            </div>
            <div class="media-info">
              <div class="media-name" title="${Shared.escapeHtml(m.originalFilename)}">${Shared.escapeHtml(m.originalFilename)}</div>
              <div class="media-meta">${m.mimeType}</div>
            </div>
          </div>
        `;
      }).join('');
      grid.querySelectorAll('.media-card').forEach(card => {
        card.addEventListener('click', () => {
          grid.querySelectorAll('.media-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          selectedMediaId = parseInt(card.dataset.mediaId);
          document.getElementById('confirmAddItem').disabled = false;
        });
      });
    } catch (e) {}
  }

  async function confirmAddItem() {
    if (!selectedMediaId) return Shared.showToast('Select a media asset', 'error');
    const durationRaw = document.getElementById('itemDuration').value;
    const startAt = document.getElementById('itemStartAt').value;
    const endAt   = document.getElementById('itemEndAt').value;
    const isActive = document.getElementById('itemIsActive')?.checked ?? true;

    const body = {
      mediaAssetId: selectedMediaId,
      sortOrder: (tv?.items?.length ?? 0),
      durationSeconds: durationRaw ? parseInt(durationRaw) : null,
      startAt: startAt ? new Date(startAt).toISOString() : null,
      endAt:   endAt   ? new Date(endAt).toISOString()   : null,
      isActive: isActive,
    };

    try {
      await Shared.api(`/api/tvs/${tvId}/items`, { method: 'POST', body: JSON.stringify(body) });
      Shared.closeModal('addItemModal');
      await loadTV();
      Shared.showToast('Item added', 'success');
    } catch (e) {}
  }

  async function editTV() {
    const body = {};
    const name     = document.getElementById('editName').value.trim();
    const location = document.getElementById('editLocation').value.trim();
    const interval = parseInt(document.getElementById('editInterval').value);
    const isActive = document.getElementById('editIsActive').checked;
    const showEmergency = document.getElementById('editShowEmergency').checked;
    if (name) body.name = name;
    if (location !== undefined) body.location = location;
    if (!isNaN(interval)) body.cycleIntervalSeconds = interval;
    body.isActive = isActive;
    body.showEmergency = showEmergency;
    try {
      await Shared.api(`/api/tvs/${tvId}`, { method: 'PATCH', body: JSON.stringify(body) });
      Shared.closeModal('editTVModal');
      await loadTV();
      Shared.showToast('TV updated', 'success');
    } catch (e) {}
  }

  async function deleteTV() {
    if (!confirm(`Delete TV "${tv?.name}"? This cannot be undone.`)) return;
    try {
      await Shared.api(`/api/tvs/${tvId}`, { method: 'DELETE' });
      window.location.href = '/admin/tvs.html';
    } catch (e) {}
  }

  async function loadUsersForGrant() {
    try {
      const users = await Shared.api('/api/admin/users');
      const granted = tv?.access?.map(a => a.userId) || [];
      const select = document.getElementById('grantUserId');
      select.innerHTML = '<option value="">— select user —</option>' +
        users
          .filter(u => !granted.includes(u.id) && u.role !== 'admin')
          .map(u => `<option value="${u.id}">${Shared.escapeHtml(u.username)} (${Shared.escapeHtml(u.email)})</option>`)
          .join('');
    } catch (e) {}
  }

  async function grantAccess() {
    const userId = parseInt(document.getElementById('grantUserId').value);
    if (!userId) return Shared.showToast('Select a user', 'error');
    try {
      await Shared.api(`/api/tvs/${tvId}/access`, { method: 'POST', body: JSON.stringify({ userId }) });
      Shared.closeModal('grantAccessModal');
      await loadTV();
      Shared.showToast('Access granted', 'success');
    } catch (e) {}
  }

  async function init() {
    const user = await Shared.checkAuth();
    if (!user) return;
    await loadSidebar();
    await loadTV();

    // Copy token
    document.getElementById('copyTokenBtn').addEventListener('click', () => {
      const url = `${location.origin}/player.html?token=${tv?.displayToken}`;
      navigator.clipboard.writeText(url).then(() => Shared.showToast('Player URL copied', 'success'));
    });

    // Add item
    document.getElementById('addItemBtn').addEventListener('click', openAddItemModal);
    document.getElementById('closeAddItem').addEventListener('click', () => Shared.closeModal('addItemModal'));
    document.getElementById('cancelAddItem').addEventListener('click', () => Shared.closeModal('addItemModal'));
    document.getElementById('confirmAddItem').addEventListener('click', confirmAddItem);

    if (user.role === 'admin') {
      // Edit TV
      document.getElementById('editTVBtn').addEventListener('click', () => {
        document.getElementById('editName').value = tv.name;
        document.getElementById('editLocation').value = tv.location || '';
        document.getElementById('editInterval').value = tv.cycleIntervalSeconds;
        document.getElementById('editIsActive').checked = tv.isActive;
        document.getElementById('editShowEmergency').checked = !!tv.showEmergency;
        Shared.openModal('editTVModal');
      });
      document.getElementById('closeEditTV').addEventListener('click', () => Shared.closeModal('editTVModal'));
      document.getElementById('cancelEditTV').addEventListener('click', () => Shared.closeModal('editTVModal'));
      document.getElementById('confirmEditTV').addEventListener('click', editTV);

      // Delete TV
      document.getElementById('deleteTVBtn').addEventListener('click', deleteTV);

      // Grant access
      document.getElementById('grantAccessBtn').addEventListener('click', async () => {
        await loadUsersForGrant();
        Shared.openModal('grantAccessModal');
      });
      document.getElementById('closeGrantAccess').addEventListener('click', () => Shared.closeModal('grantAccessModal'));
      document.getElementById('cancelGrantAccess').addEventListener('click', () => Shared.closeModal('grantAccessModal'));
      document.getElementById('confirmGrantAccess').addEventListener('click', grantAccess);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
