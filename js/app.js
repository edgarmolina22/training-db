// app.js — extracted from the original monolithic js/app.js
// Sourced ranges:
//   lines 17–192  (Event delegation + tab switching)
//   lines 3824–4031  (Init + bootstrap)

// ════════════════════════════════════════
// EVENT DELEGATION
// ════════════════════════════════════════
// Single click dispatcher mapping [data-action] elements to handlers.
// Replaces the inline onclick="…" attrs that used to live in the HTML and JS
// template strings — keeps the markup CSP-friendly and centralizes behavior.
const CLICK_ACTIONS = {
  // Tabs + page nav
  'show-tab':             el => showTab(el.dataset.tab, el),
  'show-act-tab':         el => showActTab(el.dataset.tab, el),
  'set-analytics-page':   el => setAnalyticsPage(el.dataset.page, el),
  // Plan filters / week toggles
  'filter-phase':         el => filterPhase(el.dataset.phase, el),
  'toggle-all-weeks':     el => toggleAllWeeks(el),
  'toggle-week':          el => toggleWeek(el),
  // Analytics filters
  'set-run-sub':          el => setRunSub(el.dataset.sub, el),
  'set-cycle-sub':        el => setCycleSub(el.dataset.sub, el),
  'set-range-filter':     el => {
    const r = el.dataset.range;
    setRangeFilter(r === 'all' ? 'all' : Number(r), el);
  },
  // Share modal
  'set-share-style':      el => setShareStyle(Number(el.dataset.style), el),
  'download-share-card':  () => downloadShareCard(),
  'close-share-modal':    () => closeShareModal(),
  'backdrop-share':       (el, e) => { if (e.target === el) closeShareModal(); },
  // Activity detail modal
  'close-act-modal':      () => closeActModal(),
  'backdrop-act':         (el, e) => { if (e.target === el) closeActModal(); },
  // Garmin sync
  'clear-garmin':         () => clearGarmin(),
  // Analytics page sections (expand/collapse)
  'toggle-section':       el => toggleSection(el.dataset.sectionKey, el),
  // Strength reference card routines (Daily / A / B)
  'toggle-strength':      el => toggleStrengthRoutine(el.dataset.strengthKey, el),
  // Snapshots + race predictor
  'toggle-race-predictor':() => toggleRacePredictor(),
  'toggle-snapshot':      el => toggleSnapshot(el.dataset.snapshot),
  'toggle-plan-health':   () => {
    const d = document.getElementById('planHealth');
    if (!d) return;
    d.dataset.open = d.dataset.open === '1' ? '0' : '1';
    renderPlanHealth();
  },
  // Table sort
  'sort-table':           el => sortTable(el.dataset.key),
  // Row-level actions (table → modal). garminId is the primary key for DB lookups;
  // date/title/type/distance are kept for the legacy fuzzy-match fallback when a row
  // doesn't have a garmin_id (e.g. CSV-uploaded activities not yet in training.db).
  'open-activity-detail': el => openActivityDetail(
    el.dataset.date,
    el.dataset.title,
    el.dataset.type,
    el.dataset.distance,
    el.dataset.garminId
  ),
  'open-share-modal':     el => {
    const idx = Number(el.dataset.rowIdx);
    const src = el.dataset.source === 'cycle' ? window._cycleTableRows : window._tableRows;
    openShareModal(el.dataset.shareType, src?.[idx]);
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const handler = CLICK_ACTIONS[el.dataset.action];
  if (handler) handler(el, e);
});

const RACE_TITLES = ['marathon','half marathon','race','san francisco','avenue','humboldt'];
const TEMPO_KW    = ['tempo','over and under','progression run','repeating progressive','descending interval','steady into','tempo 2','tempo 3','tempo intro'];
const INTERVAL_KW = ['interval','repeat','400','800','1km','mile repeat','pyramid','rolling 4','rolling 8'];
const HILLS_KW    = ['hill repeat','hill repeats','hills -','hilly long','hilly pr','shorter hill'];
const LONG_KW     = ['long run','long ru','marathon long','race practice','block long','progressive long'];

function getRunType(r) {
  const atype = getActivityType(r);
  if(!atype.includes('Running')) return atype;
  if(r.is_race) return 'race';
  const t = (r.Title||r.title||'').toLowerCase();
  if(HILLS_KW.some(k=>t.includes(k))) return 'hills';
  if(INTERVAL_KW.some(k=>t.includes(k))) return 'intervals';
  if(TEMPO_KW.some(k=>t.includes(k))) return 'tempo';
  if(LONG_KW.some(k=>t.includes(k))) return 'long';
  if((r.Distance||r.distance||0) >= 10) return 'long';
  return 'easy';
}
const ITB_FLARES  = ['2026-04-12','2026-05-03'];

