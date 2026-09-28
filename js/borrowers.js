/**
 * borrowers.js — Masterlist table rendering, the Add/Edit Borrower
 * modals (including the loan-type/amount/cutoff auto-fill logic), and
 * the Statement of Account (SOA) view.
 */

let masterlistSort = { key: null, dir: 1 };
let expandedHouseholds = new Set();

function toggleHouseholdExpand(householdId){
  const key = String(householdId);
  if(expandedHouseholds.has(key)) expandedHouseholds.delete(key);
  else expandedHouseholds.add(key);
  renderBorrowersTable();
}

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

  const householdsSeen = new Set();
  const rowsHtml = [];
  visibleBorrowers.forEach(b => {
    const householdId = b['Household ID'] || b['Borrower ID'];
    const key = String(householdId);
    if(householdsSeen.has(key)) return;
    householdsSeen.add(key);
    const members = visibleBorrowers.filter(x => String(x['Household ID'] || x['Borrower ID']) === key);

    if(members.length === 1){
      rowsHtml.push(renderBorrowerRow(members[0], false));
      return;
    }

    const main = members.find(x => String(x['Borrower ID']) === key) || members[0];
    const combinedDue = members
      .filter(x => x['Loan Type']==='Regular Loan' || x['Loan Type']==='Amortized Loan')
      .reduce((s,x) => s + (Number(x.cutoffAmountDue)||0), 0);
    const priorityOrder = ['Past Due','Partially Paid','Due Today','Nearly Due','Eligible for Renewal','Active','Paid','Renewed'];
    const worst = members.reduce((acc,x) => priorityOrder.indexOf(x.status) < priorityOrder.indexOf(acc) ? x.status : acc, members[0].status);
    const earliestDue = members.filter(x => x.nextDue).map(x => x.nextDue).sort()[0];
    const isExpanded = expandedHouseholds.has(key);

    rowsHtml.push(`
      <tr style="cursor:pointer;" onclick="toggleHouseholdExpand('${key}')">
        <td>${formatBorrowerId(main)}</td>
        <td>${main['Last Name']}, ${main['First Name']} <span style="font-size:.68rem;color:var(--muted);">(${isExpanded?'▾':'▸'} Group · ${members.length} loans)</span></td>
        <td>Group Loan</td>
        <td>${fmt(combinedDue)}</td>
        <td>${fmtDate(earliestDue)}</td>
        <td><span class="status-pill status-${((worst==='Eligible for Renewal'?'Active':worst)||'').replace(/\s+/g,'-')}">${worst==='Eligible for Renewal'?'Active':worst}</span></td>
        <td class="no-print"><button class="btn small ghost" onclick="event.stopPropagation();showSOA(${main['Borrower ID']}, '${(main['Loan Type']||'').replace(/'/g,"\\'")}', ${main._row})">View</button></td>
        <td class="no-print admin-only" style="display:${isAdmin()?'':'none'}"></td>
      </tr>`);

    if(isExpanded){
      members.forEach(m => rowsHtml.push(renderBorrowerRow(m, true)));
    }
  });

  mtbody.innerHTML = rowsHtml.length ? rowsHtml.join('') : `<tr><td colspan="8" class="empty">${q ? 'No borrowers match "'+q+'"' : 'No active borrowers'}</td></tr>`;
}

