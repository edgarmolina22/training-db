#!/usr/bin/env python3
"""
Edgar Molina Training Hub — Database Previewer
===============================================
A local web app to browse training.db live in your browser.

Usage:
    python preview_db.py                          # uses training.db in current folder
    python preview_db.py --db ~/training/training.db
    python preview_db.py --port 8080              # change port (default 5000)

Then open:  http://localhost:5000

Requirements:
    pip install flask
"""

import argparse
import json
import math
import sqlite3
from pathlib import Path

from flask import Flask, jsonify, render_template_string, request

app = Flask(__name__)
DB_PATH = "training.db"
PAGE_SIZE = 100   # rows per page for large tables

# ── DB helpers ─────────────────────────────────────────────────────────

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def query(sql, params=()):
    conn = get_conn()
    try:
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

def query_one(sql, params=()):
    rows = query(sql, params)
    return rows[0] if rows else None

def get_schema():
    conn = get_conn()
    schema = {}
    for row in conn.execute(
        "SELECT name, type FROM sqlite_master "
        "WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' "
        "ORDER BY type DESC, name"
    ).fetchall():
        name, kind = row['name'], row['type']
        cols = [c['name'] for c in conn.execute(f"PRAGMA table_info('{name}')")]
        count = conn.execute(f"SELECT COUNT(*) FROM \"{name}\"").fetchone()[0]
        schema[name] = {'kind': kind, 'cols': cols, 'count': count}
    conn.close()
    return schema

# ── HTML template ───────────────────────────────────────────────────────

HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>training.db — Edgar Molina Training Hub</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#0f0e0c;--surface:#17150f;--surface2:#1e1b14;--surface3:#252018;
  --border:#2a2720;--border2:#332f25;
  --text:#f0ece4;--text2:#b8b0a0;--text3:#6e6558;--text4:#3e3a32;
  --coral:#C84B2F;--green:#2D7A5A;--blue:#1D5FA0;--amber:#EF9F27;
  --run:#2D7A5A;--cycle:#1A4D7A;
  --mono:'DM Mono',monospace;--serif:'Instrument Serif',serif;
  --rad:5px;
}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--mono);font-size:13px;}

/* ── Layout ── */
.app{display:flex;height:100vh;overflow:hidden;}
.sidebar{width:220px;flex-shrink:0;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;}

/* ── Sidebar ── */
.sidebar-header{padding:16px 14px 12px;border-bottom:1px solid var(--border);}
.sidebar-logo{font-family:var(--serif);font-style:italic;font-size:15px;color:var(--text);line-height:1.2;}
.sidebar-sub{font-size:9px;color:var(--text3);margin-top:3px;letter-spacing:0.08em;}
.sidebar-body{flex:1;overflow-y:auto;padding:8px 0;}
.sidebar-section{padding:6px 14px 4px;font-size:8px;letter-spacing:0.14em;color:var(--text4);text-transform:uppercase;}
.nav-item{display:flex;align-items:center;justify-content:space-between;padding:5px 14px;cursor:pointer;border-left:2px solid transparent;transition:all .1s;}
.nav-item:hover{background:var(--surface2);}
.nav-item.active{background:var(--surface2);border-left-color:var(--coral);color:var(--text);}
.nav-item-name{font-size:10.5px;color:var(--text2);}
.nav-item.active .nav-item-name{color:var(--text);}
.nav-badge{font-size:8px;color:var(--text3);background:var(--surface3);padding:1px 6px;border-radius:10px;}
.nav-item.active .nav-badge{color:var(--text3);}

