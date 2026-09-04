function renderPaymentBorrowerResults(query){
  const box = document.getElementById('paymentBorrowerResults');
  if(!box) return;
  const q = (query||'').trim().toLowerCase();
  if(!q){ box.classList.remove('show'); box.innerHTML=''; return; }
  const eligible = (STATE?.borrowers||[]).filter(b => (b.status !== 'Paid' && b.status !== 'Renewed'));
  const matches = eligible.filter(b=>{
    const idStr = String(b['Borrower ID']||'').toLowerCase();
    const nameStr = `${b['Last Name']||''} ${b['First Name']||''}`.toLowerCase();
    return idStr.includes(q) || nameStr.includes(q);
  }).slice(0,25);
  box.innerHTML = matches.length
    ? matches.map(b=>`<div class="item" data-id="${b['Borrower ID']}">${b['Borrower ID']} — ${b['Last Name']}, ${b['First Name']}</div>`).join('')
    : `<div class="item" style="color:var(--muted);cursor:default;">No matches</div>`;
  box.classList.add('show');
}

document.getElementById('paymentBorrowerSearch')?.addEventListener('input', (e)=>{
  document.getElementById('paymentBorrowerSelect').value = ''; // clear selection until re-picked from the list
  document.getElementById('paymentBorrowerName').value = '';
  renderPaymentBorrowerResults(e.target.value);
});

document.getElementById('paymentBorrowerResults')?.addEventListener('click', (e)=>{
  const item = e.target.closest('.item[data-id]');
  if(!item) return;
  selectPaymentBorrower(item.dataset.id);
  document.getElementById('paymentBorrowerResults').classList.remove('show');
});

function selectPaymentBorrower(id){
  const b = (STATE?.borrowers||[]).find(x => String(x['Borrower ID']) === String(id));
  if(!b) return;
  document.getElementById('paymentBorrowerSelect').value = id;
  document.getElementById('paymentBorrowerSearch').value = `${id} — ${b['Last Name']}, ${b['First Name']}`;
  document.getElementById('paymentBorrowerName').value = `${b['Last Name']}, ${b['First Name']}`;

  // Default (not locked) Mode of Payment based on whether this borrower's
  // ATM card is on file — staff can still change it to anything.
  const modeSelect = document.getElementById('paymentModeSelect');
  modeSelect.value = String(b['ATMOption']).trim().toLowerCase() === 'yes' ? 'ATM' : 'Cash';
  updateAtmChangeCalcVisibility();

  const amtInput = document.getElementById('paymentAmountInput');
  const isAmortized = b['Loan Type'] === 'Amortized Loan';
  const household = (STATE?.borrowers||[]).filter(x => String(x['Household ID'] || x['Borrower ID']) === String(b['Household ID'] || b['Borrower ID']));
  const isGroup = household.length > 1;

  document.getElementById('paymentAmountLabel').style.display = (isAmortized || isGroup) ? 'none' : '';
  document.getElementById('amortizedSplitWrap').style.display = (isAmortized && !isGroup) ? '' : 'none';
  document.getElementById('groupPaymentWrap').style.display = isGroup ? '' : 'none';

  if(isGroup){
    document.getElementById('groupTotalAmountInput').value = '';
    document.getElementById('groupPaymentPreview').innerHTML = '';
    updateGroupPaymentPreview();
    return;
  }

  if(isAmortized){
    const interestDue = Math.round((Number(b['Loan Amount'])||0) * 0.025 * 100) / 100;
    document.getElementById('amortizedInterestInput').value = interestDue || '';
    document.getElementById('amortizedPrincipalInput').value = '';
    syncAmortizedSplit();
  } else if(amtInput){
    const hasFixedCutoff = b['Loan Type'] !== 'Add-on Diminishing' && !isBonusLoanType(b['Loan Type']) && Number(b['Amount/Cut-off']) > 0;
    if(hasFixedCutoff){
      amtInput.value = Number(b['Amount/Cut-off']); // pre-filled, still editable (partial/catch-up payments happen)
      amtInput.placeholder = '';
    } else {
      amtInput.value = '';
      amtInput.placeholder = b['Loan Type'] === 'Add-on Diminishing' ? 'No fixed amount — enter payment' : 'Enter payment amount';
    }
  }
}

/** Amortized loans split "Amount Paid" into interest + principal in the UI
 *  for clarity (the per-cutoff amount is pure interest — it never reduces
 *  the balance on its own, only whatever's paid beyond it does, per
 *  computeAmortized in LoanCalculationService.gs). The hidden Amount Paid
 *  field is just their sum, so nothing else in the form/backend needs to
 *  know this split UI exists — it submits as one ordinary payment. */
