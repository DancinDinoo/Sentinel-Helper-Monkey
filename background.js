// Background service worker: injects a one-shot scanner into all frames when the extension icon is clicked

chrome.action.onClicked.addListener((tab) => {
  if(!tab || !tab.id) return;
  // First, cleanup any legacy/static buttons that older builds may have injected
  const cleanupFunc = () => {
    try{
      // remove known class-based controls
      document.querySelectorAll('.sentinel-kql-copy-btn').forEach(n=>n.remove());
      // remove any buttons with the legacy label
      Array.from(document.querySelectorAll('button')).forEach(b=>{ try{ if(b.textContent && b.textContent.includes('Copy KQL')) b.remove(); }catch(e){} });
      // remove legacy attached flags on <pre> elements
      document.querySelectorAll('pre').forEach(p=>{ try{ if(p.__kqlCopyAttached) delete p.__kqlCopyAttached; }catch(e){} });
      // also clear any leftover data attributes used by prior runs
      document.querySelectorAll('[data-sentinel-owner-id]').forEach(n=>{ try{ n.removeAttribute && n.removeAttribute('data-sentinel-owner-id'); n.removeAttribute && n.removeAttribute('__sentinel_kql_button'); }catch(e){} });
    }catch(e){}
  };

  chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: cleanupFunc }, ()=>{
    // Inject the content script file into all frames (if not already present), then call the exposed scan helper
    chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content-script.js'] }, ()=>{
      chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => {
        try{ if(window.__sentinelKqlScan){ window.__sentinelKqlScan(); return {scanned:true, frameUrl: location.href}; } return {scanned:false, frameUrl: location.href}; }
        catch(err){ return {error: String(err), frameUrl: location.href}; }
      } }, (results)=>{ console.log('Sentinel KQL helper injected/scan results:', results); });
    });
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
    if(changeInfo.status === 'complete' && tab && tab.url && (/portal.azure.com/.test(tab.url) || /security.microsoft.com/.test(tab.url))){
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
