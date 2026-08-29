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
  document.getElementById('borrowerChangePasswordErr').textContent = '';
  openModal('borrowerChangePasswordModal');
}

document.getElementById('borrowerChangePasswordForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  if(btn.disabled) return;
  const errEl = document.getElementById('borrowerChangePasswordErr');
  errEl.textContent = '';
  const {currentPassword, newPassword, confirmNewPassword} = Object.fromEntries(new FormData(e.target));
  if(newPassword !== confirmNewPassword){ errEl.textContent = 'Passwords do not match.'; return; }
  btn.disabled = true;
  try{
    const res = await fetch(API_URL, {method:'POST', body: JSON.stringify({
      action:'changeBorrowerPassword', username: BORROWER_SESSION.username, currentPassword, newPassword
    })});
    const out = await res.json();
    if(out.error){ errEl.textContent = out.error; return; }
    closeModal('borrowerChangePasswordModal');
    showToast('Password updated successfully.');
  }catch(err){ errEl.textContent = 'Could not reach the server.'; }
  finally { btn.disabled = false; }
});

async function enterBorrowerPortal(){
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('borrowerChangePasswordScreen').style.display = 'none';
  document.getElementById('borrowerPortal').style.display = 'block';
  document.getElementById('borrowerGreeting').textContent = `Good day, ${BORROWER_SESSION.firstName} ${BORROWER_SESSION.lastName}`;
  document.getElementById('borrowerWhoamiText').textContent = `${BORROWER_SESSION.firstName} ${BORROWER_SESSION.lastName} • Borrower`;
  const contentEl = document.getElementById('borrowerSOAContent');
  contentEl.innerHTML = '<div class="empty">Please wait while we prepare your Statement of Account.</div>';
  const res = await fetch(API_URL, {method:'POST', body: JSON.stringify({action:'getMySOA', username: BORROWER_SESSION.username})});
  const soa = await res.json();
  if(soa.error){ contentEl.innerHTML = `<div class="err">${soa.error}</div>`; return; }
  contentEl.innerHTML = buildSOAHTML(soa);
}

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