function syncAmortizedSplit(){
  const interest = Number(document.getElementById('amortizedInterestInput').value) || 0;
  const principal = Number(document.getElementById('amortizedPrincipalInput').value) || 0;
  const amtInput = document.getElementById('paymentAmountInput');
  amtInput.value = interest + principal;
  amtInput.dispatchEvent(new Event('input')); // keep the ATM change calculator in sync
}
document.getElementById('amortizedInterestInput').addEventListener('input', syncAmortizedSplit);
document.getElementById('amortizedPrincipalInput').addEventListener('input', syncAmortizedSplit);

document.addEventListener('click', (e)=>{
  if(e.target.id !== 'paymentBorrowerSearch' && !e.target.closest('#paymentBorrowerResults')){
    document.getElementById('paymentBorrowerResults')?.classList.remove('show');
  }
});

function buildReceiptCopy(payment, borrower, copyLabel){
  const companyName = (STATE?.settings && STATE.settings.CompanyName) || "Manalo's Lending Corporation";
  const name = payment['Borrower Name'] || (borrower ? `${borrower['Last Name']}, ${borrower['First Name']}` : String(payment['Borrower ID']));
  const loanType = borrower ? borrower['Loan Type'] : '—';
  return `
    <div class="receipt-copy">
      <div style="text-align:center;border-bottom:2px solid var(--gold);padding-bottom:8px;margin-bottom:10px;">
        <div style="font-family:Arial,sans-serif;font-weight:bold;font-size:.95rem;color:var(--navy);">${companyName}</div>
        <div style="font-family:Arial,sans-serif;font-size:.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-top:2px;">Official Receipt</div>
        <div style="font-family:Arial,sans-serif;font-size:.62rem;color:var(--gold);text-transform:uppercase;letter-spacing:.08em;margin-top:4px;font-weight:700;">${copyLabel}</div>
      </div>
      <table style="width:100%;font-family:Arial,sans-serif;font-size:.72rem;border-collapse:collapse;">
        <tr><td style="padding:3px 0;color:var(--muted);">OR No.</td><td style="padding:3px 0;text-align:right;font-weight:700;">${payment['OR / Reference No.']}</td></tr>
        <tr><td style="padding:3px 0;color:var(--muted);">Date</td><td style="padding:3px 0;text-align:right;">${fmtDate(payment['Payment Date'])}</td></tr>
        <tr><td style="padding:3px 0;color:var(--muted);">Borrower</td><td style="padding:3px 0;text-align:right;">${name}</td></tr>
        <tr><td style="padding:3px 0;color:var(--muted);">Loan Type</td><td style="padding:3px 0;text-align:right;">${loanType}</td></tr>
        <tr><td colspan="2" style="border-top:1px solid var(--line);padding-top:6px;"></td></tr>
        <tr><td style="padding:3px 0;font-weight:700;color:var(--navy);">Amount Paid</td><td style="padding:3px 0;text-align:right;font-weight:700;color:var(--navy);font-size:.9rem;">${fmt(payment['Amount Paid'])}</td></tr>
        <tr><td style="padding:3px 0;color:var(--muted);">Mode of Payment</td><td style="padding:3px 0;text-align:right;">${payment['Mode of Payment']}</td></tr>
        <tr><td style="padding:3px 0;color:var(--muted);">Received By</td><td style="padding:3px 0;text-align:right;">${payment['Received By'] || '—'}</td></tr>
      </table>
      <div style="text-align:center;font-size:.6rem;color:var(--muted);margin-top:10px;font-style:italic;">This receipt is system generated.</div>
    </div>`;
}

function buildReceiptHTML(payment, borrower){
  return `<div class="receipt-copies">
    ${buildReceiptCopy(payment, borrower, 'Borrower Copy')}
    <div class="receipt-divider"></div>
    ${buildReceiptCopy(payment, borrower, 'Company Copy')}
  </div>`;
}

function showReceipt(payment, borrower){
  document.getElementById('receiptContent').innerHTML = buildReceiptHTML(payment, borrower);
  openModal('receiptModal');
}

function showReceiptForRow(rowNum){
  const payment = (STATE?.payments||[]).find(p => p._row === rowNum);
  if(!payment){ alert('Payment not found.'); return; }
  const borrower = (STATE?.borrowers||[]).find(b => String(b['Borrower ID']) === String(payment['Borrower ID']));
  showReceipt(payment, borrower);
}

