let BORROWER_SESSION = null; // {username, borrowerId, firstName, lastName, mustChangePassword}

function setLoginMode(mode){
  const staffBtn = document.getElementById('loginModeStaffBtn');
  const borrowerBtn = document.getElementById('loginModeBorrowerBtn');
  const staffForm = document.getElementById('loginForm');
  const borrowerForm = document.getElementById('borrowerLoginForm');
  if(mode === 'borrower'){
    staffForm.style.display = 'none';
    borrowerForm.style.display = '';
    staffBtn.classList.add('ghost');
    borrowerBtn.classList.remove('ghost');
  } else {
    staffForm.style.display = '';
    borrowerForm.style.display = 'none';
    borrowerBtn.classList.add('ghost');
    staffBtn.classList.remove('ghost');
  }
}

document.getElementById('borrowerLoginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  if(btn.disabled) return;
  btn.disabled = true;
  const errEl = document.getElementById('borrowerLoginErr');
  errEl.textContent = '';
  const {username, password} = Object.fromEntries(new FormData(e.target));
  try{
    if(!API_URL){ errEl.textContent = 'Connect API_URL first — see the setup note on Home.'; return; }
    const res = await fetch(API_URL, {method:'POST', body: JSON.stringify({action:'loginBorrower', username, password})});
    const out = await res.json();
    if(out.error){ errEl.textContent = out.error; return; }
    BORROWER_SESSION = out;
    sessionStorage.setItem('lm_borrower_session', JSON.stringify(out));
    e.target.reset();
    if(out.mustChangePassword){
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('borrowerChangePasswordScreen').style.display = 'flex';
    } else {
      enterBorrowerPortal();
    }
  }catch(err){ errEl.textContent = 'Could not reach the server.'; }
  finally { btn.disabled = false; }
});

document.getElementById('borrowerForcedChangeForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  if(btn.disabled) return;
  const errEl = document.getElementById('borrowerForcedChangeErr');
  errEl.textContent = '';
  const {newPassword, confirmNewPassword} = Object.fromEntries(new FormData(e.target));
  if(newPassword !== confirmNewPassword){ errEl.textContent = 'Passwords do not match.'; return; }
  btn.disabled = true;
  try{
    const defaultPassword = String(BORROWER_SESSION.lastName || '').toLowerCase().replace(/\s+/g, '');
    const res = await fetch(API_URL, {method:'POST', body: JSON.stringify({
      action:'changeBorrowerPassword', username: BORROWER_SESSION.username,
      currentPassword: defaultPassword, newPassword
    })});
    const out = await res.json();
    if(out.error){ errEl.textContent = out.error; return; }
    BORROWER_SESSION.mustChangePassword = false;
    sessionStorage.setItem('lm_borrower_session', JSON.stringify(BORROWER_SESSION));
    e.target.reset();
    document.getElementById('borrowerChangePasswordScreen').style.display = 'none';
    enterBorrowerPortal();
  }catch(err){ errEl.textContent = 'Could not reach the server.'; }
  finally { btn.disabled = false; }
});

function openBorrowerChangePasswordModal(){
  document.getElementById('borrowerChangePasswordForm').reset();
  document.getElementById('borrowerEditUsernameInput').value = BORROWER_SESSION.username;
  document.getElementById('borrowerChangePasswordErr').textContent = '';
  openModal('borrowerChangePasswordModal');
}

document.getElementById('borrowerChangePasswordForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  if(btn.disabled) return;
  const errEl = document.getElementById('borrowerChangePasswordErr');
  errEl.textContent = '';
  const {newUsername, currentPassword, newPassword, confirmNewPassword} = Object.fromEntries(new FormData(e.target));
  if(newPassword && newPassword !== confirmNewPassword){ errEl.textContent = 'Passwords do not match.'; return; }
  btn.disabled = true;
  try{
    const res = await fetch(API_URL, {method:'POST', body: JSON.stringify({
      action:'updateOwnBorrowerAccount', username: BORROWER_SESSION.username, currentPassword, newUsername, newPassword
    })});
    const out = await res.json();
    if(out.error){ errEl.textContent = out.error; return; }
    BORROWER_SESSION.username = out.username;
    sessionStorage.setItem('lm_borrower_session', JSON.stringify(BORROWER_SESSION));
    closeModal('borrowerChangePasswordModal');
    showToast('Account updated successfully.');
  }catch(err){ errEl.textContent = 'Could not reach the server.'; }
  finally { btn.disabled = false; }
});

