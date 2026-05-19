// ════════════════════════════════════════════════════════════════════
// DB INTEGRATION — connects to local Flask server (python serve.py)
// ════════════════════════════════════════════════════════════════════

const DB_CANDIDATES = ['http://localhost:5000', 'http://127.0.0.1:5000'];
let DB_BASE = 'http://localhost:5000';
let _dbConnected = false;
let _actModalData = {};   // { date, title, activityId }
let _actModalTab  = 'splits';

// ── Status check ────────────────────────────────────────────────────
async function checkDbStatus() {
  const badge = document.getElementById('dbStatusBadge');
  for (const base of DB_CANDIDATES) {
    try {
      const r = await fetch(base + '/api/status', {signal: AbortSignal.timeout(1500)});
      const d = await r.json();
      if (d.connected) {
        DB_BASE = base;
        _dbConnected = true;
        if (badge) {
          badge.className = 'db-badge db-connected';
          badge.innerHTML = '<span class="db-dot"></span>DB live';
          badge.title = 'Connected · ' + d.db;
        }
        renderPowerCurveFromDB();
        renderCyclingLoadFromDB();
        return;
      }
    } catch { /* try next */ }
  }
  _dbConnected = false;
  if (badge) {
    badge.className = 'db-badge db-disconnected';
    badge.innerHTML = '<span class="db-dot"></span>DB offline';
    badge.title = 'Start server: cd training-db && python serve.py';
  }
}

// ── Activity detail modal ────────────────────────────────────────────
function openActModal(date, title, actType, dist, garminId) {
  // garminId (when present) is the preferred key for DB-backed API calls.
  // date/title/dist/actType remain available for the fuzzy-match fallback.
  _actModalData = { date, title, actType, dist: dist||'', garminId: garminId||'' };
  _actModalTab  = 'splits';
  document.getElementById('actModalTitle').textContent = title;
  document.getElementById('actModalSub').textContent   = date;

  const isRun = actType === 'Running' || actType === 'run';

  // Show/hide tabs based on activity type
  document.querySelectorAll('.act-modal-tab').forEach((t, i) => {
    const tab = t.dataset.tab;
    // Hide form drift for cycling — it's running-only
    if (tab === 'drift') {
      t.style.display = isRun ? '' : 'none';
    } else {
      t.style.display = '';
    }
    t.classList.toggle('active', i === 0);
  });

  document.getElementById('actModal').classList.add('open');
  loadActModalTab('splits');
}

function closeActModal() {
  document.getElementById('actModal').classList.remove('open');
}

function showActTab(tab, el) {
  _actModalTab = tab;
  document.querySelectorAll('.act-modal-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  loadActModalTab(tab);
}

async function loadActModalTab(tab) {
  const body = document.getElementById('actModalBody');
  if (!_dbConnected) {
    body.innerHTML = `<div class="no-db-msg">
      <div style="margin-bottom:6px">🔌 Local server not running</div>
      <div style="font-size:10px">Start it with: <code style="background:var(--surface2);padding:2px 6px;border-radius:3px;">python serve.py</code></div>
    </div>`;
    return;
  }

  body.innerHTML = '<div class="no-db-msg">Loading…</div>';
  const { date, title, garminId } = _actModalData;

  // Build a params object that always prefers garmin_id when we have it,
  // falling back to (date, type[, title, dist]) for activities not in the DB.
  const idParams = (extra = {}) => {
    const p = new URLSearchParams();
    if (garminId) p.set('garmin_id', garminId);
    else {
      if (date) p.set('date', date);
      if (_actModalData.actType) p.set('type', _actModalData.actType);
    }
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== '') p.set(k, v);
    }
    return p;
  };

  try {
    if (tab === 'splits') {
      const { actType, dist } = _actModalData;
      // Extra fields are only used by the legacy fallback path (no garmin_id),
      // but include them anyway — the backend ignores them when garmin_id wins.
      const params = idParams({ title: title.slice(0,30), dist: dist || '' });
      const r = await fetch(`${DB_BASE}/api/laps?${params}`);
      const d = await r.json();
      if (d.not_imported) {
        body.innerHTML = `<div class="no-db-msg">
          <div style="margin-bottom:6px">Activity not in database yet</div>
          <div style="font-size:10px;color:var(--text3);margin-top:4px">${d.message}</div>
        </div>`;
        return;
      }
      body.innerHTML = renderSplitsTab(d.laps || [], actType);

    } else if (tab === 'zones') {
      const r = await fetch(`${DB_BASE}/api/hr_zones?${idParams()}`);
      const d = await r.json();
      // With garmin_id, the backend returns exactly one row. Without it, we still
      // get the legacy multi-row response, so the fallback ranking from the earlier
      // fix stays in place.
      const list = d.zones || [];
      const zones = list.find(z => z.title === title)
        || list.slice().sort((a,b) => (b.total_sec||0) - (a.total_sec||0))[0];
      body.innerHTML = renderZonesTab(zones);

    } else if (tab === 'drift') {
      const isRun = _actModalData.actType === 'Running' || _actModalData.actType === 'run';
      if (!isRun) {
        body.innerHTML = '<div class="no-db-msg">Form drift is only available for running activities.</div>';
        return;
      }
      const r = await fetch(`${DB_BASE}/api/form_drift?${idParams()}`);
      const d = await r.json();
      // Same pattern as zones: with garmin_id we get exactly one row; without it the
      // title-match → first-row fallback still applies.
      const drift = (d.drift || []).find(z => z.title === title) || d.drift?.[0];
      body.innerHTML = renderDriftTab(drift);
    }
  } catch(e) {
    body.innerHTML = `<div class="no-db-msg">Error: ${e.message}</div>`;
  }
}

