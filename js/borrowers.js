let masterlistSort = { key: null, dir: 1 };

function sortRows(rows, key, dir, kind){
  return [...rows].sort((a, b) => {
    let av, bv;
    if(key === 'name'){ av = `${a['Last Name']||''} ${a['First Name']||''}`.toLowerCase(); bv = `${b['Last Name']||''} ${b['First Name']||''}`.toLowerCase(); }
    else { av = a[key]; bv = b[key]; }
    if(kind === 'date'){ av = av ? new Date(av).getTime() : -Infinity; bv = bv ? new Date(bv).getTime() : -Infinity; }
    else if(kind === 'number'){ av = Number(av) || 0; bv = Number(bv) || 0; }
    else { av = String(av ?? '').toLowerCase(); bv = String(bv ?? '').toLowerCase(); }
    if(av < bv) return -1 * dir;
    if(av > bv) return 1 * dir;
    return 0;
  });
}

function updateSortHeaderClasses(tableId, activeKey, dir){
  document.querySelectorAll(`th.sortable[data-table="${tableId}"]`).forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if(th.dataset.key === activeKey) th.classList.add(dir === 1 ? 'sort-asc' : 'sort-desc');
  });
}

document.querySelectorAll('th.sortable[data-table="masterlist"]').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.key;
    masterlistSort.dir = (masterlistSort.key === key) ? -masterlistSort.dir : 1;
    masterlistSort.key = key;
    renderBorrowersTable();
  });
});

