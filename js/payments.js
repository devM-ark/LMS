/**
 * payments.js — the borrower-search autocomplete inside Add Payment,
 * the payment form, receipts, and voiding a payment.
 */

function renderPaymentBorrowerResults(query){
  const box = document.getElementById('paymentBorrowerResults');
  if(!box) return;
  const q = (query||'').trim().toLowerCase();
  if(!q){ box.classList.remove('show'); box.innerHTML=''; return; }
  // Only main borrowers: a group's co-borrowers are paid through the main
  // borrower's group payment (a co-borrower has a Household ID pointing to someone else).
  const isCoBorrower = b => b['Household ID'] && String(b['Household ID']) !== String(b['Borrower ID']);
  const eligible = (STATE?.borrowers||[]).filter(b => (b.status !== 'Paid' && b.status !== 'Renewed') && !isCoBorrower(b));
  const matched = eligible.filter(b=>{
    const idStr = String(b['Borrower ID']||'').toLowerCase();
    const nameStr = `${b['Last Name']||''} ${b['First Name']||''}`.toLowerCase();
    return idStr.includes(q) || nameStr.includes(q);
  });
  // One result per account (Borrower ID): an account with more than one open
  // loan (e.g. Amortized + Regular, or + Bonus) shows once, listing every
  // loan type — clicking it opens the combined Multiple Loan Payment screen
  // instead of forcing staff to search twice and pick one loan at a time.
  const byId = new Map();
  matched.forEach(b => { const k = String(b['Borrower ID']); if(!byId.has(k)) byId.set(k, []); byId.get(k).push(b); });
  const matches = [...byId.values()].slice(0,25);
  box.innerHTML = matches.length
    ? matches.map(rows => { const b = rows[0];
        const types = rows.map(r => r['Loan Type']).join(', ');
        return `<div class="item" data-id="${b['Borrower ID']}" data-loantype="${(rows.length===1 ? b['Loan Type'] : '').replace(/"/g,'&quot;')}">${b['Borrower ID']} — ${b['Last Name']}, ${b['First Name']} (${types})</div>`; }).join('')
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
  selectPaymentBorrower(item.dataset.id, item.dataset.loantype);
  document.getElementById('paymentBorrowerResults').classList.remove('show');
});