function renderBorrowerRow(b, indented){
  const nameCell = indented
    ? `<span style="padding-left:22px;color:var(--muted);">↳ ${b['Last Name']}, ${b['First Name']}</span>`
    : `${b['Last Name']}, ${b['First Name']}`;
  return `
    <tr style="${indented ? 'background:#F7FAFB;' : ''}">
      <td>${formatBorrowerId(b)}</td>
      <td>${nameCell}</td>
      <td>${b['Loan Type']}</td>
      <td>${fmt(b.cutoffAmountDue)}</td>
      <td>${fmtDate(b.nextDue)}</td>
      <td><span class="status-pill status-${((b.status==='Eligible for Renewal'?'Active':b.status)||'').replace(/\s+/g,'-')}">${b.status==='Eligible for Renewal'?'Active':b.status}</span></td>
      <td class="no-print"><button class="btn small ghost" onclick="showSOA(${b['Borrower ID']}, '${(b['Loan Type']||'').replace(/'/g,"\\'")}', ${b._row})">View</button></td>
      <td class="no-print admin-only" style="display:${isAdmin()?'':'none'}"><button class="btn small ghost" onclick="openEdit(${b['Borrower ID']}, '${(b['Loan Type']||'').replace(/'/g,"\\'")}', ${b._row})">Edit</button></td>
    </tr>`;
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
  // This function also runs on every background data refresh — remember what
  // staff already chose/typed so the amount never snaps back to the lowest tier.
  const prevField = document.getElementById('borrowerLoanAmountInput');
  const prevVal = prevField ? prevField.value : '';
  const sameContext = wrap.dataset.key === type + '|' + group;
  wrap.dataset.key = type + '|' + group;
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
  if(sameContext && prevVal !== '' && (newField.tagName !== 'SELECT' || [...newField.options].some(o => o.value === prevVal))){
    newField.value = prevVal;
  }
  newField.addEventListener(newField.tagName === 'SELECT' ? 'change' : 'input', updateCutoffAuto);

  // Bonus Period (Mid-Year / Year-End) only applies to a Bonus Loan.
  const bonusWrap2 = document.getElementById('bonusPeriodFieldWrap');
  const bonusSel2 = document.getElementById('bonusPeriodSelect');
  const showBonus = isBonusLoanType(type);
  bonusWrap2.style.display = showBonus ? '' : 'none';
  bonusSel2.disabled = !showBonus;

  // Payment Schedule (Cutoff vs Monthly) only applies to Regular Loan.
  const scheduleWrap = document.getElementById('paymentScheduleFieldWrap');
  const scheduleSelect = document.getElementById('borrowerPaymentScheduleSelect');
  if(type === 'Regular Loan'){
    scheduleWrap.style.display = '';
  } else {
    scheduleWrap.style.display = 'none';
    scheduleSelect.value = 'Cutoff';
  }
  updateCutoffAuto();
}
document.getElementById('borrowerPaymentScheduleSelect')?.addEventListener('change', updateCutoffAuto);