async function enterBorrowerPortal(){
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('borrowerChangePasswordScreen').style.display = 'none';
  document.getElementById('borrowerPortal').style.display = 'block';
  document.getElementById('borrowerGreeting').innerHTML = `Good day, <b>${BORROWER_SESSION.firstName} ${BORROWER_SESSION.lastName}</b>!`;
  document.getElementById('borrowerWhoamiText').innerHTML = '<svg viewBox="0 0 24 24"><path d="m12,0C5.383,0,0,5.383,0,12s5.383,12,12,12,12-5.383,12-12S18.617,0,12,0Zm-4,21.164v-.164c0-2.206,1.794-4,4-4s4,1.794,4,4v.164c-1.226.537-2.578.836-4,.836s-2.774-.299-4-.836Zm9.925-1.113c-.456-2.859-2.939-5.051-5.925-5.051s-5.468,2.192-5.925,5.051c-2.47-1.823-4.075-4.753-4.075-8.051C2,6.486,6.486,2,12,2s10,4.486,10,10c0,3.298-1.605,6.228-4.075,8.051Zm-5.925-15.051c-2.206,0-4,1.794-4,4s1.794,4,4,4,4-1.794,4-4-1.794-4-4-4Zm0,6c-1.103,0-2-.897-2-2s.897-2,2-2,2,.897,2,2-.897,2-2,2Z"/></svg><span>' + BORROWER_SESSION.firstName + ' ' + BORROWER_SESSION.lastName + ' • Borrower</span>';

  const pickerWrap = document.getElementById('householdPickerWrap');
  const pickerSelect = document.getElementById('householdPickerSelect');
  const household = BORROWER_SESSION.household || [];
  if(household.length > 1){
    pickerSelect.innerHTML = household.map(m =>
      `<option value="${m.borrowerId}">${m.lastName}, ${m.firstName} — ${m.loanType}${m.isMain ? ' (You)' : ''}</option>`
    ).join('');
    pickerSelect.value = BORROWER_SESSION.borrowerId;
    pickerWrap.style.display = '';
  } else {
    pickerWrap.style.display = 'none';
  }

  await loadBorrowerSOA(BORROWER_SESSION.borrowerId);
}

async function loadBorrowerSOA(targetBorrowerId){
  const contentEl = document.getElementById('borrowerSOAContent');
  contentEl.innerHTML = '<div class="empty">Please wait while we prepare your Statement of Account.</div>';
  const res = await fetch(API_URL, {method:'POST', body: JSON.stringify({action:'getMySOA', username: BORROWER_SESSION.username, targetBorrowerId})});
  const soa = await res.json();
  if(soa.error){ contentEl.innerHTML = `<div class="err">${soa.error}</div>`; return; }
  contentEl.innerHTML = buildSOAHTML(soa);
}

document.getElementById('householdPickerSelect').addEventListener('change', (e)=>{
  loadBorrowerSOA(e.target.value);
});

function borrowerLogout(){
  BORROWER_SESSION = null;
  sessionStorage.removeItem('lm_borrower_session');
  document.getElementById('borrowerPortal').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('borrowerLoginForm').reset();
  document.getElementById('loginForm')?.reset();
  setLoginMode('borrower');
}

// restore borrower session on reload (same tab only)
const savedBorrower = sessionStorage.getItem('lm_borrower_session');
if(savedBorrower && !sessionStorage.getItem('lm_session')){
  BORROWER_SESSION = JSON.parse(savedBorrower);
  if(!BORROWER_SESSION.mustChangePassword) enterBorrowerPortal();
}
