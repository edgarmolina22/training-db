// analytics.js — extracted from the original monolithic js/app.js
// Sourced ranges:
//   lines 994–1870  (Race predictor + last-activity snapshots + share card)
//   lines 2154–3706  (Analytics data + render + all chart functions)

// ════════════════════════════════════════
// RACE PREDICTOR — Riegel formula
// ════════════════════════════════════════
function riegelProject(timeSec, distMi, targetMi) {
  return timeSec * Math.pow(targetMi / distMi, 1.06);
}
function fmtRaceTime(s) {
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=Math.round(s%60);
  return h>0 ? h+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0') : m+':'+String(sec).padStart(2,'0');
}

const HILLY_RACES = ['brazen','10k','humboldt','avenue'];
const RACE_TARGETS = [
  { label:'5K',   dist:3.107 },
  { label:'Half', dist:13.109 },
  { label:'Full', dist:26.219 },
];

// ════════════════════════════════════════
// LAST ACTIVITY SNAPSHOT
// ════════════════════════════════════════
function renderLastRunSnapshot(){
  const el=document.getElementById('lastRunSnapshot');
  if(!el)return;
  const runs=[...filteredRuns].filter(r=>r.Date||r.date).sort((a,b)=>new Date(b.Date||b.date)-new Date(a.Date||a.date));
  if(!runs.length){el.innerHTML='';return;}

  const latest=runs[0];
  const sameType=runs.slice(1).filter(r=>getRunType(r)===getRunType(latest)).slice(0,10);
  const isOpen=el.dataset.open==='1';

  function avg(arr,fn){const v=arr.map(fn).filter(x=>x&&x>0);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;}
  function arrow(cur,baseline,lowerBetter=false){
    if(!cur||!baseline)return{cls:'neutral',txt:'—'};
    const pct=((cur-baseline)/baseline*100);
    const better=lowerBetter?pct<-2:pct>2;
    const worse=lowerBetter?pct>2:pct<-2;
    const sign=pct>=0?'+':'';
    return{cls:better?'up':worse?'down':'neutral',txt:`${sign}${pct.toFixed(1)}% vs avg`};
  }

  const metrics=[
    {key:'HR',val:latest.hr?latest.hr+' bpm':null,baseline:avg(sameType,r=>r.hr),cur:latest.hr,lowerBetter:true,flag:latest.hr>166?'⚠ Above Z3':null},
    {key:'Aerobic TE',val:latest.aerobic_te||null,baseline:avg(sameType,r=>r.aerobic_te),cur:latest.aerobic_te,lowerBetter:false},
    {key:'Cadence',val:latest.cadence?latest.cadence+' spm':null,baseline:avg(sameType,r=>r.cadence),cur:latest.cadence,lowerBetter:false,flag:latest.cadence&&latest.cadence<170?'⚠ Below 175':null},
    {key:'Left GCT',val:latest.left_pct?latest.left_pct+'%':null,baseline:avg(sameType,r=>r.left_pct),cur:latest.left_pct,lowerBetter:false,flag:latest.left_pct&&latest.left_pct<47.5?'⚠ IT band risk':null,flagged:latest.left_pct&&latest.left_pct<47.5},
    {key:'GCT ms',val:latest.gct?latest.gct+'ms':null,baseline:avg(sameType,r=>r.gct),cur:latest.gct,lowerBetter:true},
    {key:'Stride',val:latest.stride_len?latest.stride_len+'m':null,baseline:avg(sameType,r=>r.stride_len),cur:latest.stride_len,lowerBetter:false},
    {key:'Vert osc',val:latest.vo?latest.vo+'cm':null,baseline:avg(sameType,r=>r.vo),cur:latest.vo,lowerBetter:true},
    {key:'Vert ratio',val:latest.vert_ratio?latest.vert_ratio+'%':null,baseline:avg(sameType,r=>r.vert_ratio),cur:latest.vert_ratio,lowerBetter:true,flag:latest.vert_ratio&&latest.vert_ratio>10?'⚠ Above 10%':null},
  ].filter(m=>m.val);

  // Summary line for toggle bar
  const flags=metrics.filter(m=>m.flag);
  const summaryItems=[];
  if(latest.hr) summaryItems.push(`<span class="snapshot-toggle-item">HR <span>${latest.hr} bpm</span></span>`);
  if(latest.left_pct) summaryItems.push(`<span class="snapshot-toggle-item${latest.left_pct<47.5?' flag':''}">Left GCT <span>${latest.left_pct}%</span>${latest.left_pct<47.5?' ⚠':''}</span>`);
  if(latest.cadence) summaryItems.push(`<span class="snapshot-toggle-item">Cadence <span>${latest.cadence} spm</span></span>`);
  if(latest.aerobic_te) summaryItems.push(`<span class="snapshot-toggle-item">TE <span>${latest.aerobic_te}</span></span>`);
  if(flags.length) summaryItems.push(`<span class="snapshot-toggle-item flag">${flags.length} flag${flags.length>1?'s':''}</span>`);

  const metricsHTML=metrics.map(m=>{
    const{cls,txt}=arrow(m.cur,m.baseline,m.lowerBetter);
    return`<div class="snap-metric${m.flagged?' flagged':''}">
      <div class="snap-key">${m.key}</div>
      <div class="snap-val">${m.val}</div>
      <div class="snap-delta ${cls}">${txt}</div>
      ${m.flag?`<div class="snap-flag">${m.flag}</div>`:''}
    </div>`;
  }).join('');

  const runType=getRunType(latest);
  const dist=latest.Distance?latest.Distance.toFixed(1)+'mi':'';
  const pace=latest.pace_sec?'· '+secToMin(latest.pace_sec)+'/mi':'';

  el.innerHTML=`
    <div class="snapshot-toggle" data-action="toggle-snapshot" data-snapshot="lastRunSnapshot">
      <span class="snapshot-toggle-label">Last run</span>
      <div class="snapshot-toggle-summary">
        <span class="snapshot-toggle-item" style="color:var(--text2)">${(latest.Title||'').replace(/Oakley - W\d+ - /,'').slice(0,40)}</span>
        <span class="snapshot-toggle-item"><span>${fmtDate(latest.Date||latest.date)} · ${dist} ${pace}</span></span>
        ${summaryItems.join('')}
      </div>
      <span class="snapshot-toggle-chevron">${isOpen?'▲ collapse':'▼ expand'}</span>
    </div>
    <div class="snapshot-detail${isOpen?' open':''}" id="lastRunDetail">
      <div style="font-size:9px;font-family:var(--mono);color:var(--text3);margin-bottom:8px;">${runType.charAt(0).toUpperCase()+runType.slice(1)} run · comparing to ${sameType.length} similar runs</div>
      <div class="snapshot-detail-grid">${metricsHTML}</div>
    </div>`;
}

function renderLastRideSnapshot(){
  const el=document.getElementById('lastRideSnapshot');
  if(!el)return;
  const rides=[...filteredCycles].filter(r=>r.Date||r.date).sort((a,b)=>new Date(b.Date||b.date)-new Date(a.Date||a.date));
  if(!rides.length){el.innerHTML='';return;}

  const latest=rides[0];
  const sameType=rides.slice(1).filter(r=>r.ActivityType===latest.ActivityType).slice(0,10);
  const isOpen=el.dataset.open==='1';

  function avg(arr,fn){const v=arr.map(fn).filter(x=>x&&x>0);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;}
  function arrow(cur,baseline,lowerBetter=false){
    if(!cur||!baseline)return{cls:'neutral',txt:'—'};
    const pct=((cur-baseline)/baseline*100);
    const better=lowerBetter?pct<-2:pct>2;
    const worse=lowerBetter?pct>2:pct<-2;
    const sign=pct>=0?'+':'';
    return{cls:better?'up':worse?'down':'neutral',txt:`${sign}${pct.toFixed(1)}% vs avg`};
  }

  const metrics=[
    {key:'Avg power',val:latest.avg_power?latest.avg_power+'w':null,baseline:avg(sameType,r=>r.avg_power),cur:latest.avg_power,lowerBetter:false},
    {key:'Max power',val:latest.max_power?latest.max_power+'w':null,baseline:avg(sameType,r=>r.max_power),cur:latest.max_power,lowerBetter:false},
    {key:'Avg speed',val:latest.avg_speed?latest.avg_speed+' mph':null,baseline:avg(sameType,r=>r.avg_speed),cur:latest.avg_speed,lowerBetter:false},
    {key:'HR',val:latest.hr?latest.hr+' bpm':null,baseline:avg(sameType,r=>r.hr),cur:latest.hr,lowerBetter:true},
    {key:'Cadence',val:latest.cadence?latest.cadence+' rpm':null,baseline:avg(sameType,r=>r.cadence),cur:latest.cadence,lowerBetter:false},
    {key:'Aerobic TE',val:latest.aerobic_te||null,baseline:avg(sameType,r=>r.aerobic_te),cur:latest.aerobic_te,lowerBetter:false},
    {key:'Elevation',val:latest.ascent?parseInt(latest.ascent).toLocaleString()+'ft':null,baseline:avg(sameType,r=>parseInt(r.ascent)||0),cur:parseInt(latest.ascent)||0,lowerBetter:false},
  ].filter(m=>m.val);

  const summaryItems=[];
  if(latest.avg_power) summaryItems.push(`<span class="snapshot-toggle-item">Power <span>${latest.avg_power}w</span></span>`);
  if(latest.avg_speed) summaryItems.push(`<span class="snapshot-toggle-item">Speed <span>${latest.avg_speed} mph</span></span>`);
  if(latest.hr) summaryItems.push(`<span class="snapshot-toggle-item">HR <span>${latest.hr} bpm</span></span>`);
  if(latest.aerobic_te) summaryItems.push(`<span class="snapshot-toggle-item">TE <span>${latest.aerobic_te}</span></span>`);

  const metricsHTML=metrics.map(m=>{
    const{cls,txt}=arrow(m.cur,m.baseline,m.lowerBetter);
    return`<div class="snap-metric">
      <div class="snap-key">${m.key}</div>
      <div class="snap-val">${m.val}</div>
      <div class="snap-delta ${cls}">${txt}</div>
    </div>`;
  }).join('');

  const rideType=(latest.ActivityType||'').replace(' Cycling','');
  const dist=latest.Distance?latest.Distance.toFixed(1)+'mi':'';

  el.innerHTML=`
    <div class="snapshot-toggle" data-action="toggle-snapshot" data-snapshot="lastRideSnapshot">
      <span class="snapshot-toggle-label">Last ride</span>
      <div class="snapshot-toggle-summary">
        <span class="snapshot-toggle-item" style="color:var(--text2)">${(latest.Title||'').replace(/Zwift - /,'').replace(/Oakley |Newark /,'').slice(0,40)}</span>
        <span class="snapshot-toggle-item"><span>${fmtDate(latest.Date||latest.date)} · ${dist} · ${rideType}</span></span>
        ${summaryItems.join('')}
      </div>
      <span class="snapshot-toggle-chevron">${isOpen?'▲ collapse':'▼ expand'}</span>
    </div>
    <div class="snapshot-detail${isOpen?' open':''}" id="lastRideDetail">
      <div style="font-size:9px;font-family:var(--mono);color:var(--text3);margin-bottom:8px;">${rideType} ride · comparing to ${sameType.length} similar rides</div>
      <div class="snapshot-detail-grid">${metricsHTML}</div>
    </div>`;
}

// ════════════════════════════════════════
// SHARE CARD — 4 styles, Instagram Story
// ════════════════════════════════════════
let _shareStyle = 1;
let _shareType  = 'run';
let _shareActivity = null; // specific activity to share (null = use latest)

