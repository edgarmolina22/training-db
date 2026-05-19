// data.js — extracted from the original monolithic js/app.js
// Sourced ranges:
//   lines 1–16  (SHARED STATE)
//   lines 193–452  (CSV PARSING + Garmin upload)
//   lines 3707–3823  (JSONBin cloud persistence)

// ════════════════════════════════════════
// SHARED STATE
// ════════════════════════════════════════
let garminRuns = [];      // uploaded running CSV
let garminCycles = [];    // uploaded cycling CSV
let analyticsRuns = [];   // active run data (builtin or uploaded)
let analyticsCycles = []; // active cycle data (builtin or uploaded)
let filteredRuns = [];    // current filter view (runs only)
let filteredCycles = []; // current filter view (cycles only)
let activeView = 'all';        // 'all' | 'running' | 'cycling'
let activeRunSub = 'all';      // 'all' | 'easy' | 'long' | 'tempo' | 'intervals' | 'hills' | 'race'
let activeCycleSub = 'all';    // 'all' | 'virtual' | 'road' | 'indoor'
let activeRangeFilter = 'all';
let tableSortKey = 'date', tableSortDir = 'desc';
let charts = {};


// ════════════════════════════════════════
// CSV PARSING — separate running.csv and cycling.csv
// (parseCSVRow + normalizeDate are defined below alongside the per-type parsers)
// ════════════════════════════════════════

// Detect file type from headers
function detectCSVType(headers) {
  const h = headers.map(x=>x.toLowerCase());
  if(h.includes('avg run cadence') || h.includes('avg pace'))  return 'running';
  if(h.includes('avg bike cadence') || h.includes('avg speed')) return 'cycling';
  return null;
}

// Shared helpers
function csvFlt(v, def=0){ try{ return parseFloat(String(v).replace(/,/g,'').trim())||def; } catch{ return def; } }
function csvInt(v, def=0){ return Math.round(csvFlt(v,def)); }
function csvPace(v){
  if(!v||String(v).trim()===''||String(v).trim()==='--') return null;
  const m = String(v).trim().match(/^(\d+):(\d{2})$/);
  return m ? parseInt(m[1])*60+parseInt(m[2]) : null;
}
function csvGCT(v){
  if(!v||String(v).trim()==='--') return null;
  const m = String(v).match(/([\d.]+)%\s*L/);
  return m ? parseFloat(m[1]) : null;
}
function csvAscent(v){
  const s = String(v||'').replace(/,/g,'').trim();
  return (s && s!=='--') ? s : '0';
}

function parseRunningCSV(text) {
  const lines = text.trim().split('\n');
  if(lines.length < 2) return [];
  const headers = parseCSVRow(lines[0]).map(h=>h.trim());
  const col = name => headers.findIndex(h=>h.toLowerCase()===name.toLowerCase());

  const iDate   = col('Date');
  const iTitle  = col('Title');
  const iDist   = col('Distance');
  const iTime   = col('Time');
  const iHR     = col('Avg HR');
  const iMaxHR  = col('Max HR');
  const iCad    = col('Avg Run Cadence');
  const iPace   = col('Avg Pace');
  const iAscent = col('Total Ascent');
  const iVO     = col('Avg Vertical Oscillation');
  const iGCT    = col('Avg Ground Contact Time');
  const iGCTBal = col('Avg GCT Balance');
  const iStride = col('Avg Stride Length');
  const iVR     = col('Avg Vertical Ratio');
  const iCals   = col('Calories');
  const iTE     = col('Aerobic TE');
  const iFav    = col('Favorite');
  const iAType  = col('Activity Type');

  const seen = new Set();
  const runs = [];

  for(let i=1; i<lines.length; i++){
    const row = parseCSVRow(lines[i]);
    if(!row.length) continue;
    const dateRaw = (row[iDate]||'').trim();
    if(!dateRaw) continue;
    const dateStr = normalizeDate(dateRaw);
    if(!dateStr) continue;

    const dist = csvFlt(row[iDist]);
    const time = (row[iTime]||'').trim();
    const fp = `${dateStr}|running|${Math.round(dist*20)}|${time}`;
    if(seen.has(fp)) continue;
    seen.add(fp);

    runs.push({
      Date: dateRaw,
      Title: (row[iTitle]||'').trim(),
      Distance: Math.round(dist*100)/100,
      Time: time,
      ActivityType: iAType>=0 ? (row[iAType]||'Running').trim() : 'Running',
      pace_sec:   csvPace(row[iPace]),
      hr:         csvInt(row[iHR]),
      max_hr:     csvInt(row[iMaxHR]),
      cadence:    csvInt(row[iCad]),
      left_pct:   csvGCT(row[iGCTBal]),
      vo:         csvFlt(row[iVO]),
      gct:        csvInt(row[iGCT]),
      stride_len: csvFlt(row[iStride]),
      vert_ratio: csvFlt(row[iVR]),
      ascent:     csvAscent(row[iAscent]),
      calories:   csvInt(row[iCals]),
      aerobic_te: csvFlt(row[iTE]),
      is_race:    (row[iFav]||'').trim().toLowerCase()==='true',
    });
  }
  return runs;
}

