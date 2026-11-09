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
  if(/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone){
    const hint = document.getElementById('iosInstallHint'); if(hint) hint.style.display = '';
  }

  window.addEventListener('online', () => { OFFLINE.renderBar(); if(typeof SESSION !== 'undefined' && SESSION && typeof loadData === 'function') loadData(); });
  window.addEventListener('offline', () => {
    OFFLINE.renderBar();
    const el = document.getElementById('syncStatus');
    if(el){ el.textContent = 'Offline'; el.className = 'sync err'; }
  });
})();
