// Sentinel KQL Copy Helper - content-script.js
// Runs on portal.azure.com and attaches a hoverable "Copy KQL" button

(function(){
  'use strict';

  // Debug marker: helps verify the content script actually loaded in this frame
  try{
    console.log('[Sentinel KQL Copy Helper] content script loaded in frame:', location.href);
    window.__sentinelKqlCopyHelper = true;
  }catch(e){ /* ignore */ }

  const BTN_ID = 'sentinel-kql-copy-btn';
  const ENH_ATTR = 'data-sentinel-enhanced';
  const DEBUG = true;
  // verbose debug toggles more detailed per-scan selector logs; keep false to reduce noise
  const VERBOSE_DEBUG = false;

  // whether we've attached at least one button already in this frame
  let foundAny = false;
  // count how many scans we've attempted in this frame (for diagnostics)
  let scanAttempts = 0;
  // last time a scan was scheduled (ms)
  let lastScanAt = 0;
  // suppression window: when a control is attached, suppress polling until this timestamp
  let attachSuppressedUntil = 0;

  // Insert styles for the floating button
  function injectStyles(){
    const css = `
      .sentinel-kql-copy-btn {
        position: absolute;
        z-index: 2147483647;
        background: #0078d4;
        color: white;
        border-radius: 4px;
        padding: 6px 8px;
        font-size: 12px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        cursor: pointer;
        user-select: none;
        opacity: 0.95;
        transition: transform 0.08s ease;
      }
      .sentinel-kql-copy-btn:active { transform: scale(0.98); }
    `;
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  function isVisible(el){
    if(!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 20 && rect.height > 10 && rect.bottom >= 0 && rect.top <= (window.innerHeight || document.documentElement.clientHeight);
  }

  function getMonacoText(editorEl){
    const viewLines = editorEl.querySelector('.view-lines');
    if(viewLines) return viewLines.innerText;
    // fallback: any code/pre inside
    const code = editorEl.querySelector('code, pre');
    if(code) return code.innerText;
    return editorEl.innerText || '';
  }

  function addButtonFor(el){
    if(!el) return;
    if(el.getAttribute && el.getAttribute('__sentinel_kql_button')){
      // If a previous run marked this element but the control no longer
      // exists (orphaned), remove the stale marker so we can recreate it.
      try{
        const existingOwner = el.getAttribute('data-sentinel-owner-id');
        if(existingOwner){
          const controlExists = !!document.querySelector(`[data-sentinel-control-owner="${existingOwner}"]`);
          if(controlExists){
            if(DEBUG) console.log('[Sentinel KQL] already enhanced element (control exists)', el);
            return;
          } else {
            if(DEBUG) console.log('[Sentinel KQL] stale enhancement marker found, removing and recreating', el, 'ownerId=', existingOwner);
            try{ el.removeAttribute('__sentinel_kql_button'); }catch(e){}
            try{ el.removeAttribute && el.removeAttribute('data-sentinel-owner-id'); }catch(e){}
            // continue to recreate control
          }
        } else {
          if(DEBUG) console.log('[Sentinel KQL] enhancement marker present without owner id, removing', el);
          try{ el.removeAttribute('__sentinel_kql_button'); }catch(e){}
        }
      }catch(e){ if(DEBUG) console.debug('[Sentinel KQL] error checking existing enhancement marker', e); }
    }
    // Avoid creating duplicate controls near the same area. If an existing
    // sentinel control button is already within ~56px of this element, skip adding.
    function hasNearbyControl(targetEl){
      try{
        const r = targetEl.getBoundingClientRect();
        const cx = r.left + r.width/2;
        const cy = r.top + r.height/2;
        const existing = Array.from(document.querySelectorAll('.sentinel-kql-copy-btn'));
        for(const ex of existing){
          try{
            const er = ex.getBoundingClientRect();
            // ignore hidden or zero-sized buttons (likely orphans)
            if(er.width < 6 || er.height < 6) continue;
            const excx = er.left + er.width/2;
            const excy = er.top + er.height/2;
            const dx = excx - cx;
            const dy = excy - cy;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if(dist < 56) return true;
          }catch(e){/* ignore rect errors */}
        }
      }catch(e){/* ignore */}
      return false;
    }

    if(hasNearbyControl(el)){
      if(DEBUG) console.debug('[Sentinel KQL] skipping addButtonFor because nearby control exists');
      // DO NOT mark as enhanced here — leave it unmarked so hover attach can still
      // attempt to attach later if the nearby control disappears.
      return;
    }
    // assign a stable owner id for this element so we can mark controls and avoid duplicates
    let ownerId = el.getAttribute && el.getAttribute('data-sentinel-owner-id');
    if(!ownerId){
      ownerId = 'sentinel-' + Math.random().toString(36).slice(2,9);
      el.setAttribute && el.setAttribute('data-sentinel-owner-id', ownerId);
    }
    el.setAttribute && el.setAttribute('__sentinel_kql_button','1');
    if(DEBUG) console.log('[Sentinel KQL] attaching button to', el.tagName, el.className, el, 'ownerId=', ownerId);

    // If an ancestor/descendant owner already has a control, skip creating another
    try{
      const otherOwners = Array.from(document.querySelectorAll('[data-sentinel-owner-id]')).map(n=>n).filter(n=>n !== el);
      for(const other of otherOwners){
        try{
          const oid = other.getAttribute('data-sentinel-owner-id');
          if(!oid) continue;
          const hasControl = !!document.querySelector(`[data-sentinel-control-owner="${oid}"]`);
          if(!hasControl) continue;
          if(other.contains(el) || el.contains(other)){
            if(DEBUG) console.debug('[Sentinel KQL] found nearby owner with control, skipping', oid, other, el);
            return;
          }
        }catch(e){/*ignore*/}
      }
    }catch(e){/*ignore*/}
    const btn = document.createElement('div');
    btn.className = 'sentinel-kql-copy-btn';
    btn.textContent = 'Copy KQL';
    btn.style.display = 'none';
    // mark this control with the owner id so we can detect/avoid duplicates
    try{ btn.setAttribute && btn.setAttribute('data-sentinel-control-owner', ownerId); }catch(e){}

    // We'll insert the button inside the target container so it sits in the
    // top-right of the KQL box (avoids overlapping the page sidebar).
    const attachParent = el.closest('.uc-kql-viewer, .monaco-editor') || el.parentElement || document.body;
    // if parent is statically positioned, set relative so absolute children position correctly
    let restoredParentPosition = null;
    try{
      const cs = getComputedStyle(attachParent);
      if(cs && cs.position === 'static'){
        restoredParentPosition = attachParent.style.position || '';
        attachParent.style.position = 'relative';
        attachParent.setAttribute && attachParent.setAttribute('data-sentinel-original-position', restoredParentPosition);
      }
    }catch(e){/*ignore*/}

    // attach the button into the container
    try{ btn.style.position = 'absolute'; btn.style.top = '6px'; btn.style.right = '8px'; btn.style.left = 'auto'; attachParent.appendChild(btn); }catch(e){ document.body.appendChild(btn); }

    let shown = false;
    let hoverTimeout = null;
    let hideTimeout = null;

    // When attached inside the container we don't need to continuously reposition
    // the button — it's positioned via CSS relative to the container. Just show/hide.
    function positionBtn(){ /* no-op: container-anchored */ }
    function startFollow(){ /* no-op */ }
    function stopFollow(){ /* no-op */ }

    function showAll(){
      try{
        // If the user is directly hovering the element or the attachParent we
        // should show the button even if visibility heuristics consider it small/hidden.
        const hovered = (el && el.matches && el.matches(':hover')) ||
                        (attachParent && attachParent.matches && attachParent.matches(':hover')) ||
                        (btn && btn.matches && btn.matches(':hover'));
        if(!hovered && !isVisible(el)) return;
        try{ btn.style.display = 'block'; }catch(e){}
        shown = true;
      }catch(e){ if(DEBUG) console.debug('[Sentinel KQL] showAll error', e); }
    }
    function hideAll(){ try{ btn.style.display = 'none'; }catch(e){} shown = false; }

    // Use mouseover/mouseout on the container so hovering over child token spans
    // still triggers the show/hide behavior (mouseenter/mouseleave don't bubble).
    // listen on both the element and the attachParent so hovering child
    // tokens or the container both trigger show/hide reliably
    function onMouseOverTarget(){
      clearTimeout(hideTimeout);
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(showAll, 100);
    }
    function onMouseOutTarget(){
      clearTimeout(hoverTimeout);
      hideTimeout = setTimeout(()=>{ if(!btn.matches(':hover')) hideAll(); }, 120);
    }
    el.addEventListener('mouseover', onMouseOverTarget);
    el.addEventListener('mouseout', onMouseOutTarget);
    try{ if(attachParent && attachParent !== el){ attachParent.addEventListener('mouseover', onMouseOverTarget); attachParent.addEventListener('mouseout', onMouseOutTarget); } }catch(e){}

    btn.addEventListener('mouseenter', ()=>{ clearTimeout(hideTimeout); });
    btn.addEventListener('mouseleave', ()=>{ hideTimeout = setTimeout(()=>{ if(!el.matches(':hover')) hideAll(); }, 120); });

    // Ensure the button starts hidden (some frames can flip styles early)
    try{ btn.style.display = 'none'; }catch(e){}

    btn.addEventListener('click', async (ev)=>{
      ev.stopPropagation();
      btn.textContent = 'Copying…';
      try{
        let text = '';
        // Monaco editor common container
        if(el.classList && el.classList.contains('monaco-editor')){
          text = getMonacoText(el);
        } else {
          // try to locate nested monaco inside
          const mon = el.querySelector && el.querySelector('.monaco-editor');
          if(mon) text = getMonacoText(mon);
          else if(el.value) text = el.value;
          else text = el.innerText || '';
        }
        text = (text || '').trim();
        if(!text){ btn.textContent = 'No KQL found'; setTimeout(()=>btn.textContent='Copy KQL',1200); return; }

        // Try navigator.clipboard first (click is user gesture)
        if(navigator.clipboard && navigator.clipboard.writeText){
          await navigator.clipboard.writeText(text);
        } else {
          // fallback execCommand
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        btn.textContent = 'Copied ✓';
        setTimeout(()=>btn.textContent='Copy KQL',1500);
      }catch(err){
        console.error('Copy failed', err);
        btn.textContent = 'Copy failed';
        setTimeout(()=>btn.textContent='Copy KQL',1500);
      }
    });

    foundAny = true;
    if(DEBUG) console.debug('[Sentinel KQL] button created for owner=', ownerId, 'attachParent=', attachParent && attachParent.tagName);
    // No icon: removed per user preference to keep UI minimal.

    // no scroll/resize reposition required when button is inside the container

    // make sure button removed if element disappears
    const ro = new MutationObserver(()=>{
      if(!document.contains(el)){
        try{ btn.remove(); }catch(e){}
        // restore parent position if we mutated it
        try{
          if(attachParent && attachParent.getAttribute && attachParent.getAttribute('data-sentinel-original-position') !== null){
            attachParent.style.position = attachParent.getAttribute('data-sentinel-original-position') || '';
            attachParent.removeAttribute('data-sentinel-original-position');
          }
        }catch(e){}
        ro.disconnect();
      }
    });
    ro.observe(document.body, {childList:true, subtree:true});
  }

  // Note: expose `__sentinelKqlScan` after scanAndAttach is defined (done below)

  function scanAndAttach(){
    if(DEBUG && VERBOSE_DEBUG) console.debug('[Sentinel KQL] scanAndAttach running, foundAny=', foundAny);
    // track attempts so we can surface a louder warning if nothing is ever found
    scanAttempts = (typeof scanAttempts === 'number') ? scanAttempts + 1 : 1;
    // Note: we do not bail early if we've attached before; keep scanning so
    // we can clean up orphaned buttons when the portal's SPA navigates quickly.

    // First, try the exact selector provided by the user for the KQL pre element.
    const EXACT_SELECTOR = '#root > div > div > main > div.sc-kdBSHD.jLOLSm.uc-collapsible-container.uc-collapsible-primary-left.W6fkE > div.sc-tagGq.hiXBlU.uc-collapsible-section-container > div.collapsibleContentAutoCollapse > div > div.vCdKM > div > div > div.itemContainer-196 > div > div:nth-child(4) > div > div > pre';
    try{
      const exactEl = document.querySelector(EXACT_SELECTOR);
      if(DEBUG) console.debug('[Sentinel KQL] exact selector found', !!exactEl);
      if(exactEl && isVisible(exactEl)){
        addButtonFor(exactEl);
        // also attach to its closest editor/container if different
        const parentContainer = exactEl.closest('.monaco-editor, pre, code, textarea, [role=region], [role=textbox]');
        if(parentContainer && parentContainer !== exactEl) addButtonFor(parentContainer);
        return;
      }
    }catch(e){
      console.debug('Exact selector check failed', e);
    }

    // Also target the common Sentinel KQL viewer element and its inner <pre>
    try{
      // search normal DOM and shadow DOM for .uc-kql-viewer
      const kqlViewerEls = findAll('.uc-kql-viewer');
      if(DEBUG) console.debug('[Sentinel KQL] uc-kql-viewer count', kqlViewerEls.length);
      for(const kv of kqlViewerEls){
        if(!kv) continue;
        const pre = kv.querySelector('pre');
        const target = pre || kv;
        if(target && isVisible(target)){
          addButtonFor(target);
          return;
        }
      }
    }catch(e){
      console.debug('KQL viewer detection failed', e);
    }

    // common heuristic selectors for the Sentinel analytic rule query box (Monaco editor, textareas, code blocks)
    const selectors = ['.monaco-editor', 'textarea', 'pre.kusto', 'pre', 'code', '[role=region] [role=textbox]'];
    const seen = new Set();
    selectors.forEach(sel=>{
      const els = findAll(sel);
      if(DEBUG) console.debug('[Sentinel KQL] selector', sel, 'found', els.length);
      els.forEach(el=>{
        if(!el) return;
        // skip tiny or invisible elements
        if(!isVisible(el)) return;
        if(seen.has(el)) return;
        seen.add(el);
        // Heuristic: if element contains Kusto keywords or 'KQL' label nearby, prefer attaching
        const textSample = (el.innerText || el.value || '').slice(0,200);
        const likely = /where\s+|project\s+|union\s+|let\s+|KQL|Kusto/i.test(textSample) || el.classList.contains('monaco-editor');
        if(likely){ addButtonFor(el); return; }
      });
    });

    // Additional detection: the Sentinel UI often renders KQL with many small <span> tokens
    // (e.g. classes like 'keyword', 'schema-table', 'function', 'schema-column', 'class-name', 'string', 'comment').
    // Use those spans to find the nearest code container and attach the button there.
    try{
      const highlightSelector = '.keyword, .schema-table, .function, .schema-column, .class-name, .string, .comment';
      const spanEls = findAll(highlightSelector);
      if(DEBUG) console.debug('[Sentinel KQL] highlight spans found', spanEls.length);
      for(const span of spanEls){
        if(!span) continue;
        const container = span.closest('.monaco-editor, pre, code, textarea, [role=region], [role=textbox]') || span.parentElement;
        if(!container) continue;
        if(seen.has(container)) continue;
        if(!isVisible(container)) continue;
        seen.add(container);
        addButtonFor(container);
        return;
      }
    }catch(e){
      // ignore any selector errors
      console.debug('Highlight-span detection failed', e);
    }

    // Content-based fallback: scan all <pre> blocks and match by KQL-like content or known table names
    try{
      const pres = findAll('pre');
      if(DEBUG) console.debug('[Sentinel KQL] scanning all <pre> blocks, count=', pres.length);
      for(const p of pres){
        try{
          const txt = (p.innerText || '').trim();
          if(!txt || txt.length < 20) continue;
          // heuristics: contains pipe, Kusto keywords, or common table names
          if(/\|/.test(txt) || /\bwhere\b|\bsummarize\b|\bjoin\b|\bsigninlogs\b|\bDeviceRegistryEvents\b/i.test(txt)){
            if(DEBUG) console.debug('[Sentinel KQL] content-pre match', txt.slice(0,120));
            addButtonFor(p);
            return;
          }
        }catch(e){ /* continue on inner errors */ }
      }
    }catch(e){ console.debug('pre-content detection failed', e); }

    // if nothing found, we'll rely on MutationObserver to re-run scan
    if(DEBUG && VERBOSE_DEBUG) console.debug('[Sentinel KQL] scanAndAttach found nothing; will retry on DOM changes');
    // If we've scanned several times without finding anything, suppress further scans
    const MAX_FAILURES = 12; // per-frame failure cap before temporary suppression
    if(scanAttempts >= MAX_FAILURES && !foundAny){
      // suppress further scans in this frame for 30s (until DOM changes or user gesture)
      const now = Date.now();
      if(now >= attachSuppressedUntil){
        attachSuppressedUntil = now + 30000;
        console.warn('[Sentinel KQL] No KQL candidates found after', scanAttempts, 'attempts in this frame — temporarily suppressing scans for 30s. Interact with the frame or reload to retry.');
        try{ dumpCandidateDiagnostics(); }catch(e){ if(DEBUG) console.warn('[Sentinel KQL] dumpCandidateDiagnostics failed', e); }
      }
      return;
    }
  }

  // Diagnostic helper: collect candidate elements and sample text for debugging
  function dumpCandidateDiagnostics(){
    const info = {};
    try{
      // exact selector
      const EXACT_SELECTOR = '#root > div > div > main > div.sc-kdBSHD.jLOLSm.uc-collapsible-container.uc-collapsible-primary-left.W6fkE > div.sc-tagGq.hiXBlU.uc-collapsible-section-container > div.collapsibleContentAutoCollapse > div > div.vCdKM > div > div > div.itemContainer-196 > div > div:nth-child(4) > div > div > pre';
      const exactEl = document.querySelector(EXACT_SELECTOR);
      info.exact = exactEl ? {found:true, outerHTML: (exactEl.outerHTML||'').slice(0,800)} : {found:false};

      // uc-kql-viewer
      const kqlViewerEls = findAll('.uc-kql-viewer');
      info.ucKqlViewerCount = kqlViewerEls.length;
      info.ucKqlViewerSamples = kqlViewerEls.slice(0,5).map(e=>({tag:e.tagName, sample: (e.innerText||'').slice(0,300)}));

      // common selectors
      const selectors = ['.monaco-editor', 'textarea', 'pre.kusto', 'pre', 'code', '[role=region] [role=textbox]'];
      info.selectors = {};
      for(const sel of selectors){
        try{
          const els = findAll(sel);
          info.selectors[sel] = {count: els.length, samples: els.slice(0,5).map(e=>({tag:e.tagName, text:(e.innerText||'').slice(0,300)}))};
        }catch(e){ info.selectors[sel] = {error: String(e)}; }
      }

      // highlight spans
      const highlightSelector = '.keyword, .schema-table, .function, .schema-column, .class-name, .string, .comment';
      const spanEls = findAll(highlightSelector);
      info.highlightSpanCount = spanEls.length;
      info.highlightSpanSamples = spanEls.slice(0,10).map(s=>({tag:s.tagName, text:(s.innerText||'').slice(0,120)}));

      // pre blocks
      const pres = findAll('pre');
      info.preCount = pres.length;
      info.preSamples = pres.slice(0,6).map(p=>({text:(p.innerText||'').slice(0,500)}));

    }catch(e){ console.warn('[Sentinel KQL] dumpCandidateDiagnostics error', e); }
    // Log structured info
    console.groupCollapsed('[Sentinel KQL] Candidate diagnostics');
    console.log(info);
    console.groupEnd();
    return info;
  }

  // Expose a console helper for interactive dumps
  try{ window.__sentinelKqlDumpCandidates = dumpCandidateDiagnostics; }catch(e){/*ignore*/}

    // expose a manual scan function for debugging (callable from the frame console)
    try{ window.__sentinelKqlScan = scanAndAttach; }catch(e){/*ignore*/}

  // throttled scanner
  let scanTimer = null;
  function scheduleScan(delay=400){
    const now = Date.now();
    // if we're in a suppression window (recent attach), skip scheduling
    if(now < attachSuppressedUntil){ if(DEBUG) console.debug('[Sentinel KQL] scan suppressed until', new Date(attachSuppressedUntil)); return; }
    // simple rate-limit: don't schedule scans more often than 250ms
    if(now - lastScanAt < 250){ if(DEBUG) console.debug('[Sentinel KQL] scheduleScan rate-limited'); return; }
    lastScanAt = now;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanAndAttach, delay);
  }

  // Find elements in document and shadow roots
  function findAll(selector){
    const results = Array.from(document.querySelectorAll(selector));
    // walk shadow roots
    function walk(node){
      if(!node || !node.childNodes) return;
      node.childNodes.forEach(child=>{
        if(child.shadowRoot){
          try{
            const fromShadow = Array.from(child.shadowRoot.querySelectorAll(selector));
            fromShadow.forEach(n=>results.push(n));
          }catch(e){ /* ignore */ }
          walk(child.shadowRoot);
        }
        walk(child);
      });
    }
    try{ walk(document); }catch(e){ /* ignore */ }
    return results;
  }

  function start(){
    injectStyles();
    scheduleScan(600);
    // Watch for dynamic UI changes in the portal (single-page app)
    const mo = new MutationObserver((mutations)=>{
      // If we're suppressed due to repeated failures, wake up on meaningful DOM changes
      try{
        if(attachSuppressedUntil && Date.now() < attachSuppressedUntil){
          // look for added/removed nodes as a sign of the UI changing
          let significant = false;
          for(const m of mutations){ if((m.addedNodes && m.addedNodes.length) || (m.removedNodes && m.removedNodes.length)){ significant = true; break; } }
          if(significant){
            attachSuppressedUntil = 0;
            if(DEBUG) console.debug('[Sentinel KQL] DOM change detected during suppression — re-enabling scans');
            scheduleScan(200);
            return;
          }
          return; // remain suppressed
        }
      }catch(e){/*ignore*/}
      if(DEBUG && VERBOSE_DEBUG) console.debug('[Sentinel KQL] MutationObserver triggered');
      scheduleScan(300);
    });
    mo.observe(document.body, {childList:true, subtree:true, attributes:false});

    // Additionally poll for a longer window because some parts render after many micro-tasks
    const POLL_DURATION = 25000; // ms (extended to handle slow iframe/rendering)
    const POLL_INTERVAL = 300; // ms
    const startTs = Date.now();
    const poll = setInterval(()=>{
      try{ scheduleScan(0); }catch(e){ if(DEBUG) console.debug('poll error', e); }
      if((Date.now() - startTs) > POLL_DURATION) clearInterval(poll);
    }, POLL_INTERVAL);

    // Cleanup orphaned/static buttons: if a button's owner element no longer
    // exists in the DOM, or the button is zero-sized, remove it. Run for a
    // short window after start to handle fast nav races.
    function cleanupOrphans(){
      try{
        const buttons = Array.from(document.querySelectorAll('.sentinel-kql-copy-btn'));
        buttons.forEach(btn=>{
          try{
            const ownerId = btn.getAttribute && btn.getAttribute('data-sentinel-control-owner');
            let remove = false;
            if(!ownerId) remove = true;
            else {
              const owner = document.querySelector(`[data-sentinel-owner-id="${ownerId}"]`);
              if(!owner || !document.contains(owner)) remove = true;
              else {
                const or = owner.getBoundingClientRect();
                // if owner has disappeared or is tiny, remove button
                if(or.width === 0 && or.height === 0) remove = true;
              }
            }
            const br = btn.getBoundingClientRect();
            if(br.width === 0 && br.height === 0) remove = true;
            if(remove){ btn.remove(); }
            if(remove){
              // also attempt to clear stale owner attributes if present
              try{
                if(ownerId){
                  const ownerEl = document.querySelector(`[data-sentinel-owner-id="${ownerId}"]`);
                  if(ownerEl){
                    try{ ownerEl.removeAttribute('__sentinel_kql_button'); }catch(e){}
                    try{ ownerEl.removeAttribute('data-sentinel-owner-id'); }catch(e){}
                  }
                }
              }catch(e){/*ignore*/}
            }
          }catch(e){}
        });
      }catch(e){}
    }
    const cleanupInterval = setInterval(()=>{ cleanupOrphans(); }, 400);
    setTimeout(()=>{ clearInterval(cleanupInterval); cleanupOrphans(); }, POLL_DURATION + 400);

    // Delegated hover detection: if the user hovers over a KQL block (pre/monaco/etc), attach immediately.
    // This is a fallback that is robust to late rendering and shadow DOM because it triggers on user interaction.
    const hoverMap = new Map();
    document.addEventListener('mouseover', (ev)=>{
      try{
        const t = ev.target;
        if(!t) return;
        const candidate = t.closest && (t.closest('pre') || t.closest('.uc-kql-viewer') || t.closest('.monaco-editor') || t.closest('code'));
        if(!candidate) return;
        if(candidate.getAttribute && candidate.getAttribute('__sentinel_kql_button')) return;
        // debounce per element
        if(hoverMap.has(candidate)) return;
        const timer = setTimeout(()=>{
          try{ if(DEBUG) console.debug('[Sentinel KQL] hover attach attempt for', candidate.tagName); addButtonFor(candidate); }catch(e){ if(DEBUG) console.debug('hover attach failed', e); }
          hoverMap.delete(candidate);
        }, 180);
        hoverMap.set(candidate, timer);
      }catch(e){}
    }, true);

    // Also trigger a scan on user pointerdown actions (click/press) anywhere in the frame.
    // This helps in cases where automatic scans miss content due to timing or shadow DOM quirks.
    document.addEventListener('pointerdown', (ev)=>{
      try{ if(DEBUG) console.debug('[Sentinel KQL] pointerdown detected, scheduling immediate scan'); scheduleScan(120); }catch(e){}
    }, true);

    // Use pointer-based detection to show/hide buttons. Relying on :hover
    // can fail when the KQL is rendered as many token spans or inside shadow DOM.
    let mouseMoveTimer = null;
    let lastMouse = {x:0,y:0};
    document.addEventListener('mousemove', (ev)=>{
      lastMouse.x = ev.clientX; lastMouse.y = ev.clientY;
      clearTimeout(mouseMoveTimer);
      mouseMoveTimer = setTimeout(()=>{
        try{
          const buttons = Array.from(document.querySelectorAll('.sentinel-kql-copy-btn'));
          buttons.forEach(btn=>{
            try{
              // keep visible if user is directly over the button
              if(btn.matches(':hover')) return;
              const ownerId = btn.getAttribute && btn.getAttribute('data-sentinel-control-owner');
              let ownerEl = null;
              if(ownerId) ownerEl = document.querySelector(`[data-sentinel-owner-id="${ownerId}"]`);
              let show = false;
              if(ownerEl){
                const or = ownerEl.getBoundingClientRect();
                if(lastMouse.x >= or.left && lastMouse.x <= or.right && lastMouse.y >= or.top && lastMouse.y <= or.bottom) show = true;
              }
              // Fallback: if button is inside a parent container that is hovered (use :hover), allow show
              if(!show){
                const parent = btn.parentElement;
                if(parent && parent.matches && parent.matches(':hover')) show = true;
              }
              // apply visibility
              if(show){ try{ btn.style.display = 'block'; }catch(e){} } else { try{ btn.style.display = 'none'; }catch(e){} }
            }catch(e){}
          });
        }catch(e){}
      }, 50);
    }, true);
  }

  // start when DOM ready
  if(document.readyState === 'complete' || document.readyState === 'interactive') start();
  else document.addEventListener('DOMContentLoaded', start);

})();
