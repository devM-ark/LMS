/**
 * pwa.js — makes the app installable and registers the offline service worker.
 * Loads last. Also reacts to the device going offline / back online.
 */
(function(){
  if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')){
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if(hadController && typeof showToast === 'function') showToast('App updated — reload the page to use the newest version.');
      hadController = true;
    });
  }

  // Install button (Chrome / Edge / Android). iPhone/iPad have no install event, so show a hint instead.
  let deferred = null;
  const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  const buttons = () => document.querySelectorAll('.install-app-btn');
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; buttons().forEach(b => b.style.display = ''); });
  window.addEventListener('appinstalled', () => { deferred = null; buttons().forEach(b => b.style.display = 'none'); if(typeof showToast === 'function') showToast('App installed.'); });
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('.install-app-btn');
    if(!b || !deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch(err){}
    deferred = null; buttons().forEach(x => x.style.display = 'none');
  });
  // Safari has no install button event, so show the steps instead (iPhone/iPad and Mac Safari).
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1); // iPadOS reports as a Mac
  const isMacSafari = !isIOS && /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(ua);
  const hint = document.getElementById('iosInstallHint');
  if(hint && !standalone && (isIOS || isMacSafari)){
    hint.textContent = isIOS
      ? 'To install on iPhone / iPad: open this page in Safari, tap the Share button, then "Add to Home Screen". Open the installed app once while online and sign in.'
      : 'To install on Mac: in Safari choose File → Add to Dock. Open the installed app once while online and sign in.';
    hint.style.display = '';
  }
  // Ask the browser not to clear this app's saved data when the device is low on space.
  if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  window.addEventListener('online', () => { OFFLINE.renderBar(); if(typeof SESSION !== 'undefined' && SESSION && typeof loadData === 'function') loadData(); });
  window.addEventListener('offline', () => {
    OFFLINE.renderBar();
    const el = document.getElementById('syncStatus');
    if(el){ el.textContent = 'Offline'; el.className = 'sync err'; }
  });
})();
