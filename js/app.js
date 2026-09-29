/**
 * app.js — core application state (STATE/SESSION), the dashboard
 * render() aggregate, login/logout/account handlers, and bootstrapping.
 *
 * LOAD ORDER MATTERS: this file must load LAST (after utilities.js,
 * api.js, navigation.js, borrowers.js, payments.js, reports.js,
 * settings.js). The session-restore check at the bottom of this file
 * calls enterApp() -> loadData() -> render(), which in turn calls
 * functions defined in several of the other files (e.g.
 * renderBorrowersTable() in borrowers.js). Those files must already be
 * loaded and have defined their functions as globals before this
 * bootstrap runs — exactly mirroring their order of appearance in the
 * original single-file index.html.
 */

let STATE = null;
let borrowerSearchQuery = '';
let SESSION = null; // {username, role, name}
const RANK = {staff:1, admin:2, superadmin:3};
const isAdmin = () => SESSION && RANK[SESSION.role] >= RANK.admin;
const isSuperadmin = () => SESSION && SESSION.role === 'superadmin';

// ---------- Auth ----------
document.getElementById('loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  if(btn.disabled) return;
  btn.disabled = true;
  const errEl = document.getElementById('loginErr');
  errEl.textContent = '';
  const {username, password} = Object.fromEntries(new FormData(e.target));
  if(!API_URL){
    // demo mode: any credentials work, role = superadmin so you can see everything
    SESSION = {username, role:'superadmin', name: username};
    enterApp();
    btn.disabled = false;
    return;
  }
  try{
    const res = await fetch(API_URL, {method:'POST', body: JSON.stringify({action:'login', username, password})});
    const out = await res.json();
    if(out.error){ errEl.textContent = out.error; return; }
    SESSION = out;
    sessionStorage.setItem('lm_session', JSON.stringify(out));
    e.target.reset();
    enterApp();
  }catch(err){ errEl.textContent = 'Could not reach the server.'; }
  finally { btn.disabled = false; }
});

document.getElementById('logoutBtn').addEventListener('click', ()=>{
  SESSION = null;
  sessionStorage.removeItem('lm_session');
  document.getElementById('mainApp').style.display='none';
  document.getElementById('tabbar').style.display='none';
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('loginForm').reset();
  document.getElementById('borrowerLoginForm')?.reset();
});

document.getElementById('whoamiText').addEventListener('click', ()=>{
  document.getElementById('accountForm').reset();
  document.getElementById('accountUsernameField').value = SESSION.username;
  document.getElementById('accountErr').textContent = '';
  openModal('accountModal');
});

document.getElementById('accountForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  if(btn.disabled) return;
  const errEl = document.getElementById('accountErr');
  errEl.textContent = '';
  const {currentPassword, newUsername, newPassword, confirmNewPassword} = Object.fromEntries(new FormData(e.target));
  if(newPassword && newPassword !== confirmNewPassword){
    errEl.textContent = 'New password and confirmation do not match.';
    return;
  }
  btn.disabled = true;
  try{
    if(!API_URL){ errEl.textContent = 'Connect API_URL first — see the setup note on Home.'; return; }
    const res = await fetch(API_URL, {method:'POST', body: JSON.stringify({
      action:'updateOwnAccount', username: SESSION.username, currentPassword, newUsername, newPassword
    })});
    const out = await res.json();
    if(out.error){ errEl.textContent = out.error; return; }
    SESSION = out;
    sessionStorage.setItem('lm_session', JSON.stringify(out));
    document.getElementById('whoamiText').innerHTML = '<svg viewBox="0 0 24 24"><path d="m12,0C5.383,0,0,5.383,0,12s5.383,12,12,12,12-5.383,12-12S18.617,0,12,0Zm-4,21.164v-.164c0-2.206,1.794-4,4-4s4,1.794,4,4v.164c-1.226.537-2.578.836-4,.836s-2.774-.299-4-.836Zm9.925-1.113c-.456-2.859-2.939-5.051-5.925-5.051s-5.468,2.192-5.925,5.051c-2.47-1.823-4.075-4.753-4.075-8.051C2,6.486,6.486,2,12,2s10,4.486,10,10c0,3.298-1.605,6.228-4.075,8.051Zm-5.925-15.051c-2.206,0-4,1.794-4,4s1.794,4,4,4,4-1.794,4-4-1.794-4-4-4Zm0,6c-1.103,0-2-.897-2-2s.897-2,2-2,2,.897,2,2-.897,2-2,2Z"/></svg><span>'+SESSION.name+' · '+SESSION.role+'</span>';
    closeModal('accountModal');
    showToast('Account updated successfully.');
  } catch(err){ errEl.textContent = 'Could not reach the server.'; }
  finally { btn.disabled = false; }
});

