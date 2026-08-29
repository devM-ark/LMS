function renderBorrowersTable(){
  const mtbody = document.querySelector('#masterlistTable tbody');
  if(!mtbody || !STATE) return;
  const borrowers = STATE.borrowers || [];
  const q = (borrowerSearchQuery || '').trim().toLowerCase();
  // Default view: Active Borrowers only (any unpaid loan). Searching reaches
  // every borrower, including Paid ones, so paid history is still findable.
  const pool = q ? borrowers : borrowers.filter(b => b.status !== 'Paid');
  const visibleBorrowers = q ? pool.filter(b => {
    const idStr = String(b['Borrower ID'] || '').toLowerCase();
    const nameStr = `${b['Last Name']||''} ${b['First Name']||''}`.toLowerCase();
    return idStr.includes(q) || nameStr.includes(q);
  }) : pool;
  mtbody.innerHTML = visibleBorrowers.length ? visibleBorrowers.map(b=>`
    <tr>
      <td>${b['Borrower ID']}</td>
      <td>${b['Last Name']}, ${b['First Name']}</td>
      <td>${b['Loan Type']}</td>
      <td>${fmt(b.cutoffAmountDue)}</td>
      <td>${fmtDate(b.nextDue)}</td>
      <td><span class="status-pill status-${(b.status||'').replace(/\s+/g,'-')}">${b.status}</span></td>
      <td class="no-print"><button class="btn small ghost" onclick="showSOA(${b['Borrower ID']})">View</button></td>
      <td class="no-print admin-only" style="display:${isAdmin()?'':'none'}"><button class="btn small ghost" onclick="openEdit(${b['Borrower ID']})">Edit</button></td>
    </tr>`).join('') : `<tr><td colspan="8" class="empty">${q ? 'No borrowers match "'+q+'"' : 'No active borrowers'}</td></tr>`;
}

function computeNextBorrowerId(){
  const year = new Date().getFullYear();
  const prefix = String(year);
  const existing = (STATE?.borrowers||[]).map(b => String(b['Borrower ID'])).filter(id => id.startsWith(prefix));
  let maxSeq = 0;
  existing.forEach(id => { const seq = parseInt(id.slice(prefix.length), 10); if(!isNaN(seq) && seq > maxSeq) maxSeq = seq; });
  return prefix + String(maxSeq + 1).padStart(3, '0');
}

function refreshLoanAmountField(){
  const typeSel = document.getElementById('borrowerLoanTypeSelect');
  const groupSel = document.getElementById('borrowerGroupSelect');
  const wrap = document.getElementById('loanAmountFieldWrap');
  if(!typeSel || !wrap) return;
  const type = typeSel.value;
  const group = groupSel ? groupSel.value : 'Teachers';
  // Add-on Diminishing and Bonus Loan are one-off, borrower-specific amounts —
  // not repeatable rate tiers — so both always get a plain manual entry field.
  if(type === 'Add-on Diminishing' || isBonusLoanType(type)){
    wrap.innerHTML = `<input name="Loan Amount" id="borrowerLoanAmountInput" type="number" required placeholder="Enter the principal amount">`;
  } else {
    const tiers = [...new Set((STATE?.loanTypes||[])
      .filter(lt => lt.LoanType === type && (!lt.Group || lt.Group === group || lt.Group === 'Both'))
      .map(lt => Number(lt.AmountTier)).filter(n => !isNaN(n)))].sort((a,b) => a-b);
    if(tiers.length){
      wrap.innerHTML = `<select name="Loan Amount" id="borrowerLoanAmountInput" required>${tiers.map(t=>`<option value="${t}">₱${t.toLocaleString()}</option>`).join('')}</select>`;
    } else {
      wrap.innerHTML = `<input name="Loan Amount" id="borrowerLoanAmountInput" type="number" required placeholder="No preset tiers — add one in Settings, or enter manually">`;
    }
  }
  const newField = document.getElementById('borrowerLoanAmountInput');
  newField.addEventListener(newField.tagName === 'SELECT' ? 'change' : 'input', updateCutoffAuto);
  updateCutoffAuto();
}