function setShareStyle(n, btn){
  _shareStyle = n;
  document.querySelectorAll('.share-style-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const wrap = document.getElementById('shareCardWrap');
  if(wrap) wrap.innerHTML = buildShareCardHTML(_shareType, n);
  // Paint the route into the preview canvas (styles 5 & 6 only emit one).
  // Function defined in js/map.js; bail quietly if it isn't loaded.
  window.paintSharePreviewRoute?.();
}

function getShareData(type){
  let r = _shareActivity;
  if(!r){
    const items = type==='run'
      ? [...analyticsRuns].sort((a,b)=>new Date(b.Date||b.date)-new Date(a.Date||a.date))
      : [...analyticsCycles].sort((a,b)=>new Date(b.Date||b.date)-new Date(a.Date||a.date));
    if(!items.length) return null;
    r = items[0];
  }
  const isRun = type === 'run';
  const title = (r.Title||'')
    .replace(/Oakley - W\d+ - /i,'').replace(/Zwift - /i,'')
    .replace(/Oakley |Newark /gi,'').slice(0,38);
  const dateStr = parseLocalDate(r.Date||r.date).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'});
  const emoji   = isRun ? '🏃' : '🚴';
  const typeLabel = isRun ? getRunType(r) : (r.ActivityType||'').replace(' Cycling','').toLowerCase();
  const dist    = r.Distance ? r.Distance.toFixed(2)+' mi' : '—';
  const pace    = r.pace_sec ? secToMin(r.pace_sec)+'/mi' : null;
  const hr      = r.hr ? r.hr+' bpm' : null;
  const elev    = r.ascent && parseInt(r.ascent)>0 ? parseInt(r.ascent).toLocaleString()+'ft' : null;
  const cals    = r.calories ? r.calories.toLocaleString() : null;
  const time    = r.Time || null;
  const power   = r.avg_power ? r.avg_power+'w' : null;
  const speed   = r.avg_speed ? r.avg_speed+' mph' : null;
  const headline     = isRun ? dist : (power||speed||dist);
  const headlineLabel= isRun ? 'DISTANCE' : (power?'AVG POWER':'AVG SPEED');
  const metrics = isRun
    ? [pace&&{k:'AVG PACE',v:pace}, hr&&{k:'AVG HR',v:hr}, elev&&{k:'ELEVATION',v:elev}, cals&&{k:'CALORIES',v:cals}].filter(Boolean)
    : [speed&&{k:'AVG SPEED',v:speed}, hr&&{k:'AVG HR',v:hr}, elev&&{k:'ELEVATION',v:elev}, cals&&{k:'CALORIES',v:cals}].filter(Boolean);
  return { r, isRun, title, dateStr, emoji, typeLabel, dist, headline, headlineLabel, time, metrics };
}

// Branding footer shared across styles
const BRAND_HTML = '<div style="display:flex;justify-content:space-between;align-items:center;">'
  + '<span style="font-size:6px;letter-spacing:0.1em;color:rgba(255,255,255,0.22);text-transform:uppercase;">Edgar Molina Training Hub</span>'
  + '<span style="font-size:6px;letter-spacing:0.06em;color:rgba(255,255,255,0.18);">training.edgarmolina.com</span>'
  + '</div>';

function buildShareCardHTML(type, style){
  const d = getShareData(type);
  if(!d) return '<div style="padding:20px;color:#888;font-size:11px;">No data</div>';
  const { emoji, typeLabel, dateStr, headline, headlineLabel, time, metrics, dist } = d;

  // Preview at 200×356 (9:16), download renders at 3×
  const W=200, H=356;

  if(style===1){
    // ── Bottom pill ──
    const mHTML = metrics.slice(0,4).map(m=>`
      <div style="text-align:center;flex:1;padding:0 4px;">
        <div style="font-size:5.5px;letter-spacing:0.12em;color:rgba(255,255,255,0.55);text-transform:uppercase;margin-bottom:2px;">${m.k}</div>
        <div style="font-family:'Instrument Serif',serif;font-style:italic;font-size:13px;color:#fff;">${m.v}</div>
      </div>`).join('<div style="width:0.5px;background:rgba(255,255,255,0.2);align-self:stretch;margin:2px 0;"></div>');
    return `<div style="width:${W}px;height:${H}px;position:relative;display:flex;flex-direction:column;justify-content:flex-end;padding:0 0 16px;">
      <div style="margin:0 14px;background:rgba(0,0,0,0.72);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:9px;border:0.5px solid rgba(255,255,255,0.18);padding:12px 14px 10px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px;">
          <span style="font-size:7px;letter-spacing:0.14em;color:#C84B2F;text-transform:uppercase;font-family:'DM Mono',monospace;">${emoji} ${typeLabel}</span>
          <span style="font-size:7px;color:rgba(255,255,255,0.6);font-family:'DM Mono',monospace;">${dateStr}</span>
        </div>
        <div style="font-family:'Instrument Serif',serif;font-style:italic;font-size:30px;color:#fff;line-height:1;margin-bottom:8px;">${headline}</div>
        <div style="display:flex;margin-bottom:10px;">${mHTML}</div>
        <div style="padding-top:8px;border-top:0.5px solid rgba(255,255,255,0.18);">${BRAND_HTML}</div>
      </div>
    </div>`;
  }

  if(style===2){
    // ── Corner tag ──
    const mHTML = metrics.slice(0,4).map(m=>`
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-bottom:0.5px solid rgba(255,255,255,0.15);">
        <span style="font-size:5.5px;letter-spacing:0.12em;color:rgba(255,255,255,0.55);text-transform:uppercase;font-family:'DM Mono',monospace;">${m.k}</span>
        <span style="font-family:'Instrument Serif',serif;font-style:italic;font-size:12px;color:#fff;">${m.v}</span>
      </div>`).join('');
    return `<div style="width:${W}px;height:${H}px;position:relative;padding:16px 0 0 16px;">
      <div style="display:inline-block;background:rgba(0,0,0,0.75);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:8px;border:0.5px solid rgba(255,255,255,0.18);padding:12px 14px 10px;min-width:130px;">
        <div style="font-size:6px;letter-spacing:0.16em;color:#C84B2F;text-transform:uppercase;font-family:'DM Mono',monospace;margin-bottom:2px;">${emoji} ${typeLabel}</div>
        <div style="font-size:7px;color:rgba(255,255,255,0.6);font-family:'DM Mono',monospace;margin-bottom:10px;">${dateStr}</div>
        <div style="font-family:'Instrument Serif',serif;font-style:italic;font-size:32px;color:#fff;line-height:0.9;margin-bottom:2px;">${headline}</div>
        <div style="font-size:6.5px;color:rgba(255,255,255,0.55);font-family:'DM Mono',monospace;margin-bottom:10px;">${time||''}</div>
        <div>${mHTML}</div>
        <div style="margin-top:10px;padding-top:8px;border-top:0.5px solid rgba(255,255,255,0.18);">${BRAND_HTML}</div>
      </div>
    </div>`;
  }

  if(style===3){
    // ── Left stripe ──
    const mHTML = metrics.slice(0,3).map(m=>`
      <div style="margin-bottom:8px;">
        <div style="font-size:5px;letter-spacing:0.12em;color:rgba(255,255,255,0.55);text-transform:uppercase;font-family:'DM Mono',monospace;margin-bottom:1px;">${m.k}</div>
        <div style="font-family:'Instrument Serif',serif;font-style:italic;font-size:12px;color:#fff;">${m.v}</div>
      </div>`).join('');
    return `<div style="width:${W}px;height:${H}px;position:relative;display:flex;">
      <div style="width:68px;background:rgba(0,0,0,0.75);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-right:0.5px solid rgba(255,255,255,0.18);padding:22px 12px 18px;display:flex;flex-direction:column;justify-content:space-between;flex-shrink:0;">
        <div>
          <div style="width:14px;height:1.5px;background:#C84B2F;margin-bottom:10px;"></div>
          <div style="font-size:5.5px;letter-spacing:0.14em;color:rgba(255,255,255,0.6);text-transform:uppercase;font-family:'DM Mono',monospace;margin-bottom:8px;">${emoji} ${typeLabel}</div>
          <div style="font-family:'Instrument Serif',serif;font-style:italic;font-size:26px;color:#fff;line-height:0.9;margin-bottom:2px;">${headline}</div>
          <div style="font-size:5.5px;color:rgba(255,255,255,0.55);font-family:'DM Mono',monospace;letter-spacing:0.06em;">${headlineLabel}</div>
        </div>
        <div>
          ${mHTML}
          <div style="font-size:5px;color:rgba(255,255,255,0.45);font-family:'DM Mono',monospace;margin-bottom:3px;">${dateStr}</div>
          <div style="font-size:5px;color:rgba(255,255,255,0.3);font-family:'DM Mono',monospace;letter-spacing:0.04em;">EMTH</div>
        </div>
      </div>
    </div>`;
  }

  if(style===4){
    // ── Top bar + floating card ──
    const mHTML = metrics.slice(0,4).map(m=>`
      <div>
        <div style="font-size:5.5px;letter-spacing:0.12em;color:rgba(255,255,255,0.55);text-transform:uppercase;font-family:'DM Mono',monospace;margin-bottom:2px;">${m.k}</div>
        <div style="font-family:'Instrument Serif',serif;font-style:italic;font-size:15px;color:#fff;">${m.v}</div>
      </div>`).join('');
    return `<div style="width:${W}px;height:${H}px;position:relative;display:flex;flex-direction:column;">
      <div style="background:rgba(0,0,0,0.72);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:0.5px solid rgba(255,255,255,0.18);padding:12px 16px;display:flex;align-items:center;gap:10px;">
        <div style="width:5px;height:5px;border-radius:50%;background:#C84B2F;flex-shrink:0;"></div>
        <div style="font-family:'Instrument Serif',serif;font-style:italic;font-size:20px;color:#fff;flex-shrink:0;">${headline}</div>
        <div style="width:0.5px;height:18px;background:rgba(255,255,255,0.25);flex-shrink:0;"></div>
        <div>
          <div style="font-size:6px;letter-spacing:0.12em;color:rgba(255,255,255,0.65);text-transform:uppercase;font-family:'DM Mono',monospace;">${emoji} ${typeLabel}</div>
          <div style="font-size:6.5px;color:rgba(255,255,255,0.55);font-family:'DM Mono',monospace;">${dateStr}</div>
        </div>
      </div>
      <div style="margin:14px 16px 0;background:rgba(0,0,0,0.72);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:8px;border:0.5px solid rgba(255,255,255,0.18);padding:12px 14px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-bottom:10px;">${mHTML}</div>
        <div style="padding-top:8px;border-top:0.5px solid rgba(255,255,255,0.18);">${BRAND_HTML}</div>
      </div>
    </div>`;
  }
  if(style===5){
    // ── Full card — standalone, dark background ──
    const mHTML = metrics.slice(0,4).map(m=>`
      <div style="padding:4px 8px;border-radius:4px;border:0.5px solid rgba(255,255,255,0.1);">
        <div style="font-size:5px;letter-spacing:0.12em;color:rgba(255,255,255,0.28);text-transform:uppercase;font-family:'DM Mono',monospace;margin-bottom:1px;">${m.k}</div>
        <div style="font-family:'Instrument Serif',serif;font-style:italic;font-size:14px;color:#fff;line-height:1.15;">${m.v}</div>
      </div>`).join('');
    // Route canvas — same percentage-based area as overlayRouteOnCard (33%/45%)
    const rx = Math.round(W*0.04), ry = Math.round(H*0.33), rw = Math.round(W*0.92), rh = Math.round(H*0.45);
    return `<div style="width:${W}px;height:${H}px;position:relative;overflow:hidden;display:flex;flex-direction:column;background:linear-gradient(160deg,#1a1714 0%,#0d0c0a 55%,#17120e 100%);">
      <div style="position:absolute;inset:0;background-image:repeating-linear-gradient(0deg,transparent,transparent 29px,rgba(255,255,255,0.018) 30px),repeating-linear-gradient(90deg,transparent,transparent 29px,rgba(255,255,255,0.018) 30px);pointer-events:none;"></div>
      <canvas class="share-preview-route" width="${rw}" height="${rh}" style="position:absolute;left:${rx}px;top:${ry}px;width:${rw}px;height:${rh}px;"></canvas>
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent 0%,#C84B2F 40%,#C84B2F 60%,transparent 100%);"></div>
      <div style="position:relative;z-index:1;display:flex;flex-direction:column;height:100%;padding:28px 28px 20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <div style="font-size:6.5px;letter-spacing:0.18em;color:rgba(255,255,255,0.28);font-family:'DM Mono',monospace;text-transform:uppercase;">Edgar Molina Training Hub</div>
          <div style="font-size:7px;letter-spacing:0.1em;color:#C84B2F;font-family:'DM Mono',monospace;text-transform:uppercase;">${emoji} ${typeLabel}</div>
        </div>
        <div style="font-size:8px;color:rgba(255,255,255,0.38);font-family:'DM Mono',monospace;margin-bottom:4px;">${dateStr}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.65);font-family:'DM Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${d.title}</div>
        <div style="height:0.5px;background:rgba(255,255,255,0.1);margin:14px 0 16px;"></div>
        <div>
          <div style="font-size:8px;letter-spacing:0.16em;color:rgba(255,255,255,0.35);font-family:'DM Mono',monospace;margin-bottom:6px;">${headlineLabel}</div>
          <div style="font-family:'Instrument Serif',serif;font-style:italic;font-size:48px;color:#fff;line-height:0.88;margin-bottom:8px;">${headline}</div>
          <div style="font-size:9px;color:rgba(255,255,255,0.35);font-family:'DM Mono',monospace;letter-spacing:0.08em;">${time||''}</div>
        </div>
        <div style="flex:1;"></div>
        <div style="height:0.5px;background:rgba(255,255,255,0.08);margin-bottom:8px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px;">${mHTML}</div>
        <div style="padding-top:8px;border-top:0.5px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:6px;letter-spacing:0.1em;color:rgba(255,255,255,0.2);font-family:'DM Mono',monospace;">Santa Rosa Marathon · Aug 23, 2026</div>
          <div style="font-size:6px;letter-spacing:0.06em;color:rgba(255,255,255,0.15);font-family:'DM Mono',monospace;">training.edgarmolina.com</div>
        </div>
      </div>
    </div>`;
  }

  if(style===6){
    // ── Full card — transparent background, white text overlay ──
    const mHTML = metrics.slice(0,4).map(m=>`
      <div style="padding:4px 8px;border-radius:4px;border:0.5px solid rgba(255,255,255,0.25);">
        <div style="font-size:5px;letter-spacing:0.12em;color:rgba(255,255,255,0.5);text-transform:uppercase;font-family:'DM Mono',monospace;margin-bottom:1px;">${m.k}</div>
        <div style="font-family:'Instrument Serif',serif;font-style:italic;font-size:14px;color:#fff;line-height:1.15;">${m.v}</div>
      </div>`).join('');
    const rx = Math.round(W*0.04), ry = Math.round(H*0.33), rw = Math.round(W*0.92), rh = Math.round(H*0.45);
    return `<div style="width:${W}px;height:${H}px;position:relative;overflow:hidden;display:flex;flex-direction:column;background:transparent;">
      <canvas class="share-preview-route" width="${rw}" height="${rh}" style="position:absolute;left:${rx}px;top:${ry}px;width:${rw}px;height:${rh}px;"></canvas>
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent 0%,#C84B2F 40%,#C84B2F 60%,transparent 100%);"></div>
      <div style="position:relative;z-index:1;display:flex;flex-direction:column;height:100%;padding:28px 28px 20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <div style="font-size:6.5px;letter-spacing:0.18em;color:rgba(255,255,255,0.6);font-family:'DM Mono',monospace;text-transform:uppercase;">Edgar Molina Training Hub</div>
          <div style="font-size:7px;letter-spacing:0.1em;color:#C84B2F;font-family:'DM Mono',monospace;text-transform:uppercase;">${emoji} ${typeLabel}</div>
        </div>
        <div style="font-size:8px;color:rgba(255,255,255,0.55);font-family:'DM Mono',monospace;margin-bottom:4px;">${dateStr}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.85);font-family:'DM Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${d.title}</div>
        <div style="height:0.5px;background:rgba(255,255,255,0.25);margin:14px 0 16px;"></div>
        <div>
          <div style="font-size:8px;letter-spacing:0.16em;color:rgba(255,255,255,0.55);font-family:'DM Mono',monospace;margin-bottom:6px;">${headlineLabel}</div>
          <div style="font-family:'Instrument Serif',serif;font-style:italic;font-size:48px;color:#fff;line-height:0.88;margin-bottom:8px;">${headline}</div>
          <div style="font-size:9px;color:rgba(255,255,255,0.55);font-family:'DM Mono',monospace;letter-spacing:0.08em;">${time||''}</div>
        </div>
        <div style="flex:1;"></div>
        <div style="height:0.5px;background:rgba(255,255,255,0.25);margin-bottom:8px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px;">${mHTML}</div>
        <div style="padding-top:8px;border-top:0.5px solid rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:6px;letter-spacing:0.1em;color:rgba(255,255,255,0.45);font-family:'DM Mono',monospace;">Santa Rosa Marathon · Aug 23, 2026</div>
          <div style="font-size:6px;letter-spacing:0.06em;color:rgba(255,255,255,0.35);font-family:'DM Mono',monospace;">training.edgarmolina.com</div>
        </div>
      </div>
    </div>`;
  }

  return '';
}

function openShareModal(type, activity){
  _shareType  = type;
  _shareActivity = activity || null;
  _shareStyle = 1;
  document.querySelectorAll('.share-style-btn').forEach((b,i)=>b.classList.toggle('active',i===0));
  const wrap = document.getElementById('shareCardWrap');
  if(wrap) wrap.innerHTML = buildShareCardHTML(type, 1);
  document.getElementById('shareModal').classList.add('open');
  // No-op for the default style 1 (no preview canvas emitted); kicks in if the
  // user switches to styles 5/6.
  window.paintSharePreviewRoute?.();
}

function closeShareModal(){
  document.getElementById('shareModal').classList.remove('open');
}

async function downloadShareCard(){
  const d = getShareData(_shareType);
  if(!d) return;
  const { r, isRun, emoji, typeLabel, dateStr, headline, headlineLabel, time, metrics } = d;

  const scale=3, W=360*scale, H=640*scale;
  const canvas=document.createElement('canvas');
  canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,W,H); // transparent background

  const mono=`${scale*7}px 'DM Mono',monospace`;
  const serif=(sz)=>`italic ${sz*scale}px 'Instrument Serif',serif`;

  function rr(x,y,w,h,r){
    ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
  }

  const brand1='EDGAR MOLINA TRAINING HUB';
  const brand2='training.edgarmolina.com';

  if(_shareStyle===1){
    // Bottom pill
    const PH=188*scale, PY=H-PH-24*scale, PX=28*scale, PW=W-56*scale;
    ctx.fillStyle='rgba(0,0,0,0.72)'; rr(PX,PY,PW,PH,18*scale); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.18)';ctx.lineWidth=scale*0.5; rr(PX,PY,PW,PH,18*scale); ctx.stroke();
    let cy=PY+22*scale;
    ctx.textBaseline='top';
    ctx.fillStyle='#C84B2F';ctx.font=`500 ${7*scale}px 'DM Mono',monospace`;ctx.textAlign='left';
    ctx.fillText((emoji+' '+typeLabel).toUpperCase(),PX+20*scale,cy);
    ctx.fillStyle='rgba(255,255,255,0.6)';ctx.font=mono;ctx.textAlign='right';
    ctx.fillText(dateStr,PX+PW-20*scale,cy); cy+=22*scale;
    ctx.fillStyle='#fff';ctx.font=serif(34);ctx.textAlign='left';
    ctx.fillText(headline,PX+20*scale,cy); cy+=48*scale;
    // metric dividers
    const mW=Math.floor((PW-40*scale)/metrics.slice(0,4).length);
    metrics.slice(0,4).forEach((m,i)=>{
      const mx=PX+20*scale+i*mW;
      if(i>0){ctx.strokeStyle='rgba(255,255,255,0.22)';ctx.lineWidth=scale*0.5;ctx.beginPath();ctx.moveTo(mx,cy-2*scale);ctx.lineTo(mx,cy+28*scale);ctx.stroke();}
      ctx.fillStyle='rgba(255,255,255,0.55)';ctx.font=`${5.5*scale}px 'DM Mono',monospace`;ctx.textAlign='center';
      ctx.fillText(m.k,mx+mW/2,cy);
      ctx.fillStyle='rgba(255,255,255,0.9)';ctx.font=serif(13);
      ctx.fillText(m.v,mx+mW/2,cy+10*scale);
    });
    cy+=38*scale;
    ctx.strokeStyle='rgba(255,255,255,0.2)';ctx.lineWidth=scale*0.5;ctx.beginPath();ctx.moveTo(PX+20*scale,cy);ctx.lineTo(PX+PW-20*scale,cy);ctx.stroke();
    cy+=10*scale;
    ctx.fillStyle='rgba(255,255,255,0.22)';ctx.font=`${6*scale}px 'DM Mono',monospace`;ctx.textAlign='left';ctx.fillText(brand1,PX+20*scale,cy);
    ctx.textAlign='right';ctx.fillStyle='rgba(255,255,255,0.18)';ctx.fillText(brand2,PX+PW-20*scale,cy);
  }

  if(_shareStyle===2){
    // Corner tag — width 66% of canvas, auto height based on content
    const TX=28*scale, TY=28*scale;
    const TW=Math.round(W*0.66);
    const innerPx=18*scale;
    ctx.textBaseline='top';

    // measure content height first
    let cy=TY+20*scale;
    cy+=16*scale; // type label
    cy+=20*scale; // date
    cy+=44*scale; // headline
    if(time) cy+=18*scale;
    cy+=metrics.slice(0,4).length*16*scale+10*scale; // metrics
    cy+=10*scale+10*scale; // footer divider + brand
    cy+=14*scale; // bottom padding
    const TH=cy-TY;

    ctx.fillStyle='rgba(0,0,0,0.75)'; rr(TX,TY,TW,TH,14*scale); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.18)';ctx.lineWidth=scale*0.5; rr(TX,TY,TW,TH,14*scale); ctx.stroke();

    // redraw content at correct positions
    cy=TY+20*scale;
    ctx.fillStyle='#C84B2F';ctx.font=`500 ${6.5*scale}px 'DM Mono',monospace`;ctx.textAlign='left';
    ctx.fillText((emoji+' '+typeLabel).toUpperCase(),TX+innerPx,cy); cy+=16*scale;
    ctx.fillStyle='rgba(255,255,255,0.6)';ctx.font=`${7*scale}px 'DM Mono',monospace`;
    ctx.fillText(dateStr,TX+innerPx,cy); cy+=20*scale;
    ctx.fillStyle='#fff';ctx.font=serif(36);ctx.fillText(headline,TX+innerPx,cy); cy+=44*scale;
    if(time){ctx.fillStyle='rgba(255,255,255,0.55)';ctx.font=`${6.5*scale}px 'DM Mono',monospace`;ctx.fillText(time,TX+innerPx,cy);cy+=18*scale;}
    metrics.slice(0,4).forEach(m=>{
      ctx.strokeStyle='rgba(255,255,255,0.18)';ctx.lineWidth=scale*0.5;
      ctx.beginPath();ctx.moveTo(TX+innerPx,cy+13*scale);ctx.lineTo(TX+TW-innerPx,cy+13*scale);ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,0.55)';ctx.font=`${5.5*scale}px 'DM Mono',monospace`;ctx.textAlign='left';ctx.fillText(m.k,TX+innerPx,cy);
      ctx.fillStyle='#fff';ctx.font=serif(12);ctx.textAlign='right';ctx.fillText(m.v,TX+TW-innerPx,cy);
      cy+=16*scale;
    });
    cy+=10*scale;
    ctx.strokeStyle='rgba(255,255,255,0.2)';ctx.lineWidth=scale*0.5;
    ctx.beginPath();ctx.moveTo(TX+innerPx,cy);ctx.lineTo(TX+TW-innerPx,cy);ctx.stroke(); cy+=10*scale;
    ctx.fillStyle='rgba(255,255,255,0.22)';ctx.font=`${6*scale}px 'DM Mono',monospace`;ctx.textAlign='left';ctx.fillText(brand1,TX+innerPx,cy);
    ctx.textAlign='right';ctx.fillStyle='rgba(255,255,255,0.18)';ctx.fillText(brand2,TX+TW-innerPx,cy);
  }

  if(_shareStyle===3){
    // Left stripe — transparent background, stripe fills left 38% of canvas
    const SW=Math.round(W*0.38);
    ctx.fillStyle='rgba(0,0,0,0.75)';ctx.fillRect(0,0,SW,H);
    ctx.strokeStyle='rgba(255,255,255,0.18)';ctx.lineWidth=scale*0.5;
    ctx.beginPath();ctx.moveTo(SW,0);ctx.lineTo(SW,H);ctx.stroke();
    const px=22*scale; let cy=40*scale;
    ctx.textBaseline='top';
    // accent bar
    ctx.fillStyle='#C84B2F';ctx.fillRect(px,cy,16*scale,2*scale); cy+=18*scale;
    // type label
    ctx.fillStyle='rgba(255,255,255,0.65)';ctx.font=`${6*scale}px 'DM Mono',monospace`;ctx.textAlign='left';
    ctx.fillText((emoji+' '+typeLabel).toUpperCase(),px,cy); cy+=20*scale;
    // headline
    ctx.fillStyle='#fff';ctx.font=serif(30);ctx.fillText(headline,px,cy); cy+=42*scale;
    ctx.fillStyle='rgba(255,255,255,0.55)';ctx.font=`${6.5*scale}px 'DM Mono',monospace`;
    ctx.fillText(headlineLabel,px,cy); cy+=36*scale;
    // metrics
    metrics.slice(0,3).forEach(m=>{
      ctx.fillStyle='rgba(255,255,255,0.55)';ctx.font=`${5.5*scale}px 'DM Mono',monospace`;ctx.fillText(m.k,px,cy);cy+=12*scale;
      ctx.fillStyle='#fff';ctx.font=serif(14);ctx.fillText(m.v,px,cy);cy+=24*scale;
    });
    // branding at bottom
    const brandY=H-44*scale;
    ctx.fillStyle='rgba(255,255,255,0.5)';ctx.font=`${5.5*scale}px 'DM Mono',monospace`;
    ctx.fillText(dateStr,px,brandY);
    ctx.fillStyle='rgba(255,255,255,0.4)';ctx.font=`${5*scale}px 'DM Mono',monospace`;
    ctx.fillText(brand1,px,brandY+14*scale);
    ctx.fillStyle='rgba(255,255,255,0.3)';
    ctx.fillText(brand2,px,brandY+26*scale);
  }

  if(_shareStyle===4){
    // Top bar + floating card
    const BH=52*scale;
    ctx.fillStyle='rgba(0,0,0,0.72)';ctx.fillRect(0,0,W,BH);
    ctx.strokeStyle='rgba(255,255,255,0.18)';ctx.lineWidth=scale*0.5;ctx.beginPath();ctx.moveTo(0,BH);ctx.lineTo(W,BH);ctx.stroke();
    ctx.textBaseline='middle';
    ctx.fillStyle='#C84B2F';ctx.beginPath();ctx.arc(26*scale,BH/2,4*scale,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff';ctx.font=serif(22);ctx.textAlign='left';ctx.fillText(headline,38*scale,BH/2-2*scale);
    ctx.strokeStyle='rgba(255,255,255,0.15)';ctx.lineWidth=scale*0.5;
    const dx=38*scale+ctx.measureText(headline).width+14*scale;
    ctx.beginPath();ctx.moveTo(dx,BH/2-10*scale);ctx.lineTo(dx,BH/2+10*scale);ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,0.7)';ctx.font=`${6*scale}px 'DM Mono',monospace`;ctx.textBaseline='top';
    ctx.fillText((emoji+' '+typeLabel).toUpperCase(),dx+12*scale,BH/2-10*scale);
    ctx.fillStyle='rgba(255,255,255,0.55)';ctx.fillText(dateStr,dx+12*scale,BH/2);
    // floating card
    const CX=28*scale,CY=BH+22*scale,CW=W-56*scale,CH=148*scale;
    ctx.fillStyle='rgba(0,0,0,0.72)'; rr(CX,CY,CW,CH,14*scale); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.18)';ctx.lineWidth=scale*0.5; rr(CX,CY,CW,CH,14*scale); ctx.stroke();
    const mW2=CW/2-16*scale;
    ctx.textBaseline='top';
    metrics.slice(0,4).forEach((m,i)=>{
      const col=i%2,row=Math.floor(i/2);
      const mx=CX+18*scale+col*(mW2+12*scale),my=CY+16*scale+row*50*scale;
      ctx.fillStyle='rgba(255,255,255,0.55)';ctx.font=`${5.5*scale}px 'DM Mono',monospace`;ctx.textAlign='left';ctx.fillText(m.k,mx,my);
      ctx.fillStyle='#fff';ctx.font=serif(15);ctx.fillText(m.v,mx,my+10*scale);
    });
    const brandY=CY+CH-22*scale;
    ctx.strokeStyle='rgba(255,255,255,0.2)';ctx.lineWidth=scale*0.5;ctx.beginPath();ctx.moveTo(CX+18*scale,brandY-6*scale);ctx.lineTo(CX+CW-18*scale,brandY-6*scale);ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,0.22)';ctx.font=`${6*scale}px 'DM Mono',monospace`;ctx.textAlign='left';ctx.fillText(brand1,CX+18*scale,brandY);
    ctx.textAlign='right';ctx.fillStyle='rgba(255,255,255,0.18)';ctx.fillText(brand2,CX+CW-18*scale,brandY);
  }

  if(_shareStyle===5){
    // Full card — dark background
    const bg=ctx.createLinearGradient(0,0,W*0.6,H);
    bg.addColorStop(0,'#1a1714');bg.addColorStop(0.55,'#0d0c0a');bg.addColorStop(1,'#17120e');
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    // grid
    ctx.strokeStyle='rgba(255,255,255,0.018)';ctx.lineWidth=0.5;
    for(let x=0;x<W;x+=30*scale){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=30*scale){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    // coral accent top
    const acc=ctx.createLinearGradient(0,0,W,0);
    acc.addColorStop(0,'transparent');acc.addColorStop(0.4,'#C84B2F');acc.addColorStop(0.6,'#C84B2F');acc.addColorStop(1,'transparent');
    ctx.fillStyle=acc;ctx.fillRect(0,0,W,2*scale);
    ctx.textBaseline='top';
    const px=28*scale;

    // ── Header (top) ──
    let cy=28*scale;
    ctx.fillStyle='rgba(255,255,255,0.28)';ctx.font=`${6.5*scale}px 'DM Mono',monospace`;ctx.textAlign='left';
    ctx.fillText('EDGAR MOLINA TRAINING HUB',px,cy);
    ctx.fillStyle='#C84B2F';ctx.font=`${7*scale}px 'DM Mono',monospace`;ctx.textAlign='right';
    ctx.fillText((emoji+' '+typeLabel).toUpperCase(),W-px,cy); cy+=18*scale;
    ctx.fillStyle='rgba(255,255,255,0.38)';ctx.font=`${8*scale}px 'DM Mono',monospace`;ctx.textAlign='left';
    ctx.fillText(dateStr,px,cy); cy+=14*scale;
    ctx.fillStyle='rgba(255,255,255,0.65)';ctx.font=`${10*scale}px 'DM Mono',monospace`;
    ctx.fillText(d.title.slice(0,42),px,cy); cy+=26*scale;
    // divider
    ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.lineWidth=scale*0.5;
    ctx.beginPath();ctx.moveTo(px,cy);ctx.lineTo(W-px,cy);ctx.stroke(); cy+=24*scale;

    // ── Headline (top third, 20% smaller than before: 60→48) ──
    ctx.fillStyle='rgba(255,255,255,0.35)';ctx.font=`${8*scale}px 'DM Mono',monospace`;
    ctx.fillText(headlineLabel,px,cy); cy+=14*scale;
    ctx.fillStyle='#fff';ctx.font=serif(48);ctx.fillText(headline,px,cy); cy+=60*scale;
    if(time){ctx.fillStyle='rgba(255,255,255,0.35)';ctx.font=`${9*scale}px 'DM Mono',monospace`;ctx.fillText(time,px,cy);}

    // ── Metrics (pushed to bottom) ──
    const mW2=(W-px*2-10*scale)/2;
    const mH2=36*scale; // tight — just label + value
    const mGap=5*scale;
    const gridH=2*(mH2+mGap);
    const footerH=32*scale;
    const metricsTop=H-footerH-gridH-20*scale;

    // divider above metrics
    ctx.strokeStyle='rgba(255,255,255,0.08)';ctx.lineWidth=scale*0.5;
    ctx.beginPath();ctx.moveTo(px,metricsTop-10*scale);ctx.lineTo(W-px,metricsTop-10*scale);ctx.stroke();

    metrics.slice(0,4).forEach((m,i)=>{
      const col=i%2,row=Math.floor(i/2);
      const mx=px+col*(mW2+10*scale),my=metricsTop+row*(mH2+mGap);
      ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.lineWidth=scale*0.5;rr(mx,my,mW2,mH2,4*scale);ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,0.28)';ctx.font=`${5*scale}px 'DM Mono',monospace`;ctx.textAlign='left';
      ctx.fillText(m.k,mx+8*scale,my+6*scale);
      ctx.fillStyle='#fff';ctx.font=serif(14);ctx.fillText(m.v,mx+8*scale,my+14*scale);
    });

    // ── Footer branding ──
    const brandY=H-18*scale;
    ctx.strokeStyle='rgba(255,255,255,0.08)';ctx.lineWidth=scale*0.5;
    ctx.beginPath();ctx.moveTo(px,brandY-8*scale);ctx.lineTo(W-px,brandY-8*scale);ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,0.2)';ctx.font=`${6*scale}px 'DM Mono',monospace`;ctx.textAlign='left';
    ctx.fillText('Santa Rosa Marathon · Aug 23, 2026',px,brandY);
    ctx.textAlign='right';ctx.fillStyle='rgba(255,255,255,0.15)';
    ctx.fillText('training.edgarmolina.com',W-px,brandY);
  } // end style 5

  if(_shareStyle===6){
    // Full card — transparent background (no ctx.fillRect background)
    // coral accent top
    const acc=ctx.createLinearGradient(0,0,W,0);
    acc.addColorStop(0,'transparent');acc.addColorStop(0.4,'#C84B2F');acc.addColorStop(0.6,'#C84B2F');acc.addColorStop(1,'transparent');
    ctx.fillStyle=acc;ctx.fillRect(0,0,W,2*scale);
    ctx.textBaseline='top';
    const px=28*scale;

    // ── Header ──
    let cy=28*scale;
    ctx.fillStyle='rgba(255,255,255,0.6)';ctx.font=`${6.5*scale}px 'DM Mono',monospace`;ctx.textAlign='left';
    ctx.fillText('EDGAR MOLINA TRAINING HUB',px,cy);
    ctx.fillStyle='#C84B2F';ctx.font=`${7*scale}px 'DM Mono',monospace`;ctx.textAlign='right';
    ctx.fillText((emoji+' '+typeLabel).toUpperCase(),W-px,cy); cy+=18*scale;
    ctx.fillStyle='rgba(255,255,255,0.55)';ctx.font=`${8*scale}px 'DM Mono',monospace`;ctx.textAlign='left';
    ctx.fillText(dateStr,px,cy); cy+=14*scale;
    ctx.fillStyle='rgba(255,255,255,0.85)';ctx.font=`${10*scale}px 'DM Mono',monospace`;
    ctx.fillText(d.title.slice(0,42),px,cy); cy+=26*scale;
    // divider
    ctx.strokeStyle='rgba(255,255,255,0.25)';ctx.lineWidth=scale*0.5;
    ctx.beginPath();ctx.moveTo(px,cy);ctx.lineTo(W-px,cy);ctx.stroke(); cy+=24*scale;

    // ── Headline ──
    ctx.fillStyle='rgba(255,255,255,0.55)';ctx.font=`${8*scale}px 'DM Mono',monospace`;
    ctx.fillText(headlineLabel,px,cy); cy+=14*scale;
    ctx.fillStyle='#fff';ctx.font=serif(48);ctx.fillText(headline,px,cy); cy+=60*scale;
    if(time){ctx.fillStyle='rgba(255,255,255,0.55)';ctx.font=`${9*scale}px 'DM Mono',monospace`;ctx.fillText(time,px,cy);}

    // ── Metrics at bottom ──
    const mW2=(W-px*2-10*scale)/2;
    const mH2=36*scale;
    const mGap=5*scale;
    const gridH=2*(mH2+mGap);
    const footerH=32*scale;
    const metricsTop=H-footerH-gridH-20*scale;

    ctx.strokeStyle='rgba(255,255,255,0.25)';ctx.lineWidth=scale*0.5;
    ctx.beginPath();ctx.moveTo(px,metricsTop-10*scale);ctx.lineTo(W-px,metricsTop-10*scale);ctx.stroke();

    metrics.slice(0,4).forEach((m,i)=>{
      const col=i%2,row=Math.floor(i/2);
      const mx=px+col*(mW2+10*scale),my=metricsTop+row*(mH2+mGap);
      ctx.strokeStyle='rgba(255,255,255,0.25)';ctx.lineWidth=scale*0.5;rr(mx,my,mW2,mH2,4*scale);ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,0.5)';ctx.font=`${5*scale}px 'DM Mono',monospace`;ctx.textAlign='left';
      ctx.fillText(m.k,mx+8*scale,my+6*scale);
      ctx.fillStyle='#fff';ctx.font=serif(14);ctx.fillText(m.v,mx+8*scale,my+14*scale);
    });

    // ── Footer ──
    const brandY=H-18*scale;
    ctx.strokeStyle='rgba(255,255,255,0.25)';ctx.lineWidth=scale*0.5;
    ctx.beginPath();ctx.moveTo(px,brandY-8*scale);ctx.lineTo(W-px,brandY-8*scale);ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,0.45)';ctx.font=`${6*scale}px 'DM Mono',monospace`;ctx.textAlign='left';
    ctx.fillText('Santa Rosa Marathon · Aug 23, 2026',px,brandY);
    ctx.textAlign='right';ctx.fillStyle='rgba(255,255,255,0.35)';
    ctx.fillText('training.edgarmolina.com',W-px,brandY);
  } // end style 6

  const filename=`emth-${_shareType}-${new Date(r.Date||r.date).toISOString().slice(0,10)}-style${_shareStyle}.png`;
  canvas.toBlob(async blob=>{
    // iOS Safari: use Web Share API → user gets "Save Image" → goes to Photos
    // Desktop: fall back to direct download
    if(navigator.share && navigator.canShare && /iphone|ipad|ipod/i.test(navigator.userAgent)){
      try{
        const file = new File([blob], filename, {type:'image/png'});
        if(navigator.canShare({files:[file]})){
          await navigator.share({files:[file], title:'Training activity'});
          return;
        }
      } catch(e){
        // user cancelled or share failed — fall through to download
        if(e.name==='AbortError') return;
      }
    }
    // Desktop / fallback: standard download
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.download=filename;
    link.href=url;
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  },'image/png');
}

