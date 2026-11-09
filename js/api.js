/**
 * api.js — the API endpoint, demo/offline sample data, and the single
 * postAction() wrapper every mutating form goes through.
 */

const API_URL = "https://script.google.com/macros/s/AKfycbz5R1jf1Z8SadH5CwTc0G3945_MQs_6rac7ps4i8f7vKvqXe5ybI_FvNSfnbX6KaGcv/exec";

const SAMPLE = {
  borrowers: [
    {"Borrower ID":2026003,"Last Name":"Mangunay","First Name":"Clarabels","Loan Type":"Amortized Loan",
     totalPaid:4000, totalToRepay:48000, balance:44000, nextDue:"2026-09-07", status:"Active"},
    {"Borrower ID":2026009,"Last Name":"Remo","First Name":"Raymark","Loan Type":"Regular Loan",
     totalPaid:30000, totalToRepay:30000, balance:0, nextDue:null, status:"Paid"},
    {"Borrower ID":2026001,"Last Name":"Pogi","First Name":"Mark","Loan Type":"Add-on Diminishing",
     totalPaid:0, totalToRepay:null, balance:15000, nextDue:"2026-08-01", status:"Nearly Due"},
  ],
  payments: [
    {"Payment Date":"2026-07-23","Borrower ID":2026003,"Borrower Name":"Mangunay, Clarabels","OR / Reference No.":1001,"Amount Paid":2500,"Mode of Payment":"GCash",_row:2},
    {"Payment Date":"2026-07-23","Borrower ID":2026009,"Borrower Name":"Remo, Raymark","OR / Reference No.":1111,"Amount Paid":5500,"Mode of Payment":"Cash",_row:3},
  ],
  loanTypes: [
    {LoanTypeKey:"ADO", LoanType:"Add-on Diminishing", AmountTier:"Variable", AddOnRate:0.05, TermMonths:"up to 12"},
    {LoanTypeKey:"REG-20000", LoanType:"Regular Loan", AmountTier:20000, AddOnRate:"", TermMonths:12},
  ],
  settings: { CompanyName: "Manalo's Lending Corporation", LogoUrl: "" },
  monthLabel: "This Month", monthCollectible: 12500, monthCollected: 8000, totalUnpaid: 15750, monthUnpaid: 4500
};


// Set to true to bring back the "Borrower Login" button and portal on the sign-in screen.
const BORROWER_PORTAL_ENABLED = false;

// ---------- Actions ----------
// These can be done with no internet — they're saved on the device and sent
// when the connection returns (see offline.js). Everything else needs to be online.
const QUEUEABLE_ACTIONS = ['addPayment', 'addGroupPayment', 'addBorrower', 'updateBorrower'];
let _clientSeq = 0;
function newClientId(){ return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + (++_clientSeq); }

async function postAction(action, extra){
  if(!API_URL){ alert('Please setup the API URL web link!'); return null; }
  const queueable = QUEUEABLE_ACTIONS.indexOf(action) !== -1;
  const payload = {action, username: SESSION?.username, ...extra};
  if(queueable){ payload.clientId = newClientId(); OFFLINE.prepare(action, payload); }
  let out;
  try{
    const res = await fetchWithTimeout(API_URL, {method:'POST', body: JSON.stringify(payload)}, queueable ? 30000 : 60000);
    out = await res.json();
  }catch(netErr){
    // No connection (or the reply got lost). The same entry ID is re-sent later,
    // and the server ignores it if it was in fact already recorded.
    if(queueable) return OFFLINE.enqueue(action, payload);
    alert(navigator.onLine === false
      ? 'This action needs an internet connection. Please connect and try again.'
      : 'Could not reach the server. Please check your connection and try again.');
    return null;
  }
  if(out.error){
    if(queueable && out.retry) return OFFLINE.enqueue(action, payload);
    alert('Error: '+out.error); return null;
  }
  return out;
}