function parseCyclingCSV(text) {
  const lines = text.trim().split('\n');
  if(lines.length < 2) return [];
  const headers = parseCSVRow(lines[0]).map(h=>h.trim());
  const col = name => headers.findIndex(h=>h.toLowerCase()===name.toLowerCase());

  const iDate    = col('Date');
  const iTitle   = col('Title');
  const iAType   = col('Activity Type');
  const iDist    = col('Distance');
  const iTime    = col('Time');
  const iHR      = col('Avg HR');
  const iMaxHR   = col('Max HR');
  const iSpeed   = col('Avg Speed');
  const iMaxSpd  = col('Max Speed');
  const iCad     = col('Avg Bike Cadence');
  const iPwr     = col('Avg Power');
  const iMaxPwr  = col('Max Power');
  const iAscent  = col('Total Ascent');
  const iCals    = col('Calories');
  const iTE      = col('Aerobic TE');
  const iFav     = col('Favorite');

  const seen = new Set();
  const cycles = [];

  for(let i=1; i<lines.length; i++){
    const row = parseCSVRow(lines[i]);
    if(!row.length) continue;
    const dateRaw = (row[iDate]||'').trim();
    if(!dateRaw) continue;
    const dateStr = normalizeDate(dateRaw);
    if(!dateStr) continue;

    const atype = iAType>=0 ? (row[iAType]||'').trim() : 'Virtual Cycling';
    if(atype==='Indoor Cycling') continue; // skip indoor rides

    const dist = csvFlt(row[iDist]);
    const time = (row[iTime]||'').trim();
    const fp = `${dateStr}|${atype.toLowerCase()}|${Math.round(dist*20)}|${time}`;
    if(seen.has(fp)) continue;
    seen.add(fp);

    cycles.push({
      Date: dateRaw,
      Title: (row[iTitle]||'').trim(),
      Distance: Math.round(dist*100)/100,
      Time: time,
      ActivityType: atype,
      avg_speed:  csvFlt(row[iSpeed]),
      max_speed:  csvFlt(row[iMaxSpd]),
      hr:         csvInt(row[iHR]),
      max_hr:     csvInt(row[iMaxHR]),
      cadence:    csvInt(row[iCad]),
      avg_power:  csvInt(row[iPwr]),
      max_power:  csvInt(row[iMaxPwr]),
      ascent:     csvAscent(row[iAscent]),
      calories:   csvInt(row[iCals]),
      aerobic_te: csvFlt(row[iTE]),
      is_race:    (row[iFav]||'').trim().toLowerCase()==='true',
    });
  }
  return cycles;
}

// Legacy unified parser — kept for backwards compatibility
function parseGarminCSV(text) {
  const lines = text.trim().split('\n');
  if(lines.length < 2) return [];
  const headers = parseCSVRow(lines[0]).map(h=>h.trim());
  const type = detectCSVType(headers);
  if(type==='running')  return parseRunningCSV(text);
  if(type==='cycling')  return parseCyclingCSV(text);
  return [];
}


// Fingerprint an activity for deduplication: date + type + distance rounded to 0.05mi + duration
function activityFingerprint(a) {
  const date = (a.Date||a.date||'').slice(0,10);
  const type = (a.ActivityType||a.type||'').toLowerCase();
  const dist  = Math.round((a.Distance||a.distance||0)*20);
  const time  = (a.Time||a.time||'').trim();
  return `${date}|${type}|${dist}|${time}`;
}