async function copyShareCard(){ downloadShareCard(); }





function renderRacePredictor() {
  const elId = analyticsPage === 'running' ? 'racePredictorRun' : 'racePredictor';
  const el = document.getElementById(elId);
  if(!el) return;

  if(analyticsPage === 'cycling') { el.innerHTML=''; return; }

  const races = analyticsRuns.filter(r => r.is_race && r.pace_sec && r.Distance > 0)
    .sort((a,b) => new Date(a.Date||a.date) - new Date(b.Date||b.date));

  if(!races.length) { el.innerHTML=''; return; }

  const flatRaces = races.filter(r => !HILLY_RACES.some(k => (r.Title||'').toLowerCase().includes(k)));
  const bestPredictor = flatRaces.length ? flatRaces[flatRaces.length-1] : races[races.length-1];
  const bestMarathonSec = riegelProject(bestPredictor.pace_sec * bestPredictor.Distance, bestPredictor.Distance, 26.219);
  const bestPaceSec = bestMarathonSec / 26.219;
  const isHilly = r => HILLY_RACES.some(k => (r.Title||'').toLowerCase().includes(k));
  const isOpen = el.dataset.open === '1';

  const cardsHTML = races.map(r => {
    const isBest = r === bestPredictor;
    const totalSec = r.pace_sec * r.Distance;
    const projs = RACE_TARGETS.map(t => {
      const proj = riegelProject(totalSec, r.Distance, t.dist);
      const paceSec = proj / t.dist;
      return `<div class="race-card-proj">
        <div class="proj-dist">${t.label}</div>
        <div class="proj-time">${fmtRaceTime(proj)}</div>
        <div class="proj-pace">${secToMin(Math.round(paceSec))}/mi</div>
      </div>`;
    }).join('');
    const flag = isHilly(r) ? '<div class="race-card-flag">⚠ hilly course · projections adjusted</div>' : '';
    return `<div class="race-card${isBest?' best':''}">
      <div class="race-card-date">${fmtDate(r.Date||r.date)}</div>
      <div class="race-card-name">${(r.Title||'Race').replace(/Humboldt County - |2025 Brentwood |Brazen /gi,'').slice(0,40)}</div>
      <div class="race-card-result">${r.Distance.toFixed(1)}mi · ${secToMin(r.pace_sec)}/mi · ${fmtRaceTime(r.pace_sec*r.Distance)}</div>
      <div class="race-card-projs">${projs}</div>
      ${flag}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="snapshot-toggle" data-action="toggle-race-predictor">
      <span class="snapshot-toggle-label">Race predictor · ${races.length} races</span>
      <div class="snapshot-toggle-summary">
        <span class="snapshot-toggle-item" style="color:var(--text2)">${fmtRaceTime(bestMarathonSec)} / ${secToMin(Math.round(bestPaceSec))}/mi</span>
        <span class="snapshot-toggle-item"><span>Santa Rosa · Aug 23, 2026</span></span>
        <span class="snapshot-toggle-item" style="color:${bestMarathonSec<14700?'#2D7A5A':'#C84B2F'}">${bestMarathonSec<14700?'✓ On track for sub-4:05':'⚠ Over goal'}</span>
        <span class="snapshot-toggle-item"><span>via ${(bestPredictor.Title||'').replace(/Humboldt County - /,'').replace(/Oakley - W\d+ \w+ \w+ - /,'').slice(0,30)}</span></span>
      </div>
      <span class="snapshot-toggle-chevron" id="racePredictorHint">${isOpen?'▲ collapse':'▼ expand'}</span>
    </div>
    <div style="display:${isOpen?'block':'none'};padding:14px 40px;background:var(--surface);border-bottom:1px solid var(--border);">
      <div class="race-cards">${cardsHTML}</div>
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--surface2);border-radius:6px;border:1px solid var(--border);flex-wrap:wrap;margin-top:2px;">
        <div>
          <div class="consensus-label">Best predictor · Santa Rosa projection</div>
          <div style="font-size:11px;font-family:var(--mono);color:var(--text2);">${(bestPredictor.Title||'').replace(/Humboldt County - /,'').replace(/Oakley - W\d+ \w+ \w+ - /,'').slice(0,35)} · ${bestPredictor.Distance.toFixed(1)}mi at ${secToMin(bestPredictor.pace_sec)}/mi</div>
        </div>
        <div style="margin-left:auto;font-size:11px;font-family:var(--mono);color:${bestMarathonSec<14700?'#2D7A5A':'#C84B2F'};">${bestMarathonSec<14700?'✓ On track for sub-4:05':'⚠ '+Math.round((bestMarathonSec-14700)/60)+' min over goal'} · Goal: 3:58–4:05</div>
      </div>
    </div>`;
}

function toggleSnapshot(id){
  const el=document.getElementById(id);
  if(!el)return;
  el.dataset.open=el.dataset.open==='1'?'0':'1';
  if(id==='lastRunSnapshot') renderLastRunSnapshot();
  else if(id==='lastRideSnapshot') renderLastRideSnapshot();
}

function toggleRacePredictor() {
  const elId = analyticsPage === 'running' ? 'racePredictorRun' : 'racePredictor';
  const el = document.getElementById(elId);
  if(!el) return;
  el.dataset.open = el.dataset.open === '1' ? '0' : '1';
  renderRacePredictor();
  const hint = document.getElementById('racePredictorHint');
  if(hint) hint.textContent = el.dataset.open === '1' ? '▲ collapse' : '▼ see all races';
}

function fmtSyncTime(){
  const now=new Date();
  return now.toLocaleTimeString('en',{hour:'numeric',minute:'2-digit',hour12:true}).toLowerCase();
}

// ── Phase mileage config (planned miles per phase) ──
const PHASE_CONFIG = [
  { id:'rehab',   name:'Phase 1 — Rehab',   weeks:[1,2],       color:'#c84b2f', plannedMiles:51  },
  { id:'rebuild', name:'Phase 2 — Rebuild',  weeks:[3,4,5,6],   color:'#b85c00', plannedMiles:114 },
  { id:'build',   name:'Phase 3 — Build',    weeks:[7,8,9,10],  color:'#185FA5', plannedMiles:145 },
  { id:'peak',    name:'Phase 4 — Peak',     weeks:[11,12],     color:'#2d6a4f', plannedMiles:80  },
  { id:'taper',   name:'Phase 5 — Taper',    weeks:[13,14,15],  color:'#534AB7', plannedMiles:59  },
];
const TOTAL_PLANNED_MILES = PHASE_CONFIG.reduce((s,p)=>s+p.plannedMiles,0); // 449

function renderProgress() {
  const el = document.getElementById('progressSection');
  if(!el) return;

  const today = todayLocal();

  // Calculate actual miles per phase from Garmin run data
  // Match runs to plan weeks by date
  const phaseActuals = PHASE_CONFIG.map(phase => {
    let actual = 0;
    phase.weeks.forEach(weekNum => {
      const weekStart = WEEK_START_DATES[weekNum];
      const weekEnd   = addDays(weekStart, 7);
      analyticsRuns.forEach(r => {
        const d = (r.Date||r.date||'').slice(0,10);
        if(d >= weekStart && d < weekEnd) actual += (r.Distance||r.distance||0);
      });
    });
    return { id:phase.id, name:phase.name, weeks:phase.weeks, color:phase.color, plannedMiles:phase.plannedMiles, actual: Math.round(actual*10)/10 };
  });

  const totalActual = phaseActuals.reduce((s,p)=>s+p.actual,0);
  const totalPct    = Math.min(100, Math.round((totalActual/TOTAL_PLANNED_MILES)*100));

  // Determine current phase
  const currentWeek = Object.entries(WEEK_START_DATES).find(([num, date]) => {
    const end = addDays(date, 7);
    return today >= date && today < end;
  });
  const currentWeekNum = currentWeek ? parseInt(currentWeek[0]) : 0;
  const currentPhaseId = PHASE_CONFIG.find(p=>p.weeks.includes(currentWeekNum))?.id;

  // Phase status: done / active / upcoming
  let passedCurrent = false;
  const phases = phaseActuals.map(p => {
    const isDone   = !p.weeks.includes(currentWeekNum) && !passedCurrent;
    const isActive = p.id === currentPhaseId;
    if(isActive) passedCurrent = true;
    return { id:p.id, name:p.name, weeks:p.weeks, color:p.color, plannedMiles:p.plannedMiles, actual:p.actual, isDone, isActive };
  });

  const remaining = Math.max(0, TOTAL_PLANNED_MILES - totalActual).toFixed(1);
  const weekLabel  = currentWeekNum ? `Week ${currentWeekNum} of 15` : 'Plan complete';

  el.innerHTML = `
    <div class="progress-section">
      <div class="progress-header">
        <span class="progress-title">Training mileage progress</span>
        <span class="progress-summary"><strong>${totalActual.toFixed(1)}</strong> of <strong>${TOTAL_PLANNED_MILES}</strong> planned miles · <strong>${remaining} mi</strong> to race day</span>
      </div>
      <div class="progress-overall">
        <div class="progress-overall-num">${totalPct}%</div>
        <div class="progress-overall-detail">
          <div class="progress-overall-label">Overall · ${weekLabel}</div>
          <div class="progress-overall-sub">${totalActual.toFixed(1)} mi completed · ${TOTAL_PLANNED_MILES} mi total plan</div>
          <div class="progress-overall-bar-wrap"><div class="progress-overall-bar" style="width:${totalPct}%"></div></div>
        </div>
      </div>
      <div class="progress-phases">
        ${phases.map(p => {
          const pct   = Math.min(100, Math.round((p.actual/p.plannedMiles)*100));
          const cls   = p.isActive ? 'active-phase' : p.isDone ? 'done-phase' : '';
          const label = p.isActive ? '▶ Current' : p.isDone ? '✓ Done' : 'Upcoming';
          const barColor = p.isActive ? p.color : p.isDone ? '#2d6a4f' : '#d0ccc5';
          return `<div class="progress-phase ${cls}">
            <div class="progress-phase-name">${p.name.split('—')[1]?.trim()||p.name}</div>
            <div class="progress-phase-stats"><strong>${p.actual.toFixed(1)}</strong> / ${p.plannedMiles} mi</div>
            <div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct}%;background:${barColor}"></div></div>
            <div class="progress-phase-pct">${pct}% · ${label}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}


// ════════════════════════════════════════
// ANALYTICS DATA + RENDER
// ════════════════════════════════════════
// Loaded from runs.json at bootstrap (see loadBuiltinData below)
let BUILTIN_RUNS = [];
// Loaded from cycles.json at bootstrap
let BUILTIN_CYCLES = [];

function applyFilters(){
  // "Last N days" measured from real now (was hardcoded to 2026-05-11
  // during the rehab block — that anchor would drift further off over time).
  const now = new Date();
  const inRange = r => {
    if(activeRangeFilter==='all') return true;
    const days=parseInt(activeRangeFilter);
    return (now - new Date(r.Date||r.date)) / 86400000 <= days;
  };

  // Filter runs
  filteredRuns = analyticsRuns.filter(r => {
    if(!inRange(r)) return false;
    if(activeRunSub==='all') return true;
    return getRunType(r) === activeRunSub;
  });

  // Filter cycles
  filteredCycles = analyticsCycles.filter(r => {
    if(!inRange(r)) return false;
    if(activeCycleSub==='all') return true;
    const t=(r.ActivityType||'').toLowerCase();
    if(activeCycleSub==='virtual') return t.includes('virtual');
    if(activeCycleSub==='road') return t.includes('road');
    if(activeCycleSub==='indoor') return t.includes('indoor');
    return true;
  });

  updateChartVisibility();
  renderAnalytics();
  // Section KPIs depend on filteredRuns/filteredCycles — refresh them too.
  if (typeof updateSectionKPIs === 'function') updateSectionKPIs();
}

function updateChartVisibility(){
  document.querySelectorAll('[data-show]').forEach(card => {
    const shows = card.dataset.show.split(' ');
    card.classList.toggle('hidden', !shows.includes(activeView));
  });
  // Re-layout grid — full-width cards that are hidden shouldn't leave gaps
  document.querySelectorAll('.charts-grid').forEach(grid => {
    grid.style.display = [...grid.querySelectorAll('.chart-card:not(.hidden)')].length ? 'grid' : 'none';
  });
}

// ════════════════════════════════════════
// ANALYTICS PAGE SWITCHING
// ════════════════════════════════════════
let analyticsPage = 'overview';

// ════════════════════════════════════════
// COLLAPSIBLE ANALYTICS SECTIONS
// ════════════════════════════════════════
// Default open/closed for each section (false = closed). User toggles persist
// to localStorage so they don't have to re-collapse on every visit.
const SECTION_DEFAULTS = {
  'run-pace-volume': true,
  'run-cardio':      true,
  'run-form':        false,  // diagnostic — hidden until needed
  'run-prs':         true,
  'cyc-pace-volume': true,
  'cyc-power':       true,
  'cyc-cardio':      true,
  'cyc-prs':         true,
};

function _sectionStorageKey(key) { return 'emt:section:' + key; }

function isSectionOpen(key) {
  let saved = null;
  try { saved = localStorage.getItem(_sectionStorageKey(key)); } catch {}
  if (saved === '1') return true;
  if (saved === '0') return false;
  return !!SECTION_DEFAULTS[key];
}

function toggleSection(key, headerEl) {
  const body = document.getElementById('an-body-' + key);
  if (!body || !headerEl) return;
  const willCollapse = !headerEl.classList.contains('collapsed');
  headerEl.classList.toggle('collapsed', willCollapse);
  body.classList.toggle('collapsed', willCollapse);
  try { localStorage.setItem(_sectionStorageKey(key), willCollapse ? '0' : '1'); } catch {}
  // If we just expanded a section, charts inside it may need to (re)render —
  // they were skipped earlier or sized to 0 while hidden. renderAnalytics is
  // idempotent (destroys + recreates).
  if (!willCollapse && typeof renderAnalytics === 'function' && typeof Chart !== 'undefined') {
    renderAnalytics();
  }
}

function applySectionStates() {
  Object.keys(SECTION_DEFAULTS).forEach(key => {
    const header = document.querySelector(`[data-section-key="${key}"]`);
    const body   = document.getElementById('an-body-' + key);
    if (!header || !body) return;
    const open = isSectionOpen(key);
    header.classList.toggle('collapsed', !open);
    body.classList.toggle('collapsed', !open);
  });
}

// ── KPI summaries shown inline when a section is collapsed ─────────────
// Each function returns a short string like "9:32/mi · 152 bpm · 762 mi"
// suitable for an at-a-glance summary in the section header.
function _fmtPace(sec) {
  if (!sec || sec <= 0) return '—';
  return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}/mi`;
}
function _fmtTime(sec) {
  if (!sec) return '—';
  const s = Math.round(sec), h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60;
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}` : `${m}:${String(ss).padStart(2,'0')}`;
}
function _latest(arr) {
  if (!arr || !arr.length) return null;
  return [...arr].sort((a,b)=> new Date(b.Date||b.date) - new Date(a.Date||a.date))[0];
}
function _sum(arr, fn) { return arr.reduce((s,x)=>s+(fn(x)||0), 0); }
function _avg(arr, fn) {
  const v = arr.map(fn).filter(x => x && x > 0);
  return v.length ? v.reduce((a,b)=>a+b, 0)/v.length : null;
}

