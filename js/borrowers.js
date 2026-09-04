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
        <td class="no-print"><button class="btn small ghost" onclick="event.stopPropagation();showSOA(${main['Borrower ID']})">View</button></td>
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
      <td class="no-print"><button class="btn small ghost" onclick="showSOA(${b['Borrower ID']})">View</button></td>
      <td class="no-print admin-only" style="display:${isAdmin()?'':'none'}"><button class="btn small ghost" onclick="openEdit(${b['Borrower ID']})">Edit</button></td>
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
  if(type === 'Amortized Loan'){
    // Fixed formula, not a configured tier: 2.5% of the loan amount per
    // cutoff (5%/month), based on the ORIGINAL principal, forever.
    cutoffInput.value = amt > 0 ? Math.round(amt * 0.025 * 100) / 100 : '';
    const termInput = document.querySelector('#borrowerForm input[name="Term (Months)"]');
    const match = (STATE?.loanTypes||[]).find(lt =>
      lt.LoanType === type && Number(lt.AmountTier) === amt && (!lt.Group || lt.Group === group || lt.Group === 'Both'));
    if(termInput && match && match.TermMonths) termInput.value = match.TermMonths;
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
  const msgEl = document.getElementById('borrowerMsg');
  if(document.getElementById('loanCategoryUISelect').value === 'Group-Co' && !document.getElementById('householdIdHidden').value){
    msgEl.textContent = 'Search and select the main borrower for this group before saving.';
    msgEl.style.color = 'var(--bad)';
    return;
  }
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Saving…';
  const data = Object.fromEntries(new FormData(e.target));
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
  openModal('addBorrowerModal');
}

document.getElementById('loanCategoryUISelect').addEventListener('change', (e)=>{
  const val = e.target.value;
  const searchWrap = document.getElementById('coBorrowerSearchWrap');
  const categoryHidden = document.getElementById('loanCategoryHidden');
  const householdHidden = document.getElementById('householdIdHidden');
  if(val === 'Individual'){
    categoryHidden.value = 'Individual';
    householdHidden.value = '';
    searchWrap.style.display = 'none';
  } else if(val === 'Group-Main'){
    categoryHidden.value = 'Group';
    householdHidden.value = document.getElementById('borrowerIdField').value; // main borrower = own ID
    searchWrap.style.display = 'none';
  } else { // Group-Co
    categoryHidden.value = 'Group';
    householdHidden.value = ''; // set once a main borrower is picked below
    searchWrap.style.display = '';
  }
});

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