document.getElementById('paymentForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  if(btn.disabled) return;
  if(!document.getElementById('paymentBorrowerSelect').value){
    document.getElementById('paymentMsg').textContent = 'Please pick a borrower from the search results.';
    document.getElementById('paymentMsg').style.color = 'var(--bad)';
    return;
  }
  if(document.getElementById('groupPaymentWrap').style.display !== 'none'){
    return submitGroupPayment(btn);
  }
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Saving…';
  const data = Object.fromEntries(new FormData(e.target));
  const msgEl = document.getElementById('paymentMsg');
  msgEl.textContent = 'Please wait while we record the payment.';
  msgEl.style.color = 'var(--muted)';
  try{
    const out = await postAction('addPayment', {data});
    if(out){
      showToast('Payment recorded successfully.');
      e.target.reset();
      document.getElementById('paymentBorrowerName').value = '';
      document.getElementById('paymentAmountInput').placeholder = '';
      setTodayDefault('paymentDateInput');
      document.getElementById('paymentReceivedByInput').value = SESSION.name;
      await loadData();
      closeModal('addPaymentModal');
    } else {
      msgEl.textContent = '';
    }
  } finally { btn.disabled = false; btn.textContent = originalLabel; }
});

/** Live preview of how a group payment would be allocated — main borrower
 *  covered first, matches the same priority rule addGroupPayment applies
 *  server-side, so staff see exactly what will happen before submitting. */
function updateGroupPaymentPreview(){
  const previewEl = document.getElementById('groupPaymentPreview');
  const id = document.getElementById('paymentBorrowerSelect').value;
  const b = (STATE?.borrowers||[]).find(x => String(x['Borrower ID']) === String(id));
  if(!b){ previewEl.innerHTML = ''; return; }
  const householdId = b['Household ID'] || b['Borrower ID'];
  const members = (STATE?.borrowers||[]).filter(x => String(x['Household ID'] || x['Borrower ID']) === String(householdId));
  const splitLoans = members.filter(x => x['Loan Type']==='Regular Loan' || x['Loan Type']==='Amortized Loan')
    .sort((x,y) => (String(x['Borrower ID'])===String(householdId)?0:1) - (String(y['Borrower ID'])===String(householdId)?0:1));

  let remaining = Number(document.getElementById('groupTotalAmountInput').value) || 0;
  const rows = splitLoans.map(m => {
    const due = Number(m['Amount/Cut-off']) || 0;
    const amt = Math.max(0, Math.min(due, remaining));
    remaining = Math.round((remaining - amt) * 100) / 100;
    return { name: `${m['Last Name']}, ${m['First Name']}`, loanType: m['Loan Type'], due, amt, short: amt < due };
  });

  previewEl.innerHTML = rows.map(r =>
    `<div class="group-payment-row"><span>${r.name} (${r.loanType})</span><span>${fmt(r.amt)} / ${fmt(r.due)}${r.short ? ' <span style="color:var(--bad);font-weight:700;">SHORT</span>' : ''}</span></div>`
  ).join('');
}
document.getElementById('groupTotalAmountInput').addEventListener('input', updateGroupPaymentPreview);

async function submitGroupPayment(btn){
  const msgEl = document.getElementById('paymentMsg');
  const id = document.getElementById('paymentBorrowerSelect').value;
  const b = (STATE?.borrowers||[]).find(x => String(x['Borrower ID']) === String(id));
  const householdId = b['Household ID'] || b['Borrower ID'];
  const totalAmount = Number(document.getElementById('groupTotalAmountInput').value) || 0;
  if(totalAmount <= 0){ msgEl.textContent = 'Enter the total amount paid.'; msgEl.style.color = 'var(--bad)'; return; }

  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Saving…';
  msgEl.textContent = 'Please wait while we record the group payment.';
  msgEl.style.color = 'var(--muted)';
  try{
    const out = await postAction('addGroupPayment', {
      householdId,
      totalAmount,
      paymentDate: document.getElementById('paymentDateInput').value,
      mode: document.getElementById('paymentModeSelect').value,
      receivedBy: document.getElementById('paymentReceivedByInput').value
    });
    if(out && out.success){
      showToast(out.shortfall ? 'Payment recorded — some loans were short.' : 'Payment recorded successfully.');
      document.getElementById('paymentForm').reset();
      document.getElementById('paymentBorrowerName').value = '';
      document.getElementById('groupPaymentWrap').style.display = 'none';
      document.getElementById('paymentAmountLabel').style.display = '';
      setTodayDefault('paymentDateInput');
      document.getElementById('paymentReceivedByInput').value = SESSION.name;
      await loadData();
      closeModal('addPaymentModal');
      showGroupReceipt(out);
    } else {
      msgEl.textContent = '';
    }
  } finally { btn.disabled = false; btn.textContent = originalLabel; }
}

