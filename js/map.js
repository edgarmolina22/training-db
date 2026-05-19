// ════════════════════════════════════════════════════════════════════
// MAP TAB — Leaflet with pace heatmap (slow=coral → fast=green)
// ════════════════════════════════════════════════════════════════════
let _leafletMap = null;

function lerpColor(a, b, t) {
  const ah=parseInt(a.slice(1),16), bh=parseInt(b.slice(1),16);
  const ar=ah>>16,ag=(ah>>8)&255,ab_=ah&255;
  const br=bh>>16,bg=(bh>>8)&255,bb=bh&255;
  const r=Math.round(ar+(br-ar)*t),g=Math.round(ag+(bg-ag)*t),bl=Math.round(ab_+(bb-ab_)*t);
  return `#${((1<<24)|(r<<16)|(g<<8)|bl).toString(16).slice(1)}`;
}

function paceColor(paceSec, fastSec, slowSec) {
  if (!paceSec || paceSec > 1200) return '#6e6558';
  const t = Math.max(0, Math.min(1, (paceSec - fastSec) / Math.max(1, slowSec - fastSec)));
  if (t < 0.5) return lerpColor('#2D7A5A', '#EF9F27', t * 2);
  return lerpColor('#EF9F27', '#C84B2F', (t - 0.5) * 2);
}