function selectPaymentBorrower(id, loanType){
  const b = findLoanRow(id, loanType);
  if(!b) return;
  document.getElementById('paymentBorrowerSelect').value = id;
  document.getElementById('paymentLoanTypeHidden').value = b['Loan Type'] || '';
  document.getElementById('paymentBorrowerSearch').value = `${id} — ${b['Last Name']}, ${b['First Name']} (${b['Loan Type']})`;
  document.getElementById('paymentBorrowerName').value = `${b['Last Name']}, ${b['First Name']}`;

  // Default (not locked) Mode of Payment based on whether this borrower's
  // ATM card is on file — staff can still change it to anything.
  const modeSelect = document.getElementById('paymentModeSelect');
  modeSelect.value = String(b['ATMOption']).trim().toLowerCase() === 'yes' ? 'ATM' : 'Cash';
  updateAtmChangeCalcVisibility();

  const amtInput = document.getElementById('paymentAmountInput');
  const isAmortized = b['Loan Type'] === 'Amortized Loan';
  const isOpen = x => !x['Renewed To'] && x.status !== 'Paid' && x.status !== 'Renewed';
  const household = (STATE?.borrowers||[]).filter(x => isOpen(x) && String(x['Household ID'] || x['Borrower ID']) === String(b['Household ID'] || b['Borrower ID']));
  // Two situations open the same split-payment screen: a real Group Loan
  // household (several people), or one person who simply has more than one
  // open loan on their own account (e.g. Amortized + Regular, or + Bonus).
  // Either way, one payment needs to be divided across more than one loan.
  const isRealHousehold = new Set(household.map(x => String(x['Borrower ID']))).size > 1;
  const isGroup = household.length > 1;

  document.getElementById('groupPaymentTitle').textContent = isRealHousehold ? 'Group Loan Payment' : 'Multiple Loan Payment';
  document.getElementById('groupPaymentSubtitle').textContent = isRealHousehold
    ? 'This borrower is part of a household. One payment splits across every per-cutoff loan in the group — main borrower is covered first if the amount paid is short.'
    : 'This borrower has more than one loan on this account. One payment splits across all of them, in order, before anything goes to a Bonus Loan that is not yet due.';

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
  const borrower = findLoanRow(payment['Borrower ID'], payment['Loan Type']);
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
  const loanType = document.getElementById('paymentLoanTypeHidden').value;
  const b = findLoanRow(id, loanType);
  if(!b){ previewEl.innerHTML = ''; return; }
  const householdId = b['Household ID'] || b['Borrower ID'];
  const members = (STATE?.borrowers||[]).filter(x => String(x['Household ID'] || x['Borrower ID']) === String(householdId));
  const isOpen = x => !x['Renewed To'] && x.status !== 'Paid' && x.status !== 'Renewed';
  const mainFirst = (x,y) => (String(x['Borrower ID'])===String(householdId)?0:1) - (String(y['Borrower ID'])===String(householdId)?0:1);
  // A Bonus Loan that's actually due joins the same due pool as the per-cutoff
  // loans (folded into Total Amount Due, can go SHORT); one that isn't due yet
  // stays separate, paid only from whatever's left over.
  const dueStatuses = ['Nearly Due','Due Today','Past Due','Partially Paid'];
  const isDueBonus = x => isBonusLoanType(x['Loan Type']) && dueStatuses.indexOf(x.status) !== -1;
  const splitLoans = members.filter(x => isOpen(x) && (x['Loan Type']==='Regular Loan' || x['Loan Type']==='Amortized Loan' || isDueBonus(x))).sort(mainFirst);
  const bonusLoans = members.filter(x => isOpen(x) && isBonusLoanType(x['Loan Type']) && !isDueBonus(x) && Number(x.balance) > 0).sort(mainFirst);

  let remaining = Number(document.getElementById('groupTotalAmountInput').value) || 0;
  let totalDue = 0;
  const line = (r, isBonus) =>
    `<div class="group-payment-row"><span>${r.name} (${r.loanType})</span><span>${fmt(r.amt)} / ${fmt(r.due)}${r.short && !isBonus ? ' <span style="color:var(--bad);font-weight:700;">SHORT</span>' : ''}</span></div>`;
  const rows = splitLoans.map(m => {
    const isBonus = isBonusLoanType(m['Loan Type']);
    const due = isBonus ? (Number(m.balance) || 0) : (Number(m['Amount/Cut-off']) || 0);
    const amt = Math.max(0, Math.min(due, remaining));
    remaining = Math.round((remaining - amt) * 100) / 100;
    totalDue += due;
    return { name: `${m['Last Name']}, ${m['First Name']}`, loanType: m['Loan Type'], due, amt, short: amt < due };
  });
  const bonusRows = bonusLoans.map(m => {
    const due = Number(m.balance) || 0;
    const amt = Math.max(0, Math.min(due, remaining));
    remaining = Math.round((remaining - amt) * 100) / 100;
    return { name: `${m['Last Name']}, ${m['First Name']}`, loanType: m['Loan Type'], due, amt, short: false };
  });

  previewEl.innerHTML = rows.map(r => line(r, false)).join('')
    + `<div class="group-payment-row" style="font-weight:700;border-top:2px solid var(--line);"><span style="color:inherit;">Total Amount Due</span><span>${fmt(totalDue)}</span></div>`
    + (bonusRows.length
        ? `<div style="margin-top:8px;font-size:.78rem;color:var(--muted);">Bonus Loan — paid only from any amount above the total due:</div>` + bonusRows.map(r => line(r, true)).join('')
        : '');
}
document.getElementById('groupTotalAmountInput').addEventListener('input', () => { updateGroupPaymentPreview(); updateAtmChangeCalc(); });

