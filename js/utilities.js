function fmt(n){ return n===null||n===undefined ? '—' : '₱' + (Number(n)||0).toLocaleString(undefined,{maximumFractionDigits:0}); }
function fmtDate(s){
  if(!s) return '—';
  const str = String(s).slice(0,10); // expects yyyy-mm-dd
  const parts = str.split('-');
  if(parts.length !== 3) return str;
  const [y,m,d] = parts;
  return `${m}-${d}-${y}`;
}

function openModal(id){
  document.getElementById('reportOutput')?.classList.remove('open'); // only one print target active at a time
  document.getElementById('collectionsOutput')?.classList.remove('open');
  document.getElementById(id).classList.add('open');
}
function closeModal(id){ document.getElementById(id).classList.remove('open'); }

const EYE_ICON = '<svg viewBox="0 0 24 24"><path d="M23.271,9.419C21.72,6.893,18.192,2.655,12,2.655S2.28,6.893.729,9.419a4.908,4.908,0,0,0,0,5.162C2.28,17.107,5.808,21.345,12,21.345s9.72-4.238,11.271-6.764A4.908,4.908,0,0,0,23.271,9.419Zm-1.705,4.115C20.234,15.7,17.219,19.345,12,19.345S3.766,15.7,2.434,13.534a2.918,2.918,0,0,1,0-3.068C3.766,8.3,6.781,4.655,12,4.655s8.234,3.641,9.566,5.811A2.918,2.918,0,0,1,21.566,13.534Z"/><path d="M12,7a5,5,0,1,0,5,5A5.006,5.006,0,0,0,12,7Zm0,8a3,3,0,1,1,3-3A3,3,0,0,1,12,15Z"/></svg>';
const EYE_CROSSED_ICON = '<svg viewBox="0 0 24 24"><path d="M23.271,9.419A15.866,15.866,0,0,0,19.9,5.51l2.8-2.8a1,1,0,0,0-1.414-1.414L18.241,4.345A12.054,12.054,0,0,0,12,2.655C5.809,2.655,2.281,6.893.729,9.419a4.908,4.908,0,0,0,0,5.162A15.866,15.866,0,0,0,4.1,18.49l-2.8,2.8a1,1,0,1,0,1.414,1.414l3.052-3.052A12.054,12.054,0,0,0,12,21.345c6.191,0,9.719-4.238,11.271-6.764A4.908,4.908,0,0,0,23.271,9.419ZM2.433,13.534a2.918,2.918,0,0,1,0-3.068C3.767,8.3,6.782,4.655,12,4.655A10.1,10.1,0,0,1,16.766,5.82L14.753,7.833a4.992,4.992,0,0,0-6.92,6.92l-2.31,2.31A13.723,13.723,0,0,1,2.433,13.534ZM15,12a3,3,0,0,1-3,3,2.951,2.951,0,0,1-1.285-.3L14.7,10.715A2.951,2.951,0,0,1,15,12ZM9,12a3,3,0,0,1,3-3,2.951,2.951,0,0,1,1.285.3L9.3,13.285A2.951,2.951,0,0,1,9,12Zm12.567,1.534C20.233,15.7,17.218,19.345,12,19.345A10.1,10.1,0,0,1,7.234,18.18l2.013-2.013a4.992,4.992,0,0,0,6.92-6.92l2.31-2.31a13.723,13.723,0,0,1,3.09,3.529A2.918,2.918,0,0,1,21.567,13.534Z"/></svg>';


function togglePasswordField(inputId, btn){
  const input = document.getElementById(inputId);
  if(!input) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.innerHTML = showing ? EYE_ICON : EYE_CROSSED_ICON;
  btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
}

document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape'){
    document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
  }
  if(e.key === 'Enter'){
    const openModalEl = document.querySelector('.modal-backdrop.open');
    if(!openModalEl) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if(tag === 'textarea') return; // allow multi-line fields to insert a newline normally
    const form = openModalEl.querySelector('form');
    if(!form) return;
    e.preventDefault();
    if(typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', {cancelable:true}));
  }
});

