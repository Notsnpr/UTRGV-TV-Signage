(function() {
  let media = [];

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
      document.querySelector('.nav-link[data-page="media"]')?.classList.add('active');
    }
  }

  function formatBytes(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function loadMedia() {
    try {
      media = await Shared.api('/api/media');
      const grid = document.getElementById('mediaGrid');
      if (!media.length) {
        grid.innerHTML = '<p style="color:var(--gray-400);grid-column:1/-1;padding:48px;text-align:center">No media yet. Upload files to get started.</p>';
        return;
      }
      grid.innerHTML = media.map(m => {
        const isImage   = m.mimeType?.startsWith('image/');
        const isYoutube = m.mimeType === 'youtube';
        const icon = isYoutube ? '▶️' : m.mimeType?.startsWith('video/') ? '🎬' : '🖼️';
        return `
          <div class="media-card fade-in">
            <div class="media-thumb">
              ${isImage ? `<img src="${Shared.escapeHtml(m.url)}" alt="">` : `<span>${icon}</span>`}
            </div>
            <div class="media-info">
              <div class="media-name" title="${Shared.escapeHtml(m.originalFilename)}">${Shared.escapeHtml(m.originalFilename)}</div>
              <div class="media-meta">${isYoutube ? 'YouTube' : formatBytes(m.fileSize)}</div>
            </div>
            <div class="media-actions">
              <button class="btn-icon danger" data-delete="${m.id}" title="Delete">✕</button>
            </div>
          </div>
        `;
      }).join('');
      grid.querySelectorAll('[data-delete]').forEach(btn =>
        btn.addEventListener('click', () => deleteMedia(btn.dataset.delete)));
    } catch (e) {}
  }

  async function deleteMedia(id) {
    const asset = media.find(m => m.id == id);
    if (!confirm(`Delete "${asset?.originalFilename}"?`)) return;
    try {
      await Shared.api(`/api/media/${id}`, { method: 'DELETE' });
      await loadMedia();
      Shared.showToast('Deleted');
    } catch (e) {}
  }

  async function uploadFiles(files) {
    if (!files.length) return;
    const formData = new FormData();
    for (const f of files) formData.append('files', f);
    try {
      const res = await fetch('/api/media/upload', {
        method: 'POST', credentials: 'same-origin', body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Upload failed');
      Shared.showToast(`Uploaded ${data.length} file${data.length !== 1 ? 's' : ''}`, 'success');
      await loadMedia();
    } catch (err) {
      Shared.showToast(err.message, 'error');
    }
  }

  async function addYouTube() {
    const url   = document.getElementById('youtubeUrl').value.trim();
    const title = document.getElementById('youtubeTitle').value.trim();
    if (!url) return Shared.showToast('URL is required', 'error');
    try {
      await Shared.api('/api/media/youtube', { method: 'POST', body: JSON.stringify({ url, title }) });
      Shared.closeModal('youtubeModal');
      document.getElementById('youtubeUrl').value = '';
      document.getElementById('youtubeTitle').value = '';
      await loadMedia();
      Shared.showToast('YouTube video added', 'success');
    } catch (e) {}
  }

  async function init() {
    const user = await Shared.checkAuth();
    if (!user) return;
    await loadSidebar();
    await loadMedia();

    // File input
    document.getElementById('fileInput').addEventListener('change', e => uploadFiles(Array.from(e.target.files)));

    // Drag & drop
    const zone = document.getElementById('uploadZone');
    zone.addEventListener('click', () => document.getElementById('fileInput').click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      uploadFiles(Array.from(e.dataTransfer.files));
    });

    // YouTube modal
    document.getElementById('addYouTubeBtn').addEventListener('click', () => Shared.openModal('youtubeModal'));
    document.getElementById('closeYouTube').addEventListener('click', () => Shared.closeModal('youtubeModal'));
    document.getElementById('cancelYouTube').addEventListener('click', () => Shared.closeModal('youtubeModal'));
    document.getElementById('confirmYouTube').addEventListener('click', addYouTube);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
