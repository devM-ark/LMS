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


// ---------- Actions ----------
async function postAction(action, extra){
  if(!API_URL){ alert('Please setup the API URL web link!'); return null; }
  const res = await fetch(API_URL, {method:'POST', body: JSON.stringify({action, username: SESSION?.username, ...extra})});
  const out = await res.json();
  if(out.error){ alert('Error: '+out.error); return null; }
  return out;
}
