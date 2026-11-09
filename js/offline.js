/**
 * offline.js — everything that lets the installed app keep working with no
 * internet, and sync when it's back.
 *
 * HOW IT WORKS
 *  - Every successful data download is also saved on the device (IndexedDB),
 *    so the app can open and show the last-synced data offline.
 *  - These four actions can be done offline: record a payment, record a
 *    group/multiple-loan payment, add a borrower/loan, edit a borrower. They
 *    are saved in a queue on the device and sent to the server, in order,
 *    as soon as the connection is back. Each one carries a unique ID so the
 *    server can never record the same entry twice if a connection drops
 *    halfway through.
 *  - Everything else (voiding a payment, renewals, Settings, imports...)
 *    needs a live connection, because it depends on balances only the server
 *    calculates.
 *  - Balances, statuses and due dates are always calculated by the server, so
 *    offline they show the last-synced figures. Entries waiting to sync are
 *    marked "pending" and the figures update after they sync.
 */

const SAVED_OFFLINE_MSG = 'Saved on this device — it will sync automatically when you are online.';

function fetchWithTimeout(url, opts, ms){
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || 30000);
  return fetch(url, Object.assign({}, opts, { signal: ctl.signal })).finally(() => clearTimeout(t));
}

const OFFLINE = (() => {
  let _db = null;
  let items = [];            // mirror of the queue store (oldest first)
  let syncing = false;
  let lastSnapshotAt = null;
  let _paySet = null;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ---------- tiny IndexedDB helper ----------
  function openDb(){
    if(_db) return _db;
    _db = new Promise((resolve, reject) => {
      const r = indexedDB.open('lm_offline', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('kv');
        d.createObjectStore('queue', { keyPath: 'seq', autoIncrement: true });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return _db;
  }
  function run(store, mode, make){
    return openDb().then(d => new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const req = make(t.objectStore(store));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = t.onabort = () => reject(t.error);
    }));
  }
  const kvGet = k => run('kv', 'readonly', s => s.get(k));
  const kvSet = (k, v) => run('kv', 'readwrite', s => s.put(v, k));

  async function add(rec){ const seq = await run('queue', 'readwrite', s => s.add(rec)); rec.seq = seq; items.push(rec); _paySet = null; return rec; }
  async function save(rec){ await run('queue', 'readwrite', s => s.put(rec)); _paySet = null; }
  async function drop(rec){ await run('queue', 'readwrite', s => s.delete(rec.seq)); items = items.filter(i => i !== rec); _paySet = null; }

  const ready = (async () => {
    try { items = (await run('queue', 'readonly', s => s.getAll())) || []; items.sort((a, b) => a.seq - b.seq); } catch(e){ items = []; }
    try { const snap = await kvGet('snapshot'); lastSnapshotAt = snap ? snap.savedAt : null; } catch(e){}
    renderBar();
  })();

  // ---------- snapshot of the last downloaded data ----------
  function saveSnapshot(state){
    try {
      lastSnapshotAt = Date.now();
      const copy = JSON.parse(JSON.stringify(state)); // copy NOW, before pending entries are layered on top
      return kvSet('snapshot', { savedAt: lastSnapshotAt, data: copy }).catch(() => {});
    } catch(e){ return Promise.resolve(); }
  }
  async function loadSnapshot(){ try { return await kvGet('snapshot'); } catch(e){ return null; } }
  function snapshotTime(){ return lastSnapshotAt; }

  // ---------- OR numbers (same format the server uses: yyyymmdd-001) ----------
  function proposeOr(dateStr){
    const t = new Date();
    const today = t.getFullYear() + String(t.getMonth() + 1).padStart(2, '0') + String(t.getDate()).padStart(2, '0');
    const d = String(dateStr || '').slice(0, 10).replace(/-/g, '') || today;
    let max = 0;
    const scan = or => { const m = /^(\d{8})-(\d+)$/.exec(String(or || '')); if(m && m[1] === d) max = Math.max(max, parseInt(m[2], 10)); };
    ((typeof STATE !== 'undefined' && STATE && STATE.payments) || []).forEach(p => scan(p['OR / Reference No.']));
    items.filter(i => i.status !== 'failed').forEach(i => scan(i.proposedOr));
    return d + '-' + String(max + 1).padStart(3, '0');
  }

  // Called by postAction before every queueable write.
  function prepare(action, payload){
    if(action === 'addPayment') payload.proposedOr = proposeOr(payload.data && payload.data['Payment Date']);
    if(action === 'addGroupPayment') payload.proposedOr = proposeOr(payload.paymentDate);
  }

  function buildOptimistic(action, payload){
    if(action === 'addPayment') return { orNumber: payload.proposedOr };
    if(action === 'addGroupPayment'){
      const g = computeGroupAllocations(payload.householdId, payload.totalAmount);
      return { orNumber: payload.proposedOr, allocations: g.allocations, shortfall: g.shortfall };
    }
    return {};
  }

  // ---------- layering pending entries onto the displayed data ----------
  function overlayItem(state, rec){
    if(!state || rec.status === 'failed') return;
    const p = rec.payload || {};
    if(rec.action === 'addPayment'){
      state.payments = state.payments || [];
      state.payments.push(Object.assign({}, p.data, { 'OR / Reference No.': rec.proposedOr, Status: 'Payment Success', _pending: true }));
    } else if(rec.action === 'addGroupPayment'){
      state.payments = state.payments || [];
      ((rec.optimistic && rec.optimistic.allocations) || []).filter(a => a.amount > 0).forEach(a => {
        state.payments.push({ 'Payment Date': p.paymentDate, 'Borrower ID': a.borrowerId, 'Borrower Name': a.name, 'Loan Type': a.loanType,
          'Amount Paid': a.amount, 'Mode of Payment': p.mode, 'Received By': p.receivedBy, 'OR / Reference No.': rec.proposedOr,
          Status: 'Payment Success', _pending: true });
      });
    } else if(rec.action === 'updateBorrower'){
      const d = p.data || {};
      const row = (state.borrowers || []).find(b => (d._row && b._row === d._row) || (!d._row && String(b['Borrower ID']) === String(d['Borrower ID']) && b['Loan Type'] === d['Loan Type']));
      if(row) Object.keys(d).forEach(k => { if(k !== 'Borrower ID' && k !== '_row') row[k] = d[k]; });
    }
  }
  function applyOverlay(state){ items.filter(i => i.status === 'pending').forEach(i => overlayItem(state, i)); }

  function reservedBorrowerIds(){
    return items.filter(i => i.status === 'pending' && i.action === 'addBorrower' && i.payload.data)
      .map(i => String(i.payload.data['Borrower ID']));
  }
  function hasPendingPayment(id){
    if(!_paySet){
      _paySet = new Set();
      items.filter(i => i.status === 'pending').forEach(i => {
        if(i.action === 'addPayment' && i.payload.data) _paySet.add(String(i.payload.data['Borrower ID']));
        if(i.action === 'addGroupPayment') ((i.optimistic && i.optimistic.allocations) || []).forEach(a => _paySet.add(String(a.borrowerId)));
      });
    }
    return _paySet.has(String(id));
  }
  function pendingCount(){ return items.filter(i => i.status === 'pending').length; }

  // ---------- queueing ----------
  async function enqueue(action, payload){
    await ready;
    const rec = { clientId: payload.clientId, action, payload, createdAt: Date.now(), status: 'pending',
                  proposedOr: payload.proposedOr || null, optimistic: buildOptimistic(action, payload) };
    try { await add(rec); }
    catch(e){ alert('Could not save this entry on the device. Please connect to the internet and try again.'); return null; }
    if(typeof STATE !== 'undefined' && STATE) overlayItem(STATE, rec);
    renderBar();
    if(typeof render === 'function' && typeof STATE !== 'undefined' && STATE){ render(); }
    return Object.assign({ success: true, queued: true }, rec.optimistic);
  }

  function describe(i){
    const p = i.payload || {}, d = p.data || {};
    switch(i.action){
      case 'addPayment': return `Payment ${fmt(d['Amount Paid'])} — ${d['Borrower Name'] || 'Borrower ' + d['Borrower ID']} (${d['Payment Date'] || ''})`;
      case 'addGroupPayment': { const f = i.optimistic && i.optimistic.allocations && i.optimistic.allocations[0];
        return `Group / multiple-loan payment ${fmt(p.totalAmount)} — ${f ? f.name : 'Household ' + p.householdId} (${p.paymentDate || ''})`; }
      case 'addBorrower': return `New loan — ${d['Last Name'] || ''}, ${d['First Name'] || ''} (${d['Loan Type'] || ''}, ID ${d['Borrower ID']})`;
      case 'updateBorrower': return `Edit borrower — ${d['Last Name'] || ''}, ${d['First Name'] || ''} (ID ${d['Borrower ID']})`;
    }
    return i.action;
  }

  // ---------- syncing ----------
  async function sync(){
    await ready;
    if(syncing || navigator.onLine === false) return { synced: 0 };
    const pend = items.filter(i => i.status === 'pending');
    if(!pend.length) return { synced: 0 };
    syncing = true; renderBar();
    let synced = 0;
    try {
      for(const it of pend){
        let out;
        try {
          const res = await fetchWithTimeout(API_URL, { method: 'POST', body: JSON.stringify(Object.assign({}, it.payload, { fromQueue: true })) }, 45000);
          out = await res.json();
        } catch(e){ break; } // still can't reach the server — keep this and everything after it, in order
        if(out && out.error){
          if(out.retry) break;
          it.status = 'failed'; it.error = out.error; await save(it);
          continue;
        }
        if(it.proposedOr && out && out.orNumber && out.orNumber !== it.proposedOr){
          it.status = 'notice';
          it.note = `The receipt number you saw offline (${it.proposedOr}) was recorded as ${out.orNumber}. If you handed out a printed receipt, please correct it.`;
          await save(it);
        } else {
          await drop(it);
        }
        synced++;
      }
    } finally { syncing = false; renderBar(); }
    return { synced };
  }

  // ---------- the status bar and review screen ----------
  function renderBar(){
    const bar = document.getElementById('offlineBar');
    if(!bar) return;
    const pend = items.filter(i => i.status === 'pending').length;
    const failed = items.filter(i => i.status === 'failed').length;
    const notices = items.filter(i => i.status === 'notice').length;
    const offline = navigator.onLine === false;
    const parts = []; let cls = '';
    if(offline){ parts.push('You are offline — keep working. Entries are saved on this device and sync automatically when you are back online.'); cls = 'offline'; }
    if(pend) { parts.push(syncing ? `Syncing ${pend} saved ${pend === 1 ? 'entry' : 'entries'}…` : `${pend} saved ${pend === 1 ? 'entry is' : 'entries are'} waiting to sync.`); cls = cls || 'pending'; }
    if(notices){ parts.push(`${notices} receipt number ${notices === 1 ? 'change' : 'changes'} to review.`); cls = cls || 'pending'; }
    if(failed){ parts.push(`${failed} ${failed === 1 ? 'entry' : 'entries'} could not be saved to the server — tap to review.`); cls = 'failed'; }
    bar.className = 'offline-bar' + (cls ? ' ' + cls : '');
    bar.style.display = parts.length ? '' : 'none';
    bar.textContent = parts.join(' ');
    bar.dataset.reviewable = (pend || failed || notices) ? '1' : '';
  }

  function openReview(){
    const body = document.getElementById('syncModalBody');
    if(!body) return;
    body.innerHTML = items.length ? items.map(i => {
      const when = new Date(i.createdAt).toLocaleString();
      const state = i.status === 'failed' ? '<span class="status-pill status-Past-Due">Not saved</span>'
        : i.status === 'notice' ? '<span class="status-pill status-Nearly-Due">Synced — check receipt</span>'
        : '<span class="status-pill status-Nearly-Due">Waiting to sync</span>';
      const msg = i.status === 'failed' ? `<div class="err">${esc(i.error)}</div>` : (i.status === 'notice' ? `<div class="note">${esc(i.note)}</div>` : '');
      const btns = i.status === 'failed' ? `<button class="btn small gold" onclick="OFFLINE.retry(${i.seq})">Try again</button> <button class="btn small danger" onclick="OFFLINE.discard(${i.seq})">Discard</button>`
        : i.status === 'notice' ? `<button class="btn small ghost" onclick="OFFLINE.dismiss(${i.seq})">Dismiss</button>`
        : `<button class="btn small danger" onclick="OFFLINE.discard(${i.seq})">Discard</button>`;
      return `<div class="sync-item"><div style="font-weight:700;">${esc(describe(i))}</div><div style="font-size:.72rem;color:var(--muted);margin:2px 0 6px;">Entered ${esc(when)} ${state}</div>${msg}<div style="margin-top:6px;">${btns}</div></div>`;
    }).join('') : '<div class="empty">Nothing waiting.</div>';
    openModal('syncModal');
  }
  async function retry(seq){ const r = items.find(i => i.seq === seq); if(!r) return; r.status = 'pending'; r.error = null; await save(r); renderBar(); openReview(); if(typeof loadData === 'function') loadData(); }
  async function dismiss(seq){ const r = items.find(i => i.seq === seq); if(r){ await drop(r); } renderBar(); openReview(); }
  async function discard(seq){
    const r = items.find(i => i.seq === seq); if(!r) return;
    if(!confirm('Discard this entry? It will NOT be saved to the system.')) return;
    await drop(r); renderBar(); openReview();
    if(navigator.onLine !== false && typeof loadData === 'function') loadData();
    else { const snap = await loadSnapshot(); if(snap && typeof STATE !== 'undefined'){ STATE = snap.data; applyOverlay(STATE); if(typeof render === 'function') render(); } }
  }

  // ---------- Statements of Account: keep a copy of each one viewed ----------
  async function fetchSOA(url, key){
    try {
      const res = await fetchWithTimeout(url, {}, 30000);
      const soa = await res.json();
      if(soa && !soa.error) kvSet('soa:' + key, { savedAt: Date.now(), soa }).catch(() => {});
      return { soa, cachedAt: null };
    } catch(e){
      let hit = null; try { hit = await kvGet('soa:' + key); } catch(e2){}
      return hit ? { soa: hit.soa, cachedAt: hit.savedAt } : { soa: null, cachedAt: null, missing: true };
    }
  }

  document.addEventListener('click', e => {
    const bar = e.target.closest && e.target.closest('#offlineBar');
    if(bar && bar.dataset.reviewable) openReview();
  });

  return { ready, enqueue, prepare, sync, renderBar, openReview, retry, dismiss, discard,
           saveSnapshot, loadSnapshot, snapshotTime, applyOverlay, reservedBorrowerIds, hasPendingPayment, pendingCount, fetchSOA };
})();