// Only Regular Loan is available to both groups — everything else is Teachers-only.
function refreshLoanTypeOptionsForGroup(){
  const groupSel = document.getElementById('borrowerGroupSelect');
  const typeSel = document.getElementById('borrowerLoanTypeSelect');
  if(!groupSel || !typeSel) return;
  const group = groupSel.value;
  const loanTypes = STATE?.loanTypes || [];
  let names;
  if(loanTypes.length){
    // A loan type NAME is eligible for the selected group only if at least one of its
    // configured tiers is marked for that group (or "Both"/blank). This reads the actual
    // Group column from Settings — it no longer assumes eligibility from the type's name.
    names = [...new Set(loanTypes
      .filter(lt => !lt.Group || lt.Group === 'Both' || lt.Group === group)
      .map(lt => lt.LoanType))];
  } else {
    // No rate table configured yet — sensible fallback defaults.
    names = group === 'Teachers'
      ? ['Regular Loan','Amortized Loan','Add-on Diminishing','Bonus Loan']
      : ['Regular Loan'];
  }
  const current = typeSel.value;
  typeSel.innerHTML = names.map(n => `<option${n===current?' selected':''}>${n}</option>`).join('');
  refreshLoanAmountField();
}
document.getElementById('borrowerGroupSelect')?.addEventListener('change', refreshLoanTypeOptionsForGroup);
document.getElementById('borrowerLoanTypeSelect')?.addEventListener('change', refreshLoanAmountField);

function updateCutoffAuto(){
  const typeEl = document.getElementById('borrowerLoanTypeSelect');
  const amtEl = document.getElementById('borrowerLoanAmountInput');
  const groupEl = document.getElementById('borrowerGroupSelect');
  const cutoffInput = document.getElementById('borrowerCutoffInput');
  const hint = document.getElementById('cutoffHint');
  if(!typeEl || !cutoffInput || !amtEl) return;
  const type = typeEl.value;
  const amt = Number(amtEl.value);
  const group = groupEl ? groupEl.value : 'Teachers';
  hint.style.display = 'none';

  if(type === 'Add-on Diminishing' || isBonusLoanType(type)){
    cutoffInput.value = '';
    cutoffInput.placeholder = 'N/A';
    if(type === 'Add-on Diminishing'){
      hint.innerHTML = 'Add-on Diminishing loans have no fixed per-cutoff amount — balance compounds per payment instead.';
    } else {
      // Bonus Loan: "Loan Amount" IS the principal the borrower owes back in full.
      // The interest fee (configured per tier in Settings, default ₱9,000) is only
      // deducted from what they physically receive at release — it never reduces
      // the principal/balance itself.
      let interestFee = 9000;
      const btMatch = (STATE?.loanTypes||[]).find(lt => lt.LoanType === type && Number(lt.AmountTier) === amt);
      if(btMatch && btMatch.LumpSumAmount) interestFee = Number(btMatch.LumpSumAmount);
      const netReleased = amt > 0 ? Math.max(0, amt - interestFee) : null;
      hint.innerHTML = `<b>Loan Amount above = Principal / Amount to Pay</b> — this is the full amount owed back and what shows as the balance.<br>`
        + (netReleased !== null
            ? `Interest fee (from Settings): ₱${interestFee.toLocaleString()} — <b>Net Amount Released to Borrower: ₱${netReleased.toLocaleString()}</b>`
            : `Interest fee (from Settings): ₱${interestFee.toLocaleString()} — enter the Loan Amount above to see the net release amount.`);
    }
    hint.style.display = 'block';
    return;
  }
  const match = (STATE?.loanTypes||[]).find(lt =>
    lt.LoanType === type && Number(lt.AmountTier) === amt && (!lt.Group || lt.Group === group || lt.Group === 'Both'));
  if(match){
    cutoffInput.value = match.AmountPerCutoff ?? '';
    const termInput = document.querySelector('#borrowerForm input[name="Term (Months)"]');
    if(termInput && match.TermMonths) termInput.value = match.TermMonths;
  } else {
    cutoffInput.value = '';
    hint.textContent = 'No matching rate found for this amount/group — add this tier under Settings → Loan Types & Rates.';
    hint.style.display = 'block';
  }
}