async function submitGroupPayment(btn){
  const msgEl = document.getElementById('paymentMsg');
  const id = document.getElementById('paymentBorrowerSelect').value;
  const loanType = document.getElementById('paymentLoanTypeHidden').value;
  const b = findLoanRow(id, loanType);
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
  const isRealHousehold = new Set((out.allocations||[]).map(a => String(a.borrowerId))).size > 1;
  const rows = out.allocations.filter(a => a.amount > 0).map(a => `
    <tr><td style="padding:4px 0;">${a.name} <span style="color:var(--muted);">(${a.loanType})</span></td><td style="padding:4px 0;text-align:right;">${fmt(a.amount)}</td></tr>
  `).join('');
  const total = out.allocations.reduce((s,a) => s + a.amount, 0);
  document.getElementById('receiptContent').innerHTML = `
    <div style="text-align:center;border-bottom:2px solid var(--gold);padding-bottom:8px;margin-bottom:10px;">
      <div style="font-family:Arial,sans-serif;font-weight:bold;font-size:.95rem;color:var(--navy);">${companyName}</div>
      <div style="font-family:Arial,sans-serif;font-size:.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-top:2px;">Official Receipt — ${isRealHousehold ? 'Group Loan Payment' : 'Multiple Loan Payment'}</div>
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

function openAddPaymentModal(preselectBorrowerId, preselectLoanType){
  document.getElementById('paymentBorrowerSearch').value = '';
  document.getElementById('paymentBorrowerSelect').value = '';
  document.getElementById('paymentLoanTypeHidden').value = '';
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
  if(preselectBorrowerId) selectPaymentBorrower(preselectBorrowerId, preselectLoanType);
}

/** Jumps from the Nearly Due / Past Due dashboard modals straight into
 *  Record Payment for that borrower, without staff needing to re-search. */
function payFromModal(borrowerId, sourceModalId, loanType){
  closeModal(sourceModalId);
  openAddPaymentModal(borrowerId, loanType);
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

/** Tiered ATM change/handling fee. Uses the editable table from Settings →
 *  ATM Change Calculator when configured (STATE.settings.ATMChangeFeeTiers);
 *  otherwise falls back to the built-in default table:
 *    ₱1–500=10   ₱501–1000=15   ₱1001–1500=25   ₱1501–2000=30
 *    ₱2001–2500=40   ₱2501–3000=45   ₱3001–3500=55   …
 *  Amounts above the highest configured tier keep extending the pattern set
 *  by the last two tiers (same peso-per-fee rate, repeating). */
function atmChangeFee(excess){
  if (excess <= 0) return 0;
  const tiers = parseAtmChangeTiers(STATE?.settings?.ATMChangeFeeTiers);
  if(tiers && tiers.length){
    const hit = tiers.find(t => excess <= t.max);
    if(hit) return hit.fee;
    const last = tiers[tiers.length - 1];
    const prev = tiers.length > 1 ? tiers[tiers.length - 2] : { max: 0, fee: 0 };
    const stepMax = last.max - prev.max || last.max;
    const stepFee = last.fee - prev.fee;
    const extra = Math.ceil((excess - last.max) / stepMax);
    return last.fee + extra * stepFee;
  }
  const n = Math.ceil(excess / 500); // which 500-peso bracket the excess falls in
  const k = Math.floor((n - 1) / 2);
  return 10 + 15 * k + (n % 2 === 0 ? 5 : 0);
}

function updateAtmChangeCalc(){
  const resultEl = document.getElementById('atmChangeResult');
  const received = Number(document.getElementById('atmAmountReceivedInput').value) || 0;
  // Group Loan Payment uses a different "amount paid" field (the shared
  // total) than a normal single-loan payment — read whichever one is
  // actually active, or "received" always looked like 100% excess.
  const isGroupMode = document.getElementById('groupPaymentWrap').style.display !== 'none';
  const paid = Number(document.getElementById(isGroupMode ? 'groupTotalAmountInput' : 'paymentAmountInput').value) || 0;
  const excess = received - paid;
  if(received <= 0 || excess <= 0){ resultEl.textContent = ''; return; }
  const charge = atmChangeFee(excess);
  const netChange = Math.round((excess - charge) * 100) / 100;

  const id = document.getElementById('paymentBorrowerSelect').value;
  const loanType = document.getElementById('paymentLoanTypeHidden').value;
  const b = id ? findLoanRow(id, loanType) : null;
  const contact = b && normalizePhoneDisplay(b['Contact Number']);
  // Editable in Settings → ATM Change Calculator; falls back to the default English text.
  const msgTpl = (contact ? STATE?.settings?.ATMChangeMessageTemplate : STATE?.settings?.ATMChangeNoContactTemplate)
    || (contact ? 'Send the amount {amount} to {contact}.' : 'No contact number is available for this borrower. The change is {amount}.');
  const instruction = msgTpl.replace(/\{amount\}/g, fmt(netChange)).replace(/\{contact\}/g, contact || '');

  resultEl.innerHTML = `Change to give back: <b>${fmt(netChange)}</b> <span style="color:var(--muted);">(₱${excess.toLocaleString()} excess − ₱${charge} ATM change charge)</span><br>${instruction}`;
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
