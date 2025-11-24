document.addEventListener('DOMContentLoaded', ()=>{
  const dbg = document.getElementById('dbg');
  const vdbg = document.getElementById('vdbg');
  const save = document.getElementById('save');
  const closeBtn = document.getElementById('close');

  // load settings
  chrome.storage.sync.get({ debug: false, verbose: false }, (res)=>{
    dbg.checked = !!res.debug;
    vdbg.checked = !!res.verbose;
  });

  save.addEventListener('click', (ev)=>{
    ev.preventDefault();
    const newSettings = { debug: !!dbg.checked, verbose: !!vdbg.checked };
    chrome.storage.sync.set(newSettings, ()=>{
      save.textContent = 'Saved';
      setTimeout(()=>{ save.textContent = 'Save'; }, 1200);
    });
  });

  closeBtn.addEventListener('click', ()=>{ window.close(); });
});