// ── Splits tab renderer ──────────────────────────────────────────────
function renderSplitsTab(laps, actType) {
  if (!laps.length) return '<div class="no-db-msg">No lap data found in database.<br><span style="font-size:10px">Import this activity first: python import_fit.py garmin_fit/</span></div>';

  const isRun = actType === 'Running' || actType === 'run';
  const headers = isRun
    ? ['Mile','Dist','Pace','HR','Cad','GCT','Left%','VO','VR','Power','NP','Cal','Asc','Temp']
    : ['Lap','Dist','Speed','HR','Cad','Power','NP','Cal','Asc','Temp'];

  let html = `<table class="splits-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>`;

  laps.forEach(lap => {
    const isCooldown = lap.pace_sec && lap.pace_sec > 700;
    const isItbWarn  = lap.left_gct_pct && lap.left_gct_pct < 47.5;
    const rowStyle   = isCooldown ? ' style="opacity:0.45"' : '';

    if (isRun) {
      html += `<tr${rowStyle}>
        <td>${lap.lap_number}</td>
        <td>${lap.distance_mi?.toFixed(2) ?? '—'}</td>
        <td class="${isCooldown?'splits-warn':''}">${lap.pace_fmt ?? '—'}</td>
        <td>${lap.avg_hr ?? '—'}</td>
        <td>${lap.cadence_spm ?? '—'}</td>
        <td>${lap.gct_ms ? Math.round(lap.gct_ms)+'ms' : '—'}</td>
        <td class="${isItbWarn?'splits-warn':''}">${lap.left_gct_pct?.toFixed(1)+'%' ?? '—'}</td>
        <td>${lap.vert_osc_cm?.toFixed(1)+'cm' ?? '—'}</td>
        <td>${lap.vert_ratio_pct?.toFixed(1)+'%' ?? '—'}</td>
        <td>${lap.avg_power_w ? lap.avg_power_w+'w' : '—'}</td>
        <td>${lap.norm_power_w ? lap.norm_power_w+'w' : '—'}</td>
        <td>${lap.calories ?? '—'}</td>
        <td>${lap.ascent_ft ? Math.round(lap.ascent_ft)+'ft' : '—'}</td>
        <td>${lap.avg_temp_c != null ? lap.avg_temp_c+'°C' : '—'}</td>
      </tr>`;
    } else {
      const spd = lap.speed_mph != null ? lap.speed_mph.toFixed(1)+' mph' : '—';
      const cad = lap.cadence_rpm != null ? lap.cadence_rpm+' rpm' : '—';
      html += `<tr${rowStyle}>
        <td>${lap.lap_number}</td>
        <td>${lap.distance_mi?.toFixed(2) ?? '—'}</td>
        <td>${spd}</td>
        <td>${lap.avg_hr ?? '—'}</td>
        <td>${cad}</td>
        <td>${lap.avg_power_w ? lap.avg_power_w+'w' : '—'}</td>
        <td>${lap.norm_power_w ? lap.norm_power_w+'w' : '—'}</td>
        <td>${lap.calories ?? '—'}</td>
        <td>${lap.ascent_ft ? Math.round(lap.ascent_ft)+'ft' : '—'}</td>
        <td>${lap.avg_temp_c != null ? lap.avg_temp_c+'°C' : '—'}</td>
      </tr>`;
    }
  });

  html += '</tbody></table>';
  if (isRun) html += '<p style="font-size:9px;color:var(--text3);margin-top:8px">Red = IT band risk (left GCT < 47.5%) · Dimmed = cooldown walk</p>';
  return html;
}

