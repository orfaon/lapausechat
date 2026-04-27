(function () {
  'use strict';

  if (window.__catGatekeeperLoaded) return;
  window.__catGatekeeperLoaded = true;

  let overlay = null;
  let countdownInterval = null;
  let remainingSeconds = 0;
  let initialized = false;

  /* ── Ask background for domain list + break state ─────────────── */
  try {
    chrome.runtime.sendMessage({ type: 'CONTENT_READY' }, (response) => {
      if (chrome.runtime.lastError || !response) return;

      const { hostname } = location;
      const domains = response.domains || [];
      const isTracked = domains.some(d => hostname === d || hostname.endsWith('.' + d));
      if (!isTracked) return;

      // This tab is tracked — set up visibility relay and message listener
      initialized = true;
      setupListeners();

      // Re-show cat if we're in the middle of a break
      if (response.isOnBreak && response.breakDuration > 0) {
        createOverlay(response.breakDuration);
      }

      // Initial visibility report
      chrome.runtime.sendMessage({ type: document.hidden ? 'TAB_HIDDEN' : 'TAB_VISIBLE' });
    });
  } catch (e) {}

  function setupListeners() {
    document.addEventListener('visibilitychange', () => {
      if (!initialized) return;
      const type = document.hidden ? 'TAB_HIDDEN' : 'TAB_VISIBLE';
      try { chrome.runtime.sendMessage({ type }); } catch (e) {}
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'SHOW_CAT') createOverlay(message.breakDuration);
      if (message.type === 'HIDE_CAT') removeOverlay();
    });
  }

  const MESSAGES = [
    "Ton chat ordonne une pause !",
    "Miaou ! Pose ce téléphone !",
    "Même les chats se reposent. Toi aussi !",
    "Internet sera encore là après ta pause…",
    "Purrfait moment pour souffler !",
    "Le chat a pris le contrôle. Résiste pas."
  ];

  let breakEndsAt = null; // timestamp absolu

  function createOverlay(seconds) {
  if (overlay) { breakEndsAt = Date.now() + seconds * 1000; return; }
  breakEndsAt = Date.now() + seconds * 1000;
  
    if (overlay) { remainingSeconds = seconds; return; }

    const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    overlay = document.createElement('div');
    overlay.id = '__cat-gatekeeper-overlay__';
    
    // Bloque la page sans la cacher
const blocker = document.createElement('div');
blocker.id = '__cat-gatekeeper-blocker__';
blocker.style.cssText = 'position:fixed;inset:0;z-index:2147483645;cursor:not-allowed';
document.documentElement.appendChild(blocker);

overlay.style.cssText = [
  'position:fixed','inset:0',
  'background:transparent',
  'z-index:2147483647',
  'display:flex','flex-direction:column',
  'align-items:center','justify-content:center',
  'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif',
  'color:#fff','text-align:center',
  'overflow:hidden',
  'pointer-events:none'
].join(';');

const videoUrl = chrome.runtime.getURL('background/cat.mp4');

overlay.innerHTML = `
  <div id="__cgk-video-wrap__" style="
    position:absolute;
    top:50px;left:50px;right:50px;bottom:50px;
    overflow:hidden;
    clip-path: polygon(
      0% 1.5%, 1% 0%, 3% 2%, 4% 0%, 7% 1%, 6% 3%, 10% 0%, 12% 2%, 11% 0%,
      17% 1.5%, 15% 0%, 22% 2%, 19% 0%, 26% 1%, 24% 3%, 32% 0%, 36% 1.5%,
      34% 0%, 41% 2%, 39% 0%, 46% 1%, 44% 0%, 50% 1.5%, 56% 0%, 58% 2%,
      57% 0%, 63% 1%, 61% 3%, 68% 0%, 73% 1.5%, 71% 0%, 78% 2%, 76% 0%,
      83% 1%, 81% 3%, 88% 0%, 93% 1.5%, 91% 0%, 96% 2%, 94% 0%, 99% 1%, 100% 0%,
      100% 3%, 98% 7%, 100% 11%, 97% 16%, 100% 21%, 98% 26%,
      100% 31%, 97% 36%, 100% 42%, 98% 47%, 100% 50%,
      98% 54%, 100% 59%, 97% 64%, 100% 69%, 98% 74%,
      100% 79%, 97% 84%, 100% 89%, 98% 94%, 100% 100%,
      97% 98%, 95% 100%, 92% 97%, 90% 100%, 86% 98%, 84% 100%,
      80% 97%, 77% 100%, 73% 98%, 70% 100%, 66% 97%, 63% 100%,
      59% 98%, 56% 100%, 52% 97%, 50% 100%, 46% 98%, 43% 100%,
      39% 97%, 36% 100%, 32% 98%, 29% 100%, 25% 97%, 22% 100%,
      18% 98%, 15% 100%, 11% 97%, 8% 100%, 5% 98%, 2% 100%, 0% 100%,
      2% 95%, 0% 90%, 3% 85%, 0% 80%, 2% 75%, 0% 70%,
      3% 65%, 0% 60%, 2% 55%, 0% 50%, 3% 44%, 0% 39%,
      2% 34%, 0% 29%, 3% 24%, 0% 19%, 2% 14%, 0% 8%, 2% 4%
    );
  ">
    <video autoplay loop muted playsinline
      style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;">
      <source src="${videoUrl}" type="video/mp4">
    </video>
    <div style="position:absolute;inset:0;background:rgba(12,8,28,0.5);z-index:1"></div>
  </div>

  <div id="__cgk-inner__" style="position:relative;z-index:3;pointer-events:auto;animation:cgkPop 0.55s cubic-bezier(.175,.885,.32,1.275) both;display:flex;flex-direction:column;align-items:center;padding:20px">
    <h2 style="margin:12px 0 6px;font-size:1.7em;font-weight:800;color:#F4A340;text-shadow:0 0 20px rgba(244,163,64,0.6)">${msg}</h2>
    <p style="margin:0 0 20px;font-size:1em;color:#bbb;max-width:340px;line-height:1.5">Prends une vraie pause. Le minuteur te libère dans&nbsp;:</p>
    <div id="__cgk-countdown__" style="font-size:4em;font-weight:900;color:#F4A340;letter-spacing:3px;text-shadow:0 0 40px rgba(244,163,64,0.7);font-variant-numeric:tabular-nums"></div>
    <p style="margin-top:14px;font-size:0.8em;color:#555">Le chat partira quand le timer sera terminé</p>
  </div>

  <style>
    @keyframes cgkPop { 0%{transform:scale(0.2) translateY(60px);opacity:0} 100%{transform:scale(1) translateY(0);opacity:1} }
    @keyframes cgkPulse { 0%,100%{text-shadow:0 0 40px rgba(244,163,64,0.7)} 50%{text-shadow:0 0 60px rgba(244,163,64,1)} }
    #__cgk-countdown__ { animation:cgkPulse 1s ease-in-out infinite }
  </style>
`;
      

    document.documentElement.style.overflow = 'hidden';
    document.documentElement.appendChild(overlay);

    remainingSeconds = seconds;
    renderCountdown();
    
      countdownInterval = setInterval(() => {
    remainingSeconds = Math.max(0, Math.floor((breakEndsAt - Date.now()) / 1000));
    renderCountdown();
    if (remainingSeconds <= 0) {
      stopCountdown();
      removeOverlay();
      try { chrome.runtime.sendMessage({ type: 'BREAK_ENDED' }); } catch (e) {}
    }
  }, 1000);
  }

  function renderCountdown() {
    const el = document.getElementById('__cgk-countdown__');
    if (!el) return;
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  function stopCountdown() {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  }

  function removeOverlay() {
    stopCountdown();
    if (overlay) { overlay.remove(); overlay = null; }
    const blocker = document.getElementById('__cat-gatekeeper-blocker__');
    if (blocker) blocker.remove();
    document.documentElement.style.overflow = '';
  }
})();