function mergeActivities(existing, incoming) {
  const seen = new Set(existing.map(activityFingerprint));
  const newOnes = incoming.filter(a => !seen.has(activityFingerprint(a)));
  // Merge and sort by date ascending
  return [...existing, ...newOnes].sort((a,b) =>
    new Date(a.Date||a.date) - new Date(b.Date||b.date)
  );
}

function handleGarminUpload(file) {
  const status=document.getElementById('uploadStatus');
  const clearBtn=document.getElementById('clearBtn');
  if(!file.name.toLowerCase().endsWith('.csv')){
    status.textContent='Upload running.csv or cycling.csv from Garmin Connect';
    status.className='upload-status err'; return;
  }
  const reader=new FileReader();
  reader.onload=async e=>{
    const text = e.target.result;
    // Detect file type from first header row
    const firstLine = text.trim().split('\n')[0].toLowerCase();
    const isRunFile = firstLine.includes('avg run cadence') || firstLine.includes('avg pace');
    const isCycFile = firstLine.includes('avg bike cadence') || firstLine.includes('avg speed');

    if(!isRunFile && !isCycFile){
      status.textContent='File not recognized — export running.csv or cycling.csv separately from Garmin Connect';
      status.className='upload-status err'; return;
    }

    // Require write key before accepting any data
    const writeKey = getWriteKey();
    if(!writeKey){
      status.textContent='⚠ Write key required — upload cancelled';
      status.className='upload-status err';
      document.getElementById('garminFile').value=''; return;
    }

    let newCount=0, totalLabel='';

    if(isRunFile){
      const incoming = parseRunningCSV(text);
      if(!incoming.length){ status.textContent='No running activities found'; status.className='upload-status err'; return; }
      const merged = mergeActivities(analyticsRuns, incoming);
      newCount = merged.length - analyticsRuns.length;
      garminRuns=merged; analyticsRuns=merged; filteredRuns=[...merged];
      totalLabel = `${analyticsRuns.length} runs${newCount>0?' (+'+newCount+' new)':''}`;
    } else {
      const incoming = parseCyclingCSV(text);
      if(!incoming.length){ status.textContent='No cycling activities found'; status.className='upload-status err'; return; }
      const merged = mergeActivities(analyticsCycles, incoming);
      newCount = merged.length - analyticsCycles.length;
      garminCycles=merged; analyticsCycles=merged; filteredCycles=[...merged];
      totalLabel = `${analyticsCycles.length} rides${newCount>0?' (+'+newCount+' new)':''}`;
    }

    document.getElementById('dropText').textContent=file.name+' ✓';
    clearBtn.style.display='inline-block';
    document.getElementById('analyticsCount').textContent=analyticsRuns.length+' runs · '+analyticsCycles.length+' rides';
    renderPlan();
    renderAnalytics();
    status.textContent='Saving to cloud…';
    status.className='upload-status';
    await saveToCloud();
    status.textContent='✓ '+totalLabel+' · saved '+fmtSyncTime();
    status.className='upload-status ok';
  };
  reader.readAsText(file);
}

// clearGarmin() is defined below (alongside cloud sync). Earlier duplicate removed.

document.getElementById('garminFile').addEventListener('change',e=>{if(e.target.files[0])handleGarminUpload(e.target.files[0]);});
const dz=document.getElementById('dropZone');
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('over');});
dz.addEventListener('dragleave',()=>dz.classList.remove('over'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('over');if(e.dataTransfer.files[0])handleGarminUpload(e.dataTransfer.files[0]);});


// ════════════════════════════════════════
// ════════════════════════════════════════
// PERSISTENCE — JSONBin cloud storage
// ════════════════════════════════════════
const JSONBIN_ID      = '6a062140250b1311c34eeb9c';
const JSONBIN_READ_KEY = '$2a$10$x1A.OyhJCTJ39tF5PGlW5uN6yZFyZqxiaHpQRHlLM4ysplZbQ0b2G';
const JSONBIN_URL     = `https://api.jsonbin.io/v3/b/${JSONBIN_ID}`;

