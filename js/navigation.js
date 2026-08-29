document.querySelectorAll('nav.tabbar button[data-tab]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('nav.tabbar button[data-tab]').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('main section').forEach(s=>s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
    if(btn.dataset.tab === 'logs') loadLogs();
    toggleHomeOnlyActions(btn.dataset.tab === 'home');
  });
});

function toggleHomeOnlyActions(show){
  document.querySelectorAll('.home-only-action').forEach(el => el.style.display = show ? '' : 'none');
}

function focusActiveBorrowers(){
  const el = document.getElementById('activeBorrowersSection');
  if(!el) return;
  el.scrollIntoView({behavior:'smooth', block:'start'});
  el.classList.add('section-flash');
  setTimeout(()=>{ el.classList.remove('section-flash'); }, 1600);
}