function enterApp(){
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('mainApp').style.display='block';
  document.getElementById('tabbar').style.display='flex';
  document.getElementById('whoamiText').innerHTML = '<svg viewBox="0 0 24 24"><path d="m12,0C5.383,0,0,5.383,0,12s5.383,12,12,12,12-5.383,12-12S18.617,0,12,0Zm-4,21.164v-.164c0-2.206,1.794-4,4-4s4,1.794,4,4v.164c-1.226.537-2.578.836-4,.836s-2.774-.299-4-.836Zm9.925-1.113c-.456-2.859-2.939-5.051-5.925-5.051s-5.468,2.192-5.925,5.051c-2.47-1.823-4.075-4.753-4.075-8.051C2,6.486,6.486,2,12,2s10,4.486,10,10c0,3.298-1.605,6.228-4.075,8.051Zm-5.925-15.051c-2.206,0-4,1.794-4,4s1.794,4,4,4,4-1.794,4-4-1.794-4-4-4Zm0,6c-1.103,0-2-.897-2-2s.897-2,2-2,2,.897,2,2-.897,2-2,2Z"/></svg><span>'+SESSION.name+' · '+SESSION.role+'</span>';
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = isAdmin() ? '' : 'none');
  document.querySelectorAll('.superadmin-only').forEach(el => el.style.display = isSuperadmin() ? '' : 'none');
  setTodayDefault('paymentDateInput');
  setTodayDefault('borrowerReleaseDateInput');
  const receivedByField = document.getElementById('paymentReceivedByInput');
  if(receivedByField && !receivedByField.value) receivedByField.value = SESSION.name;
  toggleHomeOnlyActions(true); // Home is the default active tab
  loadData();
  setInterval(loadData, 30000);
  // Browsers throttle/pause timers in a background or inactive tab, so the
  // 30s auto-refresh above can fall behind if staff leave this tab open
  // while working elsewhere (e.g. recording a payment in a different tab).
  // Refresh immediately whenever this tab becomes visible again, so a
  // payment just recorded elsewhere shows up right away instead of only
  // catching up on the next timer tick.
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') loadData();
  });
}

// restore session on reload (same tab only)
const saved = sessionStorage.getItem('lm_session');
if(saved){ SESSION = JSON.parse(saved); enterApp(); }

// ---------- Data ----------
async function loadData(){
  const syncEl = document.getElementById('syncStatus');
  if(!API_URL){
    document.getElementById('setupNote').style.display = 'block';
    syncEl.textContent = 'Demo mode (sample data)';
    STATE = SAMPLE; render(); return;
  }
  try{
    syncEl.textContent = 'Syncing…';
    const res = await fetch(API_URL + '?action=all');
    STATE = await res.json();
    syncEl.textContent = 'Synced ' + new Date().toLocaleTimeString();
    syncEl.className = 'sync';
    render();
  }catch(err){
    syncEl.textContent = 'Sync failed — showing last known data';
    syncEl.className = 'sync err';
    if(!STATE) STATE = SAMPLE;
    render();
  }
}