// ── HR Zones tab renderer ────────────────────────────────────────────
function renderZonesTab(zones) {
  if (!zones) return '<div class="no-db-msg">No HR zone data found.</div>';
  const zColors = ['#9e9890','#2C6FAC','#1D9E75','#EF9F27','#E24B4A'];
  const zNames  = ['Z1 Recovery','Z2 Easy','Z3 Aerobic','Z4 Threshold','Z5 Max'];
  const zRanges = ['<121','121–152','152–166','166–179','179+'];
  const total   = zones.total_sec || 1;

  let bar = '<div class="zone-bar">';
  for (let i=1;i<=5;i++) {
    const pct = zones[`z${i}_pct`] || 0;
    if (pct > 0) bar += `<div class="zone-seg" style="flex:${pct};background:${zColors[i-1]}" title="${zNames[i-1]}: ${pct}%"></div>`;
  }
  bar += '</div>';

  let legend = '<div class="zone-legend">';
  for (let i=1;i<=5;i++) {
    const secs = zones[`z${i}_sec`] || 0;
    const pct  = zones[`z${i}_pct`] || 0;
    if (secs > 0) {
      const m = Math.floor(secs/60), s = secs%60;
      legend += `<div class="zone-leg-item"><div class="zone-leg-dot" style="background:${zColors[i-1]}"></div>${zNames[i-1]} ${zRanges[i-1]} bpm — ${m}:${String(s).padStart(2,'0')} (${pct}%)</div>`;
    }
  }
  legend += '</div>';

  return bar + legend;
}

// ── Form drift tab renderer ──────────────────────────────────────────
function renderDriftTab(drift) {
  if (!drift) return '<div class="no-db-msg">No form drift data found.<br><span style="font-size:10px">Only available for runs with running dynamics data.</span></div>';

  const metrics = [
    { key:'hr',       label:'Heart Rate',   unit:'bpm',  field:'hr',        higherBad:true  },
    { key:'gct_ms',   label:'GCT',          unit:'ms',   field:'gct_ms',    higherBad:true  },
    { key:'left_pct', label:'Left GCT',     unit:'%',    field:'left_pct',  higherBad:false },
    { key:'vert_osc', label:'Vert Osc',     unit:'mm',   field:'vert_osc',  higherBad:true  },
    { key:'power_w',  label:'Power',        unit:'w',    field:'power_w',   higherBad:false },
  ];

  let html = `<p style="font-size:10px;color:var(--text3);margin-bottom:12px">First mile vs last running mile — tracks whether form held or degraded over the run.</p>`;
  html += '<div class="drift-grid">';

  for (const m of metrics) {
    const first = drift[`first_${m.field}`];
    const last  = drift[`last_${m.field}`];
    const delta = drift[`delta_${m.field}`];
    if (first == null || last == null) continue;

    const isBad   = m.higherBad ? delta > 5 : delta < -5;
    const isGood  = m.higherBad ? delta < -5 : delta > 5;
    const dClass  = isBad ? 'drift-pos' : isGood ? 'drift-neg' : 'drift-neut';
    const dSign   = delta > 0 ? '+' : '';
    const dLabel  = `${dSign}${delta?.toFixed(1)} ${m.unit}`;

    html += `<div class="drift-card">
      <div class="drift-label">${m.label}</div>
      <div class="drift-vals">
        <span>${first.toFixed(1)}</span>
        <span class="drift-arrow">→</span>
        <span>${last.toFixed(1)}</span>
        <span style="font-size:9px;font-family:var(--mono);font-style:normal;color:var(--text3)">${m.unit}</span>
      </div>
      <div class="drift-delta ${dClass}">${dLabel}</div>
    </div>`;
  }

  html += '</div>';
  return html;
}

