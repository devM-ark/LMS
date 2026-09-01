function reportRemarks(b){
  if(b.status === 'Paid') return 'Fully Paid';
  if(typeof b.missedCount === 'number' && b.missedCount > 0) return b.missedCount + ' missed payment' + (b.missedCount>1?'s':'');
  if(b.status === 'Past Due' || b.status === 'Eligible for Renewal') return 'Past Due';
  return '';
}

document.getElementById('reportFilterForm')?.addEventListener('submit', (e)=>{
  e.preventDefault();
  const group = document.getElementById('reportGroupSelect').value;
  const statusFilter = document.getElementById('reportStatusSelect').value;
  const all = STATE?.borrowers || [];
  const borrowers = all.filter(b => {
    const bGroup = String(b['Group']||'Teachers').trim().toLowerCase();
    const matchesGroup = bGroup === group.toLowerCase();
    const matchesStatus = statusFilter === 'paid' ? (b.status === 'Paid' || b.status === 'Renewed') : (b.status !== 'Paid' && b.status !== 'Renewed');
    return matchesGroup && matchesStatus;
  }).sort((a,b) => {
    const an = `${a['Last Name']||''} ${a['First Name']||''}`.trim().toLowerCase();
    const bn = `${b['Last Name']||''} ${b['First Name']||''}`.trim().toLowerCase();
    return an.localeCompare(bn);
  });

  document.getElementById('reportCompanyName').textContent = (STATE?.settings && STATE.settings.CompanyName) || "Manalo's Lending Corporation";
  document.getElementById('reportSubtitle').textContent =
    `Summary of Borrowers — ${group} — ${statusFilter==='paid'?'Paid':'Active'} Loans — Generated ${fmtDate(new Date().toISOString().slice(0,10))}`;

  const tbody = document.querySelector('#reportTable tbody');
  tbody.innerHTML = borrowers.length ? borrowers.map(b => `
    <tr>
      <td>${b['Borrower ID']}</td>
      <td>${b['Last Name']}, ${b['First Name']}</td>
      <td>${b['Loan Type']}</td>
      <td>${fmt(b['Loan Amount'])}</td>
      <td>${fmtDate(b['Release Date'])}</td>
      <td>${fmtDate(b.maturityDate)}</td>
      <td>${fmt(b.totalPaid)}</td>
      <td>${b['Amount/Cut-off'] ? fmt(b['Amount/Cut-off']) : '–'}</td>
      <td>${fmt(b.balance)}</td>
      <td>${reportRemarks(b)}</td>
    </tr>`).join('') : `<tr><td colspan="10" class="empty">No matching borrowers</td></tr>`;

  document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
  document.getElementById('collectionsOutput')?.classList.remove('open');
  document.getElementById('reportOutput').classList.add('open');
});

// Populate the Year dropdown once (current year, plus a couple years back)
(function populateCollectionsYears(){
  const sel = document.getElementById('collectionsYearSelect');
  if(!sel) return;
  const now = new Date().getFullYear();
  const years = [now, now-1, now-2];
  sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
})();