function fmtPace(sec) {
  if (!sec) return '—';
  return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}/mi`;
}

async function loadMapTab() {
  const body = document.getElementById('actModalBody');
  if (!_dbConnected) {
    body.innerHTML = `<div class="no-db-msg">🔌 Local server not running<br><span style="font-size:10px">Start: <code style="background:var(--surface2);padding:2px 6px;border-radius:3px;">python serve.py</code></span></div>`;
    return;
  }
  body.innerHTML = `
    <div id="actMapContainer"></div>
    <div class="map-legend">
      <div class="map-leg-item"><div class="map-leg-dot" style="background:#2D7A5A"></div>Fast</div>
      <div class="map-leg-item"><div class="map-leg-dot" style="background:#EF9F27"></div>Mid</div>
      <div class="map-leg-item"><div class="map-leg-dot" style="background:#C84B2F"></div>Slow</div>
      <div class="map-leg-item"><div class="map-leg-dot" style="background:#6e6558"></div>Walk</div>
      <span id="mapPaceRange" style="font-size:9px;color:var(--text3);margin-left:8px"></span>
      <span id="mapPointCount" style="margin-left:auto;font-size:9px;color:var(--text3)"></span>
    </div>`;

  if (_leafletMap) { _leafletMap.remove(); _leafletMap = null; }

  const { date, actType, dist, garminId } = _actModalData;
  try {
    // Prefer garmin_id; fall back to date+type+dist for activities not in the DB.
    const params = new URLSearchParams();
    if (garminId) params.set('garmin_id', garminId);
    else {
      if (date)    params.set('date', date);
      if (actType) params.set('type', actType);
      if (dist)    params.set('dist', dist);
    }
    const res = await fetch(`${DB_BASE}/api/route?${params}`);
    const d = await res.json();

    if (!d.points || !d.points.length) {
      document.getElementById('actMapContainer').innerHTML =
        `<div class="no-db-msg" style="padding:60px 0">${d.error || 'No GPS data'}<br><span style="font-size:10px">Import this activity first: python import_fit.py garmin_fit/</span></div>`;
      return;
    }

    const ps = d.pace_stats || { fast:480, slow:720 };
    const fastSec = ps.fast, slowSec = ps.slow;

    _leafletMap = L.map('actMapContainer', { zoomControl:true, attributionControl:false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom:19 }).addTo(_leafletMap);

    const pts = d.points; // [lat, lon, hr, pace_sec, alt]
    for (let i = 0; i < pts.length - 1; i++) {
      L.polyline([[pts[i][0],pts[i][1]],[pts[i+1][0],pts[i+1][1]]],
        { color: paceColor(pts[i][3], fastSec, slowSec), weight:3.5, opacity:0.92, lineCap:'round' }
      ).addTo(_leafletMap);
    }

    L.circleMarker([pts[0][0],pts[0][1]], { radius:6, fillColor:'#2D7A5A', fillOpacity:1, color:'#fff', weight:2 }).bindTooltip('Start').addTo(_leafletMap);
    const lp = pts[pts.length-1];
    L.circleMarker([lp[0],lp[1]], { radius:6, fillColor:'#C84B2F', fillOpacity:1, color:'#fff', weight:2 }).bindTooltip('Finish').addTo(_leafletMap);

    const b = d.bounds;
    _leafletMap.fitBounds([[b.min_lat,b.min_lon],[b.max_lat,b.max_lon]], { padding:[20,20] });

    const pr = document.getElementById('mapPaceRange');
    if (pr) pr.textContent = `${fmtPace(fastSec)} – ${fmtPace(slowSec)}`;
    const el = document.getElementById('mapPointCount');
    if (el) el.textContent = `${d.total.toLocaleString()} GPS pts`;
  } catch(e) {
    document.getElementById('actMapContainer').innerHTML =
      `<div class="no-db-msg" style="padding:60px 0">Error: ${e.message}</div>`;
  }
}

// Patch loadActModalTab to handle map tab
const _baseLoadTab = loadActModalTab;
window.loadActModalTab = async function(tab) {
  _actModalTab = tab;
  if (tab === 'map') { await loadMapTab(); return; }
  await _baseLoadTab(tab);
};

// Clean up map on close
const _baseClose = closeActModal;
window.closeActModal = function() {
  if (_leafletMap) { _leafletMap.remove(); _leafletMap = null; }
  _baseClose();
};

// ════════════════════════════════════════════════════════════════════
// SHARE CARD ROUTE — white silhouette on all canvas styles
// ════════════════════════════════════════════════════════════════════
const _routeCache = {};

async function fetchRouteForShare(r) {
  if (!_dbConnected) return null;
  const gid   = r.garmin_id;
  const date  = (r.Date||r.date||'').slice(0,10);
  const atype = r.ActivityType||'';
  if (!gid && !date) return null;
  // garmin_id is unique-per-activity; date+type isn't (e.g. a run + a ride on
  // the same day collide), so cache by gid when we have it.
  const key = gid ? `gid:${gid}` : `${date}_${atype}`;
  if (_routeCache[key] !== undefined) return _routeCache[key];
  try {
    const params = new URLSearchParams();
    if (gid) params.set('garmin_id', gid);
    else { params.set('date', date); params.set('type', atype); }
    const res = await fetch(`${DB_BASE}/api/route?${params}`);
    const d = await res.json();
    _routeCache[key] = (d.points && d.points.length > 10) ? d : null;
    return _routeCache[key];
  } catch { _routeCache[key]=null; return null; }
}

function drawRouteOnCanvas(ctx, pts, bounds, area, paceStats, lw) {
  if (!pts || pts.length < 2) return;
  const { x, y, w, h } = area;
  const latRange = (bounds.max_lat - bounds.min_lat) || 0.001;
  const lonRange = (bounds.max_lon - bounds.min_lon) || 0.001;
  const pad = lw * 4;
  const scale = Math.min((w-pad*2)/lonRange, (h-pad*2)/latRange);
  const drawW = lonRange*scale, drawH = latRange*scale;
  const ox = x + pad + (w-pad*2-drawW)/2;
  const oy = y + pad + (h-pad*2-drawH)/2;
  const toXY = (lat,lon) => [ox+(lon-bounds.min_lon)*scale, oy+(bounds.max_lat-lat)*scale];

  const fastSec = paceStats?.fast || 480;
  const slowSec = paceStats?.slow || 720;

  ctx.save();
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Draw pace-colored segments
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = toXY(pts[i][0], pts[i][1]);
    const [bx, by] = toXY(pts[i+1][0], pts[i+1][1]);
    // Use paceColor from main scope (pts[i][3] = pace_sec)
    ctx.strokeStyle = paceColor(pts[i][3], fastSec, slowSec);
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = lw * 1.5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  // Start dot (green)
  const [sx, sy] = toXY(pts[0][0], pts[0][1]);
  ctx.beginPath(); ctx.fillStyle = '#2D7A5A';
  ctx.arc(sx, sy, lw*2.5, 0, Math.PI*2); ctx.fill();
  // End dot (coral)
  const [ex, ey] = toXY(pts[pts.length-1][0], pts[pts.length-1][1]);
  ctx.beginPath(); ctx.fillStyle = '#C84B2F';
  ctx.arc(ex, ey, lw*2.5, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

function overlayRouteOnCard(ctx, W, H, scale, style, routeData) {
  // Only styles 5 and 6
  if (style !== 5 && style !== 6) return;
  if (!routeData?.points?.length) return;

  // Layout for the "Full card" share styles (1080×1920 Instagram Story aspect):
  //   ~0–17%  : header (HUB + badge, date, title, divider)
  //   ~17–31% : DISTANCE label + big serif value + duration time
  //   ~33–78% : route map  ← we want it here
  //   ~79–92% : metrics grid (2×2)
  //   ~92–100%: footer branding
  const lw = scale * 2;
  const areas = {
    5: { x: W*0.04, y: H*0.33, w: W*0.92, h: H*0.45 },
    6: { x: W*0.04, y: H*0.33, w: W*0.92, h: H*0.45 },
  };
  drawRouteOnCanvas(ctx, routeData.points, routeData.bounds, areas[style], routeData.pace_stats, lw);
}

// Patch downloadShareCard to fetch route then draw
const _baseDownload = window.downloadShareCard;
window.downloadShareCard = async function() {
  window._shareRouteData = null;
  if (_dbConnected) {
    const sd = getShareData(_shareType);
    if (sd) window._shareRouteData = await fetchRouteForShare(sd.r);
  }
  await _baseDownload();
};

// Paint the route onto every <canvas.share-preview-route> currently in the DOM.
// Called from openShareModal + setShareStyle so the preview reflects what the
// saved PNG will actually contain (styles 5 & 6 only — buildShareCardHTML only
// emits the canvas for those styles).
async function paintSharePreviewRoute() {
  const canvases = document.querySelectorAll('canvas.share-preview-route');
  if (!canvases.length || !_dbConnected) return;
  const sd = getShareData(_shareType);
  if (!sd) return;
  const routeData = await fetchRouteForShare(sd.r);
  if (!routeData?.points?.length) return;
  // Re-query in case the user switched styles while the fetch was in flight
  document.querySelectorAll('canvas.share-preview-route').forEach(canvas => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRouteOnCanvas(
      ctx, routeData.points, routeData.bounds,
      { x: 0, y: 0, w: canvas.width, h: canvas.height },
      routeData.pace_stats,
      Math.max(2, canvas.width / 90)   // line width tuned for the small preview
    );
  });
}
window.paintSharePreviewRoute = paintSharePreviewRoute;

// Patch drawShareCardCanvas (called inside downloadShareCard) to inject route
// Since drawShareCardCanvas is defined inline in the main script, we intercept
// at the canvas.toBlob level by post-processing
const _baseToBlob = HTMLCanvasElement.prototype.toBlob;
HTMLCanvasElement.prototype.toBlob = function(cb, type, quality) {
  // If this is a share card download and we have route data, draw it first
  if (window._shareRouteData && this.id === '' && this.width > 500) {
    const ctx = this.getContext('2d');
    overlayRouteOnCard(ctx, this.width, this.height, this.width/360, _shareStyle, window._shareRouteData);
    window._shareRouteData = null; // consume once
  }
  _baseToBlob.call(this, cb, type, quality);
};