function _runningKPIs() {
  const list = (typeof filteredRuns !== 'undefined' && filteredRuns?.length) ? filteredRuns : analyticsRuns || [];
  const r = _latest(list);
  return {
    'run-pace-volume': r
      ? `latest ${_fmtPace(r.pace_sec)} · ${(r.Distance||0).toFixed(2)} mi · ${list.length} runs`
      : 'no runs',
    'run-cardio':      r ? `latest avg HR ${r.hr || '—'} bpm` : '',
    'run-form':        r && r.cadence ? `cadence ${r.cadence} spm · left ${r.left_pct?.toFixed?.(1) || '—'}%` : 'click to expand',
    'run-prs':         'click to expand',
  };
}

function _cyclingKPIs() {
  const list = (typeof filteredCycles !== 'undefined' && filteredCycles?.length) ? filteredCycles : analyticsCycles || [];
  const r = _latest(list);
  return {
    'cyc-pace-volume': r
      ? `latest ${(r.avg_speed||0).toFixed(1)} mph · ${(r.Distance||0).toFixed(1)} mi · ${list.length} rides`
      : 'no rides',
    'cyc-power':       r && r.avg_power ? `latest avg ${r.avg_power}w · max ${r.max_power||'—'}w` : 'click to expand',
    'cyc-cardio':      r ? `latest avg HR ${r.hr || '—'} bpm` : '',
    'cyc-prs':         'click to expand',
  };
}

function updateSectionKPIs() {
  const all = { ..._runningKPIs(), ..._cyclingKPIs() };
  Object.entries(all).forEach(([key, text]) => {
    const el = document.getElementById('an-kpi-' + key);
    if (el) el.textContent = text;
  });
}

function setAnalyticsPage(page, btn) {
  analyticsPage = page;
  document.querySelectorAll('.anav').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');

  ['overview','running','cycling'].forEach(p=>{
    const el=document.getElementById('analyticsPage-'+p);
    if(el) el.style.display = p===page?'block':'none';
  });

  const subLabel=document.getElementById('subFilterLabel');
  const runSub=document.getElementById('runSubFilters');
  const cycSub=document.getElementById('cycleSubFilters');
  if(subLabel) subLabel.style.display = page==='overview'?'none':'inline';
  if(runSub)  runSub.style.display  = page==='running'?'flex':'none';
  if(cycSub)  cycSub.style.display  = page==='cycling'?'flex':'none';

  if(page==='running')      activeView='running';
  else if(page==='cycling') activeView='cycling';
  else                      activeView='all';

  // Masthead
  const title=document.getElementById('mastheadTitle');
  if(title){
    if(page==='running')      title.innerHTML='Running <span>Analytics</span>';
    else if(page==='cycling') title.innerHTML='Cycling <span>Analytics</span>';
    else                      title.innerHTML='Training <span>Analytics</span>';
  }

  applyFilters();
  renderRacePredictor();
  if(typeof Chart!=='undefined') renderAnalytics();

  // Best Efforts card (DB-backed, running + cycling pages only).
  // Defined in js/db.js — present whenever serve.py is up.
  if (page === 'running' && typeof renderBestEfforts === 'function') renderBestEfforts('Running');
  if (page === 'cycling' && typeof renderBestEfforts === 'function') renderBestEfforts('Cycling');

  // Collapsible section states (open/closed from localStorage) + KPI summaries.
  applySectionStates();
  updateSectionKPIs();
}

function setView(v, btn){
  activeView = v;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  applyFilters();
  renderRacePredictor();
}

function setRunSub(s, btn){
  activeRunSub = s;
  document.querySelectorAll('[data-run]').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}

function setCycleSub(s, btn){
  activeCycleSub = s;
  document.querySelectorAll('[data-cyc]').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}

// keep old name for range buttons
function setRunFilter(f,btn){} // no-op, replaced
function setRangeFilter(r,btn){activeRangeFilter=r;document.querySelectorAll('[data-range]').forEach(b=>b.classList.remove('active'));btn.classList.add('active');applyFilters();}


// renderStats defined below — view-aware version

// Pull chart neutrals from the CSS theme so the JS and CSS stay in sync.
// (Tooltip background stays dark intentionally — dark tooltips on a light page.)
const CHART_THEME = (() => {
  const cs = getComputedStyle(document.documentElement);
  const v  = (name, fb) => (cs.getPropertyValue(name) || '').trim() || fb;
  return {
    grid:      v('--border', '#e0dbd3'),  // axis gridlines
    tick:      v('--text3',  '#9e9890'),  // tick labels
    axisTitle: v('--text2',  '#6b6560'),  // axis titles
    empty:     v('--border', '#e0dbd3'),  // missing-data bar fill
  };
})();

