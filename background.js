// Background service worker: injects a one-shot scanner into all frames when the extension icon is clicked

chrome.action.onClicked.addListener((tab) => {
  if(!tab || !tab.id) return;
  chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: () => {
      try{
        const attachOnceToPre = (p)=>{
          if(p.__kqlCopyAttached) return false;
          p.__kqlCopyAttached = true;
          const btn = document.createElement('button');
          btn.textContent = 'Copy KQL';
          btn.style.position = 'absolute';
          btn.style.zIndex = 2147483647;
          btn.style.background = '#0078d4';
          btn.style.color = 'white';
          btn.style.border = 'none';
          btn.style.borderRadius = '4px';
          btn.style.padding = '6px 8px';
          btn.style.fontSize = '12px';
          btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
          btn.style.cursor = 'pointer';

          function position(){
            const r = p.getBoundingClientRect();
            btn.style.top = (window.scrollY + r.top + 6) + 'px';
            btn.style.left = (window.scrollX + r.left + r.width - 110) + 'px';
          }
          position();
          window.addEventListener('scroll', position, true);
          window.addEventListener('resize', position);

          btn.addEventListener('click', async ()=>{
            const text = (p.innerText || '').trim();
            try{
              if(navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
              else { const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
              btn.textContent = 'Copied ✓';
              setTimeout(()=>btn.textContent='Copy KQL',1500);
            }catch(e){
              console.error('Copy failed', e);
            }
          });

          document.body.appendChild(btn);
          // brief highlight
          btn.animate([{opacity:0},{opacity:1}], {duration:220});
          return true;
        };

        const pres = Array.from(document.querySelectorAll('pre'));
        let attached = 0;
        for(const p of pres){
          try{
            const txt = (p.innerText||'').trim();
            if(!txt || txt.length < 20) continue;
            if(/\|/.test(txt) || /\bwhere\b|\bsummarize\b|\bjoin\b|\bsigninlogs\b|\bDeviceRegistryEvents\b/i.test(txt)){
              if(attachOnceToPre(p)) attached++;
            }
          }catch(e){}
        }
        // return result to caller
        return {attachedCount: attached, frameUrl: location.href};
      }catch(err){ return {error: String(err), frameUrl: location.href}; }
    }
  }, (results)=>{
    // results contains per-frame return values
    console.log('Sentinel KQL helper injected, results:', results);
  });
});

// Auto-inject after navigation/complete with debounce per tab
const lastInjected = new Map();
function shouldInject(tabId){
  const t = lastInjected.get(tabId) || 0;
  if(Date.now() - t < 5000) return false;
  lastInjected.set(tabId, Date.now());
  return true;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if(changeInfo.status === 'complete' && tab && tab.url && /portal.azure.com/.test(tab.url)){
    if(!shouldInject(tabId)) return;
    // Multiple injection attempts across a short time window to catch late-rendered frames
    const attempts = [0, 700, 1600, 3500, 7000];
    for(const delayMs of attempts){
      setTimeout(()=>{
        chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => {
      try{
        const attachOnceToPre = (p)=>{
          if(p.__kqlCopyAttached) return false;
          p.__kqlCopyAttached = true;
          const btn = document.createElement('button');
          btn.textContent = 'Copy KQL';
          btn.style.position = 'absolute';
          btn.style.zIndex = 2147483647;
          btn.style.background = '#0078d4';
          btn.style.color = 'white';
          btn.style.border = 'none';
          btn.style.borderRadius = '4px';
          btn.style.padding = '6px 8px';
          btn.style.fontSize = '12px';
          btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
          btn.style.cursor = 'pointer';

          function position(){
            const r = p.getBoundingClientRect();
            btn.style.top = (window.scrollY + r.top + 6) + 'px';
            btn.style.left = (window.scrollX + r.left + r.width - 110) + 'px';
          }
          position();
          window.addEventListener('scroll', position, true);
          window.addEventListener('resize', position);

          btn.addEventListener('click', async ()=>{
            const text = (p.innerText || '').trim();
            try{
              if(navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
              else { const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
              btn.textContent = 'Copied ✓';
              setTimeout(()=>btn.textContent='Copy KQL',1500);
            }catch(e){ console.error('Copy failed', e); }
          });

          document.body.appendChild(btn);
          btn.animate([{opacity:0},{opacity:1}], {duration:220});
          return true;
        };

        const pres = Array.from(document.querySelectorAll('pre'));
        let attached = 0;
        for(const p of pres){
          try{
            const txt = (p.innerText||'').trim();
            if(!txt || txt.length < 20) continue;
            if(/\|/.test(txt) || /\bwhere\b|\bsummarize\b|\bjoin\b|\bsigninlogs\b|\bDeviceRegistryEvents\b/i.test(txt)){
              if(attachOnceToPre(p)) attached++;
            }
          }catch(e){}
        }
        return {attachedCount: attached, frameUrl: location.href};
      }catch(err){ return {error: String(err), frameUrl: location.href}; }
        }});
      }, delayMs);
    }
  }
});
