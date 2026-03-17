// UTRGV TV Player
(function() {
  const playerEl    = document.getElementById('player');
  const overlay     = document.getElementById('overlay');
  const startBtn    = document.getElementById('startBtn');
  const loadingEl   = document.getElementById('loading');
  const errorEl     = document.getElementById('error');
  const errorMsgEl  = document.getElementById('errorMessage');
  const progressEl  = document.getElementById('progress');
  const progressBar = document.getElementById('progressBar');
  const tvInfo      = document.getElementById('tvInfo');
  const tvNameEl    = document.getElementById('tvName');
  const itemInfoEl  = document.getElementById('itemInfo');

  let tv = null;
  let items = [];
  let currentIndex = 0;
  let currentTimer = null;
  let progressInterval = null;
  let isPlaying = false;
  let infoTimeout = null;

  function getToken() {
    return new URLSearchParams(window.location.search).get('token');
  }

  function parseYoutubeId(url) {
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function showError(title, msg) {
    loadingEl.classList.add('hidden');
    overlay.classList.add('hidden');
    errorEl.querySelector('h2').textContent = title;
    errorMsgEl.textContent = msg;
    errorEl.classList.remove('hidden');
  }

  function showInfo() {
    tvInfo.classList.add('visible');
    if (infoTimeout) clearTimeout(infoTimeout);
    infoTimeout = setTimeout(() => tvInfo.classList.remove('visible'), 3000);
  }

  function updateItemInfo() {
    if (!items.length) return;
    itemInfoEl.textContent = `${currentIndex + 1} of ${items.length}`;
  }

  function clearPlayer() {
    if (currentTimer)    { clearTimeout(currentTimer);   currentTimer = null; }
    if (progressInterval){ clearInterval(progressInterval); progressInterval = null; }
    progressBar.style.width = '0%';
    const current = playerEl.querySelector('.visible');
    if (current) {
      current.classList.remove('visible');
      current.classList.add('exiting');
      setTimeout(() => { if (current.parentNode) current.remove(); }, 500);
    }
  }

  function startProgress(durationMs) {
    progressEl.classList.add('visible');
    progressBar.style.width = '0%';
    const start = Date.now();
    progressInterval = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - start) / durationMs) * 100);
      progressBar.style.width = pct + '%';
      if (pct >= 100) clearInterval(progressInterval);
    }, 50);
  }

  function nextItem() {
    if (!items.length) return;
    playItem((currentIndex + 1) % items.length);
  }

  function playItem(index) {
    if (!items.length) { showError('No content', 'This TV has no active items.'); return; }
    currentIndex = index % items.length;
    const item = items[currentIndex];
    clearPlayer();
    updateItemInfo();
    showInfo();

    const durationMs = (item.durationSeconds ?? tv.cycleIntervalSeconds ?? 10) * 1000;

    if (item.mimeType === 'youtube') {
      playYoutube(item, durationMs);
    } else if (item.mimeType.startsWith('video/')) {
      playVideo(item, durationMs);
    } else {
      playImage(item, durationMs);
    }
  }

  function playImage(item, durationMs) {
    const img = document.createElement('img');
    img.src = item.mediaUrl;
    img.alt = '';
    img.onload = () => img.classList.add('visible');
    img.onerror = () => { console.warn('Image failed:', item.mediaUrl); nextItem(); };
    playerEl.appendChild(img);
    setTimeout(() => img.classList.add('visible'), 100);
    startProgress(durationMs);
    currentTimer = setTimeout(nextItem, durationMs);
  }

  function playVideo(item, durationMs) {
    const video = document.createElement('video');
    video.src = item.mediaUrl;
    video.autoplay = true; video.muted = true; video.playsInline = true; video.loop = false;
    video.oncanplay = () => video.classList.add('visible');
    video.onerror = () => { console.warn('Video failed:', item.mediaUrl); nextItem(); };
    playerEl.appendChild(video);
    setTimeout(() => video.classList.add('visible'), 100);
    startProgress(durationMs);
    currentTimer = setTimeout(() => { video.pause(); nextItem(); }, durationMs);
    video.play().catch(() => {});
  }

  function playYoutube(item, durationMs) {
    const videoId = parseYoutubeId(item.mediaUrl);
    if (!videoId) { console.warn('Bad YouTube URL:', item.mediaUrl); nextItem(); return; }
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1`;
    iframe.allow = 'autoplay; encrypted-media';
    iframe.allowFullscreen = true;
    iframe.onload = () => iframe.classList.add('visible');
    playerEl.appendChild(iframe);
    setTimeout(() => iframe.classList.add('visible'), 100);
    startProgress(durationMs);
    currentTimer = setTimeout(nextItem, durationMs);
  }

  async function fetchTV() {
    const token = getToken();
    if (!token) { showError('No token', 'Add ?token=<displayToken> to the URL.'); return null; }
    try {
      const res = await fetch(`/api/public/tv/${token}`);
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error?.message || 'Failed to load TV');
      }
      return await res.json();
    } catch (err) {
      showError('Failed to load', err.message);
      return null;
    }
  }

  async function refreshTV() {
    const fresh = await fetchTV();
    if (!fresh) return;
    const changed = JSON.stringify(fresh.items) !== JSON.stringify(items);
    if (changed) {
      tv = fresh;
      items = fresh.items;
      tvNameEl.textContent = tv.name;
      if (isPlaying) { currentIndex = 0; playItem(0); }
    }
  }

  function startPlayback() {
    overlay.classList.add('hidden');
    isPlaying = true;
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    playItem(0);
  }

  startBtn.addEventListener('click', startPlayback);

  document.addEventListener('mousemove', () => { if (isPlaying) showInfo(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') nextItem();
    else if (e.key === 'ArrowLeft' && currentIndex > 0) playItem(currentIndex - 1);
    else if (e.key === 'f') {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen();
    }
  });

  async function init() {
    tv = await fetchTV();
    if (!tv) return;
    loadingEl.classList.add('hidden');
    items = tv.items;
    tvNameEl.textContent = tv.name;

    if (!items.length) { showError('No content', 'This TV has no active items.'); return; }

    updateItemInfo();
    isPlaying = true;
    overlay.classList.add('hidden');
    playItem(0);

    setInterval(refreshTV, 30000);
  }

  init();
})();