function showGroupReceipt(out){
  const companyName = (STATE?.settings && STATE.settings.CompanyName) || "Manalo's Lending Corporation Inc.";
  const rows = out.allocations.filter(a => a.amount > 0).map(a => `
    <tr><td style="padding:4px 0;">${a.name} <span style="color:var(--muted);">(${a.loanType})</span></td><td style="padding:4px 0;text-align:right;">${fmt(a.amount)}</td></tr>
  `).join('');
  const total = out.allocations.reduce((s,a) => s + a.amount, 0);
  document.getElementById('receiptContent').innerHTML = `
    <div style="text-align:center;border-bottom:2px solid var(--gold);padding-bottom:8px;margin-bottom:10px;">
      <div style="font-family:Arial,sans-serif;font-weight:bold;font-size:.95rem;color:var(--navy);">${companyName}</div>
      <div style="font-family:Arial,sans-serif;font-size:.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-top:2px;">Official Receipt — Group Loan Payment</div>
    </div>
    <table style="width:100%;font-family:Arial,sans-serif;font-size:.72rem;border-collapse:collapse;">
      <tr><td style="padding:3px 0;color:var(--muted);">OR No.</td><td style="padding:3px 0;text-align:right;font-weight:700;">${out.orNumber}</td></tr>
      <tr><td colspan="2" style="border-top:1px solid var(--line);padding-top:8px;font-weight:700;color:var(--navy);">Payment for:</td></tr>
      ${rows}
      <tr><td style="padding-top:6px;border-top:1px solid var(--line);font-weight:700;">Total</td><td style="padding-top:6px;border-top:1px solid var(--line);text-align:right;font-weight:700;">${fmt(total)}</td></tr>
    </table>
    ${out.shortfall ? `<div style="margin-top:10px;font-size:.72rem;color:var(--bad);">Note: the amount paid was short — one or more loans above did not receive their full amount due this cutoff.</div>` : ''}
    <div style="text-align:center;font-size:.6rem;color:var(--muted);margin-top:10px;font-style:italic;">This receipt is system generated.</div>
  `;
  openModal('receiptModal');
}

let voidingInFlight = false;
async function voidPayment(rowId){
  if(voidingInFlight) return;
  const reason = prompt('Reason for voiding this payment?');
  if(reason === null) return;
  voidingInFlight = true;
  try{ if(await postAction('voidPayment', {rowId, reason})) loadData(); }
  finally { voidingInFlight = false; }
}

function openAddPaymentModal(preselectBorrowerId){
  document.getElementById('paymentBorrowerSearch').value = '';
  document.getElementById('paymentBorrowerSelect').value = '';
  document.getElementById('paymentBorrowerName').value = '';
  const amtInput = document.getElementById('paymentAmountInput');
  amtInput.value = '';
  amtInput.placeholder = '';
  setTodayDefault('paymentDateInput');
  const rb = document.getElementById('paymentReceivedByInput');
  if(rb && SESSION && !rb.value) rb.value = SESSION.name;
  document.getElementById('paymentMsg').textContent = '';
  document.getElementById('atmAmountReceivedInput').value = '';
  document.getElementById('atmChangeResult').textContent = '';
  document.getElementById('amortizedInterestInput').value = '';
  document.getElementById('amortizedPrincipalInput').value = '';
  document.getElementById('paymentAmountLabel').style.display = '';
  document.getElementById('amortizedSplitWrap').style.display = 'none';
  document.getElementById('groupPaymentWrap').style.display = 'none';
  document.getElementById('groupTotalAmountInput').value = '';
  document.getElementById('groupPaymentPreview').innerHTML = '';
  updateAtmChangeCalcVisibility();
  openModal('addPaymentModal');
  if(preselectBorrowerId) selectPaymentBorrower(preselectBorrowerId);
}

/** Jumps from the Nearly Due / Past Due dashboard modals straight into
 *  Record Payment for that borrower, without staff needing to re-search. */