// Heart rate zones - max HR 183 bpm, Garmin % max HR method
const MAX_HR = 183;
const HR_ZONES = [
  { num:1, name:'Recovery',  pctLo:0.24, pctHi:0.66, color:'#9e9890', label:'Z1', lo:44,  hi:121 },
  { num:2, name:'Easy',      pctLo:0.66, pctHi:0.83, color:'#2C6FAC', label:'Z2', lo:121, hi:152 },
  { num:3, name:'Aerobic',   pctLo:0.83, pctHi:0.91, color:'#1D9E75', label:'Z3', lo:152, hi:166 },
  { num:4, name:'Threshold', pctLo:0.91, pctHi:0.98, color:'#EF9F27', label:'Z4', lo:166, hi:179 },
  { num:5, name:'Maximum',   pctLo:0.98, pctHi:1.00, color:'#E24B4A', label:'Z5', lo:179, hi:183 },
];

function getHRZone(hr) {
  if(!hr) return null;
  return HR_ZONES.find(z => hr >= z.lo && hr <= z.hi) || HR_ZONES[HR_ZONES.length-1];
}

function hrZoneLabel(hr) {
  const z = getHRZone(hr);
  if(!z) return '';
  return '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:'+z.color+'22;color:'+z.color+';font-family:var(--mono);font-weight:500">'+z.label+' '+z.name+'</span>';
}

function getActivityType(r) {
  return r.ActivityType || r.Type || r.type || 'Running';
}

function typeColor(r) {
  const atype = getActivityType(r);
  if(atype==='Virtual Cycling')  return '#2C6FAC';
  if(atype==='Road Cycling')     return '#1A4D7A';
  if(atype==='Indoor Cycling')   return '#4D8EC4';
  if(atype.includes('Cycling'))  return '#2C6FAC';
  if(atype.includes('Strength')) return '#2d6a4f';
  if(atype.includes('Yoga') || atype.includes('Walking')) return '#8A8278';
  // Running subtypes
  const t = getRunType(r);
  if(t==='race')      return '#7C3D9E';
  if(t==='long')      return '#1D5FA0';
  if(t==='tempo')     return '#C84B2F';
  if(t==='intervals') return '#EF9F27';
  if(t==='hills')     return '#b06a00';
  return '#2D7A5A'; // easy
}
function secToMin(s){if(!s)return '--';return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}

// Parse a date string as LOCAL time (avoids UTC midnight → previous day issue)
// Accepts "YYYY-MM-DD", "YYYY-MM-DD HH:MM:SS", "YYYY-MM-DDTHH:MM:SS.000"
function parseLocalDate(raw){
  const s=String(raw||'').slice(0,10);
  const [y,m,d]=s.split('-').map(Number);
  return new Date(y,m-1,d);
}
// Get the Monday of the week containing the given date string (local time)
function localMonday(raw){
  const d=parseLocalDate(raw);
  const mon=new Date(d);
  mon.setDate(d.getDate()-((d.getDay()+6)%7));
  return mon;
}
// Show an empty-state message alongside the canvas (canvas stays in DOM)
function noData(el, msg){
  if(!el)return;
  const wrap=el.parentElement;
  const old=wrap.querySelector('.chart-no-data');
  if(old) old.remove();
  el.style.display='none';
  const div=document.createElement('div');
  div.className='chart-no-data';
  div.style.cssText='padding:24px;text-align:center;color:var(--text3);font-size:11px;';
  div.textContent=msg||'Not enough data';
  wrap.appendChild(div);
}function fmtDate(d){const dt=new Date(d);return `${dt.toLocaleString('en',{month:'short'})} ${dt.getDate()}`;}

// ════════════════════════════════════════
// TAB SWITCHING
// ════════════════════════════════════════
function showTab(id, btn) {
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+id).classList.add('active');
  btn.classList.add('active');
  // Update masthead title to reflect current view
  const title = document.getElementById('mastheadTitle');
  if(id === 'plan')           title.innerHTML = 'Training <span>Plan</span>';
  else if(id === 'analytics'){
    const labels = {all:'All <span>Analytics</span>', running:'Running <span>Analytics</span>', cycling:'Cycling <span>Analytics</span>'};
    title.innerHTML = labels[activeView] || 'All <span>Analytics</span>';
  }
  if(id==='analytics'){
    setAnalyticsPage(analyticsPage, document.querySelector('.anav.active'));
  }
}