document.getElementById('collectionsFilterForm')?.addEventListener('submit', (e)=>{
  e.preventDefault();
  const month = Number(document.getElementById('collectionsMonthSelect').value);
  const year = Number(document.getElementById('collectionsYearSelect').value);
  const monthName = document.getElementById('collectionsMonthSelect').selectedOptions[0].text;
  const borrowersById = {};
  (STATE?.borrowers||[]).forEach(b => { borrowersById[String(b['Borrower ID'])] = b; });

  const payments = (STATE?.payments||[]).filter(p => {
    if(p.Status === 'VOID') return false;
    const d = new Date(p['Payment Date']);
    return (d.getMonth()+1) === month && d.getFullYear() === year;
  }).sort((a,b) => new Date(a['Payment Date']) - new Date(b['Payment Date']));

  document.getElementById('collectionsCompanyName').textContent = (STATE?.settings && STATE.settings.CompanyName) || "Manalo's Lending Corporation";
  document.getElementById('collectionsSubtitle').textContent =
    `Summary of Collections — ${monthName} ${year} — Generated ${fmtDate(new Date().toISOString().slice(0,10))}`;

  const tbody = document.querySelector('#collectionsTable tbody');
  tbody.innerHTML = payments.length ? payments.map(p => {
    const b = borrowersById[String(p['Borrower ID'])];
    const name = p['Borrower Name'] || (b ? `${b['Last Name']}, ${b['First Name']}` : String(p['Borrower ID']));
    const loanType = b ? b['Loan Type'] : '—';
    return `
    <tr>
      <td>${fmtDate(p['Payment Date'])}</td>
      <td>${name}</td>
      <td>${loanType}</td>
      <td>${p['OR / Reference No.']}</td>
      <td>${p['Mode of Payment']}</td>
      <td>${fmt(p['Amount Paid'])}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" class="empty">No collections recorded for this period</td></tr>`;

  const total = payments.reduce((s,p) => s + (Number(p['Amount Paid'])||0), 0);
  document.getElementById('collectionsTotalRow').innerHTML =
    `<td colspan="5">Total Collected:</td><td>${fmt(total)}</td>`;

  document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
  document.getElementById('reportOutput')?.classList.remove('open');
  document.getElementById('collectionsOutput').classList.add('open');
});

function showNearlyDueModal(){
  const tbody = document.getElementById('nearlyDueModalBody');
  const list = (STATE?.borrowers||[]).filter(b => b.status === 'Nearly Due');
  const today = new Date(); today.setHours(0,0,0,0);
  tbody.innerHTML = list.length ? list.map(b=>{
    const due = b.nextDue ? new Date(b.nextDue) : null;
    const daysBefore = due ? Math.max(0, Math.round((due - today) / 86400000)) : '—';
    return `<tr>
      <td>${b['Last Name']}, ${b['First Name']}</td>
      <td>${b['Loan Type']}</td>
      <td>${fmtDate(b.nextDue)}</td>
      <td>${fmt(b.cutoffAmountDue)}</td>
      <td>${daysBefore}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="5" class="empty">No borrowers nearly due</td></tr>`;
  openModal('nearlyDueModal');
}

function showPastDueModal(){
  const tbody = document.getElementById('pastDueModalBody');
  const list = (STATE?.borrowers||[]).filter(b => b.status === 'Past Due');
  tbody.innerHTML = list.length ? list.map(b=>{
    const missed = (typeof b.missedCount === 'number' && b.missedCount > 0) ? b.missedCount : 1;
    return `<tr>
      <td>${b['Last Name']}, ${b['First Name']}</td>
      <td>${b['Loan Type']}</td>
      <td>${fmtDate(b.nextDue)}</td>
      <td>${fmt(b.cutoffAmountDue)}</td>
      <td>${missed}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="5" class="empty">No past due borrowers</td></tr>`;
  openModal('pastDueModal');
}

function showEligibleRenewalModal(){
  const tbody = document.getElementById('eligibleRenewalModalBody');
  const list = (STATE?.borrowers||[]).filter(b => b.status === 'Eligible for Renewal');
  tbody.innerHTML = list.length ? list.map(b=>`
    <tr>
      <td>${b['Last Name']}, ${b['First Name']}</td>
      <td>${b['Loan Type']}</td>
      <td>${fmtDate(b['Release Date'])}</td>
      <td>${fmt(b['Loan Amount'])}</td>
      <td>${fmt(b.totalPaid)}</td>
      <td>${fmt(b.balance)}</td>
      <td class="no-print"><button class="btn small gold" onclick="openRenewLoanModal(${b['Borrower ID']})">Renew</button></td>
    </tr>`).join('') : `<tr><td colspan="7" class="empty">No borrowers eligible for renewal</td></tr>`;
  openModal('eligibleRenewalModal');
}

let renewingBorrower = null;

function openRenewLoanModal(borrowerId){
  const b = (STATE?.borrowers||[]).find(x => x['Borrower ID'] === borrowerId);
  if(!b){ showToast('Borrower not found.', true); return; }
  renewingBorrower = b;
  document.getElementById('renewLoanForm').reset();
  document.getElementById('renewLoanErr').textContent = '';
  document.getElementById('renewLoanPreview').textContent = '';
  document.getElementById('renewLoanSummary').innerHTML =
    `<div class="renew-summary-row"><span>Full Name</span><span>${b['First Name']} ${b['Last Name']}</span></div>` +
    `<div class="renew-summary-row"><span>Borrower ID</span><span>${formatBorrowerId(b)}</span></div>` +
    `<div class="renew-summary-row"><span>Loan Type</span><span>${b['Loan Type']}</span></div>` +
    `<div class="renew-summary-row"><span>Outstanding Balance</span><span>${fmt(b.balance)}</span></div>`;
  openModal('renewLoanModal');
}

document.getElementById('renewLoanAmountInput')?.addEventListener('input', (e)=>{
  const previewEl = document.getElementById('renewLoanPreview');
  if(!renewingBorrower){ previewEl.textContent = ''; return; }
  const amt = Number(e.target.value) || 0;
  const balance = Number(renewingBorrower.balance) || 0;
  if(amt <= 0){ previewEl.textContent = ''; return; }
  if(amt <= balance){
    previewEl.innerHTML = `<span style="color:var(--bad);">Must be greater than the current balance of ${fmt(balance)}.</span>`;
  } else {
    previewEl.innerHTML = `Borrower will receive <b>${fmt(amt - balance)}</b> upon release (after the ${fmt(balance)} balance is rolled over).`;
  }
});

document.getElementById('renewLoanForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!renewingBorrower) return;
  const btn = e.target.querySelector('button[type=submit]');
  if(btn.disabled) return;
  const errEl = document.getElementById('renewLoanErr');
  errEl.textContent = '';
  const newAmount = Number(document.getElementById('renewLoanAmountInput').value) || 0;
  const balance = Number(renewingBorrower.balance) || 0;
  if(newAmount <= balance){ errEl.textContent = `New amount must be greater than the current balance of ${fmt(balance)}.`; return; }

  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Saving…';
  errEl.textContent = 'Please wait while we process the renewal.';
  errEl.style.color = 'var(--muted)';
  try{
    const newBorrowerId = computeNextBorrowerId();
    const out = await postAction('renewLoan', {
      oldBorrowerId: renewingBorrower['Borrower ID'],
      newBorrowerId,
      newLoanAmount: newAmount
    });
    if(out && out.success){
      closeModal('renewLoanModal');
      closeModal('eligibleRenewalModal');
      const name = `${renewingBorrower['First Name']} ${renewingBorrower['Last Name']}`;
      document.getElementById('renewLoanNoticeText').innerHTML =
        `The previous balance of <b>${fmt(out.oldBalance)}</b> has been rolled into this renewal.<br><br>` +
        `Please hand over <b>${fmt(out.netProceeds)}</b> to <b>${name}</b> upon release.`;
      openModal('renewLoanNoticeModal');
      await loadData();
      renderBorrowersTable();
    } else {
      errEl.textContent = '';
    }
  } finally { btn.disabled = false; btn.textContent = originalLabel; }
});
