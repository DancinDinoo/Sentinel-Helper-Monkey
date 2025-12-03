// Background service worker: opens the helper panel when the extension icon is clicked

function isSupportedTabUrl(url){
  if(!url) return false;
  return /portal\.azure\.com/.test(url) ||
         /\.reactblade\.portal\.azure\.net/.test(url) ||
         /security\.microsoft\.com/.test(url) ||
         /mto\.security\.microsoft\.com/.test(url);
}

chrome.action.onClicked.addListener((tab) => {
  if(!tab || !tab.id) return;
  const dispatchToggleEvent = () => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => { try{ window.dispatchEvent(new CustomEvent('sentinel:toggle-panel-local')); }catch(e){} }
    });
  };
  const forceShowPanelAllFrames = () => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => { try{ window.__sentinelShowPanel && window.__sentinelShowPanel(); }catch(e){} }
    });
  };
  // Primary path: broadcast a toggle event to all frames so whichever frame owns the Incidents surface can show the panel.
  dispatchToggleEvent();
  // Also ask each frame to force-show the panel in case toggling is swallowed by a hidden top frame.
  forceShowPanelAllFrames();
  // Fallback: if the content script wasn't loaded, inject it and retry.
  chrome.tabs.sendMessage(tab.id, { type: 'sentinel:toggle-panel' }, (resp)=>{
    if(chrome.runtime.lastError && isSupportedTabUrl(tab.url)){
      chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content-script.js'] }, ()=>{
        dispatchToggleEvent();
        forceShowPanelAllFrames();
      });
    }
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
    if(changeInfo.status === 'complete' && tab && tab.url && isSupportedTabUrl(tab.url)){
    if(!shouldInject(tabId)) return;
    // Multiple injection attempts across a short time window to catch late-rendered frames
    const attempts = [0, 700, 1600, 3500, 7000];
    for(const delayMs of attempts){
      setTimeout(()=>{
        // Clean up legacy/static buttons first
        const cleanupFunc = () => {
          try{
            document.querySelectorAll('.sentinel-kql-copy-btn').forEach(n=>n.remove());
            Array.from(document.querySelectorAll('button')).forEach(b=>{ try{ if(b.textContent && b.textContent.includes('Copy KQL')) b.remove(); }catch(e){} });
            document.querySelectorAll('pre').forEach(p=>{ try{ if(p.__kqlCopyAttached) delete p.__kqlCopyAttached; }catch(e){} });
            document.querySelectorAll('[data-sentinel-owner-id]').forEach(n=>{ try{ n.removeAttribute && n.removeAttribute('data-sentinel-owner-id'); n.removeAttribute && n.removeAttribute('__sentinel_kql_button'); }catch(e){} });
          }catch(e){}
        };
        chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: cleanupFunc }, ()=>{
          // Inject content-script.js into all frames, then ask each frame to run its scan helper.
          chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content-script.js'] }, ()=>{
            chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => {
              try{ if(window.__sentinelKqlScan){ window.__sentinelKqlScan(); return {scanned:true, frameUrl: location.href}; } return {scanned:false, frameUrl: location.href}; }
              catch(err){ return {error: String(err), frameUrl: location.href}; }
            } }, (results)=>{ console.log('Sentinel KQL auto-inject scan results:', results); });
          });
        });
      }, delayMs);
    }
  }
});