// ── Power curve chart (DB) ───────────────────────────────────────────
async function renderPowerCurveFromDB() {
  const card = document.getElementById('powerCurveCard');
  const el   = document.getElementById('powerCurveChart');
  if (!el || !card) return;

  try {
    const r = await fetch(DB_BASE + '/api/power_curve');
    const d = await r.json();
    if (!d.activities?.length) return;

    card.style.display = '';
    const ftp    = d.ftp || 372;
    const pr     = d.prs || {};
    const labels = ['1s','5s','10s','30s','1 min','5 min','10 min','20 min'];
    const keys   = ['power_1s','power_5s','power_10s','power_30s','power_60s','power_300s','power_600s','power_1200s'];
    const prKeys = ['pr_1s',   'pr_5s',   'pr_10s',   'pr_30s',   'pr_60s',   'pr_300s',   'pr_600s',   'pr_1200s'];
    const prVals = prKeys.map(k => pr[k] || null);
    const ftpPct = prVals.map(v => v ? Math.round(v/ftp*100) : null);

    const ctx = el.getContext('2d');
    if (charts['cycPowerCurve']) charts['cycPowerCurve'].destroy();

    charts['cycPowerCurve'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Best power (w)',
          data: prVals,
          backgroundColor: prVals.map(v => {
            if (!v) return CHART_THEME.empty;
            const pct = v/ftp;
            return pct >= 1.0 ? '#C84B2F99' : pct >= 0.9 ? '#EF9F2799' : '#1D5FA099';
          }),
          borderColor: prVals.map(v => {
            if (!v) return CHART_THEME.empty;
            const pct = v/ftp;
            return pct >= 1.0 ? '#C84B2F' : pct >= 0.9 ? '#EF9F27' : '#1D5FA0';
          }),
          borderWidth: 1,
          borderRadius: 3,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const v = ctx.parsed.y;
                const pct = v ? Math.round(v/ftp*100) : 0;
                return `${v}w (${pct}% FTP)`;
              }
            }
          }
        },
        scales: {
          x: { grid: { color:CHART_THEME.grid }, ticks: { color:CHART_THEME.tick, font:{family:"'DM Mono',monospace",size:10} } },
          y: {
            grid: { color:CHART_THEME.grid },
            ticks: { color:CHART_THEME.tick, font:{family:"'DM Mono',monospace",size:10}, callback: v => v+'w' },
            title: { display:true, text:`Power (w) · FTP = ${ftp}w`, color:CHART_THEME.axisTitle, font:{family:"'DM Mono',monospace",size:9} }
          }
        }
      }
    });
  } catch(e) {
    console.log('Power curve DB error:', e);
  }
}

// ── Cycling load chart (DB) ──────────────────────────────────────────
async function renderCyclingLoadFromDB() {
  const card = document.getElementById('cyclingLoadCard');
  const el   = document.getElementById('cyclingLoadChart');
  if (!el || !card) return;

  try {
    const r = await fetch(DB_BASE + '/api/cycling_load');
    const d = await r.json();
    if (!d.rides?.length) return;

    card.style.display = '';
    const rides  = d.rides;
    const labels = rides.map(r => r.activity_date?.slice(5)); // MM-DD
    const tss    = rides.map(r => r.training_stress_score);
    const np     = rides.map(r => r.norm_power_w);
    const iff    = rides.map(r => r.intensity_factor ? Math.round(r.intensity_factor*100) : null);

    const ctx = el.getContext('2d');
    if (charts['cyclingLoad']) charts['cyclingLoad'].destroy();

    charts['cyclingLoad'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'TSS',
            data: tss,
            backgroundColor: '#1D5FA055',
            borderColor: '#1D5FA0',
            borderWidth: 1,
            borderRadius: 3,
            yAxisID: 'yTss',
          },
          {
            type: 'line',
            label: 'Norm Power (w)',
            data: np,
            borderColor: '#EF9F27',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#EF9F27',
            yAxisID: 'yPwr',
            tension: 0.3,
          },
          {
            type: 'line',
            label: 'IF × 100',
            data: iff,
            borderColor: '#C84B2F',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [4,3],
            pointRadius: 2,
            pointBackgroundColor: '#C84B2F',
            yAxisID: 'yTss',
            tension: 0.3,
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color:'#8a8278', font:{family:"'DM Mono',monospace",size:9}, boxWidth:10 }
          }
        },
        scales: {
          x: { grid:{color:CHART_THEME.grid}, ticks:{color:CHART_THEME.tick,font:{family:"'DM Mono',monospace",size:9}} },
          yTss: {
            position:'left', grid:{color:CHART_THEME.grid},
            ticks:{color:CHART_THEME.tick,font:{family:"'DM Mono',monospace",size:9}},
            title:{display:true,text:'TSS / IF×100',color:CHART_THEME.axisTitle,font:{family:"'DM Mono',monospace",size:9}}
          },
          yPwr: {
            position:'right', grid:{drawOnChartArea:false},
            ticks:{color:'#EF9F27',font:{family:"'DM Mono',monospace",size:9},callback:v=>v+'w'},
            title:{display:true,text:'Norm Power',color:'#EF9F27',font:{family:"'DM Mono',monospace",size:9}}
          }
        }
      }
    });
  } catch(e) {
    console.log('Cycling load DB error:', e);
  }
}

