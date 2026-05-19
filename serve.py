#!/usr/bin/env python3
"""
Edgar Molina Training Hub — Local Server
=========================================
Serves the training hub with live database integration.

    http://localhost:5000        → Training Hub
    http://localhost:5000/db     → Database Previewer

Usage:
    python serve.py
    python serve.py --db ~/training/training.db
    python serve.py --port 8080

API endpoints (called by the hub):
    GET  /api/status                    → DB connection status + row counts
    GET  /api/laps?activity_date=&title= → Per-mile splits for an activity
    GET  /api/power_curve               → All-time power curve PRs
    GET  /api/hr_zones?activity_date=   → HR zone breakdown for an activity
    GET  /api/form_drift?activity_date= → Form drift for an activity
    GET  /api/cycling_load              → TSS/IF history for all rides

Requirements:
    pip install flask
"""

import argparse
import json
import math
import sqlite3
from pathlib import Path

from flask import Flask, jsonify, render_template_string, request, send_from_directory, make_response

app = Flask(__name__)

# Allow the hub to call APIs whether opened via file:// or http://
@app.after_request
def add_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return response

@app.route('/api/<path:path>', methods=['OPTIONS'])
@app.route('/db/api/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    return make_response('', 204)
DB_PATH  = "training.db"
HUB_PATH = "index.html"

# ── DB helpers ──────────────────────────────────────────────────────────

def conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c

def q(sql, params=()):
    c = conn()
    try:    return [dict(r) for r in c.execute(sql, params).fetchall()]
    finally: c.close()

def q1(sql, params=()):
    rows = q(sql, params)
    return rows[0] if rows else None

def fmt_pace(sec):
    if not sec: return None
    return f"{int(sec)//60}:{int(sec)%60:02d}"

def merge_cycling_laps(laps, target_mi=5.0):
    """Merge 1-mile auto-laps into ~5-mile groups for cleaner display."""
    groups = []; bucket = []; bucket_dist = 0
    for lap in laps:
        d = lap.get('distance_mi') or 0
        bucket.append(lap); bucket_dist += d
        if bucket_dist >= target_mi * 0.85:
            groups.append(bucket); bucket = []; bucket_dist = 0
    if bucket:
        groups.append(bucket)

    merged = []
    for i, grp in enumerate(groups):
        def wavg(key, weight_key='duration_sec'):
            vals = [(r.get(key), r.get(weight_key) or 1) for r in grp if r.get(key) is not None]
            if not vals: return None
            total_w = sum(w for _,w in vals)
            return round(sum(v*w for v,w in vals) / total_w, 2) if total_w else None
        def wsum(key):
            return round(sum(r.get(key) or 0 for r in grp), 2) or None

        total_dist = round(sum(r.get('distance_mi') or 0 for r in grp), 3)
        total_dur  = sum(r.get('duration_sec') or 0 for r in grp)
        avg_spd    = total_dist / (total_dur / 3600) if total_dur else None

        merged.append({
            'lap_number':   i + 1,
            'distance_mi':  total_dist,
            'duration_sec': round(total_dur, 1),
            'speed_mph':    round(avg_spd, 2) if avg_spd else None,
            'avg_hr':       round(wavg('avg_hr') or 0) or None,
            'max_hr':       max((r.get('max_hr') or 0) for r in grp) or None,
            'cadence_rpm':  round(wavg('cadence_rpm') or 0) or None,
            'avg_power_w':  round(wavg('avg_power_w') or 0) or None,
            'norm_power_w': round(wavg('norm_power_w') or 0) or None,
            'calories':     round(wsum('calories') or 0) or None,
            'ascent_ft':    round(wsum('ascent_ft') or 0, 1) or None,
            'avg_temp_c':   round(wavg('avg_temp_c') or 0) or None,
        })
    return merged

# ── Hub route ───────────────────────────────────────────────────────────

@app.route('/')
def hub():
    hub = Path(HUB_PATH)
    if not hub.exists():
        return "index.html not found — make sure serve.py is in the same folder as index.html", 404
    return hub.read_text(encoding='utf-8')

# Serve static assets next to index.html (styles.css, js/*.js, runs.json, cycles.json, etc.)
# Sits below the explicit /api/* routes so they still win for API calls.
@app.route('/<path:filename>')
def static_asset(filename):
    base = Path(HUB_PATH).parent.resolve()
    target = (base / filename).resolve()
    # Defense: don't serve anything outside the hub directory.
    if base not in target.parents and target != base:
        return "Not found", 404
    if not target.is_file():
        return "Not found", 404
    return send_from_directory(base, filename)

# ── DB Previewer ────────────────────────────────────────────────────────

PAGE_SIZE = 100

def get_schema():
    c = conn()
    schema = {}
    for row in c.execute(
        "SELECT name, type FROM sqlite_master "
        "WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' "
        "ORDER BY type DESC, name"
    ).fetchall():
        name, kind = row['name'], row['type']
        cols  = [col['name'] for col in c.execute(f"PRAGMA table_info('{name}')")]
        count = c.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
        schema[name] = {'kind': kind, 'cols': cols, 'count': count}
    c.close()
    return schema

DB_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>training.db — Edgar Molina Training Hub</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
:root{--bg:#0f0e0c;--surface:#17150f;--surface2:#1e1b14;--surface3:#252018;--border:#2a2720;--border2:#332f25;--text:#f0ece4;--text2:#b8b0a0;--text3:#6e6558;--text4:#3e3a32;--coral:#C84B2F;--green:#2D7A5A;--blue:#1D5FA0;--amber:#EF9F27;--mono:'DM Mono',monospace;--serif:'Instrument Serif',serif;--rad:5px;}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--mono);font-size:13px;}
.app{display:flex;height:100vh;overflow:hidden;}
.sidebar{width:220px;flex-shrink:0;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;}
.sidebar-header{padding:16px 14px 12px;border-bottom:1px solid var(--border);}
.sidebar-logo{font-family:var(--serif);font-style:italic;font-size:15px;}
.sidebar-sub{font-size:9px;color:var(--text3);margin-top:3px;}
.sidebar-body{flex:1;overflow-y:auto;padding:8px 0;}
.sidebar-section{padding:6px 14px 4px;font-size:8px;letter-spacing:0.14em;color:var(--text4);text-transform:uppercase;}
.nav-item{display:flex;align-items:center;justify-content:space-between;padding:5px 14px;cursor:pointer;border-left:2px solid transparent;transition:all .1s;}
.nav-item:hover{background:var(--surface2);}
.nav-item.active{background:var(--surface2);border-left-color:var(--coral);}
.nav-item-name{font-size:10.5px;color:var(--text2);}
.nav-item.active .nav-item-name{color:var(--text);}
.nav-badge{font-size:8px;color:var(--text3);background:var(--surface3);padding:1px 6px;border-radius:10px;}
.topbar{display:flex;align-items:center;gap:12px;padding:10px 20px;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;}
.topbar-title{font-size:13px;font-weight:500;}
.topbar-sub{font-size:10px;color:var(--text3);}
.topbar-kind{font-size:8px;letter-spacing:0.1em;text-transform:uppercase;padding:2px 8px;border-radius:3px;}
.kind-table{background:#C84B2F22;color:var(--coral);}
.kind-view{background:#1D5FA022;color:var(--blue);}
.back-btn{padding:5px 12px;font-size:10px;font-family:var(--mono);border-radius:var(--rad);border:0.5px solid var(--border2);background:var(--surface2);color:var(--text2);cursor:pointer;text-decoration:none;display:inline-block;}
.back-btn:hover{border-color:var(--coral);color:var(--text);}
.topbar-spacer{flex:1;}
.search-box{background:var(--surface2);border:0.5px solid var(--border2);border-radius:var(--rad);padding:5px 10px;font-size:10px;font-family:var(--mono);color:var(--text);width:200px;outline:none;}
.search-box:focus{border-color:var(--coral);}
.search-box::placeholder{color:var(--text3);}
.btn{padding:5px 12px;font-size:10px;font-family:var(--mono);border-radius:var(--rad);border:0.5px solid var(--border2);background:var(--surface2);color:var(--text2);cursor:pointer;}
.btn:hover{border-color:var(--coral);color:var(--text);}
.btn-primary{background:var(--coral);border-color:var(--coral);color:#fff;}
.btn-primary:hover{background:#b03e24;}
.sql-panel{background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;}
.sql-toggle{display:flex;align-items:center;gap:8px;padding:8px 16px;cursor:pointer;font-size:10px;color:var(--text3);}
.sql-toggle:hover{color:var(--text2);}
.sql-body{padding:10px 16px 12px;border-top:1px solid var(--border);display:none;}
.sql-body.open{display:block;}
textarea.sql-input{width:100%;min-height:60px;background:var(--surface2);border:0.5px solid var(--border2);border-radius:var(--rad);padding:8px 10px;font-size:11px;font-family:var(--mono);color:var(--text);resize:vertical;outline:none;}
textarea.sql-input:focus{border-color:var(--coral);}
.sql-actions{display:flex;align-items:center;gap:8px;margin-top:8px;}
.sql-hint{font-size:9px;color:var(--text4);flex:1;}
.sql-error{color:var(--coral);font-size:10px;margin-top:6px;padding:6px 10px;background:#C84B2F11;border-radius:var(--rad);}
.table-wrap{flex:1;overflow:auto;}
table{width:100%;border-collapse:collapse;font-size:11px;}
thead{position:sticky;top:0;z-index:10;}
thead th{background:var(--surface);color:var(--text3);font-size:8.5px;letter-spacing:0.08em;text-transform:uppercase;padding:7px 10px;text-align:left;white-space:nowrap;border-bottom:1px solid var(--border);cursor:pointer;}
thead th:hover{color:var(--text2);}
thead th.sorted{color:var(--coral);}
tbody tr{border-bottom:0.5px solid var(--border);}
tbody tr:hover{background:var(--surface2);cursor:pointer;}
tbody td{padding:5px 10px;color:var(--text2);white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis;}
tbody td.num{color:var(--text);font-variant-numeric:tabular-nums;}
tbody td.null{color:var(--text4);font-style:italic;}
tbody td.run{color:var(--green);}tbody td.cycle{color:var(--blue);}
tbody td.warn{color:var(--coral);}tbody td.good{color:var(--green);}
.pagination{display:flex;align-items:center;gap:8px;padding:8px 16px;border-top:1px solid var(--border);background:var(--surface);flex-shrink:0;}
.page-info{font-size:10px;color:var(--text3);flex:1;}
.page-btn{padding:3px 10px;font-size:10px;font-family:var(--mono);border-radius:3px;border:0.5px solid var(--border2);background:var(--surface2);color:var(--text2);cursor:pointer;}
.page-btn:hover{border-color:var(--coral);}
.page-btn:disabled{opacity:0.3;cursor:default;}
.page-btn.current{border-color:var(--coral);color:var(--coral);}
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:100;display:none;align-items:center;justify-content:center;}
.modal-bg.open{display:flex;}
.modal{background:var(--surface);border:1px solid var(--border2);border-radius:8px;width:640px;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;}
.modal-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);}
.modal-title{font-size:12px;}
.modal-close{cursor:pointer;color:var(--text3);font-size:16px;}
.modal-close:hover{color:var(--text);}
.modal-body{overflow-y:auto;}
.detail-row{display:flex;border-bottom:0.5px solid var(--border);}
.detail-row:hover{background:var(--surface2);}
.detail-key{width:200px;flex-shrink:0;padding:6px 14px;font-size:10px;color:var(--text3);border-right:0.5px solid var(--border);}
.detail-val{padding:6px 14px;font-size:10px;color:var(--text2);word-break:break-all;}
.detail-val.nv{color:var(--text4);font-style:italic;}
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;color:var(--text3);}
::-webkit-scrollbar{width:6px;height:6px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px;}
</style>
</head>
<body>
<div class="app">
  <div class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-logo">training.db</div>
      <div class="sidebar-sub" id="dbPath">loading…</div>
    </div>
    <div class="sidebar-body" id="sidebarBody"></div>
  </div>
  <div class="main">
    <div class="sql-panel">
      <div class="sql-toggle" onclick="toggleSQL()"><span id="sqlArrow">▶</span> SQL Query <span style="font-size:8px;margin-left:4px;color:var(--text4)">⌘↵ to run</span></div>
      <div class="sql-body" id="sqlBody">
        <textarea class="sql-input" id="sqlInput" placeholder="SELECT * FROM activities LIMIT 10;"
          onkeydown="if((e=event).metaKey&&e.key==='Enter'||e.ctrlKey&&e.key==='Enter')runSQL()"></textarea>
        <div class="sql-actions">
          <span class="sql-hint">Read-only · DROP/DELETE/UPDATE blocked</span>
          <button class="btn" onclick="if(curTable)loadTable(curTable,1)">Reset</button>
          <button class="btn btn-primary" onclick="runSQL()">▶ Run</button>
        </div>
        <div class="sql-error" id="sqlError" style="display:none"></div>
      </div>
    </div>
    <div class="topbar">
      <a class="back-btn" href="/">← Hub</a>
      <div><div class="topbar-title" id="topTitle">Select a table</div><div class="topbar-sub" id="topSub"></div></div>
      <span class="topbar-kind" id="topKind"></span>
      <div class="topbar-spacer"></div>
      <input class="search-box" id="searchBox" placeholder="Filter rows…" oninput="onSearch()"/>
    </div>
    <div class="table-wrap" id="tableWrap"><div class="empty"><div style="font-size:32px;opacity:.3">⌘</div><div style="font-size:11px">Choose a table from the sidebar</div></div></div>
    <div class="pagination" id="pag" style="display:none">
      <span class="page-info" id="pagInfo"></span>
      <button class="page-btn" id="bFirst" onclick="goPage(1)">«</button>
      <button class="page-btn" id="bPrev" onclick="goPage(curPage-1)">‹</button>
      <span id="pagBtns"></span>
      <button class="page-btn" id="bNext" onclick="goPage(curPage+1)">›</button>
      <button class="page-btn" id="bLast" onclick="goPage(totPages)">»</button>
    </div>
  </div>
</div>
<div class="modal-bg" id="modalBg" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-header"><span class="modal-title" id="modalTitle">Row detail</span><span class="modal-close" onclick="closeModal()">✕</span></div>
    <div class="modal-body" id="modalBody"></div>
  </div>
</div>
<script>
let curTable=null,curPage=1,totPages=1,sortCol=null,sortDir='asc',filter='',sqlMode=false,lastRows=null,lastCols=null,schema={};
async function init(){
  const r=await fetch('/db/api/schema');schema=await r.json();
  let html='';
  const tables=Object.entries(schema).filter(([,v])=>v.kind==='table');
  const views=Object.entries(schema).filter(([,v])=>v.kind==='view');
  html+='<div class="sidebar-section">Tables</div>';
  for(const[n,i]of tables)html+=`<div class="nav-item" id="nav-${n}" onclick="loadTable('${n}',1)"><span class="nav-item-name">${n}</span><span class="nav-badge">${i.count.toLocaleString()}</span></div>`;
  html+='<div class="sidebar-section" style="margin-top:8px">Views</div>';
  for(const[n,i]of views)html+=`<div class="nav-item" id="nav-${n}" onclick="loadTable('${n}',1)"><span class="nav-item-name">${n}</span><span class="nav-badge">${i.count.toLocaleString()}</span></div>`;
  document.getElementById('sidebarBody').innerHTML=html;
  fetch('/db/api/info').then(r=>r.json()).then(d=>{document.getElementById('dbPath').textContent=d.path;});
  loadTable('activities',1);
}
async function loadTable(name,page){
  sqlMode=false;curTable=name;curPage=page;
  document.getElementById('sqlError').style.display='none';
  document.querySelectorAll('.nav-item').forEach(e=>e.classList.remove('active'));
  const nav=document.getElementById('nav-'+name);if(nav)nav.classList.add('active');
  const info=schema[name]||{};
  document.getElementById('topTitle').textContent=name;
  document.getElementById('topSub').textContent=`${(info.count||0).toLocaleString()} rows · ${(info.cols||[]).length} cols`;
  const kind=info.kind||'table';
  document.getElementById('topKind').textContent=kind;
  document.getElementById('topKind').className='topbar-kind kind-'+kind;
  document.getElementById('searchBox').value='';filter='';
  const p=new URLSearchParams({table:name,page,sort:sortCol||'',dir:sortDir,q:filter});
  const d=await(await fetch('/db/api/table?'+p)).json();
  if(d.error){showErr(d.error);return;}
  totPages=d.total_pages;renderTable(d.columns,d.rows,d.total,page,d.total_pages);
}
function renderTable(cols,rows,total,page,pages){
  const wrap=document.getElementById('tableWrap');
  if(!rows.length){wrap.innerHTML='<div class="empty"><div style="font-size:24px;opacity:.3">∅</div><div style="font-size:11px">No rows</div></div>';document.getElementById('pag').style.display='none';return;}
  const offset=(page-1)*100;
  let html='<table><thead><tr>';
  for(const c of cols){const s=sortCol===c;html+=`<th class="${s?'sorted':''}" onclick="doSort('${c}')">${c}${s?(sortDir==='asc'?' ↑':' ↓'):''}</th>`;}
  html+='</tr></thead><tbody>';
  for(let i=0;i<rows.length;i++){
    const row=rows[i];
    html+=`<tr onclick="showRow(${offset+i})">`;
    for(const c of cols){const v=row[c];const cls=cellCls(c,v);if(v===null||v===undefined||v==='')html+='<td class="null">null</td>';else{const d=String(v).length>45?String(v).slice(0,45)+'…':String(v);html+=`<td class="${cls}">${esc(d)}</td>`;}}
    html+='</tr>';
  }
  html+='</tbody></table>';
  wrap.innerHTML=html;lastRows=rows;lastCols=cols;
  const pag=document.getElementById('pag');
  if(pages<=1){pag.style.display='none';return;}
  pag.style.display='flex';
  document.getElementById('pagInfo').textContent=`Rows ${(offset+1).toLocaleString()}–${Math.min(offset+rows.length,total).toLocaleString()} of ${total.toLocaleString()}`;
  document.getElementById('bFirst').disabled=page<=1;document.getElementById('bPrev').disabled=page<=1;
  document.getElementById('bNext').disabled=page>=pages;document.getElementById('bLast').disabled=page>=pages;
  let pb='';const lo=Math.max(1,page-2),hi=Math.min(pages,page+2);
  for(let p=lo;p<=hi;p++)pb+=`<button class="page-btn${p===page?' current':''}" onclick="goPage(${p})">${p}</button>`;
  document.getElementById('pagBtns').innerHTML=pb;
}
function cellCls(c,v){
  if(c==='id'||c==='activity_id')return 'id-col';
  if(typeof v==='number')return 'num';
  if(c==='activity_type'){if(String(v).includes('Running'))return 'run';if(String(v).includes('Cycling'))return 'cycle';}
  if(c==='left_gct_pct'&&v<47.5)return 'warn';
  if(c==='battery_status'){if(v==='good')return 'good';if(v==='low'||v==='critical')return 'warn';}
  return '';
}
function doSort(col){
  if(sortCol===col)sortDir=sortDir==='asc'?'desc':'asc';else{sortCol=col;sortDir='asc';}
  if(sqlMode&&lastRows){
    const rows=[...lastRows];
    rows.sort((a,b)=>{const av=a[col],bv=b[col];if(av===null)return 1;if(bv===null)return -1;const r=av<bv?-1:av>bv?1:0;return sortDir==='asc'?r:-r;});
    renderTable(lastCols,rows,rows.length,1,1);
  }else loadTable(curTable,1);
}
let searchTimer=null;
function onSearch(){filter=document.getElementById('searchBox').value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{if(curTable)loadTable(curTable,1);},300);}
function goPage(p){if(p<1||p>totPages)return;curPage=p;loadTable(curTable,p);}
function showRow(idx){
  if(!lastRows)return;
  const offset=(curPage-1)*100;const row=lastRows[idx-offset];if(!row)return;
  document.getElementById('modalTitle').textContent=`Row ${idx+1} — ${curTable}`;
  let html='';
  for(const c of lastCols){const v=row[c];const isNull=v===null||v===undefined||v==='';html+=`<div class="detail-row"><div class="detail-key">${c}</div><div class="detail-val${isNull?' nv':''}">${isNull?'null':esc(String(v))}</div></div>`;}
  document.getElementById('modalBody').innerHTML=html;
  document.getElementById('modalBg').classList.add('open');
}
function closeModal(){document.getElementById('modalBg').classList.remove('open');}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
function toggleSQL(){const b=document.getElementById('sqlBody');const a=document.getElementById('sqlArrow');b.classList.toggle('open');a.textContent=b.classList.contains('open')?'▼':'▶';}
async function runSQL(){
  const sql=document.getElementById('sqlInput').value.trim();if(!sql)return;
  document.getElementById('sqlError').style.display='none';
  const r=await fetch('/db/api/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sql})});
  const d=await r.json();
  if(d.error){const el=document.getElementById('sqlError');el.textContent=d.error;el.style.display='block';return;}
  sqlMode=true;curTable='__sql__';
  document.querySelectorAll('.nav-item').forEach(e=>e.classList.remove('active'));
  document.getElementById('topTitle').textContent='SQL Result';
  document.getElementById('topSub').textContent=`${d.rows.length} rows`;
  document.getElementById('topKind').textContent='query';
  document.getElementById('topKind').className='topbar-kind';
  document.getElementById('topKind').style.cssText='background:#EF9F2722;color:var(--amber);font-size:8px;letter-spacing:.1em;text-transform:uppercase;padding:2px 8px;border-radius:3px;';
  totPages=1;curPage=1;renderTable(d.columns,d.rows,d.rows.length,1,1);
}
function showErr(msg){document.getElementById('tableWrap').innerHTML=`<div class="empty"><div style="font-size:24px;opacity:.3">✕</div><div style="font-size:11px">${esc(msg)}</div></div>`;}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
init();
</script>
</body></html>"""

@app.route('/db')
def db_viewer():
    return render_template_string(DB_HTML)

@app.route('/db/api/info')
def db_info():
    return jsonify({'path': str(Path(DB_PATH).resolve())})

@app.route('/db/api/schema')
def db_schema():
    return jsonify(get_schema())

@app.route('/db/api/table')
def db_table():
    name = request.args.get('table','')
    page = int(request.args.get('page',1))
    sort = request.args.get('sort','')
    direction = request.args.get('dir','asc')
    fq = request.args.get('q','').strip()
    schema = get_schema()
    if name not in schema:
        return jsonify({'error': f'Table "{name}" not found'})
    try:
        c = conn()
        cols = [col['name'] for col in c.execute(f"PRAGMA table_info('{name}')")]
        where=''; params=[]
        if fq:
            clauses=[f'CAST("{col}" AS TEXT) LIKE ?' for col in cols]
            where=' WHERE '+' OR '.join(clauses)
            params=[f'%{fq}%']*len(cols)
        total=c.execute(f'SELECT COUNT(*) FROM "{name}"{where}',params).fetchone()[0]
        total_pages=max(1,math.ceil(total/PAGE_SIZE))
        page=max(1,min(page,total_pages))
        order=''
        if sort and sort in cols:
            order=f' ORDER BY "{sort}" {"ASC" if direction=="asc" else "DESC"} NULLS LAST'
        offset=(page-1)*PAGE_SIZE
        rows=[dict(r) for r in c.execute(f'SELECT * FROM "{name}"{where}{order} LIMIT {PAGE_SIZE} OFFSET {offset}',params)]
        c.close()
        return jsonify({'columns':cols,'rows':rows,'total':total,'page':page,'total_pages':total_pages})
    except Exception as e:
        return jsonify({'error':str(e)})

@app.route('/db/api/query', methods=['POST'])
def db_query():
    sql=(request.get_json() or {}).get('sql','').strip()
    if not sql: return jsonify({'error':'No SQL'})
    for kw in ['DROP','DELETE','UPDATE','INSERT','CREATE','ALTER','TRUNCATE']:
        if sql.upper().lstrip().startswith(kw):
            return jsonify({'error':f'{kw} not allowed'})
    try:
        c=conn(); cur=c.execute(sql); rows=cur.fetchall()
        cols=[d[0] for d in cur.description] if cur.description else []
        result=[dict(r) for r in rows]; c.close()
        return jsonify({'columns':cols,'rows':result})
    except Exception as e:
        return jsonify({'error':str(e)})

# ── Hub API endpoints ───────────────────────────────────────────────────

def resolve_activity(args):
    """Resolve an /api/* request's identifier args to a single activities row.

    Priority order:
      1. ?garmin_id=N        — Garmin's globally-unique activity ID (preferred).
                               Exact match on activities.garmin_activity_id.
      2. ?activity_id=N      — legacy: DB autoincrement id.
      3. (?date, ?type[, ?dist, ?title])  — fuzzy fallback with ±1 day for
                                            UTC/local mismatches and
                                            distance/title disambiguation
                                            when multiple activities share
                                            the same date+type.

    Returns the matching row (with id, title, activity_type) or None.
    """
    from datetime import datetime, timedelta

    garmin_id = args.get('garmin_id', '')
    act_id    = args.get('activity_id', '')
    date      = args.get('date', '')
    atype     = args.get('type', '')
    dist      = args.get('dist', '')
    title     = args.get('title', '')

    if garmin_id:
        return q1("SELECT id, title, activity_type FROM activities "
                  "WHERE garmin_activity_id=?", (garmin_id,))
    if act_id:
        return q1("SELECT id, title, activity_type FROM activities "
                  "WHERE id=?", (act_id,))
    if not date:
        return None

    type_clause = ''
    if 'ycling' in atype:
        type_clause = "AND activity_type IN ('Road Cycling','Virtual Cycling','Indoor Cycling')"
    elif 'unning' in atype:
        type_clause = "AND activity_type='Running'"

    def search(d):
        # Try 1: exact date + type + title prefix
        if title:
            row = q1(
                f"SELECT id, title, activity_type FROM activities "
                f"WHERE activity_date=? {type_clause} AND title LIKE ? LIMIT 1",
                (d, f'%{title[:20]}%')
            )
            if row: return row
        # Try 2: exact date + type (single match)
        candidates = q(
            f"SELECT id, title, activity_type FROM activities "
            f"WHERE activity_date=? {type_clause}", (d,)
        )
        if len(candidates) == 1:
            return candidates[0]
        # Try 3: disambiguate by distance
        if len(candidates) > 1 and dist:
            try:
                return q1(
                    f"SELECT id, title, activity_type FROM activities "
                    f"WHERE activity_date=? {type_clause} "
                    f"AND CAST(ROUND(distance_mi*10) AS INTEGER)=CAST(ROUND(?*10) AS INTEGER) LIMIT 1",
                    (d, float(dist))
                )
            except ValueError:
                pass
        return None

    row = search(date)
    if row: return row
    # ±1 day fallback (UTC/local skew)
    try:
        base = datetime.strptime(date, '%Y-%m-%d')
        for delta in (1, -1):
            row = search((base + timedelta(days=delta)).strftime('%Y-%m-%d'))
            if row: return row
    except ValueError:
        pass
    return None


@app.route('/api/status')
def api_status():
    """Check DB connection and return table counts."""
    try:
        c = conn()
        counts = {}
        for tbl in ['activities','laps','records','stream_summary','hrv','events']:
            counts[tbl] = c.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
        c.close()
        return jsonify({'connected': True, 'db': str(Path(DB_PATH).resolve()), 'counts': counts})
    except Exception as e:
        return jsonify({'connected': False, 'error': str(e)})


@app.route('/api/laps')
def api_laps():
    date  = request.args.get('date', '')
    atype = request.args.get('type', '')
    dist  = request.args.get('dist', '')

    try:
        act = resolve_activity(request.args)

        if not act:
            total      = q1("SELECT COUNT(*) as n FROM activities")['n']
            date_count = q1("SELECT COUNT(*) as n FROM activities WHERE activity_date=?", (date,))['n']
            return jsonify({
                'laps': [], 'not_imported': True,
                'message': f'Activity not found for {date} (type={atype}, dist={dist}). {date_count} activities on this date, {total} total. Run: python import_fit.py garmin_fit/'
            })

        rows = q("SELECT * FROM laps WHERE activity_id=? ORDER BY lap_number", (act['id'],))

        # For cycling with many short laps (auto-lap every 1mi), group into ~5mi splits
        if 'ycling' in (act.get('activity_type') or ''):
            avg_d = sum(r['distance_mi'] or 0 for r in rows) / len(rows) if rows else 0
            if avg_d < 2.0 and len(rows) > 6:
                rows = merge_cycling_laps(rows, target_mi=5.0)

        for r in rows:
            if r.get('pace_sec'):   r['pace_fmt']     = fmt_pace(r['pace_sec'])
            if r.get('max_pace_sec'): r['max_pace_fmt'] = fmt_pace(r['max_pace_sec'])

        return jsonify({'laps': rows, 'activity_title': act['title']})
    except Exception as e:
        return jsonify({'laps': [], 'error': str(e)})


@app.route('/api/power_curve')
def api_power_curve():
    """All-time power curve PRs across all running activities."""
    try:
        # Per-activity power curves
        rows = q("""
            SELECT a.activity_date, a.title, a.distance_mi,
                   s.power_1s, s.power_5s, s.power_10s, s.power_30s,
                   s.power_60s, s.power_300s, s.power_600s, s.power_1200s
            FROM stream_summary s
            JOIN activities a ON s.activity_id = a.id
            WHERE a.activity_type = 'Running'
              AND s.power_300s IS NOT NULL
            ORDER BY a.activity_date
        """)

        # All-time PRs
        pr = q1("""
            SELECT MAX(power_1s) as pr_1s, MAX(power_5s) as pr_5s,
                   MAX(power_10s) as pr_10s, MAX(power_30s) as pr_30s,
                   MAX(power_60s) as pr_60s, MAX(power_300s) as pr_300s,
                   MAX(power_600s) as pr_600s, MAX(power_1200s) as pr_1200s
            FROM stream_summary s
            JOIN activities a ON s.activity_id = a.id
            WHERE a.activity_type = 'Running'
        """) or {}

        # FTP from most recent activity
        ftp_row = q1("SELECT ftp_w FROM activities WHERE ftp_w IS NOT NULL ORDER BY activity_date DESC LIMIT 1")
        ftp = ftp_row['ftp_w'] if ftp_row else 372

        return jsonify({'activities': rows, 'prs': pr, 'ftp': ftp})
    except Exception as e:
        return jsonify({'activities': [], 'prs': {}, 'ftp': 372, 'error': str(e)})


@app.route('/api/hr_zones')
def api_hr_zones():
    try:
        # Identifier-first path: resolve to one specific activity, return just that row.
        if request.args.get('garmin_id') or request.args.get('activity_id') \
                or (request.args.get('date') and request.args.get('type')):
            act = resolve_activity(request.args)
            if act:
                rows = q("""SELECT a.activity_date, a.title, a.activity_type,
                       s.z1_sec, s.z2_sec, s.z3_sec, s.z4_sec, s.z5_sec
                    FROM stream_summary s JOIN activities a ON s.activity_id=a.id
                    WHERE s.activity_id=?""", (act['id'],))
            else:
                rows = []
        else:
            rows = q("""SELECT a.activity_date, a.title, a.activity_type,
                   s.z1_sec, s.z2_sec, s.z3_sec, s.z4_sec, s.z5_sec
                FROM stream_summary s JOIN activities a ON s.activity_id=a.id
                ORDER BY a.activity_date DESC""")

        for r in rows:
            total = sum(r[f'z{i}_sec'] or 0 for i in range(1,6))
            r['total_sec'] = total
            for z in range(1,6):
                r[f'z{z}_pct'] = round((r[f'z{z}_sec'] or 0)/total*100,1) if total else 0
        return jsonify({'zones': rows})
    except Exception as e:
        return jsonify({'zones': [], 'error': str(e)})


@app.route('/api/form_drift')
def api_form_drift():
    try:
        if request.args.get('garmin_id') or request.args.get('activity_id') \
                or request.args.get('date'):
            act = resolve_activity(request.args)
            if act:
                rows = q("""SELECT a.activity_date, a.title, a.distance_mi,
                       s.first_hr, s.last_hr, s.delta_hr,
                       s.first_gct_ms, s.last_gct_ms, s.delta_gct_ms,
                       s.first_left_pct, s.last_left_pct, s.delta_left_pct,
                       s.first_vert_osc, s.last_vert_osc, s.delta_vert_osc,
                       s.first_power_w, s.last_power_w, s.delta_power_w
                    FROM stream_summary s JOIN activities a ON s.activity_id=a.id
                    WHERE s.activity_id=?""", (act['id'],))
            else:
                rows = []
        else:
            rows = q("""SELECT a.activity_date, a.title, a.distance_mi,
                   s.first_hr, s.last_hr, s.delta_hr,
                   s.first_gct_ms, s.last_gct_ms, s.delta_gct_ms,
                   s.first_left_pct, s.last_left_pct, s.delta_left_pct,
                   s.first_vert_osc, s.last_vert_osc, s.delta_vert_osc,
                   s.first_power_w, s.last_power_w, s.delta_power_w
                FROM stream_summary s JOIN activities a ON s.activity_id=a.id
                WHERE a.activity_type='Running' AND s.first_hr IS NOT NULL
                ORDER BY a.activity_date DESC""")
        return jsonify({'drift': rows})
    except Exception as e:
        return jsonify({'drift': [], 'error': str(e)})


# Display order for the Best Efforts card. Lower-is-better (time PRs) first,
# then higher-is-better single-activity efforts. Keys here MUST match
# effort_type strings written by import_fit.py.
BEST_EFFORTS_ORDER = {
    'Running': [
        ('400m', 'sec'), ('800m', 'sec'), ('1K', 'sec'), ('1mi', 'sec'),
        ('2mi', 'sec'), ('5K', 'sec'), ('10K', 'sec'), ('15K', 'sec'),
        ('10mi', 'sec'), ('20K', 'sec'), ('half_marathon', 'sec'),
        ('30K', 'sec'), ('marathon', 'sec'),
        ('longest_run', 'mi'), ('most_elevation_run', 'ft'),
        ('biggest_climb', 'ft'), ('most_aerobic_te', 'te'),
    ],
    'Cycling': [
        ('5mi', 'sec'), ('10K', 'sec'), ('10mi', 'sec'),
        ('20K', 'sec'), ('30K', 'sec'), ('40K', 'sec'),
        ('longest_ride', 'mi'), ('most_elevation_ride', 'ft'),
        ('biggest_climb', 'ft'),
        ('pwr_1s', 'w'), ('pwr_5s', 'w'), ('pwr_10s', 'w'),
        ('pwr_30s', 'w'), ('pwr_60s', 'w'), ('pwr_300s', 'w'),
        ('pwr_600s', 'w'), ('pwr_1200s', 'w'),
        ('highest_np', 'w'), ('most_tss', 'tss'),
    ],
}


@app.route('/api/best_efforts')
def api_best_efforts():
    """Best per effort_type across all activities of a given type.

    Query params:
      - type=Running  → returns running PRs (default)
      - type=Cycling  → returns cycling PRs (matches Road / Virtual / Indoor)

    For each effort, the response includes the value, activity date+title, and
    the activity's garmin_id so the frontend can open the detail modal.
    """
    atype = request.args.get('type', 'Running')
    type_clause = (
        "a.activity_type='Running'" if 'unning' in atype
        else "a.activity_type IN ('Road Cycling','Virtual Cycling','Indoor Cycling')"
    )
    canonical_key = 'Running' if 'unning' in atype else 'Cycling'

    try:
        rows = q(f"""
            WITH ranked AS (
                SELECT b.effort_type, b.effort_value, b.unit,
                       a.id, a.activity_date, a.title,
                       a.garmin_activity_id,
                       ROW_NUMBER() OVER (
                         PARTITION BY b.effort_type
                         ORDER BY (CASE WHEN b.unit='sec' THEN b.effort_value ELSE -b.effort_value END)
                       ) AS rk
                FROM best_efforts b
                JOIN activities a ON a.id = b.activity_id
                WHERE {type_clause}
            )
            SELECT effort_type, effort_value, unit, id AS activity_id,
                   activity_date, title, garmin_activity_id AS garmin_id
            FROM ranked WHERE rk = 1
        """)

        # Return in display order so the frontend doesn't have to sort
        order = BEST_EFFORTS_ORDER.get(canonical_key, [])
        order_idx = {k: i for i, (k, _) in enumerate(order)}
        rows.sort(key=lambda r: order_idx.get(r['effort_type'], 999))
        return jsonify({'efforts': rows})
    except Exception as e:
        return jsonify({'efforts': [], 'error': str(e)})


@app.route('/api/route')
def api_route():
    """GPS route with HR/pace for a specific activity. Returns ~300 thinned points."""
    try:
        act = resolve_activity(request.args)
        if not act:
            return jsonify({'points': [], 'error': 'Activity not found'})
        aid = act['id']

        # Fetch all GPS points
        rows = q("""
            SELECT elapsed_sec, lat, lon, altitude_ft,
                   heart_rate, pace_sec, power_w, distance_mi
            FROM records
            WHERE activity_id=? AND lat IS NOT NULL AND lon IS NOT NULL
            ORDER BY elapsed_sec
        """, (aid,))

        if not rows:
            return jsonify({'points': [], 'error': 'No GPS data for this activity'})

        # Thin to ~400 points max (evenly spaced)
        total_pts = len(rows)
        step = max(1, total_pts // 400)
        thinned = rows[::step]
        if rows[-1] not in thinned:
            thinned.append(rows[-1])

        # Build point list [lat, lon, hr, pace_sec, altitude_ft]
        points = [
            [r['lat'], r['lon'], r['heart_rate'], r['pace_sec'], r['altitude_ft']]
            for r in thinned
        ]

        # Bounds for map fitting
        lats = [p[0] for p in points]
        lons = [p[1] for p in points]
        bounds = {
            'min_lat': min(lats), 'max_lat': max(lats),
            'min_lon': min(lons), 'max_lon': max(lons),
        }

        # Pace stats for color scale (use full dataset, exclude cooldown walks)
        valid_paces = sorted([r['pace_sec'] for r in rows if r['pace_sec'] and 300 < r['pace_sec'] < 1200])
        if valid_paces:
            vn = len(valid_paces)
            pace_stats = {
                'fast': valid_paces[int(vn * 0.05)],  # 5th percentile = fast end
                'slow': valid_paces[int(vn * 0.95)],  # 95th percentile = slow end
            }
        else:
            pace_stats = {'fast': 480, 'slow': 720}

        return jsonify({
            'points':     points,
            'bounds':     bounds,
            'pace_stats': pace_stats,
            'total':      total_pts,
        })
    except Exception as e:
        return jsonify({'points': [], 'error': str(e)})
def api_cycling_load():
    """TSS, IF, normalized power history for all cycling activities."""
    try:
        rows = q("""
            SELECT activity_date, title, distance_mi,
                   ROUND(duration_sec/60.0, 1) as duration_min,
                   avg_power_w, norm_power_w, max_power_w,
                   intensity_factor, training_stress_score,
                   avg_hr, avg_speed_mph, ascent_ft,
                   aerobic_te, calories
            FROM activities
            WHERE activity_type IN ('Road Cycling','Virtual Cycling')
              AND activity_date >= '2026-01-01'
            ORDER BY activity_date
        """)
        return jsonify({'rides': rows})
    except Exception as e:
        return jsonify({'rides': [], 'error': str(e)})


@app.route('/api/activities')
def api_activities():
    """All activities with basic fields — for hub sync."""
    atype = request.args.get('type','')
    try:
        where = "WHERE activity_type=?" if atype else ""
        params = (atype,) if atype else ()
        rows = q(f"""
            SELECT id, activity_date, title, activity_type,
                   distance_mi, duration_sec, pace_sec,
                   avg_hr, cadence_spm, gct_ms, left_gct_pct,
                   vert_osc_cm, vert_ratio_pct, norm_power_w,
                   avg_power_w, avg_speed_mph, ascent_ft,
                   calories, aerobic_te, is_race
            FROM activities {where}
            ORDER BY activity_date
        """, params)
        return jsonify({'activities': rows})
    except Exception as e:
        return jsonify({'activities': [], 'error': str(e)})


# ── Main ────────────────────────────────────────────────────────────────

def main():
    global DB_PATH, HUB_PATH
    parser = argparse.ArgumentParser(description='Edgar Molina Training Hub Server')
    parser.add_argument('--db',   default='training.db',  help='Path to training.db')
    parser.add_argument('--hub',  default='index.html',   help='Path to index.html')
    parser.add_argument('--port', type=int, default=5000)
    parser.add_argument('--host', default='127.0.0.1')
    args = parser.parse_args()

    DB_PATH  = args.db
    HUB_PATH = args.hub

    db  = Path(DB_PATH)
    hub = Path(HUB_PATH)

    print(f"\n  Edgar Molina Training Hub")
    print(f"  ──────────────────────────────────────────────")
    if not db.exists():
        print(f"  ⚠ Database not found: {db.resolve()}")
        print(f"    Run: python create_db.py && python import_fit.py garmin_fit/")
    else:
        size_mb = db.stat().st_size/1024/1024
        try:
            c = conn()
            act_count = c.execute("SELECT COUNT(*) FROM activities").fetchone()[0]
            c.close()
            print(f"  Database:  {db.resolve()}")
            print(f"             {act_count} activities · {size_mb:.1f} MB")
        except:
            print(f"  Database:  {db.resolve()} ({size_mb:.1f} MB)")

    if not hub.exists():
        print(f"  ⚠ Hub not found: {hub.resolve()}")
    else:
        print(f"  Hub:       {hub.resolve()}")

    print(f"\n  Hub:       http://localhost:{args.port}")
    print(f"  DB viewer: http://localhost:{args.port}/db")
    print(f"\n  API routes:")
    print(f"    /api/status         DB connection + counts")
    print(f"    /api/laps           Per-mile splits")
    print(f"    /api/power_curve    All-time power PRs")
    print(f"    /api/hr_zones       HR zone breakdowns")
    print(f"    /api/form_drift     First vs last mile form")
    print(f"    /api/cycling_load   TSS/IF history")
    print(f"\n  Press Ctrl+C to stop\n")

    app.run(host=args.host, port=args.port, debug=False)


if __name__ == '__main__':
    main()