// Only Regular Loan is available to both groups — everything else is Teachers-only.
// Bonus Loan is never offered here — it can only be added via "Bonus Loan — Add
// to an Existing Borrower's Account", since it requires an already-active loan.
function refreshLoanTypeOptionsForGroup(){
  const groupSel = document.getElementById('borrowerGroupSelect');
  const typeSel = document.getElementById('borrowerLoanTypeSelect');
  if(!groupSel || !typeSel) return;
  const category = document.getElementById('loanCategoryUISelect')?.value;
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
      ? ['Regular Loan','Amortized Loan','Add-on Diminishing']
      : ['Regular Loan'];
  }
  // Bonus Loan can be a borrower's first loan, or added later to an existing account.
  const isExisting = category === 'Existing-Account';
  if(!names.some(isBonusLoanType)) names.push('Bonus Loan');
  const current = typeSel.value || (isExisting ? 'Bonus Loan' : '');
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
  const labelText = document.getElementById('cutoffAmountLabelText');
  const hint = document.getElementById('cutoffHint');
  if(!typeEl || !cutoffInput || !amtEl) return;
  const type = typeEl.value;
  const amt = Number(amtEl.value);
  const group = groupEl ? groupEl.value : 'Teachers';
  hint.style.display = 'none';
  if(labelText) labelText.textContent = 'Amount per Cutoff (auto)';

  if(type === 'Add-on Diminishing'){
    cutoffInput.value = '';
    cutoffInput.placeholder = 'N/A';
    return;
  }

  const match = (STATE?.loanTypes||[]).find(lt =>
    lt.LoanType === type && Number(lt.AmountTier) === amt && (!lt.Group || lt.Group === group || lt.Group === 'Both'));

  if(type === 'Amortized Loan'){
    // Uses the configured Amount Per Cutoff from Settings → Loan Types & Rates
    // for this tier — same field Regular Loan uses, and it's what's actually
    // charged (NOT auto-recalculated as 2.5% anymore). Only falls back to the
    // 2.5%-of-principal formula if this tier has no configured rate yet.
    if(match && match.AmountPerCutoff){
      cutoffInput.value = match.AmountPerCutoff;
    } else {
      cutoffInput.value = amt > 0 ? Math.round(amt * 0.025 * 100) / 100 : '';
      if(amt > 0){
        hint.textContent = 'No configured Amount Per Cutoff for this tier — falling back to 2.5% of the loan amount. Add a rate under Settings → Loan Types & Rates to set the real amount.';
        hint.style.display = 'block';
      }
    }
    const termInput = document.querySelector('#borrowerForm input[name="Term (Months)"]');
    if(termInput && match && match.TermMonths) termInput.value = match.TermMonths;
    return;
  }

  // Regular Loan on the Monthly schedule uses its own configured "Amount Per
  // Month" rate (a genuinely separate figure from Amount Per Cutoff, not
  // derived from it) — set this tier's Amount Per Month under Settings →
  // Loan Types & Rates.
  const isMonthly = type === 'Regular Loan' && document.getElementById('borrowerPaymentScheduleSelect')?.value === 'Monthly';
  if(match){
    if(isMonthly){
      cutoffInput.value = match.AmountPerMonth || '';
      if(labelText) labelText.textContent = 'Amount per Month (auto)';
      if(!match.AmountPerMonth){
        hint.textContent = 'This tier has no configured Amount Per Month yet — add one under Settings → Loan Types & Rates.';
        hint.style.display = 'block';
      }
    } else {
      cutoffInput.value = match.AmountPerCutoff ?? '';
      if(labelText) labelText.textContent = 'Amount per Cutoff (auto)';
    }
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
  const msgEl = document.getElementById('borrowerMsg');
  const loanCategoryUIVal = document.getElementById('loanCategoryUISelect').value;
  if(loanCategoryUIVal === 'Group-Co' && !document.getElementById('householdIdHidden').value){
    msgEl.textContent = 'Search and select the main borrower for this group before saving.';
    msgEl.style.color = 'var(--bad)';
    return;
  }
  if(loanCategoryUIVal === 'Existing-Account' && !document.getElementById('borrowerIdField').value){
    msgEl.textContent = 'Search and select which existing borrower this Bonus Loan belongs to.';
    msgEl.style.color = 'var(--bad)';
    return;
  }
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Saving…';
  const data = Object.fromEntries(new FormData(e.target));
  if(loanCategoryUIVal === 'Existing-Account') data['Borrower ID'] = existingAccountId || data['Borrower ID'];
  msgEl.textContent = 'Please wait while we save the borrower.';
  msgEl.style.color = 'var(--muted)';
  try{
    const out = await postAction('addBorrower', {data});
    if(out){
      showToast('Borrower added successfully.');
      if(data['Loan Type'] === 'Add-on Diminishing' || data['Loan Type'] === 'Amortized Loan'){
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

/** Add-on Diminishing and Amortized loans both deduct one cutoff's worth of
 *  interest upfront at release (5%, matching the compounding rate used in
 *  computeAddOnDiminishing and the 2.5%-per-cutoff/5%-per-month rate used in
 *  computeAmortized — both in LoanCalculationService.gs; keep these in sync
 *  if either rate ever changes). This just reminds staff how much cash to
 *  actually hand over; it doesn't touch the stored Loan Amount or balance
 *  math. */
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
    if(editingRow) data._row = editingRow;
    if(await postAction('updateBorrower', {data})){ closeModal('editModal'); loadData(); }
  } finally { btn.disabled = false; }
});

let editingRow = null;
let existingAccountId = null; // Borrower ID picked in "Add Another Loan to an Existing Account"
function openEdit(id, loanType, row){
  const b = (row && (STATE.borrowers||[]).find(x => x._row === row)) || findLoanRow(id, loanType);
  if(!b) return;
  editingRow = b._row || null;
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
    if(type === 'Amortized Loan'){
      // Fixed formula, not a configured tier: 2.5% of the loan amount.
      form['Amount/Cut-off'].value = amt > 0 ? Math.round(amt * 0.025 * 100) / 100 : '';
    } else {
      form['Amount/Cut-off'].value = match ? (match.AmountPerCutoff ?? '') : '';
    }
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
  document.getElementById('loanCategoryUISelect').value = 'Individual';
  document.getElementById('loanCategoryHidden').value = 'Individual';
  document.getElementById('householdIdHidden').value = '';
  document.getElementById('coBorrowerSearchWrap').style.display = 'none';
  document.getElementById('coBorrowerSearchInput').value = '';
  document.getElementById('coBorrowerSelectedInfo').textContent = '';
  document.getElementById('coBorrowerSearchResults').classList.remove('show');
  resetBonusExistingFields();
  openModal('addBorrowerModal');
}

/** Undoes what selectBonusExistingBorrower() locked down, so the form goes
 *  back to normal manual entry when the category is switched away from
 *  "Bonus Loan — Add to an Existing Borrower's Account". */
function setAcctFieldsHidden(hidden){
  document.querySelectorAll('#borrowerForm .acct-field').forEach(el => { el.style.display = hidden ? 'none' : ''; });
}

function resetBonusExistingFields(){
  existingAccountId = null;
  document.getElementById('bonusBorrowerSearchWrap').style.display = 'none';
  document.getElementById('bonusBorrowerSearchInput').value = '';
  document.getElementById('bonusBorrowerSelectedInfo').textContent = '';
  document.getElementById('bonusBorrowerSearchResults').classList.remove('show');
  document.getElementById('bonusPeriodFieldWrap').style.display = 'none';
  document.getElementById('bonusPeriodSelect').disabled = true;
  setAcctFieldsHidden(false);
  const idField = document.getElementById('borrowerIdField');
  ['Last Name','First Name','Contact Number','Address'].forEach(n => {
    const f = document.querySelector('#borrowerForm input[name="'+n+'"]'); if(f) f.value = '';
  });
  idField.value = computeNextBorrowerId();
}

document.getElementById('loanCategoryUISelect').addEventListener('change', (e)=>{
  const val = e.target.value;
  const searchWrap = document.getElementById('coBorrowerSearchWrap');
  const bonusWrap = document.getElementById('bonusBorrowerSearchWrap');
  const categoryHidden = document.getElementById('loanCategoryHidden');
  const householdHidden = document.getElementById('householdIdHidden');
  if(val !== 'Existing-Account') resetBonusExistingFields();
  document.getElementById('borrowerLoanTypeSelect').innerHTML = ''; // so the right default is picked for this mode
  bonusWrap.style.display = 'none';
  if(val === 'Individual'){
    categoryHidden.value = 'Individual';
    householdHidden.value = '';
    searchWrap.style.display = 'none';
  } else if(val === 'Group-Main'){
    categoryHidden.value = 'Group';
    householdHidden.value = document.getElementById('borrowerIdField').value; // main borrower = own ID
    searchWrap.style.display = 'none';
  } else if(val === 'Group-Co'){
    categoryHidden.value = 'Group';
    householdHidden.value = ''; // set once a main borrower is picked below
    searchWrap.style.display = '';
  } else { // Existing-Account
    categoryHidden.value = 'Individual';
    householdHidden.value = '';
    searchWrap.style.display = 'none';
    bonusWrap.style.display = '';
    setAcctFieldsHidden(true); // name/contact/cutoff come from the existing account
  }
  refreshLoanTypeOptionsForGroup();
});

document.getElementById('bonusBorrowerSearchInput').addEventListener('input', (e)=>{
  const q = e.target.value.trim().toLowerCase();
  document.getElementById('borrowerIdField').value = '';
  existingAccountId = null;
  document.getElementById('bonusBorrowerSelectedInfo').textContent = '';
  const resultsEl = document.getElementById('bonusBorrowerSearchResults');
  if(!q){ resultsEl.classList.remove('show'); return; }
  // One result per account (Borrower ID), listing the loans it already has.
  // The server does the authoritative eligibility check on save.
  const byId = new Map();
  (STATE?.borrowers||[]).forEach(b => {
    const idStr = String(b['Borrower ID']||'').toLowerCase();
    const nameStr = `${b['Last Name']||''} ${b['First Name']||''}`.toLowerCase();
    if(!(idStr.includes(q) || nameStr.includes(q))) return;
    const k = String(b['Borrower ID']);
    if(!byId.has(k)) byId.set(k, []);
    byId.get(k).push(b);
  });
  const matches = [...byId.values()].slice(0, 8);
  resultsEl.innerHTML = matches.length
    ? matches.map(rows => { const b = rows[0];
        const loans = rows.filter(r => r.status !== 'Paid' && r.status !== 'Renewed').map(r => r['Loan Type']).join(', ') || 'no active loan';
        return `<div class="item" onclick="selectBonusExistingBorrower(${b['Borrower ID']})">${b['Last Name']}, ${b['First Name']} — ID ${b['Borrower ID']} (${loans})</div>`; }).join('')
    : `<div class="item" style="color:var(--muted);cursor:default;">No matching account found</div>`;
  resultsEl.classList.add('show');
});

function selectBonusExistingBorrower(borrowerId){
  const rows = (STATE?.borrowers||[]).filter(x => String(x['Borrower ID']) === String(borrowerId));
  const b = rows[0];
  if(!b) return;
  const name = `${b['Last Name']}, ${b['First Name']}`;
  const active = rows.filter(r => r.status !== 'Paid' && r.status !== 'Renewed').map(r => r['Loan Type']);
  existingAccountId = b['Borrower ID'];
  document.getElementById('borrowerIdField').value = b['Borrower ID'];
  document.getElementById('bonusBorrowerSearchInput').value = name;
  document.getElementById('bonusBorrowerSelectedInfo').textContent =
    `New loan will be added to ${name}'s account (ID ${formatBorrowerId(b)}). Current active loans: ${active.join(', ') || 'none'}.`;
  document.getElementById('bonusBorrowerSearchResults').classList.remove('show');
  document.getElementById('loanCategoryHidden').value = b['Loan Category'] || 'Individual';
  document.getElementById('householdIdHidden').value = b['Household ID'] || '';
  const set = (n, v) => { const f = document.querySelector('#borrowerForm input[name="'+n+'"]'); if(f) f.value = v ?? ''; };
  set('Last Name', b['Last Name']); set('First Name', b['First Name']);
  set('Contact Number', b['Contact Number']); set('Address', b['Address']);
  const groupSel = document.getElementById('borrowerGroupSelect');
  if(groupSel) groupSel.value = b['Group'] || 'Teachers';
  const atm = document.getElementById('borrowerAtmOptionSelect');
  if(atm) atm.value = String(b['ATMOption']).trim().toLowerCase() === 'yes' ? 'Yes' : 'No';
  refreshLoanTypeOptionsForGroup();
}

document.getElementById('coBorrowerSearchInput').addEventListener('input', (e)=>{
  const q = e.target.value.trim().toLowerCase();
  document.getElementById('householdIdHidden').value = '';
  document.getElementById('coBorrowerSelectedInfo').textContent = '';
  const resultsEl = document.getElementById('coBorrowerSearchResults');
  if(!q){ resultsEl.classList.remove('show'); return; }
  // Only existing MAIN borrowers can be picked as the household anchor —
  // i.e. their own Borrower ID already equals their own Household ID (a
  // plain Individual loan) or they're already the anchor of a Group loan.
  const matches = (STATE?.borrowers||[]).filter(b => {
    const isMain = !b['Household ID'] || String(b['Household ID']) === String(b['Borrower ID']);
    if(!isMain) return false;
    const idStr = String(b['Borrower ID']||'').toLowerCase();
    const nameStr = `${b['Last Name']||''} ${b['First Name']||''}`.toLowerCase();
    return idStr.includes(q) || nameStr.includes(q);
  }).slice(0, 8);
  resultsEl.innerHTML = matches.length
    ? matches.map(b => `<div class="item" onclick="selectCoBorrowerHousehold(${b['Borrower ID']}, '${(b['Last Name']+', '+b['First Name']).replace(/'/g,"\\'")}')">${b['Last Name']}, ${b['First Name']} — ID ${b['Borrower ID']}</div>`).join('')
    : `<div class="item" style="color:var(--muted);cursor:default;">No matching borrower found</div>`;
  resultsEl.classList.add('show');
});

function selectCoBorrowerHousehold(borrowerId, name){
  document.getElementById('householdIdHidden').value = borrowerId;
  document.getElementById('coBorrowerSearchInput').value = name;
  document.getElementById('coBorrowerSelectedInfo').textContent = `Will be added under ${name}'s household.`;
  document.getElementById('coBorrowerSearchResults').classList.remove('show');
}

async function showSOA(id, loanType, row){
  let soa;
  if(!API_URL){
    const b = SAMPLE.borrowers.find(x=>x['Borrower ID']===id) || SAMPLE.borrowers[0];
    soa = {soaNo:'SOA-DEMO', dateGenerated: new Date().toISOString().slice(0,10), borrower:b, computed:b,
           payments: SAMPLE.payments.filter(p=>p['Borrower ID']===id)};
  } else {
    const res = await fetch(API_URL + '?action=soa&id=' + id + (loanType ? '&loanType=' + encodeURIComponent(loanType) : '') + (row ? '&row=' + row : ''));
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