const CD={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#141210',titleFont:{family:"'DM Mono',monospace",size:11},bodyFont:{family:"'DM Mono',monospace",size:11},padding:10,cornerRadius:4,displayColors:false}},scales:{x:{grid:{color:'rgba(0,0,0,0.05)'},ticks:{color:CHART_THEME.tick,font:{family:"'DM Mono',monospace",size:10}}},y:{grid:{color:'rgba(0,0,0,0.05)'},ticks:{color:CHART_THEME.tick,font:{family:"'DM Mono',monospace",size:10}}}}};
function dc(id, canvasEl){
  if(charts[id]){charts[id].destroy();delete charts[id];}
  // Restore canvas and clear any noData overlay from a previous empty state
  const el = canvasEl || document.getElementById(id+'Chart');
  if(el){
    el.style.display='';
    const overlay=el.parentElement?.querySelector('.chart-no-data');
    if(overlay) overlay.remove();
  }
}

function renderPaceChart(){
  dc('pace', document.getElementById('paceChart'));
  const sorted=[...filteredRuns].sort((a,b)=>new Date(a.Date||a.date)-new Date(b.Date||b.date));
  const paces=sorted.map(r=>r.pace_sec?+(r.pace_sec/60).toFixed(2):null);
  const colors=sorted.map(r=>{const dt=(r.Date||r.date||'').slice(0,10);if(ITB_FLARES.includes(dt))return'#c0392b';return typeColor(r);});
  const ptSz=sorted.map(r=>RACE_TITLES.some(k=>(r.Title||'').toLowerCase().includes(k))?8:ITB_FLARES.includes((r.Date||'').slice(0,10))?7:4);
  const smooth=paces.map((p,i,arr)=>{const w=arr.slice(Math.max(0,i-4),i+1).filter(x=>x!=null);return w.length?+(w.reduce((s,v)=>s+v,0)/w.length).toFixed(2):null;});
  charts['pace']=new Chart(document.getElementById('paceChart'),{type:'line',data:{labels:sorted.map(r=>fmtDate(r.Date||r.date)),datasets:[{data:paces,borderColor:'transparent',backgroundColor:colors,pointBackgroundColor:colors,pointRadius:ptSz,showLine:false,type:'scatter'},{data:smooth,borderColor:'#1D5FA0',borderWidth:1.5,borderDash:[4,3],pointRadius:0,fill:false,tension:0.4}]},options:{...CD,scales:{x:{...CD.scales.x,ticks:{...CD.scales.x.ticks,maxTicksLimit:10,maxRotation:40}},y:{...CD.scales.y,reverse:true,ticks:{...CD.scales.y.ticks,callback:v=>secToMin(Math.round(v*60))}}},plugins:{...CD.plugins,tooltip:{...CD.plugins.tooltip,callbacks:{title:ctx=>sorted[ctx[0].dataIndex]?.Title||'',label:ctx=>{const r=sorted[ctx.dataIndex];if(!r)return'';const lines=[`${secToMin(r.pace_sec)}/mi · ${(r.Distance||0).toFixed(2)} mi`];if(r.hr)lines.push(`HR ${r.hr} bpm`);if(ITB_FLARES.includes((r.Date||'').slice(0,10)))lines.push('⚠ IT band flare');return lines;}}}}}});
}

function renderHRPaceChart(){
  dc('hrpace', document.getElementById('hrPaceChart'));
  const data=filteredRuns.filter(r=>r.hr&&r.pace_sec&&(r.Distance||0)>=3);
  charts['hrpace']=new Chart(document.getElementById('hrPaceChart'),{
    type:'scatter',
    data:{datasets:[{data:data.map(r=>({x:+(r.pace_sec/60).toFixed(2),y:r.hr})),backgroundColor:data.map(r=>typeColor(r)+'99'),borderColor:data.map(r=>typeColor(r)),borderWidth:1,pointRadius:data.map(r=>Math.sqrt(r.Distance||1)*2.2)}]},
    options:{...CD,scales:{
      x:{...CD.scales.x,reverse:true,ticks:{...CD.scales.x.ticks,callback:v=>secToMin(Math.round(v*60))},title:{display:true,text:'Pace (min/mi)',color:'#9e9890',font:{family:"'DM Mono',monospace",size:10}}},
      y:{...CD.scales.y,title:{display:true,text:'Avg HR (bpm)',color:'#9e9890',font:{family:"'DM Mono',monospace",size:10}}}
    },plugins:{...CD.plugins,tooltip:{...CD.plugins.tooltip,callbacks:{label:ctx=>{
      const r=data[ctx.dataIndex];
      const z=getHRZone(r.hr);
      return[`${(r.Title||'Run').slice(0,30)}`,`${secToMin(r.pace_sec)}/mi · HR ${r.hr}${z?' · '+z.label+' '+z.name:''} · ${(r.Distance||0).toFixed(1)} mi`];
    }}}}},
    plugins:[{id:'zoneLines',afterDraw(chart){
      const {ctx,scales:{y}}=chart;
      HR_ZONES.forEach(z=>{
        const yLine=y.getPixelForValue(z.lo);
        if(yLine<chart.chartArea.top||yLine>chart.chartArea.bottom) return;
        ctx.save();
        ctx.strokeStyle=z.color+'55';
        ctx.setLineDash([3,3]);
        ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(chart.chartArea.left,yLine);ctx.lineTo(chart.chartArea.right,yLine);ctx.stroke();
        ctx.fillStyle=z.color;
        ctx.font="8px 'DM Mono',monospace";
        ctx.fillText(z.label,chart.chartArea.right+4,yLine+3);
        ctx.restore();
      });
    }}]
  });
}

function renderGCTChart(){
  dc('gct', document.getElementById('gctChart'));
  const sorted=[...filteredRuns].filter(r=>r.left_pct).sort((a,b)=>new Date(a.Date||a.date)-new Date(b.Date||b.date));
  charts['gct']=new Chart(document.getElementById('gctChart'),{type:'bar',data:{labels:sorted.map(r=>fmtDate(r.Date||r.date)),datasets:[{data:sorted.map(r=>r.left_pct),backgroundColor:sorted.map(r=>r.left_pct<47.5?'#C0392B99':'#2D7A5A99'),borderColor:sorted.map(r=>r.left_pct<47.5?'#C0392B':'#2D7A5A'),borderWidth:1,borderRadius:2}]},options:{...CD,scales:{x:{...CD.scales.x,ticks:{...CD.scales.x.ticks,maxTicksLimit:8,maxRotation:40}},y:{...CD.scales.y,min:45,max:52,ticks:{...CD.scales.y.ticks,callback:v=>v+'%'}}},plugins:{...CD.plugins,tooltip:{...CD.plugins.tooltip,callbacks:{label:ctx=>{const r=sorted[ctx.dataIndex];return`${ctx.parsed.y.toFixed(1)}% left GCT${ctx.parsed.y<47.5?' ⚠ low':' ✓'} · ${(r.Title||'').slice(0,25)}`;}}}}},plugins:[{id:'refLines',afterDraw(chart){const{ctx,scales:{y}}=chart;const y50=y.getPixelForValue(50);ctx.save();ctx.strokeStyle='#2D7A5A55';ctx.setLineDash([4,4]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(chart.chartArea.left,y50);ctx.lineTo(chart.chartArea.right,y50);ctx.stroke();const y475=y.getPixelForValue(47.5);ctx.strokeStyle='#C0392B55';ctx.beginPath();ctx.moveTo(chart.chartArea.left,y475);ctx.lineTo(chart.chartArea.right,y475);ctx.stroke();ctx.restore();}}]});
}

function renderCadenceChart(){
  dc('cadence', document.getElementById('cadenceChart'));
  const sorted=[...filteredRuns].filter(r=>r.cadence).sort((a,b)=>new Date(a.Date||a.date)-new Date(b.Date||b.date));
  charts['cadence']=new Chart(document.getElementById('cadenceChart'),{type:'bar',data:{labels:sorted.map(r=>fmtDate(r.Date||r.date)),datasets:[{data:sorted.map(r=>r.cadence),backgroundColor:sorted.map(r=>r.cadence<175?'#C84B2F99':'#2D7A5A99'),borderRadius:2}]},options:{...CD,scales:{x:{...CD.scales.x,ticks:{...CD.scales.x.ticks,maxTicksLimit:8,maxRotation:40}},y:{...CD.scales.y,min:148,ticks:{...CD.scales.y.ticks,callback:v=>v+' spm'}}},plugins:{...CD.plugins,tooltip:{...CD.plugins.tooltip,callbacks:{label:ctx=>{const r=sorted[ctx.dataIndex];return`${ctx.parsed.y} spm${ctx.parsed.y<175?' ⚠ below target':' ✓'} · ${(r.Title||'').slice(0,25)}`;}}}}},plugins:[{id:'target',afterDraw(chart){const{ctx,scales:{y}}=chart;const yL=y.getPixelForValue(175);ctx.save();ctx.strokeStyle='#2D7A5A66';ctx.setLineDash([4,4]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(chart.chartArea.left,yL);ctx.lineTo(chart.chartArea.right,yL);ctx.stroke();ctx.fillStyle='#2D7A5A';ctx.font="9px 'DM Mono',monospace";ctx.fillText('target 175',chart.chartArea.right-60,yL-4);ctx.restore();}}]});
}

function renderVOChart(){
  dc('vo', document.getElementById('voChart'));
  const sorted=[...filteredRuns].filter(r=>r.vo).sort((a,b)=>new Date(a.Date||a.date)-new Date(b.Date||b.date));
  charts['vo']=new Chart(document.getElementById('voChart'),{type:'line',data:{labels:sorted.map(r=>fmtDate(r.Date||r.date)),datasets:[{data:sorted.map(r=>r.vo),borderColor:'#1d4f8a',backgroundColor:'#1d4f8a18',pointBackgroundColor:sorted.map(r=>typeColor(r)),pointRadius:4,fill:true,tension:0.3,borderWidth:1.5}]},options:{...CD,scales:{x:{...CD.scales.x,ticks:{...CD.scales.x.ticks,maxTicksLimit:8,maxRotation:40}},y:{...CD.scales.y,ticks:{...CD.scales.y.ticks,callback:v=>v+' cm'}}},plugins:{...CD.plugins,tooltip:{...CD.plugins.tooltip,callbacks:{label:ctx=>{const r=sorted[ctx.dataIndex];return`${ctx.parsed.y} cm vert osc · ${(r.Title||'').slice(0,25)}`;}}}}}}); 
}

function renderWeeklyChart(){
  // Weekly stacked by type using ALL analyticsRuns (not filtered)
  dc('weekly', document.getElementById('weeklyChart')); dc('weeklyStacked', document.getElementById('weeklyStackedChart'));
  const weekMap={};const flareWeeks=new Set();
  const TYPE_GROUPS={'Running':'run','Virtual Cycling':'cycle','Road Cycling':'cycle','Indoor Cycling':'cycle','Strength Training':'other','Walking':'other','Yoga':'other'};
  [...analyticsRuns,...analyticsCycles].forEach(r=>{
    const mon=localMonday(r.Date||r.date);
    const key=mon.getFullYear()+'-'+String(mon.getMonth()+1).padStart(2,'0')+'-'+String(mon.getDate()).padStart(2,'0');
    if(!weekMap[key])weekMap[key]={run:0,cycle:0,strength:0,other:0};
    const g=TYPE_GROUPS[getActivityType(r)]||'other';
    weekMap[key][g]+=(r.Distance||0);
    if(ITB_FLARES.includes((r.Date||r.date||'').slice(0,10)))flareWeeks.add(key);
  });
  const weeks=Object.keys(weekMap).sort();
  const labels=weeks.map(w=>{const d=new Date(w);return`${d.toLocaleString('en',{month:'short'})} ${d.getDate()}`;});
  const el=document.getElementById('weeklyStackedChart');
  if(!el)return;
  charts['weeklyStacked']=new Chart(el,{
    type:'bar',
    data:{labels,datasets:[
      {label:'Running',data:weeks.map(w=>+weekMap[w].run.toFixed(1)),backgroundColor:'#C84B2Fcc',borderRadius:2},
      {label:'Cycling',data:weeks.map(w=>+weekMap[w].cycle.toFixed(1)),backgroundColor:'#2C6FACcc',borderRadius:2},
    ]},
    options:{...CD,scales:{
      x:{...CD.scales.x,stacked:true,ticks:{...CD.scales.x.ticks,maxTicksLimit:12,maxRotation:40}},
      y:{...CD.scales.y,stacked:true,beginAtZero:true,ticks:{...CD.scales.y.ticks,callback:v=>v+' mi'}}
    },plugins:{...CD.plugins,legend:{display:true,position:'top',labels:{font:{family:"'DM Mono',monospace",size:10},color:'#6b6560',boxWidth:10}},
    tooltip:{...CD.plugins.tooltip,callbacks:{
      title:ctx=>`Week of ${weeks[ctx[0].dataIndex]}${flareWeeks.has(weeks[ctx[0].dataIndex])?' · ⚠ IT band flare':''}`,
      label:ctx=>`${ctx.dataset.label}: ${ctx.parsed.y} mi`
    }}}}
  });
}

function renderCyclingChart(){
  const el=document.getElementById('cyclingChart');
  dc('cycling', el);
  if(!el)return;
  const sorted=[...analyticsCycles].filter(r=>r.avg_speed>0).sort((a,b)=>new Date(a.Date||a.date)-new Date(b.Date||b.date));
  if(!sorted.length){noData(el,'No cycling data yet');return;}
  const colors={'Virtual Cycling':'#1a5c8a99','Road Cycling':'#c84b2f99','Indoor Cycling':'#2d6a4f99'};
  charts['cycling']=new Chart(el,{
    type:'scatter',
    data:{datasets:[
      {label:'Virtual',data:sorted.filter(r=>r.ActivityType==='Virtual Cycling').map(r=>({x:new Date(r.Date||r.date).getTime(),y:r.avg_speed,r:4})),backgroundColor:'#2C6FAC99',borderColor:'#2C6FAC',pointRadius:5},
      {label:'Road',data:sorted.filter(r=>r.ActivityType==='Road Cycling').map(r=>({x:new Date(r.Date||r.date).getTime(),y:r.avg_speed,r:4})),backgroundColor:'#C84B2F99',borderColor:'#C84B2F',pointRadius:5},
      {label:'Indoor',data:sorted.filter(r=>r.ActivityType==='Indoor Cycling').map(r=>({x:new Date(r.Date||r.date).getTime(),y:r.avg_speed,r:4})),backgroundColor:'#4D8EC499',borderColor:'#4D8EC4',pointRadius:6},
    ]},
    options:{...CD,scales:{
      x:{...CD.scales.x,type:'time',time:{unit:'month'},ticks:{...CD.scales.x.ticks,maxTicksLimit:8}},
      y:{...CD.scales.y,ticks:{...CD.scales.y.ticks,callback:v=>v+' mph'},title:{display:true,text:'Speed (mph)',color:'#9e9890',font:{family:"'DM Mono',monospace",size:10}}}
    },plugins:{...CD.plugins,legend:{display:true,position:'top',labels:{font:{family:"'DM Mono',monospace",size:10},color:'#6b6560',boxWidth:10}},
    tooltip:{...CD.plugins.tooltip,callbacks:{
      label:ctx=>{const r=sorted.find(r=>Math.abs(new Date(r.Date||r.date).getTime()-ctx.parsed.x)<1000&&r.avg_speed===ctx.parsed.y);return r?`${r.ActivityType} · ${ctx.parsed.y} mph · ${r.Distance} mi · HR ${r.hr}`:ctx.parsed.y+' mph';}
    }}}}
  });
}

function renderActivityBreakdownChart(){
  const el=document.getElementById('activityBreakdownChart');
  dc('actBreakdown', el);
  if(!el)return;
  const EXCLUDE=['Strength Training','Yoga','Walking'];
  const counts={};
  [...analyticsRuns,...analyticsCycles]
    .filter(r=>!EXCLUDE.includes(getActivityType(r)))
    .forEach(r=>{const t=getActivityType(r);counts[t]=(counts[t]||0)+1;});
  const labels=Object.keys(counts);
  const data=labels.map(l=>counts[l]);
  const colorMap={'Running':'#2D7A5A','Virtual Cycling':'#2C6FAC','Road Cycling':'#1A4D7A','Indoor Cycling':'#4D8EC4'};
  const colors=labels.map(l=>colorMap[l]||'#8A8278');
  charts['actBreakdown']=new Chart(el,{
    type:'doughnut',
    data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:2,borderColor:'var(--surface)'}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:true,position:'right',labels:{font:{family:"'DM Mono',monospace",size:10},color:'#6b6560',boxWidth:10,padding:8}},
      tooltip:{backgroundColor:'#141210',titleFont:{family:"'DM Mono',monospace",size:11},bodyFont:{family:"'DM Mono',monospace",size:11},padding:10,cornerRadius:4,displayColors:false,
        callbacks:{label:ctx=>ctx.label+': '+ctx.parsed+' activities'}
      }}
    }
  });
}

function renderGCTMsChart(){
  dc('gctms', document.getElementById('gctMsChart'));
  const sorted=[...filteredRuns].filter(r=>r.gct&&getActivityType(r)==='Running').sort((a,b)=>new Date(a.Date||a.date)-new Date(b.Date||b.date));
  const el=document.getElementById('gctMsChart');
  if(!el||!sorted.length)return;
  charts['gctms']=new Chart(el,{type:'line',data:{labels:sorted.map(r=>fmtDate(r.Date||r.date)),datasets:[{data:sorted.map(r=>r.gct),borderColor:'#b06a00',backgroundColor:'#b06a0010',pointBackgroundColor:sorted.map(r=>typeColor(r)),pointRadius:4,fill:true,tension:0.3,borderWidth:1.5}]},options:{...CD,scales:{x:{...CD.scales.x,ticks:{...CD.scales.x.ticks,maxTicksLimit:12,maxRotation:40}},y:{...CD.scales.y,ticks:{...CD.scales.y.ticks,callback:v=>v+' ms'}}},plugins:{...CD.plugins,tooltip:{...CD.plugins.tooltip,callbacks:{label:ctx=>{const r=sorted[ctx.dataIndex];return`${ctx.parsed.y} ms GCT · ${secToMin(r.pace_sec)}/mi · ${(r.Title||'').slice(0,25)}`;}}}}}}); 
}

function renderTable(){
  const tbody = document.getElementById('runTableBody');
  const thead = document.querySelector('.runs-table thead tr');
  const isCycleView = activeView === 'cycling';
  const isRunView   = activeView === 'running';
  const isAll       = activeView === 'all';

  // Dynamic column headers
  if(isCycleView){
    thead.innerHTML = `
      <th data-action="sort-table" data-key="date">Date</th>
      <th data-action="sort-table" data-key="title">Title</th>
      <th data-action="sort-table" data-key="ActivityType">Type</th>
      <th data-action="sort-table" data-key="Distance">Dist (mi)</th>
      <th data-action="sort-table" data-key="avg_speed">Avg Speed</th>
      <th data-action="sort-table" data-key="avg_power">Avg Power</th>
      <th data-action="sort-table" data-key="ascent">Elev</th>
      <th data-action="sort-table" data-key="hr">Avg HR</th>
      <th data-action="sort-table" data-key="cadence">Cadence</th>
      <th data-action="sort-table" data-key="calories">Calories</th>
      <th data-action="sort-table" data-key="aerobic_te">Aerobic TE</th>
      <th></th>`;
  } else if(isRunView){
    thead.innerHTML = `
      <th data-action="sort-table" data-key="date">Date</th>
      <th data-action="sort-table" data-key="title">Title</th>
      <th data-action="sort-table" data-key="Distance">Dist (mi)</th>
      <th data-action="sort-table" data-key="pace_sec">Pace</th>
      <th data-action="sort-table" data-key="ascent">Elev</th>
      <th data-action="sort-table" data-key="hr">Avg HR</th>
      <th data-action="sort-table" data-key="cadence">Cadence</th>
      <th data-action="sort-table" data-key="left_pct">GCT L%</th>
      <th data-action="sort-table" data-key="vo">Vert Osc</th>
      <th data-action="sort-table" data-key="gct">GCT ms</th>
      <th data-action="sort-table" data-key="aerobic_te">Aerobic TE</th>
      <th></th>`;
  } else {
    thead.innerHTML = `
      <th data-action="sort-table" data-key="date">Date</th>
      <th data-action="sort-table" data-key="title">Title</th>
      <th data-action="sort-table" data-key="ActivityType">Type</th>
      <th data-action="sort-table" data-key="Distance">Dist (mi)</th>
      <th data-action="sort-table" data-key="pace_sec">Pace / Speed</th>
      <th data-action="sort-table" data-key="hr">Avg HR</th>
      <th data-action="sort-table" data-key="cadence">Cadence</th>
      <th data-action="sort-table" data-key="left_pct">GCT L% / Power</th>
      <th data-action="sort-table" data-key="vo">Vert Osc</th>
      <th data-action="sort-table" data-key="gct">GCT ms</th>
      <th></th>`;
  }

  // Re-apply sort-direction class to the active column so the ↑/↓ arrow
  // survives the innerHTML rebuild above.
  thead.querySelectorAll('th').forEach(th => {
    if (th.dataset.key === tableSortKey) th.classList.add('sort-' + tableSortDir);
  });

  // Data source
  const data = isCycleView ? [...filteredCycles]
             : isRunView   ? [...filteredRuns]
             : [...filteredRuns, ...filteredCycles];

  const searchQ = (document.getElementById('runLogSearch')?.value||'').toLowerCase().trim();

  const sorted = data.filter(r=>!searchQ||((r.Title||r.title||'').toLowerCase().includes(searchQ))).sort((a,b)=>{
    let va = tableSortKey==='date' ? new Date(a.Date||a.date) : (a[tableSortKey]||0);
    let vb = tableSortKey==='date' ? new Date(b.Date||b.date) : (b[tableSortKey]||0);
    if(tableSortKey==='title'){va=a.Title||'';vb=b.Title||'';}
    return tableSortDir==='asc' ? (va>vb?1:-1) : (va<vb?1:-1);
  });

  tbody.innerHTML = sorted.map((r, idx) => {
    const atype = getActivityType(r);
    const isRun   = atype === 'Running';
    const isCycle = atype.includes('Cycling');
    const isFlare = ITB_FLARES.includes((r.Date||r.date||'').slice(0,10));
    const isRace  = !!r.is_race;
    const typeTag = `<span style="font-size:9px;padding:1px 6px;border-radius:3px;background:${typeColor(r)}22;color:${typeColor(r)}">${atype}</span>`;
    const gctClass = r.left_pct && r.left_pct<47.5 ? 'itb-low' : 'itb-ok';
    const raceBadge = isRace ? `<span style="display:inline-block;margin-left:6px;font-size:8px;font-family:var(--mono);padding:1px 6px;border-radius:3px;background:var(--race-bg);color:var(--race);font-weight:500;vertical-align:middle;letter-spacing:0.04em;">★ RACE</span>` : '';
    const rowStyle = isRace ? ' style="background:#faf5fc;border-left:2px solid var(--race);"'
                   : isFlare ? ' style="background:#fdf0ee;"' : '';
    const shareType = isRun ? 'run' : 'ride';
    const shareBtn = `<td><button data-action="open-share-modal" data-share-type="${shareType}" data-source="run" data-row-idx="${idx}" class="row-action-btn">↗</button> <button data-action="open-activity-detail" data-garmin-id="${r.garmin_id||''}" data-date="${(r.Date||r.date||'').slice(0,10)}" data-title="${(r.Title||'').replace(/"/g,'&quot;')}" data-type="${isRun?'Running':'Cycling'}" data-distance="${r.Distance||0}" class="row-action-btn" title="View splits & zones">⊞</button></td>`;

    if(isCycleView){
      return `<tr${rowStyle}>
        <td>${fmtDate(r.Date||r.date)}</td>
        <td class="run-title-cell">${r.Title||'—'}${raceBadge}</td>
        <td>${typeTag}</td>
        <td>${(r.Distance||0).toFixed(2)}</td>
        <td class="pace-cell">${r.avg_speed>0?r.avg_speed+' mph':'—'}</td>
        <td>${r.avg_power?r.avg_power+'w':'—'}</td>
        <td>${parseAscent(r.ascent)>0?parseAscent(r.ascent).toLocaleString()+'ft':'—'}</td>
        <td>${r.hr?`${r.hr} ${hrZoneLabel(r.hr)}`:'—'}</td>
        <td>${r.cadence||'—'}</td>
        <td>${r.calories||'—'}</td>
        <td>${r.aerobic_te||'—'}</td>
        ${shareBtn}
      </tr>`;
    } else if(isRunView){
      return `<tr${rowStyle}>
        <td>${fmtDate(r.Date||r.date)}</td>
        <td class="run-title-cell">${r.Title||'—'}${raceBadge}${isFlare?' ⚠':''}</td>
        <td>${(r.Distance||0).toFixed(2)}</td>
        <td class="pace-cell">${r.pace_sec?secToMin(r.pace_sec)+'/mi':'—'}</td>
        <td>${parseAscent(r.ascent)>0?parseAscent(r.ascent).toLocaleString()+'ft':'—'}</td>
        <td>${r.hr?`${r.hr} ${hrZoneLabel(r.hr)}`:'—'}</td>
        <td>${r.cadence||'—'}</td>
        <td class="${gctClass}">${r.left_pct?r.left_pct.toFixed(1)+'%':'—'}</td>
        <td>${r.vo?r.vo.toFixed(1):'—'}</td>
        <td>${r.gct||'—'}</td>
        <td>${r.aerobic_te||'—'}</td>
        ${shareBtn}
      </tr>`;
    } else {
      const paceSpeed = isRun&&r.pace_sec ? secToMin(r.pace_sec)+'/mi' : isCycle&&r.avg_speed>0 ? r.avg_speed+' mph' : '—';
      const col8 = isCycle&&r.avg_power ? r.avg_power+'w' : r.left_pct ? `<span class="${gctClass}">${r.left_pct.toFixed(1)}%</span>` : '—';
      return `<tr${rowStyle}>
        <td>${fmtDate(r.Date||r.date)}</td>
        <td class="run-title-cell">${r.Title||'—'}${raceBadge}${isFlare?' ⚠':''}</td>
        <td>${typeTag}</td>
        <td>${(r.Distance||0).toFixed(2)}</td>
        <td class="pace-cell">${paceSpeed}</td>
        <td>${r.hr?`${r.hr} ${hrZoneLabel(r.hr)}`:'—'}</td>
        <td>${r.cadence||'—'}</td>
        <td>${col8}</td>
        <td>${isRun&&r.vo?r.vo.toFixed(1):'—'}</td>
        <td>${isRun&&r.gct?r.gct:'—'}</td>
        ${shareBtn}
      </tr>`;
    }
  }).join('');
  window._tableRows = sorted; // expose for share buttons
}