function showSyncStatus(msg, type='') {
  const el = document.getElementById('uploadStatus');
  el.textContent = msg;
  el.className = 'upload-status' + (type ? ' '+type : '');
}

function getWriteKey() {
  // Check sessionStorage first (lasts until tab is closed, never in HTML)
  let key = sessionStorage.getItem('jsonbin_write_key');
  if(key) return key;
  // Prompt once per session
  key = prompt('Enter your write key to save data to the cloud:');
  if(key && key.trim()) {
    sessionStorage.setItem('jsonbin_write_key', key.trim());
    return key.trim();
  }
  return null;
}

async function saveToCloud() {
  const writeKey = getWriteKey();
  if(!writeKey) {
    showSyncStatus('⚠ Write key required to save — data not saved to cloud', 'err');
    return false;
  }
  const builtinFP  = new Set(BUILTIN_RUNS.map(activityFingerprint));
  const builtinCFP = new Set(BUILTIN_CYCLES.map(activityFingerprint));
  const extraRuns   = analyticsRuns.filter(r => !builtinFP.has(activityFingerprint(r)));
  const extraCycles = analyticsCycles.filter(r => !builtinCFP.has(activityFingerprint(r)));
  try {
    const res = await fetch(JSONBIN_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': writeKey },
      body: JSON.stringify({ runs: extraRuns, cycles: extraCycles })
    });
    if(res.status === 401) {
      // Wrong key — clear it so they can re-enter
      sessionStorage.removeItem('jsonbin_write_key');
      showSyncStatus('⚠ Incorrect write key — please try again', 'err');
      return false;
    }
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return true;
  } catch(e) {
    showSyncStatus('⚠ Cloud save failed — check connection and try again', 'err');
    return false;
  }
}

function dismissOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if(!overlay) return;
  overlay.classList.add('fade-out');
  setTimeout(() => overlay.classList.add('gone'), 520);
}

async function loadFromCloud() {
  // Safety timeout — dismiss overlay after 5s even if fetch hangs
  const safetyTimer = setTimeout(dismissOverlay, 5000);
  try {
    showSyncStatus('Syncing data…');
    // Read-only key is safe to embed — it cannot write or delete
    const res = await fetch(JSONBIN_URL + '/latest', {
      headers: { 'X-Access-Key': JSONBIN_READ_KEY }
    });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const extraRuns   = json.record?.runs   || [];
    const extraCycles = json.record?.cycles || [];
    if(extraRuns.length || extraCycles.length) {
      analyticsRuns   = mergeActivities([...BUILTIN_RUNS],   extraRuns);
      analyticsCycles = mergeActivities([...BUILTIN_CYCLES], extraCycles);
      filteredRuns    = [...analyticsRuns];
      filteredCycles  = [...analyticsCycles];
      showSyncStatus(`✓ ${analyticsRuns.length} runs · ${analyticsCycles.length} rides — synced ${fmtSyncTime()}`, 'ok');
      document.getElementById('clearBtn').style.display = 'inline-block';
    } else {
      showSyncStatus('Drop Activities.csv to sync');
    }
    document.getElementById('analyticsCount').textContent = analyticsRuns.length + ' runs · ' + analyticsCycles.length + ' rides';
    clearTimeout(safetyTimer);
    dismissOverlay();
    renderPlan();
    renderAnalytics();
  } catch(e) {
    clearTimeout(safetyTimer);
    dismissOverlay();
    showSyncStatus('Drop Activities.csv to sync');
  }
}

function clearGarmin() {
  garminRuns=[];
  garminCycles=[];
  analyticsRuns=[...BUILTIN_RUNS];
  analyticsCycles=[...BUILTIN_CYCLES];
  filteredRuns=[...BUILTIN_RUNS];
  filteredCycles=[...BUILTIN_CYCLES];
  showSyncStatus('Drop Activities.csv to sync');
  document.getElementById('dropText').textContent='Drop Activities.csv or Running/Cycling CSV';
  document.getElementById('garminFile').value='';
  document.getElementById('clearBtn').style.display='none';
  document.getElementById('analyticsCount').textContent=BUILTIN_RUNS.length+' runs · '+BUILTIN_CYCLES.length+' rides';
  // Clear cloud too — requires write key
  saveToCloud();
  renderPlan();
  renderAnalytics();
}