function renderBorrowersTable(){
  const mtbody = document.querySelector('#masterlistTable tbody');
  if(!mtbody || !STATE) return;
  const borrowers = STATE.borrowers || [];
  const q = (borrowerSearchQuery || '').trim().toLowerCase();
  // Default view: Active Borrowers only (any unpaid loan). Searching reaches
  // every borrower, including Paid ones, so paid history is still findable.
  const pool = q ? borrowers : borrowers.filter(b => (b.status !== 'Paid' && b.status !== 'Renewed'));
  let visibleBorrowers = q ? pool.filter(b => {
    const idStr = String(b['Borrower ID'] || '').toLowerCase();
    const displayIdStr = String(formatBorrowerId(b) || '').toLowerCase();
    const originalIdStr = String(b['Original Borrower ID'] || '').toLowerCase();
    const nameStr = `${b['Last Name']||''} ${b['First Name']||''}`.toLowerCase();
    return idStr.includes(q) || displayIdStr.includes(q) || originalIdStr.includes(q) || nameStr.includes(q);
  }) : pool;
  if(masterlistSort.key){
    const kind = masterlistSort.key === 'cutoffAmountDue' ? 'number' : (masterlistSort.key === 'nextDue' ? 'date' : (masterlistSort.key === 'Borrower ID' ? 'number' : 'text'));
    visibleBorrowers = sortRows(visibleBorrowers, masterlistSort.key, masterlistSort.dir, kind);
  }
  updateSortHeaderClasses('masterlist', masterlistSort.key, masterlistSort.dir);
  mtbody.innerHTML = visibleBorrowers.length ? visibleBorrowers.map(b=>`
    <tr>
      <td>${formatBorrowerId(b)}</td>
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

/** Shared by Add Borrower, Edit Borrower, and Renew Loan — returns the
 *  sorted list of preset amount tiers configured for a loan type + group. */
function getAmountTiersForType(type, group){
  return [...new Set((STATE?.loanTypes||[])
    .filter(lt => lt.LoanType === type && (!lt.Group || lt.Group === group || lt.Group === 'Both'))
    .map(lt => Number(lt.AmountTier)).filter(n => !isNaN(n)))].sort((a,b) => a-b);
}

function refreshLoanAmountField(){
  const typeSel = document.getElementById('borrowerLoanTypeSelect');
  const groupSel = document.getElementById('borrowerGroupSelect');
  const wrap = document.getElementById('loanAmountFieldWrap');
  if(!typeSel || !wrap) return;
  const type = typeSel.value;
  const group = groupSel ? groupSel.value : 'Teachers';
  // Add-on Diminishing is a one-off, borrower-specific amount, not a repeatable
  // rate tier, so it always gets a plain manual entry field. Bonus Loan DOES
  // have configured tiers (amount + term + interest fee in Loan Types &
  // Rates) — it belongs in the same preset-dropdown path as Regular/Amortized.
  if(type === 'Add-on Diminishing'){
    wrap.innerHTML = `<input name="Loan Amount" id="borrowerLoanAmountInput" type="number" required placeholder="Enter the principal amount">`;
  } else {
    const tiers = getAmountTiersForType(type, group);
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

  if(type === 'Add-on Diminishing'){
    cutoffInput.value = '';
    cutoffInput.placeholder = 'N/A';
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
  msgEl.textContent = 'Please wait while we save the borrower.';
  msgEl.style.color = 'var(--muted)';
  try{
    const out = await postAction('addBorrower', {data});
    if(out){
      showToast('Borrower added successfully.');
      if(data['Loan Type'] === 'Add-on Diminishing'){
        showAddOnDiminishingNotice(data);
      }
      e.target.reset();
      setTodayDefault('borrowerReleaseDateInput');
      await loadData();
      refreshLoanTypeOptionsForGroup();
      closeModal('addBorrowerModal');
    } else {
      msgEl.textContent = '';
    }
  } finally { btn.disabled = false; btn.textContent = originalLabel; }
});

/** Add-on Diminishing loans have one month's interest deducted upfront at
 *  release (matches the 5% compounding rate used in computeAddOnDiminishing
 *  on the backend — LoanCalculationService.gs — keep these in sync if that
 *  rate ever changes). This just reminds staff how much cash to actually
 *  hand over; it doesn't touch the stored Loan Amount or balance math. */
function showAddOnDiminishingNotice(data){
  const amount = Number(data['Loan Amount']) || 0;
  const interest = Math.round(amount * 0.05);
  const net = amount - interest;
  const name = `${data['First Name'] || ''} ${data['Last Name'] || ''}`.trim() || 'The borrower';
  document.getElementById('addOnDiminishingNoticeText').innerHTML =
    `Please deduct the amount <b>${fmt(interest)}</b> before releasing the loan.<br><br>` +
    `<b>${name}</b> will receive the amount of <b>${fmt(net)}</b> upon release.`;
  openModal('addOnDiminishingNoticeModal');
}

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
  ['Borrower ID','Last Name','First Name','Loan Type','Contact Number','Address']
    .forEach(k => { if(form[k]) form[k].value = b[k] ?? ''; });
  // Release Date comes back as a full ISO timestamp (e.g. "2026-08-30T00:00:00.000Z"),
  // but a <input type="date"> only accepts the plain yyyy-mm-dd portion — anything
  // else is silently rejected and the field just shows empty.
  form['Release Date'].value = b['Release Date'] ? String(b['Release Date']).slice(0, 10) : '';
  refreshEditLoanAmountField(b);
  openModal('editModal');
}

/** Populates the Edit Borrower Loan Amount field the same way Add Borrower
 *  does (preset tier dropdown, or manual entry for Add-on Diminishing), pre-
 *  selected to the borrower's current amount, and keeps Term/Amount-per-
 *  cutoff auto-filled + locked from whichever tier matches. */
function refreshEditLoanAmountField(b){
  const wrap = document.getElementById('editLoanAmountFieldWrap');
  const type = b['Loan Type'];
  const group = b['Group'] || 'Teachers';
  const currentAmount = Number(b['Loan Amount']) || '';

  if(type === 'Add-on Diminishing'){
    wrap.innerHTML = `<input name="Loan Amount" id="editLoanAmountInput" type="number" required value="${currentAmount}">`;
  } else {
    const tiers = getAmountTiersForType(type, group);
    if(tiers.length){
      wrap.innerHTML = `<select name="Loan Amount" id="editLoanAmountInput" required>${tiers.map(t=>`<option value="${t}" ${t===currentAmount?'selected':''}>₱${t.toLocaleString()}</option>`).join('')}</select>`;
    } else {
      wrap.innerHTML = `<input name="Loan Amount" id="editLoanAmountInput" type="number" required value="${currentAmount}">`;
    }
  }

  const updateLockedFields = () => {
    const amtField = document.getElementById('editLoanAmountInput');
    const amt = Number(amtField.value) || 0;
    const form = document.getElementById('editForm');
    if(type === 'Add-on Diminishing'){
      form['Term (Months)'].value = '';
      form['Amount/Cut-off'].value = '';
      return;
    }
    const match = (STATE?.loanTypes||[]).find(lt => lt.LoanType === type && Number(lt.AmountTier) === amt && (!lt.Group || lt.Group === group || lt.Group === 'Both'));
    form['Term (Months)'].value = match ? (match.TermMonths ?? '') : '';
    form['Amount/Cut-off'].value = match ? (match.AmountPerCutoff ?? '') : '';
  };
  const newField = document.getElementById('editLoanAmountInput');
  newField.addEventListener(newField.tagName === 'SELECT' ? 'change' : 'input', updateLockedFields);
  updateLockedFields();
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
  document.getElementById('soaContent').innerHTML = buildSOAHTML(soa);
  openModal('soaModal');
}

document.getElementById('borrowerSearchInput')?.addEventListener('input', (e)=>{
  borrowerSearchQuery = e.target.value;
  renderBorrowersTable();
});