function sortTable(key){
  if(tableSortKey===key) tableSortDir = tableSortDir==='asc'?'desc':'asc';
  else { tableSortKey=key; tableSortDir='desc'; }
  document.querySelectorAll('.runs-table th').forEach(th=>th.classList.remove('sort-asc','sort-desc'));
  document.querySelectorAll('.runs-table th').forEach(th=>{
    if(th.dataset.key===key) th.classList.add('sort-'+tableSortDir);
  });
  // Re-render whichever log is visible. Previously always called renderTable()
  // even on the Cycling page → cycle table never updated when its headers
  // were clicked.
  if (analyticsPage === 'cycling') renderCycleTable();
  else renderTable();
}

function renderStats(){
  const stripId = analyticsPage==='running' ? 'statStripRun' : analyticsPage==='cycling' ? 'statStripCyc' : 'statStrip';
  const strip = document.getElementById(stripId);
  const isCycleView = activeView === 'cycling';
  const isRunView   = activeView === 'running';
  const runs   = filteredRuns;
  const cycles = filteredCycles;

  function cell(key, val, sub){ return `<div class="stat-cell"><div class="stat-key">${key}</div><div class="stat-val">${val}</div><div class="stat-sub">${sub}</div></div>`; }
  function avg(arr, fn){ const f=arr.filter(fn); return f.length ? Math.round(f.reduce((s,r)=>s+fn(r),0)/f.length) : 0; }

  if(isCycleView){
    if(!cycles.length){strip.innerHTML='';return;}
    const totalMi  = cycles.reduce((s,r)=>s+(r.Distance||0),0);
    const avgSpeed = avg(cycles, r=>r.avg_speed||0);
    const bestSpeed= cycles.filter(r=>r.avg_speed>0).length ? Math.max(...cycles.filter(r=>r.avg_speed>0).map(r=>r.avg_speed)) : 0;
    const avgHR    = avg(cycles, r=>r.hr||0) || '—';
    const avgPwr   = avg(cycles.filter(r=>r.avg_power>0), r=>r.avg_power);
    const bestPwr  = cycles.filter(r=>r.avg_power>0).length ? Math.max(...cycles.filter(r=>r.avg_power>0).map(r=>r.avg_power)) : 0;
    const avgCad   = avg(cycles.filter(r=>r.cadence>0), r=>r.cadence);
    const longestRide = cycles.length ? Math.max(...cycles.map(r=>r.Distance||0)) : 0;
    const totalCycAscent = cycles.reduce((s,r)=>s+parseAscent(r.ascent),0);
    strip.innerHTML =
      cell('Ride miles',   totalMi.toFixed(0),                    `${cycles.length} rides`) +
      cell('Elev gain',    totalCycAscent.toLocaleString()+'ft',  'total climbing') +
      cell('Avg speed',    avgSpeed+' mph',                       'mph') +
      cell('Best speed',   bestSpeed+' mph',                      'single ride') +
      cell('Avg HR',       avgHR,                                 'bpm') +
      cell('Avg power',    avgPwr+'w',                            'watts') +
      cell('Best power',   bestPwr+'w',                           'best avg single ride') +
      cell('Avg cadence',  avgCad,                                'rpm') +
      cell('Longest ride', longestRide.toFixed(1),                'miles');

  } else if(isRunView){
    if(!runs.length){strip.innerHTML='';return;}
    const totalMi  = runs.reduce((s,r)=>s+(r.Distance||0),0);
    const withPace = runs.filter(r=>r.pace_sec);
    const avgPace  = withPace.length ? Math.round(withPace.reduce((s,r)=>s+r.pace_sec,0)/withPace.length) : 0;
    const bestPace = withPace.filter(r=>(r.Distance||0)>3).length ? Math.min(...withPace.filter(r=>(r.Distance||0)>3).map(r=>r.pace_sec)) : 0;
    const avgHR    = avg(runs.filter(r=>r.hr), r=>r.hr);
    const avgCad   = avg(runs.filter(r=>r.cadence), r=>r.cadence);
    const withGCT  = runs.filter(r=>r.left_pct);
    const avgGCT   = withGCT.length ? (withGCT.reduce((s,r)=>s+r.left_pct,0)/withGCT.length).toFixed(1) : '—';
    const longestRun = runs.length ? Math.max(...runs.map(r=>r.Distance||0)) : 0;
    const races      = runs.filter(r=>r.is_race).length;
    const totalAscent = runs.reduce((s,r)=>s+parseAscent(r.ascent),0);
    const projFinish = (()=>{
      const raceList = analyticsRuns.filter(r=>r.is_race&&r.pace_sec&&r.Distance>=3).sort((a,b)=>new Date(a.Date||a.date)-new Date(b.Date||b.date));
      const flat = raceList.filter(r=>!HILLY_RACES.some(k=>(r.Title||'').toLowerCase().includes(k)));
      const best = flat.length?flat[flat.length-1]:raceList[raceList.length-1];
      if(!best)return'—';
      return fmtRaceTime(riegelProject(best.pace_sec*best.Distance,best.Distance,26.219));
    })();
    strip.innerHTML =
      cell('Run miles',   totalMi.toFixed(0),                `${runs.length} runs`) +
      cell('Elev gain',   totalAscent.toLocaleString()+'ft', 'total climbing') +
      cell('Avg pace',    secToMin(avgPace),                 'min/mi') +
      cell('Best pace',   secToMin(bestPace),                'runs ≥3mi') +
      cell('Avg HR',      avgHR||'—',                        'bpm') +
      cell('Avg cadence', avgCad||'—',                       'spm') +
      `<div class="stat-cell expandable" data-action="toggle-race-predictor" title="Click to see race-by-race projections">
        <div class="stat-key">Projected</div>
        <div class="stat-val">${projFinish}</div>
        <div class="stat-sub">Santa Rosa finish</div>
        <div class="expand-hint" id="racePredictorHint">▼ see all races</div>
      </div>` +
      cell('Longest run', longestRun.toFixed(1),             'miles') +
      cell('Races',       races,                             'in history');

  } else {
    // All view — combined
    const allActs = [...runs,...cycles];
    if(!allActs.length){strip.innerHTML='';return;}
    const totalRunMi    = runs.reduce((s,r)=>s+(r.Distance||0),0);
    const totalCycMi    = cycles.reduce((s,r)=>s+(r.Distance||0),0);
    const totalRunElev  = runs.reduce((s,r)=>s+parseAscent(r.ascent),0);
    const totalCycElev  = cycles.reduce((s,r)=>s+parseAscent(r.ascent),0);
    const totalElev     = totalRunElev + totalCycElev;
    const withPace      = runs.filter(r=>r.pace_sec);
    const bestPace      = withPace.filter(r=>(r.Distance||0)>3).length ? Math.min(...withPace.filter(r=>(r.Distance||0)>3).map(r=>r.pace_sec)) : 0;
    const avgRunHR      = avg(runs.filter(r=>r.hr), r=>r.hr);
    const avgCycHR      = avg(cycles.filter(r=>r.hr), r=>r.hr);
    const avgPwr        = avg(cycles.filter(r=>r.avg_power>0), r=>r.avg_power);
    const racePred      = (()=>{
      const raceList = analyticsRuns.filter(r=>r.is_race&&r.pace_sec&&r.Distance>=3).sort((a,b)=>new Date(a.Date||a.date)-new Date(b.Date||b.date));
      const flat = raceList.filter(r=>!HILLY_RACES.some(k=>(r.Title||'').toLowerCase().includes(k)));
      const best = flat.length?flat[flat.length-1]:raceList[raceList.length-1];
      if(!best)return'—';
      const proj=riegelProject(best.pace_sec*best.Distance,best.Distance,26.219);
      return fmtRaceTime(proj);
    })();
    strip.innerHTML =
      cell('Run miles',     totalRunMi.toFixed(0),          `${runs.length} runs`) +
      cell('Cycle miles',   totalCycMi.toFixed(0),          `${cycles.length} rides`) +
      cell('Total elev',    totalElev.toLocaleString()+'ft', `run ${totalRunElev.toLocaleString()} · ride ${totalCycElev.toLocaleString()}`) +
      cell('Best run pace', secToMin(bestPace),              'runs ≥3mi') +
      cell('Run avg HR',    avgRunHR||'—',                   `bpm · cycle ${avgCycHR||'—'} bpm`) +
      cell('Avg power',     avgPwr+'w',                      'cycling watts') +
      `<div class="stat-cell expandable" data-action="toggle-race-predictor" title="Click to see race-by-race projections">
        <div class="stat-key">Projected</div>
        <div class="stat-val">${racePred}</div>
        <div class="stat-sub">Santa Rosa finish</div>
        <div class="expand-hint" id="racePredictorHint">▼ see all races</div>
      </div>`;
  }

  // count label
  const countEl = document.getElementById('runCount');
  if(isCycleView)      countEl.textContent = `${cycles.length} ride${cycles.length!==1?'s':''}`;
  else if(isRunView)   countEl.textContent = `${runs.length} run${runs.length!==1?'s':''}`;
  else                 countEl.textContent = `${runs.length} run${runs.length!==1?'s':''} · ${cycles.length} ride${cycles.length!==1?'s':''}`;
}

function renderCyclingPowerChart(){
  const el=document.getElementById('cyclingPowerChart');
  dc('cyclingPower', el);
  if(!el)return;
  const sorted=[...analyticsCycles].filter(r=>r.avg_power>0).sort((a,b)=>new Date(a.Date||a.date)-new Date(b.Date||b.date));
  if(!sorted.length){noData(el,'No power data yet');return;}
  const colors={'Virtual Cycling':'#2C6FAC','Road Cycling':'#1A4D7A','Indoor Cycling':'#4D8EC4'};
  charts['cyclingPower']=new Chart(el,{
    type:'bar',
    data:{labels:sorted.map(r=>fmtDate(r.Date||r.date)),datasets:[{
      data:sorted.map(r=>r.avg_power),
      backgroundColor:sorted.map(r=>colors[r.ActivityType]||'#1a5c8a88'),
      borderRadius:3,
    }]},
    options:{...CD,scales:{
      x:{...CD.scales.x,ticks:{...CD.scales.x.ticks,maxTicksLimit:10,maxRotation:40}},
      y:{...CD.scales.y,beginAtZero:true,ticks:{...CD.scales.y.ticks,callback:v=>v+'w'}}
    },plugins:{...CD.plugins,tooltip:{...CD.plugins.tooltip,callbacks:{
      label:ctx=>{const r=sorted[ctx.dataIndex];return`${ctx.parsed.y}w avg · ${r.ActivityType} · ${r.Distance} mi · HR ${r.hr}`;}
    }}}}
  });
}

function renderHRZoneChart(){
  const el=document.getElementById('hrZoneChart');
  dc('hrzone', el);
  if(!el)return;
  const isCycleV=activeView==='cycling';
  const source=isCycleV?filteredCycles:activeView==='all'?[...filteredRuns,...filteredCycles]:filteredRuns;
  const acts=source.filter(r=>r.hr>0);
  if(!acts.length){noData(el,'No HR data available');return;}
  const counts=HR_ZONES.map(z=>({num:z.num,name:z.name,color:z.color,label:z.label,lo:z.lo,hi:z.hi,count:acts.filter(r=>r.hr>=z.lo&&r.hr<=z.hi).length}));
  const total=acts.length;
  const actLabel=isCycleV?'rides':activeView==='all'?'activities':'runs';
  const legendHTML=counts.map(z=>'<span style="display:flex;align-items:center;gap:4px;font-size:10px;color:#6b6560;white-space:nowrap"><span style="width:9px;height:9px;border-radius:2px;background:'+z.color+';flex-shrink:0"></span>'+z.label+' '+z.name+' · '+z.count+' ('+Math.round(z.count/total*100)+'%)</span>').join('');
  const wrap=el.parentElement;
  const existing=wrap.querySelector('.zone-legend');
  if(existing){existing.innerHTML=legendHTML;}
  else{
    const div=document.createElement('div');
    div.className='zone-legend';
    div.style.cssText='display:flex;flex-wrap:wrap;gap:8px 14px;margin-bottom:10px;';
    div.innerHTML=legendHTML;
    wrap.insertBefore(div,el);
  }
  charts['hrzone']=new Chart(el,{
    type:'bar',
    data:{
      labels:[total+' '+actLabel],
      datasets:counts.map((z,i)=>({
        label:z.label+' '+z.name,
        data:[Math.round(z.count/total*100)],
        backgroundColor:z.color,
        borderWidth:0,
        borderRadius: i===0?{topLeft:3,bottomLeft:3,topRight:0,bottomRight:0}:i===counts.length-1?{topLeft:0,bottomLeft:0,topRight:3,bottomRight:3}:0,
        borderSkipped:false,
      }))
    },
    options:{
      indexAxis:'y',responsive:true,maintainAspectRatio:false,
      scales:{
        x:{stacked:true,display:false,max:100},
        y:{stacked:true,display:false}
      },
      plugins:{
        legend:{display:false},
        tooltip:{backgroundColor:'#141210',titleFont:{family:"'DM Mono',monospace",size:11},bodyFont:{family:"'DM Mono',monospace",size:11},padding:10,cornerRadius:4,displayColors:true,
          callbacks:{label:ctx=>counts[ctx.datasetIndex].label+' '+counts[ctx.datasetIndex].name+': '+counts[ctx.datasetIndex].count+' '+actLabel+' ('+Math.round(counts[ctx.datasetIndex].count/total*100)+'%)'}
        }
      },
      layout:{padding:{top:4,bottom:4}}
    }
  });
}

function parseAscent(v){ try{ return parseInt(String(v).replace(',',''))||0; }catch(e){ return 0; } }

function renderElevationChart(){
  const el=document.getElementById('elevationChart');
  dc('elevation', el);
  if(!el)return;
  const isCycleV=activeView==='cycling';
  const runSource  = isCycleV ? [] : filteredRuns;
  const cycleSource= activeView==='running' ? [] : filteredCycles;
  const allSource  = [...runSource,...cycleSource].filter(r=>parseAscent(r.ascent)>0);
  if(!allSource.length){noData(el,'No elevation data available');return;}

  // Group by week (Mon start)
  const weekMap={};
  allSource.forEach(r=>{
    const mon=localMonday(r.Date||r.date);
    const key=mon.getFullYear()+'-'+String(mon.getMonth()+1).padStart(2,'0')+'-'+String(mon.getDate()).padStart(2,'0');
    if(!weekMap[key])weekMap[key]={run:0,cycle:0};
    const isRun=(r.ActivityType||r.type||'').includes('Running');
    weekMap[key][isRun?'run':'cycle']+=parseAscent(r.ascent);
  });

  const weeks=Object.keys(weekMap).sort();
  const labels=weeks.map(w=>{const d=new Date(w);return d.toLocaleString('en',{month:'short'})+' '+d.getDate();});
  const runData  =weeks.map(w=>weekMap[w].run);
  const cycleData=weeks.map(w=>weekMap[w].cycle);

  charts['elevation']=new Chart(el,{
    type:'bar',
    data:{
      labels,
      datasets:[
        {label:'Running',  data:runData,   backgroundColor:'#C84B2Fcc',borderRadius:2,stack:'elev'},
        {label:'Cycling',  data:cycleData, backgroundColor:'#2C6FACcc',borderRadius:2,stack:'elev'},
      ]
    },
    options:{...CD,
      scales:{
        x:{...CD.scales.x,stacked:true,ticks:{...CD.scales.x.ticks,maxTicksLimit:14,maxRotation:40}},
        y:{...CD.scales.y,stacked:true,beginAtZero:true,ticks:{...CD.scales.y.ticks,callback:v=>v.toLocaleString()+'ft'}}
      },
      plugins:{...CD.plugins,
        legend:{display:true,position:'top',labels:{font:{family:"'DM Mono',monospace",size:10},color:'#6b6560',boxWidth:10,padding:10,filter:item=>item.text!==''}},
        tooltip:{...CD.plugins.tooltip,callbacks:{
          title:ctx=>'Week of '+weeks[ctx[0].dataIndex],
          label:ctx=>{
            const v=ctx.parsed.y;
            if(!v)return null;
            return ctx.dataset.label+': '+v.toLocaleString()+'ft';
          },
          afterBody:ctx=>{
            const w=weeks[ctx[0].dataIndex];
            const total=(weekMap[w].run+weekMap[w].cycle);
            return['Total: '+total.toLocaleString()+'ft'];
          }
        }}
      }
    }
  });
}

function renderAeroEffChart(){
  const el=document.getElementById('aeroEffChart');
  dc('aeroeff', el);
  if(!el)return;
  // Efficiency Factor = (mph / HR) * 100 — exclude races and walks, require HR
  const sorted=[...filteredRuns]
    .filter(r=>r.hr>0&&r.pace_sec>0&&(r.Distance||0)>=2&&!r.is_race)
    .sort((a,b)=>new Date(a.Date||a.date)-new Date(b.Date||b.date));
  if(sorted.length<3){noData(el,'Not enough data');return;}

  const ef=sorted.map(r=>+((3600/r.pace_sec/r.hr)*100).toFixed(2));
  const labels=sorted.map(r=>fmtDate(r.Date||r.date));

  // 6-run rolling average
  const WINDOW=6;
  const smooth=ef.map((_,i)=>{
    if(i<WINDOW-1)return null;
    return +(ef.slice(i-WINDOW+1,i+1).reduce((a,b)=>a+b,0)/WINDOW).toFixed(2);
  });

  // Color points by run type
  const ptColors=sorted.map(r=>typeColor(r)+'aa');
  const ptSize=sorted.map(r=>Math.sqrt(r.Distance||1)*2);

  // Overall trend line (linear regression)
  const n=ef.length;
  const xArr=[...Array(n).keys()];
  const xMean=xArr.reduce((a,b)=>a+b,0)/n;
  const yMean=ef.reduce((a,b)=>a+b,0)/n;
  const slope=xArr.reduce((s,x,i)=>s+(x-xMean)*(ef[i]-yMean),0)/xArr.reduce((s,x)=>s+(x-xMean)**2,0);
  const intercept=yMean-slope*xMean;
  const trend=xArr.map(x=>+(intercept+slope*x).toFixed(2));

  charts['aeroeff']=new Chart(el,{
    type:'scatter',
    data:{
      labels,
      datasets:[
        {type:'scatter',label:'EF per run',data:ef.map((y,i)=>({x:i,y})),backgroundColor:ptColors,pointRadius:ptSize,order:3},
        {type:'line',label:'6-run avg',data:smooth.map((y,i)=>({x:i,y})),borderColor:'#1D5FA0',borderWidth:2,pointRadius:0,fill:false,tension:0.4,spanGaps:true,order:2},
        {type:'line',label:'Trend',data:trend.map((y,i)=>({x:i,y})),borderColor:'#2D7A5A',borderWidth:1.5,borderDash:[5,4],pointRadius:0,fill:false,tension:0,order:1},
      ]
    },
    options:{...CD,
      scales:{
        x:{...CD.scales.x,type:'linear',ticks:{...CD.scales.x.ticks,callback:(_,i)=>labels[i]||'',maxTicksLimit:10,maxRotation:40}},
        y:{...CD.scales.y,title:{display:true,text:'Efficiency Factor',color:'#9e9890',font:{family:"'DM Mono',monospace",size:10}},ticks:{...CD.scales.y.ticks,callback:v=>v.toFixed(1)}}
      },
      plugins:{...CD.plugins,
        legend:{display:true,position:'top',labels:{font:{family:"'DM Mono',monospace",size:10},color:'#6b6560',boxWidth:8,padding:12,usePointStyle:true}},
        tooltip:{...CD.plugins.tooltip,callbacks:{
          title:ctx=>sorted[ctx[0].dataIndex]?.Title||'',
          label:ctx=>{
            if(ctx.datasetIndex!==0)return ctx.dataset.label+': EF '+ctx.parsed.y;
            const r=sorted[ctx.dataIndex];
            return['EF '+ctx.parsed.y+' · '+secToMin(r.pace_sec)+'/mi · HR '+r.hr,(r.Distance||0).toFixed(1)+' mi · '+fmtDate(r.Date||r.date)];
          }
        }}
      }
    }
  });
}