// ════════════════════════════════════════
// INIT
// ════════════════════════════════════════
// Loads runs.json + cycles.json (extracted from the old inline arrays) and
// seeds the analytics/filter state. Returns a promise so the bootstrap below
// can wait before kicking off renders.
async function loadBuiltinData() {
  try {
    const [runs, cycles] = await Promise.all([
      fetch('runs.json').then(r => r.ok ? r.json() : []),
      fetch('cycles.json').then(r => r.ok ? r.json() : []),
    ]);
    BUILTIN_RUNS   = runs;
    BUILTIN_CYCLES = cycles;
  } catch (e) {
    console.warn('Failed to load builtin activity data:', e);
  }
  analyticsRuns   = [...BUILTIN_RUNS];
  analyticsCycles = [...BUILTIN_CYCLES];
  filteredRuns    = [...BUILTIN_RUNS];
  filteredCycles  = [...BUILTIN_CYCLES];
  const countEl = document.getElementById('analyticsCount');
  if (countEl) countEl.textContent =
    BUILTIN_RUNS.length + ' runs · ' + BUILTIN_CYCLES.length + ' rides';
}

// ── URL state / deep linking ──
// Reads ?tab=analytics&page=running on load and restores that state
function applyURLState(){
  const p=new URLSearchParams(location.search);
  const tab=p.get('tab');
  const page=p.get('page');
  if(tab==='analytics'){
    const tabBtn=document.querySelector('.tab-btn[data-tab="analytics"]');
    if(tabBtn) showTab('analytics',tabBtn);
    if(page&&['overview','running','cycling'].includes(page)){
      const navBtn=document.querySelector(`.anav[data-page="${page}"]`);
      if(navBtn) setAnalyticsPage(page,navBtn);
    }
  }
}

function pushURLState(){
  const tab=document.querySelector('.tab-btn.active')?.dataset.tab||'plan';
  const params=new URLSearchParams();
  params.set('tab',tab);
  if(tab==='analytics') params.set('page',analyticsPage);
  try{ history.replaceState({},'',location.pathname+'?'+params.toString()); }catch(e){/* iframe sandbox */}
}

// Patch showTab + setAnalyticsPage to push URL state
const _origShowTab=showTab;
showTab=function(id,btn){_origShowTab(id,btn);pushURLState();};
const _origSetPage=setAnalyticsPage;
setAnalyticsPage=function(page,btn){_origSetPage(page,btn);pushURLState();};

// ── Keyboard navigation ──
// Left/right arrows switch analytics pages; [ ] switch main tabs
document.addEventListener('keydown',e=>{
  // Don't fire when typing in inputs or textareas
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.isContentEditable) return;

  const PAGES=['overview','running','cycling'];
  const isAnalytics=document.getElementById('tab-analytics')?.classList.contains('active');

  if(isAnalytics&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
    e.preventDefault();
    const cur=PAGES.indexOf(analyticsPage);
    const next=e.key==='ArrowLeft'
      ? (cur-1+PAGES.length)%PAGES.length
      : (cur+1)%PAGES.length;
    const btn=document.querySelector(`.anav[data-page="${PAGES[next]}"]`);
    setAnalyticsPage(PAGES[next],btn);
  }

  // [ and ] to switch main tabs
  if(e.key==='['){
    const planBtn=document.querySelector('.tab-btn[data-tab="plan"]');
    if(planBtn) showTab('plan',planBtn);
  }
  if(e.key===']'){
    const analyticsBtn=document.querySelector('.tab-btn[data-tab="analytics"]');
    if(analyticsBtn) showTab('analytics',analyticsBtn);
  }
});

// ── Days until Santa Rosa countdown in masthead ──
(function(){
  const RACE_DATE=new Date('2026-08-23T06:30:00');
  const el=document.getElementById('headerWeekLabel');
  function updateCountdown(){
    const now=new Date();
    const diff=Math.ceil((RACE_DATE-now)/86400000);
    if(diff>0&&el){
      const existing=document.getElementById('raceCountdown');
      if(!existing){
        const span=document.createElement('span');
        span.id='raceCountdown';
        span.style.cssText='margin-left:10px;font-size:9px;font-family:var(--mono);color:#C84B2F;letter-spacing:0.04em;opacity:0.85;';
        span.textContent=diff+' days';
        el.parentElement?.appendChild(span);
      } else {
        existing.textContent=diff+' days';
      }
    }
  }
  updateCountdown();
  setInterval(updateCountdown,60000);
})();