/* ── Top bar ── */
.topbar{display:flex;align-items:center;gap:12px;padding:10px 20px;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;}
.topbar-title{font-size:13px;color:var(--text);font-weight:500;}
.topbar-sub{font-size:10px;color:var(--text3);}
.topbar-kind{font-size:8px;letter-spacing:0.1em;text-transform:uppercase;padding:2px 8px;border-radius:3px;}
.kind-table{background:#C84B2F22;color:var(--coral);}
.kind-view{background:#1D5FA022;color:var(--blue);}
.topbar-spacer{flex:1;}
.search-box{background:var(--surface2);border:0.5px solid var(--border2);border-radius:var(--rad);padding:5px 10px;font-size:10px;font-family:var(--mono);color:var(--text);width:200px;outline:none;}
.search-box:focus{border-color:var(--coral);}
.search-box::placeholder{color:var(--text3);}
.btn{padding:5px 12px;font-size:10px;font-family:var(--mono);border-radius:var(--rad);border:0.5px solid var(--border2);background:var(--surface2);color:var(--text2);cursor:pointer;transition:all .1s;letter-spacing:0.04em;}
.btn:hover{border-color:var(--coral);color:var(--text);}
.btn-primary{background:var(--coral);border-color:var(--coral);color:#fff;}
.btn-primary:hover{background:#b03e24;border-color:#b03e24;color:#fff;}

/* ── Stats bar ── */
.statsbar{display:flex;gap:0;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0;}
.stat-pill{padding:8px 18px;border-right:1px solid var(--border);}
.stat-pill-label{font-size:8px;letter-spacing:0.1em;text-transform:uppercase;color:var(--text3);margin-bottom:2px;}
.stat-pill-val{font-size:14px;font-family:var(--serif);font-style:italic;color:var(--text);}

/* ── Table area ── */
.table-wrap{flex:1;overflow:auto;padding:0;}
table{width:100%;border-collapse:collapse;font-size:11px;}
thead{position:sticky;top:0;z-index:10;}
thead th{background:var(--surface);color:var(--text3);font-size:8.5px;letter-spacing:0.08em;text-transform:uppercase;padding:7px 10px;text-align:left;white-space:nowrap;border-bottom:1px solid var(--border);cursor:pointer;user-select:none;}
thead th:hover{color:var(--text2);}
thead th.sorted{color:var(--coral);}
tbody tr{border-bottom:0.5px solid var(--border);}
tbody tr:hover{background:var(--surface2);}
tbody td{padding:5px 10px;color:var(--text2);white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis;}
tbody td.id-col{color:var(--text4);font-size:10px;}
tbody td.num{color:var(--text);font-variant-numeric:tabular-nums;}
tbody td.null{color:var(--text4);font-style:italic;}
tbody td.run{color:var(--run);}
tbody td.cycle{color:var(--cycle);}
tbody td.warn{color:var(--coral);}
tbody td.good{color:var(--green);}

/* ── Pagination ── */
.pagination{display:flex;align-items:center;gap:8px;padding:8px 16px;border-top:1px solid var(--border);background:var(--surface);flex-shrink:0;}
.page-info{font-size:10px;color:var(--text3);flex:1;}
.page-btn{padding:3px 10px;font-size:10px;font-family:var(--mono);border-radius:3px;border:0.5px solid var(--border2);background:var(--surface2);color:var(--text2);cursor:pointer;}
.page-btn:hover{border-color:var(--coral);}
.page-btn:disabled{opacity:0.3;cursor:default;}
.page-btn.current{border-color:var(--coral);color:var(--coral);}

/* ── SQL panel ── */
.sql-panel{background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;}
.sql-toggle{display:flex;align-items:center;gap:8px;padding:8px 16px;cursor:pointer;font-size:10px;color:var(--text3);}
.sql-toggle:hover{color:var(--text2);}
.sql-body{padding:10px 16px 12px;border-top:1px solid var(--border);display:none;}
.sql-body.open{display:block;}
textarea.sql-input{width:100%;min-height:64px;background:var(--surface2);border:0.5px solid var(--border2);border-radius:var(--rad);padding:8px 10px;font-size:11px;font-family:var(--mono);color:var(--text);resize:vertical;outline:none;}
textarea.sql-input:focus{border-color:var(--coral);}
.sql-actions{display:flex;align-items:center;gap:8px;margin-top:8px;}
.sql-hint{font-size:9px;color:var(--text4);flex:1;}
.sql-error{color:var(--coral);font-size:10px;margin-top:6px;padding:6px 10px;background:#C84B2F11;border-radius:var(--rad);}

/* ── Empty state ── */
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;color:var(--text3);}
.empty-icon{font-size:32px;opacity:0.3;}
.empty-msg{font-size:11px;}

/* ── Row detail modal ── */
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:100;display:none;align-items:center;justify-content:center;}
.modal-bg.open{display:flex;}
.modal{background:var(--surface);border:1px solid var(--border2);border-radius:8px;width:640px;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;}
.modal-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);}
.modal-title{font-size:12px;color:var(--text);}
.modal-close{cursor:pointer;color:var(--text3);font-size:16px;line-height:1;}
.modal-close:hover{color:var(--text);}
.modal-body{overflow-y:auto;padding:0;}
.detail-row{display:flex;border-bottom:0.5px solid var(--border);}
.detail-row:hover{background:var(--surface2);}
.detail-key{width:200px;flex-shrink:0;padding:6px 14px;font-size:10px;color:var(--text3);border-right:0.5px solid var(--border);}
.detail-val{padding:6px 14px;font-size:10px;color:var(--text2);word-break:break-all;}
.detail-val.null-val{color:var(--text4);font-style:italic;}

/* ── Scrollbar ── */
::-webkit-scrollbar{width:6px;height:6px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px;}
::-webkit-scrollbar-thumb:hover{background:var(--text4);}
</style>
</head>
<body>

<div class="app">
  <!-- ── Sidebar ── -->
  <div class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-logo">training.db</div>
      <div class="sidebar-sub" id="dbPath">Edgar Molina Training Hub</div>
    </div>
    <div class="sidebar-body" id="sidebarBody"></div>
  </div>

  <!-- ── Main ── -->
  <div class="main">
    <!-- SQL Panel -->
    <div class="sql-panel">
      <div class="sql-toggle" onclick="toggleSQL()">
        <span id="sqlToggleArrow">▶</span>
        <span>SQL Query</span>
        <span style="font-size:8px;margin-left:4px;color:var(--text4)">run custom queries</span>
      </div>
      <div class="sql-body" id="sqlBody">
        <textarea class="sql-input" id="sqlInput" placeholder="SELECT * FROM activities LIMIT 10;" rows="3"
          onkeydown="if((e=event).ctrlKey&&e.key==='Enter'||e.metaKey&&e.key==='Enter')runSQL()"></textarea>
        <div class="sql-actions">
          <span class="sql-hint">⌘↵ or Ctrl↵ to run</span>
          <button class="btn" onclick="loadTable(currentTable,1)">Reset</button>
          <button class="btn btn-primary" onclick="runSQL()">▶ Run Query</button>
        </div>
        <div class="sql-error" id="sqlError" style="display:none"></div>
      </div>
    </div>

    <!-- Top bar -->
    <div class="topbar">
      <div>
        <div class="topbar-title" id="topbarTitle">Select a table</div>
        <div class="topbar-sub" id="topbarSub"></div>
      </div>
      <span class="topbar-kind" id="topbarKind"></span>
      <div class="topbar-spacer"></div>
      <input class="search-box" id="searchBox" placeholder="Filter rows…" oninput="onSearch()" />
    </div>

    <!-- Stats bar -->
    <div class="statsbar" id="statsBar"></div>

    <!-- Table -->
    <div class="table-wrap" id="tableWrap">
      <div class="empty"><div class="empty-icon">⌘</div><div class="empty-msg">Choose a table or view from the sidebar</div></div>
    </div>

    <!-- Pagination -->
    <div class="pagination" id="pagination" style="display:none">
      <span class="page-info" id="pageInfo"></span>
      <button class="page-btn" id="btnFirst" onclick="goPage(1)">«</button>
      <button class="page-btn" id="btnPrev"  onclick="goPage(curPage-1)">‹</button>
      <span id="pageButtons"></span>
      <button class="page-btn" id="btnNext" onclick="goPage(curPage+1)">›</button>
      <button class="page-btn" id="btnLast" onclick="goPage(totalPages)">»</button>
    </div>
  </div>
</div>

<!-- Row detail modal -->
<div class="modal-bg" id="modalBg" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title" id="modalTitle">Row detail</span>
      <span class="modal-close" onclick="closeModal()">✕</span>
    </div>
    <div class="modal-body" id="modalBody"></div>
  </div>
</div>

<script>
// ── State ────────────────────────────────────────────────────────────
let currentTable = null;
let curPage = 1;
let totalPages = 1;
let sortCol = null;
let sortDir = 'asc';
let filterText = '';
let searchTimer = null;
let sqlMode = false;
let lastSqlResult = null;
let schema = {};

// ── Init ─────────────────────────────────────────────────────────────
async function init() {
  const r = await fetch('/api/schema');
  schema = await r.json();
  buildSidebar();
  // Auto-load activities
  if (schema['activities']) loadTable('activities', 1);
}

// ── Sidebar ───────────────────────────────────────────────────────────
function buildSidebar() {
  const tables = Object.entries(schema).filter(([,v])=>v.kind==='table');
  const views  = Object.entries(schema).filter(([,v])=>v.kind==='view');
  let html = '';

  html += '<div class="sidebar-section">Tables</div>';
  for (const [name, info] of tables) {
    const n = info.count.toLocaleString();
    html += `<div class="nav-item" id="nav-${name}" onclick="loadTable('${name}',1)">
      <span class="nav-item-name">${name}</span>
      <span class="nav-badge">${n}</span>
    </div>`;
  }

  html += '<div class="sidebar-section" style="margin-top:8px">Views</div>';
  for (const [name, info] of views) {
    const n = info.count.toLocaleString();
    html += `<div class="nav-item" id="nav-${name}" onclick="loadTable('${name}',1)">
      <span class="nav-item-name">${name}</span>
      <span class="nav-badge">${n}</span>
    </div>`;
  }

  document.getElementById('sidebarBody').innerHTML = html;

  // DB path
  fetch('/api/info').then(r=>r.json()).then(d=>{
    document.getElementById('dbPath').textContent = d.path;
    document.getElementById('dbPath').title = d.path;
  });
}

// ── Load table ────────────────────────────────────────────────────────
async function loadTable(name, page) {
  sqlMode = false;
  currentTable = name;
  curPage = page;
  document.getElementById('sqlError').style.display = 'none';

  // Active nav
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  const nav = document.getElementById('nav-'+name);
  if (nav) nav.classList.add('active');

  const info = schema[name] || {};
  document.getElementById('topbarTitle').textContent = name;
  document.getElementById('topbarSub').textContent = `${(info.count||0).toLocaleString()} rows · ${(info.cols||[]).length} columns`;
  const kind = info.kind || 'table';
  document.getElementById('topbarKind').textContent = kind;
  document.getElementById('topbarKind').className = `topbar-kind kind-${kind}`;

  // Clear search
  document.getElementById('searchBox').value = '';
  filterText = '';

  const params = new URLSearchParams({
    table: name, page, sort: sortCol||'', dir: sortDir, q: filterText
  });
  const r = await fetch('/api/table?' + params);
  const d = await r.json();
  if (d.error) { showError(d.error); return; }

  totalPages = d.total_pages;
  renderTable(d.columns, d.rows, d.total, page, d.total_pages);
  renderStats(name, d);
}

// ── Render table ─────────────────────────────────────────────────────
function renderTable(cols, rows, total, page, pages) {
  const wrap = document.getElementById('tableWrap');
  if (!rows.length) {
    wrap.innerHTML = '<div class="empty"><div class="empty-icon">∅</div><div class="empty-msg">No rows found</div></div>';
    document.getElementById('pagination').style.display = 'none';
    return;
  }

  const pageSize = 100;
  const offset = (page-1) * pageSize;

  let html = '<table><thead><tr>';
  for (const col of cols) {
    const sorted = sortCol===col ? ' sorted' : '';
    const arrow = sortCol===col ? (sortDir==='asc'?' ↑':' ↓') : '';
    html += `<th class="${sorted}" onclick="doSort('${col}')">${col}${arrow}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (let ri=0; ri<rows.length; ri++) {
    const row = rows[ri];
    const rowIdx = offset + ri;
    html += `<tr onclick="showRow(${rowIdx})" style="cursor:pointer">`;
    for (const col of cols) {
      const val = row[col];
      const cls = cellClass(col, val);
      if (val === null || val === undefined || val === '') {
        html += `<td class="null">null</td>`;
      } else {
        const display = String(val).length > 40 ? String(val).slice(0,40)+'…' : String(val);
        html += `<td class="${cls}">${escHtml(display)}</td>`;
      }
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  wrap.innerHTML = html;

  // Pagination
  const pag = document.getElementById('pagination');
  if (pages <= 1) { pag.style.display='none'; return; }
  pag.style.display='flex';
  const start = offset+1, end = Math.min(offset+rows.length, total);
  document.getElementById('pageInfo').textContent = `Rows ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`;
  document.getElementById('btnFirst').disabled = page<=1;
  document.getElementById('btnPrev').disabled  = page<=1;
  document.getElementById('btnNext').disabled  = page>=pages;
  document.getElementById('btnLast').disabled  = page>=pages;

  // Page number buttons (show 5 around current)
  let pageBtns = '';
  const lo = Math.max(1, page-2), hi = Math.min(pages, page+2);
  for (let p=lo; p<=hi; p++) {
    pageBtns += `<button class="page-btn ${p===page?'current':''}" onclick="goPage(${p})">${p}</button>`;
  }
  document.getElementById('pageButtons').innerHTML = pageBtns;
}

// ── Stats bar ─────────────────────────────────────────────────────────
function renderStats(name, d) {
  const bar = document.getElementById('statsBar');
  const stats = getStats(name, d);
  if (!stats.length) { bar.innerHTML=''; return; }
  bar.innerHTML = stats.map(s=>`
    <div class="stat-pill">
      <div class="stat-pill-label">${s.label}</div>
      <div class="stat-pill-val">${s.val}</div>
    </div>`).join('');
}

function getStats(name, d) {
  if (name==='activities') return [
    {label:'Total activities', val: d.total},
    {label:'Runs', val: d.rows.filter(r=>r.activity_type==='Running').length + (d.total > d.rows.length ? '+' : '')},
    {label:'Rides', val: d.rows.filter(r=>r.activity_type&&r.activity_type.includes('Cycling')).length + (d.total > d.rows.length ? '+' : '')},
  ];
  if (name==='records') return [{label:'Total records', val:d.total.toLocaleString()}, {label:'Per activity (avg)', val: Math.round(d.total/Math.max(1,Object.keys(schema).includes('activities')?schema.activities.count:1)).toLocaleString()}];
  if (name==='hrv') return [{label:'RR intervals', val:d.total.toLocaleString()}, {label:'Approx duration', val: Math.round(d.total/60)+' min'}];
  if (name==='events') return [{label:'Total events', val:d.total}];
  return [{label:'Rows', val: d.total.toLocaleString()}, {label:'Columns', val: d.columns.length}];
}

// ── Cell styling ──────────────────────────────────────────────────────
function cellClass(col, val) {
  if (col==='id' || col==='activity_id') return 'id-col';
  if (typeof val === 'number') return 'num';
  if (col==='activity_type') {
    if (String(val).includes('Running')) return 'run';
    if (String(val).includes('Cycling')) return 'cycle';
  }
  if (col==='left_gct_pct' && val < 47.5) return 'warn';
  if (col==='battery_status') {
    if (val==='good') return 'good';
    if (val==='low'||val==='critical') return 'warn';
  }
  if (col==='event_type' && val==='start') return 'good';
  if (col==='event_type' && val==='stop_all') return 'warn';
  return '';
}

// ── Sort ──────────────────────────────────────────────────────────────
function doSort(col) {
  if (sortCol===col) sortDir = sortDir==='asc'?'desc':'asc';
  else { sortCol=col; sortDir='asc'; }
  if (sqlMode && lastSqlResult) {
    // Sort in-memory for SQL results
    const rows = [...lastSqlResult.rows];
    rows.sort((a,b)=>{
      const av=a[col], bv=b[col];
      if(av===null) return 1; if(bv===null) return -1;
      const r = av<bv?-1:av>bv?1:0;
      return sortDir==='asc'?r:-r;
    });
    renderTable(lastSqlResult.columns, rows, rows.length, 1, 1);
  } else {
    loadTable(currentTable, 1);
  }
}

// ── Search ────────────────────────────────────────────────────────────
function onSearch() {
  filterText = document.getElementById('searchBox').value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(()=>{ if(currentTable) loadTable(currentTable,1); }, 300);
}

// ── Pagination ────────────────────────────────────────────────────────
function goPage(p) {
  if (p<1||p>totalPages) return;
  curPage=p; loadTable(currentTable,p);
}

// ── Row detail modal ──────────────────────────────────────────────────
let tableRows = [];
async function showRow(idx) {
  // Fetch single row by re-querying same page
  const params = new URLSearchParams({
    table: sqlMode?'__sql__':currentTable, page: curPage,
    sort:sortCol||'', dir:sortDir, q:filterText
  });
  const r = await fetch('/api/table?'+params);
  const d = await r.json();
  const pageSize = 100;
  const offset = (curPage-1)*pageSize;
  const rowInPage = idx - offset;
  if (!d.rows || rowInPage<0 || rowInPage>=d.rows.length) return;
  const row = d.rows[rowInPage];
  const cols = d.columns;

  document.getElementById('modalTitle').textContent = `Row ${idx+1} — ${currentTable}`;
  let html = '';
  for (const col of cols) {
    const val = row[col];
    const isNull = val===null||val===undefined||val==='';
    html += `<div class="detail-row">
      <div class="detail-key">${col}</div>
      <div class="detail-val ${isNull?'null-val':''}">${isNull?'null':escHtml(String(val))}</div>
    </div>`;
  }
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modalBg').classList.add('open');
}
function closeModal() { document.getElementById('modalBg').classList.remove('open'); }
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });

// ── SQL ───────────────────────────────────────────────────────────────
function toggleSQL() {
  const body = document.getElementById('sqlBody');
  const arrow = document.getElementById('sqlToggleArrow');
  const open = body.classList.toggle('open');
  arrow.textContent = open ? '▼' : '▶';
}

async function runSQL() {
  const sql = document.getElementById('sqlInput').value.trim();
  if (!sql) return;
  document.getElementById('sqlError').style.display='none';
  const r = await fetch('/api/query', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({sql})
  });
  const d = await r.json();
  if (d.error) {
    const el = document.getElementById('sqlError');
    el.textContent = d.error; el.style.display='block'; return;
  }
  sqlMode = true;
  currentTable = '__sql__';
  lastSqlResult = d;
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  document.getElementById('topbarTitle').textContent = 'SQL Query';
  document.getElementById('topbarSub').textContent = `${d.rows.length} rows returned`;
  document.getElementById('topbarKind').textContent = 'query';
  document.getElementById('topbarKind').className = 'topbar-kind';
  document.getElementById('topbarKind').style.background='#EF9F2722';
  document.getElementById('topbarKind').style.color='var(--amber)';
  totalPages=1; curPage=1;
  renderTable(d.columns, d.rows, d.rows.length, 1, 1);
  document.getElementById('statsBar').innerHTML = `<div class="stat-pill"><div class="stat-pill-label">Rows returned</div><div class="stat-pill-val">${d.rows.length.toLocaleString()}</div></div><div class="stat-pill"><div class="stat-pill-label">Columns</div><div class="stat-pill-val">${d.columns.length}</div></div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function showError(msg) {
  document.getElementById('tableWrap').innerHTML =
    `<div class="empty"><div class="empty-icon">✕</div><div class="empty-msg">${escHtml(msg)}</div></div>`;
}

init();
</script>
</body>
</html>"""


# ── Routes ──────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template_string(HTML)


@app.route('/api/info')
def api_info():
    return jsonify({'path': str(Path(DB_PATH).resolve())})


@app.route('/api/schema')
def api_schema():
    return jsonify(get_schema())


@app.route('/api/table')
def api_table():
    name = request.args.get('table', '')
    page = int(request.args.get('page', 1))
    sort = request.args.get('sort', '')
    direction = request.args.get('dir', 'asc')
    q = request.args.get('q', '').strip()

    if not name or name.startswith('__'):
        return jsonify({'error': 'No table specified'})

    # Validate name
    schema = get_schema()
    if name not in schema:
        return jsonify({'error': f'Table "{name}" not found'})

    try:
        conn = get_conn()
        cols_info = conn.execute(f"PRAGMA table_info('{name}')").fetchall()
        columns = [c['name'] for c in cols_info]

        # Build WHERE clause for search
        where = ''
        params = []
        if q:
            clauses = [f'CAST("{c}" AS TEXT) LIKE ?' for c in columns]
            where = ' WHERE ' + ' OR '.join(clauses)
            params = [f'%{q}%'] * len(columns)

        # Count
        total = conn.execute(f'SELECT COUNT(*) FROM "{name}"{where}', params).fetchone()[0]
        total_pages = max(1, math.ceil(total / PAGE_SIZE))
        page = max(1, min(page, total_pages))

        # Sort
        order = ''
        if sort and sort in columns:
            d = 'ASC' if direction == 'asc' else 'DESC'
            order = f' ORDER BY "{sort}" {d} NULLS LAST'

        # Fetch page
        offset = (page - 1) * PAGE_SIZE
        sql = f'SELECT * FROM "{name}"{where}{order} LIMIT {PAGE_SIZE} OFFSET {offset}'
        rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
        conn.close()

        return jsonify({
            'columns': columns,
            'rows': rows,
            'total': total,
            'page': page,
            'total_pages': total_pages,
        })
    except Exception as e:
        return jsonify({'error': str(e)})


@app.route('/api/query', methods=['POST'])
def api_query():
    data = request.get_json()
    sql = (data or {}).get('sql', '').strip()
    if not sql:
        return jsonify({'error': 'No SQL provided'})

    # Block destructive statements
    sql_upper = sql.upper().lstrip()
    for kw in ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'CREATE', 'ALTER', 'TRUNCATE']:
        if sql_upper.startswith(kw):
            return jsonify({'error': f'{kw} statements are not allowed in the previewer'})

    try:
        conn = get_conn()
        cursor = conn.execute(sql)
        rows = cursor.fetchall()
        if not rows:
            columns = [d[0] for d in cursor.description] if cursor.description else []
            conn.close()
            return jsonify({'columns': columns, 'rows': []})
        columns = list(rows[0].keys())
        result = [dict(r) for r in rows]
        conn.close()
        return jsonify({'columns': columns, 'rows': result})
    except Exception as e:
        return jsonify({'error': str(e)})


# ── Main ────────────────────────────────────────────────────────────────

def main():
    global DB_PATH
    parser = argparse.ArgumentParser(description='Training DB Previewer')
    parser.add_argument('--db', default='training.db', help='Path to training.db')
    parser.add_argument('--port', type=int, default=5000)
    parser.add_argument('--host', default='127.0.0.1')
    args = parser.parse_args()

    DB_PATH = args.db
    db = Path(DB_PATH)
    if not db.exists():
        print(f"ERROR: Database not found at {db.resolve()}")
        print(f"Run first:  python create_db.py --db {DB_PATH}")
        return

    print(f"\n  Edgar Molina Training Hub — DB Previewer")
    print(f"  ─────────────────────────────────────────")
    print(f"  Database:  {db.resolve()}")
    print(f"  Size:      {db.stat().st_size/1024/1024:.1f} MB")
    print(f"  Open:      http://localhost:{args.port}")
    print(f"\n  Press Ctrl+C to stop\n")

    app.run(host=args.host, port=args.port, debug=False)


if __name__ == '__main__':
    main()