function render(){
  if(!STATE) return;
  const borrowers = STATE.borrowers || [];

  const counts = {};
  let outstanding=0, collected=0;
  borrowers.forEach(b=>{
    counts[b.status] = (counts[b.status]||0)+1;
    outstanding += b.balance>0 ? b.balance : 0;
    collected += b.totalPaid||0;
  });
  document.getElementById('dOutstanding').textContent = fmt(outstanding);
  document.getElementById('dCollected').textContent = fmt(collected);
  document.getElementById('dMonthCollectible').textContent = fmt(STATE.monthCollectible);
  document.getElementById('dMonthCollected').textContent = fmt(STATE.monthCollected);
  document.getElementById('dUnpaid').textContent = fmt(STATE.totalUnpaid);
  document.getElementById('dMonthUnpaid').textContent = fmt(STATE.monthUnpaid);
  if(STATE.monthLabel){
    document.getElementById('dMonthCollectibleLabel').textContent = 'Total Collectibles for ' + STATE.monthLabel;
    document.getElementById('dMonthCollectedLabel').textContent = 'Total Collected for ' + STATE.monthLabel;
    document.getElementById('dMonthUnpaidLabel').textContent = 'Total Unpaid for ' + STATE.monthLabel;
  }
  document.getElementById('dActive').textContent = borrowers.filter(b => (b.status !== 'Paid' && b.status !== 'Renewed')).length;
  document.getElementById('dPastDue').textContent = (counts['Past Due']||0) + (counts['Partially Paid']||0);
  document.getElementById('dNearlyDue').textContent = counts['Nearly Due']||0;
  document.getElementById('dEligibleRenewal').textContent = counts['Eligible for Renewal']||0;

  if(STATE.settings){
    if(STATE.settings.CompanyName) document.getElementById('companyNameHeader').textContent = STATE.settings.CompanyName;
    const logoEl = document.getElementById('companyLogo');
    if(STATE.settings.LogoUrl){ logoEl.src = STATE.settings.LogoUrl; logoEl.style.display='inline-block'; }
    else logoEl.style.display='none';
    const cf = document.getElementById('companyForm');
    if(cf){
      if(cf.CompanyName) cf.CompanyName.value = STATE.settings.CompanyName || '';
      if(cf.LogoUrl) cf.LogoUrl.value = STATE.settings.LogoUrl || '';
    }
    const rf = document.getElementById('reminderForm');
    if(rf){
      if(rf.ReminderEmail) rf.ReminderEmail.value = STATE.settings.ReminderEmail || '';
      if(rf.ReminderHour && STATE.settings.ReminderHour !== undefined && STATE.settings.ReminderHour !== '') rf.ReminderHour.value = STATE.settings.ReminderHour;
      if(rf.NearlyDueDays) rf.NearlyDueDays.value = STATE.settings.NearlyDueDays || 7;
    }
    const af = document.getElementById('atmChangeForm');
    if(af && document.activeElement && !af.contains(document.activeElement)){
      if(af.ATMChangeFeeTiers) af.ATMChangeFeeTiers.value = STATE.settings.ATMChangeFeeTiers || '';
      if(af.ATMChangeMessageTemplate) af.ATMChangeMessageTemplate.value = STATE.settings.ATMChangeMessageTemplate || '';
      if(af.ATMChangeNoContactTemplate) af.ATMChangeNoContactTemplate.value = STATE.settings.ATMChangeNoContactTemplate || '';
    }
  }

  const ltbody = document.querySelector('#loanTypesTable tbody');
  if(ltbody){
    const loanTypes = STATE.loanTypes || [];
    ltbody.innerHTML = loanTypes.length ? loanTypes.map(lt => `      <tr>
        <td>${lt.LoanTypeKey}</td><td>${lt.LoanType}</td><td>${lt.Group ?? ''}</td><td>${lt.AmountTier ?? ''}</td>
        <td>${lt.AddOnRate ?? ''}</td><td>${lt.TermMonths ?? ''}</td>
        <td class="no-print"><button class="btn small ghost" onclick='editLoanType(${JSON.stringify(lt).replace(/'/g,"&apos;")})'>Edit</button></td>
        <td class="no-print"><button class="btn small danger" onclick="deleteLoanType('${lt.LoanTypeKey}')">Delete</button></td>
      </tr>`).join('') : `<tr><td colspan="8" class="empty">No loan types yet</td></tr>`;
    // keep the Add Borrower loan-type dropdown in sync (full list; group filter applied separately)
    if(!document.getElementById('addBorrowerModal')?.classList.contains('open')) refreshLoanTypeOptionsForGroup();
  }

  // Auto-generate next Borrower ID (YYYY + sequence, e.g. 2026001 -> 2026002)
  // Skip while the Add Borrower form is open: this refresh runs every 30s and
  // must not overwrite an ID staff picked (Existing Account) or a form in progress.
  const idField = document.getElementById('borrowerIdField');
  const addOpen = document.getElementById('addBorrowerModal')?.classList.contains('open');
  if(idField && !addOpen) idField.value = computeNextBorrowerId();

  renderBorrowersTable();
  renderPaymentsTable();
  renderActiveBorrowerCards();
}