document.getElementById('borrowerForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  if(btn.disabled) return;
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Saving…';
  const data = Object.fromEntries(new FormData(e.target));
  const msgEl = document.getElementById('borrowerMsg');
  msgEl.textContent = '';
  try{
    const out = await postAction('addBorrower', {data});
    if(out){
      showToast('✓ Borrower added successfully.');
      e.target.reset();
      setTodayDefault('borrowerReleaseDateInput');
      await loadData();
      refreshLoanTypeOptionsForGroup();
      closeModal('addBorrowerModal');
    }
  } finally { btn.disabled = false; btn.textContent = originalLabel; }
});

document.getElementById('editForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  if(btn.disabled) return;
  btn.disabled = true;
  try{
    const data = Object.fromEntries(new FormData(e.target));
    if(await postAction('updateBorrower', {data})){ closeModal('editModal'); loadData(); }
  } finally { btn.disabled = false; }
});

function openEdit(id){
  const b = (STATE.borrowers||[]).find(x => x['Borrower ID'] === id);
  if(!b) return;
  const form = document.getElementById('editForm');
  ['Borrower ID','Last Name','First Name','Loan Type','Loan Amount','Term (Months)','Amount/Cut-off','Release Date','Contact Number','Address']
    .forEach(k => { if(form[k]) form[k].value = b[k] ?? ''; });
  openModal('editModal');
}

function openAddBorrowerModal(){
  const idField = document.getElementById('borrowerIdField');
  if(idField) idField.value = computeNextBorrowerId();
  refreshLoanTypeOptionsForGroup();
  setTodayDefault('borrowerReleaseDateInput');
  document.getElementById('borrowerMsg').textContent = '';
  document.getElementById('cutoffHint').style.display = 'none';
  openModal('addBorrowerModal');
}

async function showSOA(id){
  let soa;
  if(!API_URL){
    const b = SAMPLE.borrowers.find(x=>x['Borrower ID']===id) || SAMPLE.borrowers[0];
    soa = {soaNo:'SOA-DEMO', dateGenerated: new Date().toISOString().slice(0,10), borrower:b, computed:b,
           payments: SAMPLE.payments.filter(p=>p['Borrower ID']===id)};
  } else {
    const res = await fetch(API_URL + '?action=soa&id=' + id);
    soa = await res.json();
    if(soa.error){ alert(soa.error); return; }
  }
  const b = soa.borrower, c = soa.computed;
  document.getElementById('soaContent').innerHTML = `
    <h3 style="margin:0;">Manalo's Lending Corporation Inc.</h3>
    <div style="color:var(--muted);font-size:.75rem;">STATEMENT OF ACCOUNT — ${soa.soaNo}</div>
    <h4>Borrower</h4>
    <div>${b['Last Name']}, ${b['First Name']} &nbsp;•&nbsp; ID ${b['Borrower ID']}</div>
    <div>${b['Loan Type']} &nbsp;•&nbsp; Released ${fmtDate(b['Release Date'])}</div>
    <h4>Account Summary</h4>
    <table>
      <tr><td>Loan Amount</td><td>${fmt(b['Loan Amount'])}</td></tr>
      <tr><td>Total Paid</td><td>${fmt(c.totalPaid)}</td></tr>
      <tr><td>Outstanding Balance (full loan)</td><td>${fmt(c.balance)}</td></tr>
      <tr><td>Amount Due This Cutoff</td><td>${fmt(c.cutoffAmountDue)}</td></tr>
      <tr><td>${b['Loan Type']==='Add-on Diminishing' ? 'Next Due / Renewal' : (isBonusLoanType(b['Loan Type']) ? 'Maturity Date' : 'Next Due Date')}</td><td>${fmtDate(c.nextDue)}</td></tr>
      <tr><td>Status</td><td>${c.status}</td></tr>
    </table>
    <h4>Payment History</h4>
    <table>
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
  openModal('soaModal');
}

document.getElementById('borrowerSearchInput')?.addEventListener('input', (e)=>{
  borrowerSearchQuery = e.target.value;
  renderBorrowersTable();
});