function renderTrainingLoadChart(){
  const el=document.getElementById('trainingLoadChart');
  dc('trainingload', el);
  if(!el)return;

  const isCycleV=activeView==='cycling';
  const runSource=isCycleV?[]:filteredRuns;
  const cycleSource=activeView==='running'?[]:filteredCycles;

  // Build weekly TE buckets
  const weekMap={};
  const addToWeek=(r,field)=>{
    const te=r.aerobic_te||0;
    if(!te)return;
    const mon=localMonday(r.Date||r.date);
    const key=mon.getFullYear()+'-'+String(mon.getMonth()+1).padStart(2,'0')+'-'+String(mon.getDate()).padStart(2,'0');
    if(!weekMap[key])weekMap[key]={run:0,cycle:0};
    weekMap[key][field]+=te;
  };
  runSource.forEach(r=>addToWeek(r,'run'));
  cycleSource.forEach(r=>addToWeek(r,'cycle'));

  const weeks=Object.keys(weekMap).sort();
  if(!weeks.length){noData(el,'No Aerobic TE data — available from Jan 2026 onward');return;}

  const labels=weeks.map(w=>{const d=new Date(w);return d.toLocaleString('en',{month:'short'})+' '+d.getDate();});
  const runTE=weeks.map(w=>+weekMap[w].run.toFixed(1));
  const cycleTE=weeks.map(w=>+weekMap[w].cycle.toFixed(1));
  const totalTE=weeks.map((_,i)=>+(runTE[i]+cycleTE[i]).toFixed(1));

  charts['trainingload']=new Chart(el,{
    type:'bar',
    data:{
      labels,
      datasets:[
        {label:'Running TE', data:runTE,  backgroundColor:'#C84B2Fcc',borderRadius:2,stack:'te'},
        {label:'Cycling TE', data:cycleTE,backgroundColor:'#2C6FACcc',borderRadius:2,stack:'te'},
      ]
    },
    options:{...CD,
      scales:{
        x:{...CD.scales.x,stacked:true,ticks:{...CD.scales.x.ticks,maxTicksLimit:12,maxRotation:40}},
        y:{...CD.scales.y,stacked:true,beginAtZero:true,
          ticks:{...CD.scales.y.ticks,callback:v=>v+' TE'},
          title:{display:true,text:'Weekly Aerobic TE',color:'#9e9890',font:{family:"'DM Mono',monospace",size:10}}
        }
      },
      plugins:{...CD.plugins,
        legend:{display:true,position:'top',labels:{font:{family:"'DM Mono',monospace",size:10},color:'#6b6560',boxWidth:10,padding:10}},
        tooltip:{...CD.plugins.tooltip,callbacks:{
          title:ctx=>'Week of '+weeks[ctx[0].dataIndex],
          afterBody:ctx=>{
            const total=totalTE[ctx[0].dataIndex];
            const zone=total>=15?'⚠ Heavy load':total>=10?'Solid build':total>=5?'Moderate':'Light';
            return[`Total: ${total} TE · ${zone}`];
          }
        }}
      }
    },
    plugins:[{id:'loadZones',afterDraw(chart){
      const{ctx,scales:{y},chartArea}=chart;
      const zones=[
        {val:5,  color:'#2D7A5A33',label:'maintaining'},
        {val:10, color:'#2C6FAC33',label:'improving'},
        {val:15, color:'#C84B2F33',label:'heavy'},
      ];
      zones.forEach(z=>{
        const yPx=y.getPixelForValue(z.val);
        if(yPx<chartArea.top||yPx>chartArea.bottom)return;
        ctx.save();
        ctx.strokeStyle=z.color.slice(0,-2)+'88';
        ctx.setLineDash([3,3]);
        ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(chartArea.left,yPx);ctx.lineTo(chartArea.right,yPx);ctx.stroke();
        ctx.fillStyle=z.color.slice(0,-2)+'bb';
        ctx.font="8px 'DM Mono',monospace";
        ctx.fillText(z.label,chartArea.right-55,yPx-3);
        ctx.restore();
      });
    }}]
  });
}

function renderPaceProgressChart(){
  const el=document.getElementById('paceProgressChart');
  dc('paceprogress', el);
  if(!el)return;

  const WINDOW_DAYS=28;
  const easy=[...filteredRuns]
    .filter(r=>r.pace_sec&&(r.Distance||0)>=3&&!r.is_race)
    .sort((a,b)=>new Date(a.Date||a.date)-new Date(b.Date||b.date));
  if(easy.length<5){noData(el,'Not enough data');return;}

  // Rolling 4-week avg pace
  const pts=[];
  easy.forEach((r,i)=>{
    const d=new Date(r.Date||r.date);
    const cutoff=new Date(d.getTime()-WINDOW_DAYS*86400000);
    const window=easy.slice(0,i+1).filter(x=>new Date(x.Date||x.date)>=cutoff);
    if(window.length<3)return;
    const avg=Math.round(window.reduce((s,x)=>s+x.pace_sec,0)/window.length);
    pts.push({date:r.Date||r.date, avg, n:window.length, label:fmtDate(r.Date||r.date)});
  });

  if(!pts.length){noData(el,'Not enough data');return;}

  const first=pts[0].avg, last=pts[pts.length-1].avg;
  const improveSec=first-last;
  const improvePct=Math.round(improveSec/first*100);

  charts['paceprogress']=new Chart(el,{
    type:'line',
    data:{
      labels:pts.map(p=>p.label),
      datasets:[{
        label:'4-wk rolling avg pace',
        data:pts.map(p=>p.avg),
        borderColor:'#C84B2F',
        backgroundColor:'#C84B2F11',
        pointBackgroundColor:'#C84B2F',
        pointRadius:3,
        pointHoverRadius:5,
        fill:true,
        tension:0.4,
        borderWidth:2,
      }]
    },
    options:{...CD,
      scales:{
        x:{...CD.scales.x,ticks:{...CD.scales.x.ticks,maxTicksLimit:10,maxRotation:40}},
        y:{...CD.scales.y,reverse:true,
          ticks:{...CD.scales.y.ticks,callback:v=>secToMin(Math.round(v))},
          title:{display:true,text:'Avg pace (min/mi)',color:'#9e9890',font:{family:"'DM Mono',monospace",size:10}}
        }
      },
      plugins:{...CD.plugins,
        legend:{display:false},
        tooltip:{...CD.plugins.tooltip,callbacks:{
          label:ctx=>{
            const p=pts[ctx.dataIndex];
            return secToMin(ctx.parsed.y)+'/mi avg · '+p.n+' runs in window';
          },
          afterLabel:ctx=>{
            const p=pts[ctx.dataIndex];
            const delta=pts[0].avg-p.avg;
            return delta>0?'↑ '+secToMin(delta)+'/mi faster than start':'—';
          }
        }}
      }
    },
    plugins:[{id:'annotation',afterDraw(chart){
      const{ctx,scales:{y},chartArea}=chart;
      // Annotate start and end values
      const drawLabel=(px,py,text,align)=>{
        ctx.save();
        ctx.fillStyle='#C84B2F';
        ctx.font="bold 9px 'DM Mono',monospace";
        ctx.textAlign=align;
        ctx.fillText(text,px,py-6);
        ctx.restore();
      };
      const x0=chartArea.left+12;
      const xN=chartArea.right-12;
      const y0=y.getPixelForValue(first);
      const yN=y.getPixelForValue(last);
      if(y0>=chartArea.top&&y0<=chartArea.bottom) drawLabel(x0,y0,secToMin(first)+'/mi','left');
      if(yN>=chartArea.top&&yN<=chartArea.bottom) drawLabel(xN,yN,secToMin(last)+'/mi · ↑'+secToMin(improveSec)+' ('+improvePct+'%)','right');
    }}]
  });
}

function renderLongRunChart(){
  const el=document.getElementById('longRunChart');
  dc('longrun', el);
  if(!el)return;

  const MIN_DIST=8;
  const sorted=[...filteredRuns]
    .filter(r=>(r.Distance||0)>=MIN_DIST)
    .sort((a,b)=>new Date(a.Date||a.date)-new Date(b.Date||b.date));
  if(!sorted.length){noData(el,'No long runs (≥8mi) in current filter');return;}

  // Find monthly peak for each run
  const monthPeak={};
  sorted.forEach(r=>{
    const mo=(r.Date||r.date).slice(0,7);
    if(!monthPeak[mo]||r.Distance>monthPeak[mo]) monthPeak[mo]=r.Distance;
  });
  const isPeak=r=>(r.Distance||0)===monthPeak[(r.Date||r.date).slice(0,7)];

  const labels=sorted.map(r=>fmtDate(r.Date||r.date));
  const distances=sorted.map(r=>+(r.Distance||0).toFixed(2));
  const bgColors=sorted.map(r=>isPeak(r)?'#C84B2F':'#C84B2F44');
  const bdColors=sorted.map(r=>isPeak(r)?'#C84B2F':'#C84B2F88');
  const ptSizes=sorted.map(r=>isPeak(r)?6:3);

  charts['longrun']=new Chart(el,{
    type:'bar',
    data:{
      labels,
      datasets:[
        {
          type:'bar',
          label:'Long run',
          data:distances,
          backgroundColor:bgColors,
          borderColor:bdColors,
          borderWidth:1,
          borderRadius:2,
          order:2,
        },
        {
          type:'line',
          label:'Monthly peak',
          data:sorted.map(r=>isPeak(r)?(r.Distance||0):null),
          borderColor:'transparent',
          backgroundColor:'transparent',
          pointBackgroundColor:sorted.map(r=>isPeak(r)?'#C84B2F':'transparent'),
          pointBorderColor:sorted.map(r=>isPeak(r)?'#fff':'transparent'),
          pointBorderWidth:2,
          pointRadius:sorted.map(r=>isPeak(r)?7:0),
          pointHoverRadius:9,
          spanGaps:false,
          fill:false,
          showLine:false,
          order:1,
        }
      ]
    },
    options:{...CD,
      scales:{
        x:{...CD.scales.x,ticks:{...CD.scales.x.ticks,maxTicksLimit:12,maxRotation:40}},
        y:{...CD.scales.y,beginAtZero:true,
          ticks:{...CD.scales.y.ticks,callback:v=>v+'mi'},
          title:{display:true,text:'Distance (mi)',color:'#9e9890',font:{family:"'DM Mono',monospace",size:10}}
        }
      },
      plugins:{...CD.plugins,
        legend:{display:false},
        tooltip:{...CD.plugins.tooltip,callbacks:{
          title:ctx=>sorted[ctx[0].dataIndex]?.Title?.replace(/Oakley - W\d+ \w+ \w+ Run - /,'').slice(0,40)||'',
          label:ctx=>{
            if(ctx.datasetIndex===1&&ctx.parsed.y===null)return null;
            const r=sorted[ctx.dataIndex];
            const peak=isPeak(r);
            const lines=[ctx.parsed.y.toFixed(1)+'mi'+(peak?' · Monthly peak ★':'')];
            if(r.pace_sec)lines.push(secToMin(r.pace_sec)+'/mi avg');
            if(r.hr)lines.push('HR '+r.hr+' bpm');
            return lines;
          }
        }}
      }
    }
  });
}

function renderVertRatioChart(){
  const el=document.getElementById('vertRatioChart');
  dc('vertratio', el);
  if(!el)return;
  const sorted=[...filteredRuns]
    .filter(r=>r.vert_ratio&&r.vert_ratio>0)
    .sort((a,b)=>new Date(a.Date||a.date)-new Date(b.Date||b.date));
  if(!sorted.length){noData(el,'No vertical ratio data — available from Jan 2026');return;}

  const labels=sorted.map(r=>fmtDate(r.Date||r.date));
  const vals=sorted.map(r=>+r.vert_ratio.toFixed(1));
  const colors=sorted.map(r=>r.vert_ratio<=8?'#2D7A5Acc':r.vert_ratio<=10?'#C84B2F99':'#C0392Bcc');

  // 4-run rolling avg
  const smooth=vals.map((_,i)=>{
    const w=vals.slice(Math.max(0,i-3),i+1);
    return +(w.reduce((a,b)=>a+b,0)/w.length).toFixed(2);
  });

  charts['vertratio']=new Chart(el,{
    type:'bar',
    data:{
      labels,
      datasets:[
        {type:'bar',label:'Vertical ratio',data:vals,backgroundColor:colors,borderWidth:0,borderRadius:2,order:2},
        {type:'line',label:'4-run avg',data:smooth,borderColor:'#1D5FA0',borderWidth:1.5,pointRadius:0,fill:false,tension:0.4,order:1},
      ]
    },
    options:{...CD,
      scales:{
        x:{...CD.scales.x,ticks:{...CD.scales.x.ticks,maxTicksLimit:10,maxRotation:40}},
        y:{...CD.scales.y,min:7,max:11,
          ticks:{...CD.scales.y.ticks,callback:v=>v+'%'},
          title:{display:true,text:'Vertical ratio (%)',color:'#9e9890',font:{family:"'DM Mono',monospace",size:10}}
        }
      },
      plugins:{...CD.plugins,
        legend:{display:true,position:'top',labels:{font:{family:"'DM Mono',monospace",size:10},color:'#6b6560',boxWidth:10,padding:10}},
        tooltip:{...CD.plugins.tooltip,callbacks:{
          title:ctx=>sorted[ctx[0].dataIndex]?.Title?.replace(/Oakley - W\d+ \w+ \w+ - /,'').slice(0,35)||'',
          label:ctx=>{
            if(ctx.datasetIndex===1) return '4-run avg: '+ctx.parsed.y+'%';
            const r=sorted[ctx.dataIndex];
            const zone=r.vert_ratio<=8?'Elite (<8%)':r.vert_ratio<=10?'Good (8–10%)':'Inefficient (>10%)';
            return[r.vert_ratio+'% · '+zone,'VO: '+r.vo+'cm · GCT: '+r.gct+'ms',secToMin(r.pace_sec)+'/mi'];
          }
        }}
      }
    },
    plugins:[{id:'vrZones',afterDraw(chart){
      const{ctx,scales:{y},chartArea}=chart;
      // Good zone band 8-10%
      const y8=y.getPixelForValue(8);
      const y10=y.getPixelForValue(10);
      ctx.save();
      ctx.fillStyle='#2D7A5A11';
      ctx.fillRect(chartArea.left,y8,chartArea.right-chartArea.left,y10-y8);
      // Target line at 8%
      ctx.strokeStyle='#2D7A5A66';
      ctx.setLineDash([4,3]);
      ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(chartArea.left,y8);ctx.lineTo(chartArea.right,y8);ctx.stroke();
      ctx.fillStyle='#2D7A5A';
      ctx.font="8px 'DM Mono',monospace";
      ctx.setLineDash([]);
      ctx.fillText('target <8%',chartArea.right-58,y8-3);
      // 10% line
      ctx.strokeStyle='#C84B2F44';
      ctx.setLineDash([3,3]);
      ctx.beginPath();ctx.moveTo(chartArea.left,y10);ctx.lineTo(chartArea.right,y10);ctx.stroke();
      ctx.fillStyle='#C84B2F99';
      ctx.fillText('>10% inefficient',chartArea.right-90,y10-3);
      ctx.restore();
    }}]
  });
}

function renderStrideLenChart(){
  const el=document.getElementById('strideLenChart');
  dc('stridelen', el);
  if(!el)return;
  const sorted=[...filteredRuns]
    .filter(r=>r.stride_len&&r.stride_len>0&&r.cadence>0&&r.pace_sec)
    .sort((a,b)=>new Date(a.Date||a.date)-new Date(b.Date||b.date));
  if(!sorted.length){noData(el,'No stride data — available from Jan 2026');return;}

  const labels=sorted.map(r=>fmtDate(r.Date||r.date));
  const vals=sorted.map(r=>+r.stride_len.toFixed(2));
  const ptColors=sorted.map(r=>typeColor(r)+'cc');

  // 4-run rolling avg
  const smooth=vals.map((_,i)=>{
    const w=vals.slice(Math.max(0,i-3),i+1);
    return +(w.reduce((a,b)=>a+b,0)/w.length).toFixed(3);
  });

  const first=smooth[0], last=smooth[smooth.length-1];
  const deltaCm=Math.round((last-first)*100);

  charts['stridelen']=new Chart(el,{
    type:'scatter',
    data:{
      labels,
      datasets:[
        {type:'scatter',label:'Stride length',data:vals.map((y,i)=>({x:i,y})),backgroundColor:ptColors,pointRadius:4,pointHoverRadius:6,order:2},
        {type:'line',label:'4-run avg',data:smooth.map((y,i)=>({x:i,y})),borderColor:'#1D5FA0',borderWidth:2,pointRadius:0,fill:false,tension:0.4,order:1},
      ]
    },
    options:{...CD,
      scales:{
        x:{...CD.scales.x,type:'linear',min:0,max:sorted.length-1,ticks:{...CD.scales.x.ticks,callback:(_,i)=>labels[i]||'',maxTicksLimit:10,maxRotation:40}},
        y:{...CD.scales.y,
          ticks:{...CD.scales.y.ticks,callback:v=>v.toFixed(2)+'m'},
          title:{display:true,text:'Stride length (m)',color:'#9e9890',font:{family:"'DM Mono',monospace",size:10}}
        }
      },
      plugins:{...CD.plugins,
        legend:{display:true,position:'top',labels:{font:{family:"'DM Mono',monospace",size:10},color:'#6b6560',boxWidth:10,padding:10}},
        tooltip:{...CD.plugins.tooltip,callbacks:{
          title:ctx=>sorted[ctx[0].dataIndex]?.Title?.replace(/Oakley - W\d+ \w+ \w+ - /,'').slice(0,35)||'',
          label:ctx=>{
            if(ctx.datasetIndex===1) return '4-run avg: '+ctx.parsed.y.toFixed(2)+'m';
            const r=sorted[ctx.dataIndex];
            return[
              r.stride_len.toFixed(2)+'m stride · '+r.cadence+' spm',
              secToMin(r.pace_sec)+'/mi · '+(r.Distance||0).toFixed(1)+' mi',
            ];
          }
        }}
      }
    },
    plugins:[{id:'strideAnnotation',afterDraw(chart){
      const{ctx,scales:{x,y},chartArea}=chart;
      if(sorted.length<2)return;
      const x0=x.getPixelForValue(0);
      const xN=x.getPixelForValue(sorted.length-1);
      const y0=y.getPixelForValue(first);
      const yN=y.getPixelForValue(last);
      ctx.save();
      ctx.font="bold 9px 'DM Mono',monospace";
      ctx.textAlign='left';
      ctx.fillStyle='#1D5FA0';
      if(y0>=chartArea.top&&y0<=chartArea.bottom)
        ctx.fillText(first.toFixed(2)+'m',x0+4,y0-5);
      ctx.textAlign='right';
      const dir=deltaCm>0?'↑':'↓';
      if(yN>=chartArea.top&&yN<=chartArea.bottom)
        ctx.fillText(last.toFixed(2)+'m · '+dir+Math.abs(deltaCm)+'cm',xN-4,yN-5);
      ctx.restore();
    }}]
  });
}