// ── Wire up activity modal to table rows ─────────────────────────────
// Override the existing share button column to add an "expand" button
const _origRenderTable = window.renderTable;
window.renderTable = function() {
  if (_origRenderTable) _origRenderTable();
  // Add ↗ detail buttons wired to openActModal
  // (table rows already re-render via existing renderTable — 
  //  the ↗ share buttons call openShareModal; we add a separate ⊞ button)
};

// Called from table row ↗ button — already exists.
// We extend openShareModal to also store the activity for the modal.
const _origOpenShare = window.openShareModal;
window.openShareModal = function(type, activity) {
  if (_origOpenShare) _origOpenShare(type, activity);
};

// New function for the detail modal button (added to each table row)
window.openActivityDetail = function(date, title, actType, dist, garminId) {
  openActModal(date, title, actType, dist, garminId);
};

// ── Best Efforts card ────────────────────────────────────────────────
// Pretty labels + value formatters keyed by effort_type. Anything not in this
// map falls back to a humanized form of the raw key.
const EFFORT_LABELS = {
  '400m':'400m', '800m':'1/2 mile', '1K':'1 km', '1mi':'1 mile', '2mi':'2 mile',
  '5K':'5K', '10K':'10K', '15K':'15K', '10mi':'10 mile', '20K':'20K',
  'half_marathon':'Half-Marathon', '30K':'30K', 'marathon':'Marathon',
  '5mi':'5 mile', '40K':'40K',
  'longest_run':'Longest Run', 'longest_ride':'Longest Ride',
  'most_elevation_run':'Most Elevation', 'most_elevation_ride':'Elevation Gain',
  'biggest_climb':'Biggest Climb', 'most_aerobic_te':'Best Aerobic TE',
  'pwr_1s':'Best 1s Power', 'pwr_5s':'Best 5s Power', 'pwr_10s':'Best 10s Power',
  'pwr_30s':'Best 30s Power', 'pwr_60s':'Best 1min Power', 'pwr_300s':'Best 5min Power',
  'pwr_600s':'Best 10min Power', 'pwr_1200s':'Best 20min Power',
  'most_tss':'Biggest TSS', 'highest_np':'Highest NP',
};

function fmtEffortValue(value, unit) {
  if (unit === 'sec') {
    const s = Math.round(value);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
             : `${m}:${String(sec).padStart(2,'0')}`;
  }
  if (unit === 'mi')  return `${value.toFixed(2)} mi`;
  if (unit === 'ft')  return `${Math.round(value).toLocaleString()} ft`;
  if (unit === 'w')   return `${Math.round(value)} w`;
  if (unit === 'tss') return value.toFixed(1);
  if (unit === 'te')  return value.toFixed(1);
  return String(value);
}

function fmtEffortDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m,10)-1]} ${parseInt(d,10)}, ${y}`;
}

async function renderBestEfforts(type) {
  // type: 'Running' | 'Cycling'
  const containerId = type === 'Running' ? 'bestEffortsRun' : 'bestEffortsCycle';
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!_dbConnected) {
    el.innerHTML = '<div class="best-effort-empty">DB offline — start <code>python serve.py</code> to see PRs.</div>';
    return;
  }

  try {
    const r = await fetch(`${DB_BASE}/api/best_efforts?type=${encodeURIComponent(type)}`);
    const d = await r.json();
    const rows = d.efforts || [];
    if (!rows.length) {
      el.innerHTML = '<div class="best-effort-empty">No best efforts yet.</div>';
      return;
    }
    el.innerHTML = '<div class="best-efforts-list">' + rows.map(e => {
      const label = EFFORT_LABELS[e.effort_type] || e.effort_type;
      const value = fmtEffortValue(e.effort_value, e.unit);
      const date  = fmtEffortDate(e.activity_date);
      const title = (e.title || '').replace(/"/g, '&quot;');
      // Each row clickable → opens activity detail modal via the dispatcher
      return `<div class="best-effort-row"
                   data-action="open-activity-detail"
                   data-garmin-id="${e.garmin_id || ''}"
                   data-date="${e.activity_date || ''}"
                   data-title="${title}"
                   data-type="${type}"
                   data-distance=""
                   title="${title}">
        <span class="best-effort-label">${label}</span>
        <span class="best-effort-value">${value}</span>
        <span class="best-effort-date">${date}</span>
      </div>`;
    }).join('') + '</div>';
  } catch (e) {
    el.innerHTML = `<div class="best-effort-empty">Error loading PRs: ${e.message}</div>`;
  }
}
window.renderBestEfforts = renderBestEfforts;

// ── Keyboard close ───────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeActModal();
});

// ── Init ─────────────────────────────────────────────────────────────
// Check DB status on load and every 30 seconds
checkDbStatus();
setInterval(checkDbStatus, 30000);
