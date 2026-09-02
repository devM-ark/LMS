function openStaffModal(){
  document.getElementById('staffForm').reset();
  document.getElementById('staffErr').textContent = '';
  openModal('staffModal');
}

document.getElementById('staffForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  if(btn.disabled) return;
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Saving…';
  const errEl = document.getElementById('staffErr');
  errEl.textContent = 'Please wait while we save the account.';
  errEl.style.color = 'var(--muted)';
  try{
    const data = Object.fromEntries(new FormData(e.target));
    const out = await postAction('setStaffPassword', data);
    if(out){
      showToast('Account saved successfully.');
      closeModal('staffModal');
    } else {
      errEl.textContent = '';
    }
  } finally { btn.disabled = false; btn.textContent = originalLabel; }
});

document.getElementById('reminderForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  if(btn.disabled) return;
  btn.disabled = true;
  const data = Object.fromEntries(new FormData(e.target));
  const errEl = document.getElementById('reminderErr');
  errEl.textContent = '';
  try{
    if(await postAction('updateReminderSettings', {data})){ errEl.textContent = 'Saved — but this does NOT schedule the email yet. Go to the Apps Script editor now and run setupReminderTrigger() (function dropdown → Run) to activate the daily send.'; errEl.style.color='var(--bad)'; loadData(); }
  } finally { btn.disabled = false; }
});

document.getElementById('testReminderBtn')?.addEventListener('click', async ()=>{
  const btn = document.getElementById('testReminderBtn');
  if(btn.disabled) return;
  const errEl = document.getElementById('reminderErr');
  btn.disabled = true; errEl.textContent = 'Sending…'; errEl.style.color='var(--muted)';
  try{
    const out = await postAction('sendTestReminder', {});
    if(out){ errEl.textContent = out.sent ? `Test email sent (${out.count} borrower(s) listed).` : (out.note || 'Sent.'); errEl.style.color='var(--good)'; }
  } finally { btn.disabled = false; }
});

document.getElementById('companyForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  if(btn.disabled) return;
  btn.disabled = true;
  const data = Object.fromEntries(new FormData(e.target));
  const errEl = document.getElementById('companyErr');
  errEl.textContent = '';
  try{
    if(await postAction('updateSettings', {data})){ errEl.textContent = 'Saved.'; errEl.style.color='var(--good)'; loadData(); }
  } finally { btn.disabled = false; }
});

document.getElementById('loanTypeForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  if(btn.disabled) return;
  btn.disabled = true;
  try{
    const data = Object.fromEntries(new FormData(e.target));
    if(await postAction('addLoanType', {data})){ e.target.reset(); loadData(); }
  } finally { btn.disabled = false; }
});

function editLoanType(lt){
  const form = document.getElementById('loanTypeForm');
  Object.keys(lt).forEach(k => { if(form[k]) form[k].value = lt[k]; });
  form.querySelector('button[type=submit]').textContent = 'Save Changes';
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    if(btn.disabled) return;
    btn.disabled = true;
    try{
      const data = Object.fromEntries(new FormData(form));
      if(await postAction('updateLoanType', {data})){
        form.reset();
        form.querySelector('button[type=submit]').textContent = 'Add Loan Type';
        form.onsubmit = null;
        loadData();
      }
    } finally { btn.disabled = false; }
  };
}

let deletingLoanType = false;
async function deleteLoanType(key){
  if(deletingLoanType) return;
  if(!window.confirm('Delete loan type "'+key+'"? This cannot be undone.')) return;
  deletingLoanType = true;
  try{ if(await postAction('deleteLoanType', {key})) loadData(); }
  finally { deletingLoanType = false; }
}

document.getElementById('deleteAllForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  if(btn.disabled) return;
  const {confirm: phrase} = Object.fromEntries(new FormData(e.target));
  if(!window.confirm('This deletes ALL borrower and payment data permanently. Continue?')) return;
  btn.disabled = true;
  try{
    if(await postAction('deleteAllData', {confirm: phrase})){ alert('All borrower and payment data deleted.'); e.target.reset(); loadData(); }
  } finally { btn.disabled = false; }
});

/** Triggers a browser download of the exported CSV — used both as a data
 *  backup and as the exact import template (headers always match). */
async function downloadCsv(action, filenameBase){
  const out = await postAction(action, {});
  if(!out || !out.success) return;
  const blob = new Blob([out.csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenameBase}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Reads the selected CSV file client-side and sends the raw text to the
 *  backend for bulk import — headers just need to match the sheet's own
 *  column names (case/whitespace tolerant), easiest guaranteed by using the
 *  downloaded template above as the starting point. */
function importCsv(fileInputId, action){
  const fileInput = document.getElementById(fileInputId);
  const msgId = action === 'importBorrowersCsv' ? 'importBorrowersMsg' : 'importPaymentsMsg';
  const msgEl = document.getElementById(msgId);
  const file = fileInput.files[0];
  if(!file){ msgEl.textContent = 'Choose a CSV file first.'; msgEl.style.color = 'var(--bad)'; return; }

  msgEl.textContent = 'Please wait while we import the file.';
  msgEl.style.color = 'var(--muted)';

  const reader = new FileReader();
  reader.onload = async () => {
    const out = await postAction(action, {csvText: reader.result});
    if(out && out.success){
      msgEl.textContent = `Imported ${out.imported} row(s)` + (out.skipped ? `, skipped ${out.skipped} (missing or unrecognized Borrower ID).` : '.');
      msgEl.style.color = 'var(--good)';
      fileInput.value = '';
      await loadData();
      renderBorrowersTable();
      renderPaymentsTable();
    } else {
      msgEl.textContent = '';
    }
  };
  reader.onerror = () => { msgEl.textContent = 'Could not read the file.'; msgEl.style.color = 'var(--bad)'; };
  reader.readAsText(file);
}

async function loadLogs(){
  const tbody = document.querySelector('#logsTable tbody');
  if(!tbody) return;
  tbody.innerHTML = `<tr><td colspan="3" class="empty">Loading…</td></tr>`;
  if(!API_URL){
    tbody.innerHTML = `<tr><td colspan="3" class="empty">Connect API_URL to view logs.</td></tr>`;
    return;
  }
  try{
    const res = await fetch(API_URL, {method:'POST', body: JSON.stringify({action:'getLogs', username: SESSION.username})});
    const out = await res.json();
    if(out.error){ tbody.innerHTML = `<tr><td colspan="3" class="empty">${out.error}</td></tr>`; return; }
    const logs = Array.isArray(out) ? out : [];
    tbody.innerHTML = logs.length ? logs.map(l => `
      <tr><td>${l.user}</td><td>${l.activity}</td><td>${l.timestamp}</td></tr>
    `).join('') : `<tr><td colspan="3" class="empty">No activity recorded yet</td></tr>`;
  } catch(err){
    tbody.innerHTML = `<tr><td colspan="3" class="empty">Could not reach the server.</td></tr>`;
  }
}