// ── Recovery balance on Overview ──
// Appended to the weekly training load chart as a second view
function renderRecoveryBalance(){
  const el=document.getElementById('recoveryChart');
  if(!el)return;
  dc('recovery', document.getElementById('recoveryChart'));

  const weekMap={};
  filteredRuns.filter(r=>r.hr>0).forEach(r=>{
    const mon=localMonday(r.Date||r.date);
    const key=mon.getFullYear()+'-'+String(mon.getMonth()+1).padStart(2,'0')+'-'+String(mon.getDate()).padStart(2,'0');
    if(!weekMap[key])weekMap[key]={easy:0,hard:0};
    // Z1/Z2 = HR < 152 (true easy boundary — Z3 starts at 152)
    if(r.hr<152) weekMap[key].easy++;
    else weekMap[key].hard++;
  });

  const weeks=Object.keys(weekMap).sort();
  if(!weeks.length){noData(el,'No data');return;}

  const labels=weeks.map(w=>{const d=new Date(w);return d.toLocaleString('en',{month:'short'})+' '+d.getDate();});
  const easyPct=weeks.map(w=>{
    const{easy,hard}=weekMap[w];
    const total=easy+hard;
    return total?Math.round(easy/total*100):null;
  });

  charts['recovery']=new Chart(el,{
    type:'bar',
    data:{
      labels,
      datasets:[
        {label:'Easy/Z1-Z2',data:easyPct.map(v=>v),backgroundColor:easyPct.map(v=>v===null?'transparent':v>=80?'#2D7A5Acc':'#C84B2Fcc'),borderRadius:2,borderWidth:0},
      ]
    },
    options:{...CD,
      scales:{
        x:{...CD.scales.x,ticks:{...CD.scales.x.ticks,maxTicksLimit:12,maxRotation:40}},
        y:{...CD.scales.y,min:0,max:100,
          ticks:{...CD.scales.y.ticks,callback:v=>v+'%'},
          title:{display:true,text:'Easy runs (%)',color:'#9e9890',font:{family:"'DM Mono',monospace",size:10}}
        }
      },
      plugins:{...CD.plugins,
        legend:{display:false},
        tooltip:{...CD.plugins.tooltip,callbacks:{
          title:ctx=>ctx.length?'Week of '+weeks[ctx[0].dataIndex]:'',
          label:ctx=>{
            if(!ctx||ctx.parsed===undefined)return null;
            const v=ctx.parsed.y;
            if(v===null||v===undefined)return null;
            const w=weekMap[weeks[ctx.dataIndex]];
            if(!w)return v+'% easy';
            const status=v>=80?'✓ on target':'⚠ below 80%';
            return[v+'% easy · '+status, w.easy+' easy runs · '+w.hard+' hard runs'];
          }
        }}
      }
    },
    plugins:[{id:'zone80',afterDraw(chart){
      const{ctx,scales:{y},chartArea}=chart;
      const y80=y.getPixelForValue(80);
      if(y80<chartArea.top||y80>chartArea.bottom)return;
      ctx.save();
      ctx.strokeStyle='#2D7A5A88';
      ctx.setLineDash([4,3]);ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(chartArea.left,y80);ctx.lineTo(chartArea.right,y80);ctx.stroke();
      ctx.fillStyle='#2D7A5A';
      ctx.font="8px 'DM Mono',monospace";ctx.setLineDash([]);
      ctx.fillText('80% target',chartArea.right-62,y80-4);
      ctx.restore();
    }}]
  });
}

// Patch renderAnalytics to include recovery balance on overview
const _origRenderAnalytics=renderAnalytics;
renderAnalytics=function(){
  _origRenderAnalytics();
  if(analyticsPage==='overview') renderRecoveryBalance();
};

// Bootstrap: load builtin activity data, then render plan + cloud + URL state.
// Waiting on loadBuiltinData() ensures BUILTIN_RUNS / BUILTIN_CYCLES are populated
// before any renderer reads them; gating applyURLState on DOMContentLoaded ensures
// deferred Chart.js + date-fns are loaded before ?tab=analytics builds charts.
loadBuiltinData().then(() => {
  renderPlan();    // render silently behind the overlay
  loadFromCloud(); // fetches cloud data, then dismisses overlay and re-renders
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyURLState);
  } else {
    applyURLState();
  }
});
// Analytics renders on tab switch to avoid hidden canvas issues