function payFromModal(borrowerId, sourceModalId){
  closeModal(sourceModalId);
  openAddPaymentModal(borrowerId);
}

/** ATM Change Calculator — a pure cash-counting helper for staff, never
 *  submitted with the payment. When a borrower's ATM deposit exceeds the
 *  amount actually being applied to their loan (the "Amount Paid" field),
 *  returning the excess as cash carries a fixed service charge: ₱10 per
 *  every ₱500 (or part thereof) of change — e.g. ₱1–500 change costs ₱10,
 *  ₱501–1000 costs ₱20, and so on. */
function updateAtmChangeCalcVisibility(){
  const isAtm = document.getElementById('paymentModeSelect').value === 'ATM';
  document.getElementById('atmChangeCalcWrap').style.display = isAtm ? '' : 'none';
  if(!isAtm){
    document.getElementById('atmAmountReceivedInput').value = '';
    document.getElementById('atmChangeResult').textContent = '';
  }
}

function updateAtmChangeCalc(){
  const resultEl = document.getElementById('atmChangeResult');
  const received = Number(document.getElementById('atmAmountReceivedInput').value) || 0;
  const paid = Number(document.getElementById('paymentAmountInput').value) || 0;
  const excess = received - paid;
  if(received <= 0 || excess <= 0){ resultEl.textContent = ''; return; }
  const charge = Math.ceil(excess / 500) * 10;
  const netChange = excess - charge;
  resultEl.innerHTML = `Change to give back: <b>${fmt(netChange)}</b> <span style="color:var(--muted);">(₱${excess.toLocaleString()} excess − ₱${charge} ATM change charge)</span>`;
}

document.getElementById('paymentModeSelect').addEventListener('change', updateAtmChangeCalcVisibility);
document.getElementById('atmAmountReceivedInput').addEventListener('input', updateAtmChangeCalc);
document.getElementById('paymentAmountInput').addEventListener('input', updateAtmChangeCalc);

let paymentsSearchQuery = '';
let paymentsSort = { key: 'Payment Date', dir: -1 }; // default: newest first

document.querySelectorAll('th.sortable[data-table="payments"]').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.key;
    paymentsSort.dir = (paymentsSort.key === key) ? -paymentsSort.dir : 1;
    paymentsSort.key = key;
    renderPaymentsTable();
  });
});

document.getElementById('paymentsSearchInput')?.addEventListener('input', (e)=>{
  paymentsSearchQuery = e.target.value;
  renderPaymentsTable();
});

function renderPaymentsTable(){
  const ptbody = document.querySelector('#paymentsTable tbody');
  if(!ptbody || !STATE) return;
  const payments = STATE.payments || [];
  const q = paymentsSearchQuery.trim().toLowerCase();
  let visible = q ? payments.filter(p => {
    const name = (p['Borrower Name'] || '').toLowerCase();
    const id = String(p['Borrower ID'] || '').toLowerCase();
    const or = String(p['OR / Reference No.'] || '').toLowerCase();
    return name.includes(q) || id.includes(q) || or.includes(q);
  }) : payments;
  if(paymentsSort.key){
    const kind = paymentsSort.key === 'Payment Date' ? 'date' : (paymentsSort.key === 'Amount Paid' ? 'number' : 'text');
    visible = sortRows(visible, paymentsSort.key, paymentsSort.dir, kind);
  }
  updateSortHeaderClasses('payments', paymentsSort.key, paymentsSort.dir);
  ptbody.innerHTML = visible.length ? visible.map(p=>`
    <tr>
      <td>${fmtDate(p['Payment Date'])}</td>
      <td>${p['Borrower Name'] || p['Borrower ID']}</td>
      <td>${p['OR / Reference No.']}</td>
      <td>${fmt(p['Amount Paid'])}</td>
      <td>${p['Mode of Payment']}</td>
      <td>${p.Status==='VOID' ? '<span class="status-pill status-Past-Due">VOID</span>' : `<span class="status-pill status-Active">${p.Status || 'Payment Success'}</span>`}</td>
      <td class="no-print"><button class="btn small ghost" onclick="showReceiptForRow(${p._row})">View</button></td>
      <td class="no-print admin-only" style="display:${isAdmin()?'':'none'}">
        ${p.Status==='VOID' ? '' : `<button class="btn small danger" onclick="voidPayment(${p._row})">Void</button>`}
      </td>
    </tr>`).join('') : `<tr><td colspan="8" class="empty">${q ? 'No payments match "'+q+'"' : 'No payments yet'}</td></tr>`;
}