// Matches "Bonus Loan", "Year-End Bonus Loan", "Mid-Year Bonus Loan", or any
// other Bonus Loan variant configured in Settings — loan type names come
// from whatever's in the LoanTypes sheet, so this can't be a strict match.
function isBonusLoanType(loanType){
  return typeof loanType === 'string' && loanType.indexOf('Bonus Loan') !== -1;
}

function setTodayDefault(inputId){
  const el = document.getElementById(inputId);
  if(el && !el.value) el.value = new Date().toISOString().slice(0,10);
}

let toastTimer = null;
function showToast(message, isError){
  const t = document.getElementById('appToast');
  if(!t) return;
  t.textContent = message;
  t.style.background = isError ? 'var(--bad)' : 'var(--good)';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ t.classList.remove('show'); }, 5000);
}

/** Shared Statement of Account renderer — used by the staff SOA modal
 *  (borrowers.js showSOA) and the Borrower/Viewer self-service portal
 *  (borrower-portal.js). Keeping this in one place means both views always
 *  show the exact same numbers/layout. */
function buildSOAHTML(soa){
  const b = soa.borrower, c = soa.computed;
  return `
    <h3 style="margin:0;">Manalo's Lending Corporation Inc.</h3>
    <div style="color:var(--muted);font-size:.75rem;">STATEMENT OF ACCOUNT — ${soa.soaNo}</div>
    <h4>Borrower</h4>
    <div class="soa-borrower-line">${b['Last Name']}, ${b['First Name']} &nbsp;•&nbsp; ID ${b['Borrower ID']}</div>
    <div class="soa-borrower-line">${b['Loan Type']} &nbsp;•&nbsp; Released ${fmtDate(b['Release Date'])}</div>
    <h4>Account Summary</h4>
    <table class="soa-account-summary">
      <tr><td>Loan Amount</td><td>${fmt(b['Loan Amount'])}</td></tr>
      <tr><td>Total Paid</td><td>${fmt(c.totalPaid)}</td></tr>
      <tr><td>Outstanding Balance (full loan)</td><td>${fmt(c.balance)}</td></tr>
      <tr><td>Amount Due This Cutoff</td><td>${fmt(c.cutoffAmountDue)}</td></tr>
      <tr><td>${b['Loan Type']==='Add-on Diminishing' ? 'Next Due / Renewal' : (isBonusLoanType(b['Loan Type']) ? 'Maturity Date' : 'Next Due Date')}</td><td>${fmtDate(c.nextDue)}</td></tr>
      <tr><td>Status</td><td class="soa-status-value">${c.status}</td></tr>
    </table>
    <h4>Payment History</h4>
    <table class="soa-payment-history">
      <thead><tr><th>Date</th><th>OR No.</th><th>Amount</th><th>Mode</th></tr></thead>
      <tbody>${(soa.payments||[]).length ? soa.payments.map(p=>`
        <tr><td>${fmtDate(p['Payment Date'])}</td><td>${p['OR / Reference No.']}</td><td>${fmt(p['Amount Paid'])}</td><td>${p['Mode of Payment']}</td></tr>
      `).join('') : '<tr><td colspan="4" class="empty">No payments recorded</td></tr>'}</tbody>
    </table>
    ${soa.schedule && soa.schedule.length ? `
    <h4>Cutoff Schedule</h4>
    <div class="schedule-wrap">
    <table class="schedule-table">
      <thead><tr><th>Due Date</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>${soa.schedule.map(r=>`
        <tr><td>${fmtDate(r.date)}</td><td>${fmt(r.amount)}</td><td><span class="status-pill status-${r.status.replace(/\s+/g,'-')}">${r.status}</span></td></tr>
      `).join('')}</tbody>
    </table>
    </div>` : ''}
    <div style="margin-top:16px;font-size:.72rem;color:var(--muted);">Generated ${fmtDate(soa.dateGenerated)}</div>
  `;
}