function renderPowerTrendChart(){
  const el=document.getElementById('powerTrendChart');
  dc('powertrend', el);
  if(!el)return;
  const sorted=[...filteredCycles]
    .filter(c=>c.avg_power>0)
    .sort((a,b)=>new Date(a.Date||a.date)-new Date(b.Date||b.date));
  if(sorted.length<3){noData(el,'Not enough power data');return;}

  const labels=sorted.map(r=>fmtDate(r.Date||r.date));
  const avgPwr=sorted.map(r=>r.avg_power);
  const maxPwr=sorted.map(r=>r.max_power||0);

  // 4-ride rolling avg for avg power
  const W=4;
  const smoothAvg=avgPwr.map((_,i)=>{
    const w=avgPwr.slice(Math.max(0,i-W+1),i+1);
    return Math.round(w.reduce((a,b)=>a+b,0)/w.length);
  });

  const typeColorCyc=r=>{
    const t=getActivityType?getActivityType(r):r.ActivityType||'';
    if(t==='Road Cycling') return '#1A4D7A';
    if(t==='Indoor Cycling') return '#4D8EC4';
    return '#2C6FAC';
  };
  const ptColors=sorted.map(r=>typeColorCyc(r)+'cc');

  charts['powertrend']=new Chart(el,{
    type:'scatter',
    data:{
      labels,
      datasets:[
        {type:'scatter',label:'Avg power',data:avgPwr.map((y,i)=>({x:i,y})),backgroundColor:ptColors,pointRadius:4,pointHoverRadius:6,order:3},
        {type:'line',label:'4-ride rolling avg',data:smoothAvg.map((y,i)=>({x:i,y})),borderColor:'#2C6FAC',borderWidth:2,pointRadius:0,fill:false,tension:0.4,order:2},
        {type:'scatter',label:'Peak power',data:maxPwr.map((y,i)=>y>0?{x:i,y}:null),backgroundColor:'#C84B2F44',borderColor:'#C84B2F',borderWidth:1,pointRadius:3,pointHoverRadius:5,order:4},
      ]
    },
    options:{...CD,
      scales:{
        x:{...CD.scales.x,type:'linear',min:0,max:sorted.length-1,ticks:{...CD.scales.x.ticks,callback:(_,i)=>labels[i]||'',maxTicksLimit:10,maxRotation:40}},
        y:{...CD.scales.y,beginAtZero:true,
          ticks:{...CD.scales.y.ticks,callback:v=>v+'w'},
          title:{display:true,text:'Power (watts)',color:'#9e9890',font:{family:"'DM Mono',monospace",size:10}}
        }
      },
      plugins:{...CD.plugins,
        legend:{display:true,position:'top',labels:{font:{family:"'DM Mono',monospace",size:10},color:'#6b6560',boxWidth:10,padding:10}},
        tooltip:{...CD.plugins.tooltip,callbacks:{
          title:ctx=>sorted[ctx[0].dataIndex]?.Title?.replace(/Zwift - /,'').slice(0,40)||'',
          label:ctx=>{
            const r=sorted[ctx.dataIndex];
            if(ctx.datasetIndex===1) return '4-ride avg: '+ctx.parsed.y+'w';
            if(ctx.datasetIndex===2) return 'Peak: '+(r.max_power||0)+'w';
            return[
              'Avg: '+r.avg_power+'w',
              r.avg_speed>0?r.avg_speed+' mph':'',
              r.hr?'HR '+r.hr+' bpm':'',
              r.ActivityType||'',
            ].filter(Boolean);
          }
        }}
      }
    },
    plugins:[{id:'pwrAnnotation',afterDraw(chart){
      const{ctx,scales:{x,y},chartArea}=chart;
      if(smoothAvg.length<2)return;
      const first=smoothAvg[0], last=smoothAvg[smoothAvg.length-1];
      const delta=last-first;
      const xN=x.getPixelForValue(sorted.length-1);
      const yN=y.getPixelForValue(last);
      if(yN>=chartArea.top&&yN<=chartArea.bottom){
        ctx.save();
        ctx.font="bold 9px 'DM Mono',monospace";
        ctx.textAlign='right';
        ctx.fillStyle='#2C6FAC';
        ctx.fillText(last+'w avg · '+(delta>=0?'↑':'↓')+Math.abs(delta)+'w',xN-4,yN-5);
        ctx.restore();
      }
    }}]
  });
}

function renderPeakPowerChart(){
  const el=document.getElementById('peakPowerChart');
  dc('peakpower', el);
  if(!el)return;
  const sorted=[...filteredCycles]
    .filter(c=>c.max_power>0)
    .sort((a,b)=>new Date(a.Date||a.date)-new Date(b.Date||b.date));
  if(!sorted.length){noData(el,'No peak power data');return;}

  const labels=sorted.map(r=>fmtDate(r.Date||r.date));
  const maxPwrs=sorted.map(r=>r.max_power);
  const allTimePR=Math.max(...maxPwrs);
  const prIdx=maxPwrs.indexOf(allTimePR);

  const typeColorCyc=r=>{
    const t=(r.ActivityType||'');
    if(t==='Road Cycling')    return '#1A4D7A';
    if(t==='Indoor Cycling')  return '#4D8EC4';
    return '#2C6FAC';
  };
  const bgColors=sorted.map(r=>typeColorCyc(r)+'cc');
  const bdColors=sorted.map((r,i)=>i===prIdx?'#C84B2F':typeColorCyc(r));
  const bdWidths=sorted.map((_,i)=>i===prIdx?2:0);

  charts['peakpower']=new Chart(el,{
    type:'bar',
    data:{labels,datasets:[{
      label:'Peak power',
      data:maxPwrs,
      backgroundColor:bgColors,
      borderColor:bdColors,
      borderWidth:bdWidths,
      borderRadius:2,
    }]},
    options:{...CD,
      scales:{
        x:{...CD.scales.x,ticks:{...CD.scales.x.ticks,maxTicksLimit:12,maxRotation:40}},
        y:{...CD.scales.y,beginAtZero:true,
          ticks:{...CD.scales.y.ticks,callback:v=>v+'w'},
          title:{display:true,text:'Max power (watts)',color:'#9e9890',font:{family:"'DM Mono',monospace",size:10}}
        }
      },
      plugins:{...CD.plugins,
        legend:{display:false},
        tooltip:{...CD.plugins.tooltip,callbacks:{
          title:ctx=>sorted[ctx[0].dataIndex]?.Title?.replace(/Zwift - /,'').replace(/Oakley |Newark /,'').slice(0,40)||'',
          label:ctx=>{
            const r=sorted[ctx.dataIndex];
            const isPR=ctx.dataIndex===prIdx;
            return[
              (isPR?'★ PR · ':'')+r.max_power+'w peak',
              'Avg: '+r.avg_power+'w',
              r.avg_speed>0?r.avg_speed+' mph':'',
              r.ActivityType||'',
            ].filter(Boolean);
          }
        }}
      }
    },
    plugins:[{id:'prLabel',afterDraw(chart){
      const{ctx,scales:{x,y},chartArea}=chart;
      if(prIdx<0||prIdx>=sorted.length)return;
      const xPR=x.getPixelForValue(prIdx);
      const yPR=y.getPixelForValue(allTimePR);
      if(yPR<chartArea.top||yPR>chartArea.bottom)return;
      ctx.save();
      ctx.fillStyle='#C84B2F';
      ctx.font="bold 9px 'DM Mono',monospace";
      ctx.textAlign='center';
      ctx.fillText('★ '+allTimePR+'w PR',xPR,yPR-7);
      ctx.restore();

      // Legend
      const types=[
        {label:'Zwift/Virtual',color:'#2C6FACcc'},
        {label:'Road',color:'#1A4D7Acc'},
      ];
      let lx=chartArea.left+8;
      const ly=chartArea.bottom+28;
      types.forEach(t=>{
        ctx.save();
        ctx.fillStyle=t.color;
        ctx.fillRect(lx,ly,8,8);
        ctx.fillStyle='#6b6560';
        ctx.font="9px 'DM Mono',monospace";
        ctx.textAlign='left';
        ctx.fillText(t.label,lx+11,ly+8);
        lx+=70;
        ctx.restore();
      });
    }}]
  });
}

function renderSpeedPowerChart(){
  const el=document.getElementById('speedPowerChart');
  dc('speedpower', el);
  if(!el)return;
  const data=[...filteredCycles].filter(c=>c.avg_power>0&&c.avg_speed>0);
  if(data.length<3){noData(el,'Not enough speed+power data');return;}

  const typeColorCyc=r=>{
    const t=(r.ActivityType||'');
    if(t==='Road Cycling')   return '#1A4D7A';
    if(t==='Indoor Cycling') return '#4D8EC4';
    return '#2C6FAC';
  };

  // Split into datasets by type for a proper legend
  const virtual=data.filter(c=>c.ActivityType==='Virtual Cycling');
  const road=data.filter(c=>c.ActivityType==='Road Cycling');
  const indoor=data.filter(c=>c.ActivityType==='Indoor Cycling');

  const mkDataset=(arr,label,color)=>({
    label,
    data:arr.map(c=>({x:c.avg_power,y:c.avg_speed,r:c})),
    backgroundColor:color+'99',
    borderColor:color,
    borderWidth:1,
    pointRadius:arr.map(c=>Math.sqrt(c.Distance||1)*2.2),
    pointHoverRadius:arr.map(c=>Math.sqrt(c.Distance||1)*2.8),
  });

  // Efficiency reference lines — speed = k * power (iso-efficiency lines)
  // For each efficiency level, speed = eff * power
  const effs=[0.08,0.12,0.16,0.20];
  const maxPwr=Math.max(...data.map(c=>c.avg_power))*1.1;
  const effDatasets=effs.map(eff=>({
    label:'',
    data:[{x:0,y:0},{x:maxPwr,y:eff*maxPwr}],
    borderColor:'#d0ccc511',
    borderWidth:1,
    borderDash:[4,4],
    pointRadius:0,
    showLine:true,
    fill:false,
    type:'line',
    tension:0,
  }));

  charts['speedpower']=new Chart(el,{
    type:'scatter',
    data:{datasets:[
      ...effDatasets,
      ...[virtual,road,indoor]
        .map((arr,i)=>[arr,[['Virtual','#2C6FAC'],['Road','#1A4D7A'],['Indoor','#4D8EC4']][i]])
        .filter(([arr])=>arr.length>0)
        .map(([arr,[label,color]])=>mkDataset(arr,label,color)),
    ]},
    options:{...CD,
      scales:{
        x:{...CD.scales.x,beginAtZero:true,
          ticks:{...CD.scales.x.ticks,callback:v=>v+'w'},
          title:{display:true,text:'Avg power (watts)',color:'#9e9890',font:{family:"'DM Mono',monospace",size:10}}
        },
        y:{...CD.scales.y,beginAtZero:true,
          ticks:{...CD.scales.y.ticks,callback:v=>v+' mph'},
          title:{display:true,text:'Avg speed (mph)',color:'#9e9890',font:{family:"'DM Mono',monospace",size:10}}
        }
      },
      plugins:{...CD.plugins,
        legend:{display:true,position:'top',labels:{
          filter:item=>item.text!=='',
          font:{family:"'DM Mono',monospace",size:10},color:'#6b6560',boxWidth:10,padding:10
        }},
        tooltip:{...CD.plugins.tooltip,callbacks:{
          title:ctx=>{
            const pt=ctx[0].raw;
            return pt?.r?.Title?.replace(/Zwift - /,'').replace(/Oakley |Newark /,'').slice(0,40)||'';
          },
          label:ctx=>{
            const pt=ctx.raw;
            if(!pt?.r)return ctx.parsed.y+' mph';
            const c=pt.r;
            const eff=(c.avg_speed/c.avg_power).toFixed(3);
            return[
              c.avg_speed+' mph · '+c.avg_power+'w',
              eff+' mph/w efficiency',
              (c.Distance||0).toFixed(1)+' mi · '+c.ActivityType,
              c.hr?'HR '+c.hr+' bpm':'',
            ].filter(Boolean);
          }
        }}
      }
    }
  });
}

function renderHRZoneChartCyc(){
  // Cycling-page dedicated HR zone chart using hrZoneChartCyc canvas
  const orig = activeView;
  const origPage = analyticsPage;
  // Temporarily set cycling view for the zone calc
  const el = document.getElementById('hrZoneChartCyc');
  if(!el) return;
  dc('hrzonecyc', document.getElementById('hrZoneChartCyc'));
  const acts = filteredCycles.filter(r=>r.hr>0);
  if(!acts.length){noData(el,'No HR data');return;}
  const counts=HR_ZONES.map(z=>({num:z.num,name:z.name,color:z.color,label:z.label,lo:z.lo,hi:z.hi,count:acts.filter(r=>r.hr>=z.lo&&r.hr<=z.hi).length}));
  const total=acts.length;
  const legendHTML=counts.map(z=>'<span style="display:flex;align-items:center;gap:4px;font-size:10px;color:#6b6560;white-space:nowrap"><span style="width:9px;height:9px;border-radius:2px;background:'+z.color+';flex-shrink:0"></span>'+z.label+' '+z.name+' · '+z.count+' ('+Math.round(z.count/total*100)+'%)</span>').join('');
  const wrap=el.parentElement;
  const existing=wrap.querySelector('.zone-legend');
  if(existing){existing.innerHTML=legendHTML;}
  else{const div=document.createElement('div');div.className='zone-legend';div.style.cssText='display:flex;flex-wrap:wrap;gap:8px 14px;margin-bottom:10px;';div.innerHTML=legendHTML;wrap.insertBefore(div,el);}
  const datasets=counts.map((z,i)=>({
    label:z.label+' '+z.name,
    data:[Math.round(z.count/total*100)],
    backgroundColor:z.color,
    borderWidth:0,
    borderRadius:i===0?{topLeft:3,bottomLeft:3,topRight:0,bottomRight:0}:i===counts.length-1?{topLeft:0,bottomLeft:0,topRight:3,bottomRight:3}:0,
    borderSkipped:false
  }));
  charts['hrzonecyc']=new Chart(el,{
    type:'bar',
    data:{labels:[total+' rides'],datasets},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
      scales:{x:{stacked:true,display:false,max:100},y:{stacked:true,display:false}},
      plugins:{legend:{display:false},tooltip:{backgroundColor:'#141210',callbacks:{
        label:ctx=>counts[ctx.datasetIndex].label+' '+counts[ctx.datasetIndex].name+': '+counts[ctx.datasetIndex].count+' rides ('+Math.round(counts[ctx.datasetIndex].count/total*100)+'%)'
      }}},
      layout:{padding:{top:4,bottom:4}}
    }
  });
}

function renderCycleTable(){
  const thead=document.querySelector('#cycleTable thead tr');
  const tbody=document.getElementById('cycleTableBody');
  if(!thead||!tbody)return;
  thead.innerHTML=`
    <th data-action="sort-table" data-key="date">Date</th>
    <th data-action="sort-table" data-key="title">Title</th>
    <th data-action="sort-table" data-key="ActivityType">Type</th>
    <th data-action="sort-table" data-key="Distance">Dist (mi)</th>
    <th data-action="sort-table" data-key="avg_speed">Speed</th>
    <th data-action="sort-table" data-key="avg_power">Avg Power</th>
    <th data-action="sort-table" data-key="ascent">Elev</th>
    <th data-action="sort-table" data-key="hr">Avg HR</th>
    <th data-action="sort-table" data-key="cadence">Cadence</th>
    <th data-action="sort-table" data-key="aerobic_te">Aerobic TE</th>
    <th></th>`;
  // Restore the ↑/↓ arrow on the active sort column (innerHTML rebuild wipes it).
  thead.querySelectorAll('th').forEach(th => {
    if (th.dataset.key === tableSortKey) th.classList.add('sort-' + tableSortDir);
  });
  const searchQ=(document.getElementById('rideLogSearch')?.value||'').toLowerCase().trim();
  const sorted=[...filteredCycles].filter(r=>!searchQ||((r.Title||r.title||'').toLowerCase().includes(searchQ))).sort((a,b)=>{
    const v=r=>{
      if(tableSortKey==='date') return new Date(r.Date||r.date);
      if(tableSortKey==='title') return (r.Title||r.title||'').toLowerCase();
      return r[tableSortKey]||0;
    };
    return tableSortDir==='asc'?(v(a)>v(b)?1:-1):(v(a)<v(b)?1:-1);
  });
  const typeColorCyc=r=>{const t=r.ActivityType||'';if(t==='Road Cycling')return'#1A4D7A';if(t==='Indoor Cycling')return'#4D8EC4';return'#2C6FAC';};
  tbody.innerHTML=sorted.map((r,idx)=>{
    const typeTag=`<span class="type-tag" style="background:${typeColorCyc(r)}22;color:${typeColorCyc(r)}">${(r.ActivityType||'').replace(' Cycling','')}</span>`;
    const shareBtn=`<td><button data-action="open-share-modal" data-share-type="ride" data-source="cycle" data-row-idx="${idx}" class="row-action-btn">↗</button> <button data-action="open-activity-detail" data-garmin-id="${r.garmin_id||''}" data-date="${(r.Date||r.date||'').slice(0,10)}" data-title="${(r.Title||'').replace(/"/g,'&quot;')}" data-type="Cycling" data-distance="${r.Distance||0}" class="row-action-btn" title="View splits & zones">⊞</button></td>`;
    return`<tr>
      <td>${fmtDate(r.Date||r.date)}</td>
      <td class="run-title-cell">${(r.Title||'—').replace(/Zwift - /,'').replace(/Oakley |Newark /,'')}</td>
      <td>${typeTag}</td>
      <td>${(r.Distance||0).toFixed(2)}</td>
      <td>${r.avg_speed>0?r.avg_speed+' mph':'—'}</td>
      <td>${r.avg_power?r.avg_power+'w':'—'}</td>
      <td>${parseAscent(r.ascent)>0?parseAscent(r.ascent).toLocaleString()+'ft':'—'}</td>
      <td>${r.hr?r.hr+' '+hrZoneLabel(r.hr):'—'}</td>
      <td>${r.cadence||'—'}</td>
      <td>${r.aerobic_te||'—'}</td>
      ${shareBtn}
    </tr>`;
  }).join('');
  window._cycleTableRows = sorted;
}

function renderAnalytics(){
  if(typeof Chart === 'undefined') {
    document.getElementById('chartFallback') && (document.getElementById('chartFallback').style.display='block');
    renderStats();
    renderTable();
    return;
  }
  renderStats();

  if(analyticsPage==='overview') {
    renderHRZoneChart();
    renderWeeklyChart();
    renderTrainingLoadChart();
    renderElevationChart();
  } else if(analyticsPage==='running') {
    renderLastRunSnapshot();
    renderPaceChart();
    renderPaceProgressChart();
    renderHRPaceChart();
    renderAeroEffChart();
    renderLongRunChart();
    renderCadenceChart();
    renderGCTChart();
    renderGCTMsChart();
    renderStrideLenChart();
    renderVertRatioChart();
    renderVOChart();
    renderTable();
  } else if(analyticsPage==='cycling') {
    renderLastRideSnapshot();
    renderCyclingChart();
    renderCyclingPowerChart();
    renderPowerTrendChart();
    renderPeakPowerChart();
    renderSpeedPowerChart();
    renderHRZoneChartCyc();
    renderCycleTable();
  }
  renderActivityBreakdownChart();
}


