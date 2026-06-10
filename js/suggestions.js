// ════════════════════════════════════════════════════════════════════════════
// SUGGESTIONS — Adaptive Plan Adjustments
// ════════════════════════════════════════════════════════════════════════════
// Reads completed activities (runs.json, cycles.json) and the static plan
// (WEEKS in plan.js) and produces structured "suggestion" objects each with a
// rationale, a current value, a proposed value, and an accept/dismiss state.
//
// Suggestions are NEVER auto-applied. The user explicitly accepts or dismisses
// each one. Accept/dismiss state is persisted in localStorage so suggestions
// don't reappear after the user has actioned them.
//
// Adding a new rule:
//   1. Write a function `ruleXxx(ctx)` that returns an array of suggestion
//      objects (or [] if the rule doesn't fire).
//   2. Add it to the RULES array at the bottom.
//   3. Make sure each suggestion has a stable `id` so dismiss/accept state
//      survives reloads.
// ════════════════════════════════════════════════════════════════════════════

const LS_KEY = 'planSuggestions.v1';

// ── helpers ──────────────────────────────────────────────────────────────────

function _loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
  catch(e) { return {}; }
}
function _saveState(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(e){}
}
function getSuggestionState(id) {
  const s = _loadState();
  return s[id] || { status:'pending' };
}
function setSuggestionState(id, patch) {
  const s = _loadState();
  s[id] = { ...(s[id]||{}), ...patch, updatedAt: new Date().toISOString().slice(0,10) };
  _saveState(s);
}

// Parse a week's `dates` string ("May 11–17" or "Jun 29–Jul 5") into start/end
// Date objects, anchored to year 2026 (the only training year supported here).
function _parseWeekDates(datesStr) {
  const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  const parts = datesStr.split('–').map(s=>s.trim());
  // left side always has a month
  const [lMon, lDay] = parts[0].split(' ');
  const lStart = new Date(2026, MONTHS[lMon], parseInt(lDay));
  let rMon = lMon, rDay = parts[1];
  if (parts[1].includes(' ')) [rMon, rDay] = parts[1].split(' ');
  const rEnd = new Date(2026, MONTHS[rMon], parseInt(rDay));
  return { start: lStart, end: rEnd };
}

// Given a Date, find which plan week contains it (or null if outside the plan).
function _weekForDate(date) {
  if(typeof WEEKS === 'undefined') return null;
  for(const w of WEEKS) {
    const {start, end} = _parseWeekDates(w.dates);
    if(date >= start && date <= new Date(end.getFullYear(),end.getMonth(),end.getDate(),23,59,59)) {
      return w;
    }
  }
  return null;
}

function _parseDur(t){
  if(!t) return 0;
  const p = t.split(':').map(Number);
  return p.length===3 ? p[0]*3600+p[1]*60+p[2] : 0;
}

function _parseAscent(v){
  try { return parseInt(String(v).replace(',',''))||0; } catch(e){ return 0; }
}

// Riegel race projection — T2 = T1 * (D2/D1)^1.06
function _riegel(timeSec, distMi, targetMi) {
  return timeSec * Math.pow(targetMi/distMi, 1.06);
}

function _fmtPace(secPerMi) {
  const s = Math.round(secPerMi);
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}/mi`;
}

function _fmtTime(s) {
  s = Math.round(s);
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
           : `${m}:${String(sec).padStart(2,'0')}`;
}

// ── shared evaluation context ────────────────────────────────────────────────
// Built once per evaluateRules() call so individual rules don't re-do work.

function _buildContext() {
  const runs   = (typeof analyticsRuns   !== 'undefined' ? analyticsRuns   : []);
  const cycles = (typeof analyticsCycles !== 'undefined' ? analyticsCycles : []);
  const today  = new Date();

  // Map each activity to its plan week (if any)
  const runsByWeek = {}, cyclesByWeek = {};
  for(const r of runs) {
    const d = new Date((r.Date||r.date||'').slice(0,10));
    const wk = _weekForDate(d);
    if(wk) (runsByWeek[wk.num] ||= []).push(r);
  }
  for(const r of cycles) {
    const d = new Date((r.Date||r.date||'').slice(0,10));
    const wk = _weekForDate(d);
    if(wk) (cyclesByWeek[wk.num] ||= []).push(r);
  }

  // Compute weekly run mileage actuals vs planned
  const weekStatus = WEEKS.map(w => {
    const runs   = runsByWeek[w.num]   || [];
    const cycles = cyclesByWeek[w.num] || [];
    const actualRunMi = runs.reduce((s,r)=>s+(r.Distance||0),0);
    const actualCycleHrs = cycles.reduce((s,r)=>s+_parseDur(r.Time||'')/3600,0);
    // Estimate planned cycling hours by scanning day stats strings
    const plannedCycleMin = (w.days||[]).reduce((sum,d)=>{
      if(!d.type || !d.type.includes('cycle')) return sum;
      const m = (d.detail||d.stats||'').match(/(\d+)\s*min/);
      return sum + (m ? parseInt(m[1]) : 0);
    }, 0);
    const {end} = _parseWeekDates(w.dates);
    const isPast = end < today;
    const isCurrent = !isPast && new Date(_parseWeekDates(w.dates).start) <= today;
    return {
      week: w, runs, cycles,
      plannedMi: w.miles || 0,
      actualMi: actualRunMi,
      hitRate: w.miles ? actualRunMi / w.miles : 0,
      plannedCycleHrs: plannedCycleMin / 60,
      actualCycleHrs,
      cycleRatio: plannedCycleMin ? actualCycleHrs / (plannedCycleMin/60) : Infinity,
      isPast, isCurrent,
    };
  });

  return { runs, cycles, today, runsByWeek, cyclesByWeek, weekStatus };
}

// ── RULES ────────────────────────────────────────────────────────────────────
// Each rule returns an array of suggestion objects with shape:
//   {
//     id:          stable id used for localStorage state
//     priority:    'high' | 'medium' | 'info'  (drives sort + color)
//     category:    'race' | 'volume' | 'cycling' | 'pace' | 'affirm'
//     title:       short headline
//     rationale:   multi-sentence explanation
//     current:     'what the plan says now' (short string)
//     proposed:    'what to change it to' (short string, or null for info-only)
//     targets:     [{weekNum, dayName?}]  which plan rows are affected (for display)
//     edit:        { file, old, new }  exact diff to apply (or null for info-only)
//   }

// R-RACE: Race-derived MP recalibration
// Looks at the most recent race ≥3mi and Riegel-projects to marathon distance.
// Compares against the marathon-pace string in upcoming "MP" sessions.
function ruleRaceRecalibration(ctx) {
  const races = ctx.runs.filter(r => r.is_race && r.pace_sec && (r.Distance||0) >= 3)
                        .sort((a,b)=> new Date(b.Date||b.date) - new Date(a.Date||a.date));
  if(!races.length) return [];
  const race = races[0];
  const raceDate = (race.Date||race.date||'').slice(0,10);
  const raceTime = race.pace_sec * race.Distance;
  const projectedMpSec = _riegel(raceTime, race.Distance, 26.219) / 26.219;
  const projMpStr = _fmtPace(projectedMpSec);

  // Plan's currently-prescribed MP — pull from upcoming Saturday MP sessions.
  // Match "marathon (goal) pace" in detail or whole-word "MP" in stats/title
  // (NOT case-insensitive substring, which would also match "mp" inside "tempo").
  const MP_DETAIL = /marathon\s+(goal\s+)?pace/i;
  const MP_TOKEN  = /\bMP\b/;
  const futureMpDays = [];
  for(const w of WEEKS) {
    if(_parseWeekDates(w.dates).start < ctx.today) continue;
    for(const d of (w.days||[])) {
      const detail = d.detail || '';
      const stats  = d.stats  || '';
      const title  = d.title  || '';
      if(MP_DETAIL.test(detail) || MP_TOKEN.test(stats) || MP_TOKEN.test(title)) {
        futureMpDays.push({week:w, day:d});
      }
    }
  }
  if(!futureMpDays.length) return [];

  // Extract the pace range that immediately follows "marathon pace" in the detail.
  // Example detail: "miles 11–14 at marathon pace (9:00–9:10/mi). Fuel ..."
  function extractMpPace(detail) {
    if(!detail) return null;
    const m = detail.match(/marathon\s+(?:goal\s+)?pace[^()]*\((\d):(\d{2})[–-](\d):(\d{2})\/mi\)/i);
    if(m) return { low: (+m[1])*60 + (+m[2]), high: (+m[3])*60 + (+m[4]), str:`${m[1]}:${m[2]}–${m[3]}:${m[4]}/mi` };
    return null;
  }
  // Prefer a sample that has an extractable MP pace; fall back to first match
  let sample = futureMpDays.find(x => extractMpPace(x.day.detail));
  sample = sample ? sample.day.detail : (futureMpDays[0].day.detail || '');
  const parsed = extractMpPace(sample);
  const planMpStr   = parsed ? parsed.str : 'unknown';
  const planLowSec  = parsed ? parsed.low : null;
  const planHighSec = parsed ? parsed.high : null;

  // Decide direction
  let priority = 'medium';
  let title, rationale, proposed = null;
  if(planLowSec != null && projectedMpSec > planHighSec + 10) {
    // Projected MP is meaningfully slower than prescribed — flag it
    const proposedLow  = Math.round(projectedMpSec - 15);
    const proposedHigh = Math.round(projectedMpSec + 15);
    proposed = `${_fmtPace(proposedLow).replace('/mi','')}–${_fmtPace(proposedHigh).replace('/mi','')}/mi`;
    title = `Marathon pace may be optimistic vs. recent race`;
    rationale = `Your most recent race (${raceDate}, ${race.Distance.toFixed(1)} mi at ${_fmtPace(race.pace_sec)}) projects a marathon pace of ~${projMpStr} (Riegel, 1.06 exponent). The plan currently prescribes marathon-pace segments at ${planMpStr} across ${futureMpDays.length} upcoming Saturday long runs. The plan's MP is faster than what the race-projection supports. Two interpretations: (1) the half was a deliberately undercooked tune-up effort and the build phase will bring fitness up to MP — likely, since the plan note for that week says "treat as a hard training effort, not a peak performance"; (2) the goal MP is aspirational and needs adjustment after a true-effort race. Recommended action: hold the prescription through W7–W8 and re-evaluate after the first MP-finish long run. If those MP miles feel sustainable, keep 9:00–9:10. If they fall apart, shift to ${proposed}.`;
  } else if(planLowSec != null && projectedMpSec < planLowSec - 10) {
    // Projected MP is faster than prescribed — runner has earned a step up
    const proposedLow  = Math.round(projectedMpSec - 10);
    const proposedHigh = Math.round(projectedMpSec + 5);
    proposed = `${_fmtPace(proposedLow).replace('/mi','')}–${_fmtPace(proposedHigh).replace('/mi','')}/mi`;
    title = `Fitness is ahead of prescribed marathon pace`;
    rationale = `Your most recent race (${raceDate}, ${race.Distance.toFixed(1)} mi at ${_fmtPace(race.pace_sec)}) projects a marathon pace of ~${projMpStr} (Riegel). The plan currently prescribes ${planMpStr} for upcoming MP segments — that's slower than the race-projection supports. Consider shifting MP prescriptions to ${proposed} across the ${futureMpDays.length} affected sessions.`;
    priority = 'medium';
  } else {
    title = `Recent race aligned with prescribed marathon pace`;
    rationale = `Your ${raceDate} race (${race.Distance.toFixed(1)} mi at ${_fmtPace(race.pace_sec)}) projects a marathon pace of ~${projMpStr} (Riegel). That sits within the plan's current MP range (${planMpStr}). No adjustment needed — execution is calibrated.`;
    priority = 'info';
  }

  return [{
    id: `race-recal-${raceDate}`,
    priority, category:'race',
    title, rationale,
    current: planMpStr,
    proposed,
    targets: futureMpDays.map(x=>({weekNum:x.week.num, dayName:x.day.name})),
  }];
}

// R-VOLUME: Weekly mileage hit-rate over recent past weeks
function ruleVolumeExecution(ctx) {
  const past = ctx.weekStatus.filter(w => w.isPast).slice(-4);
  if(past.length < 2) return [];
  const hits = past.filter(w => w.hitRate >= 0.95);
  const misses = past.filter(w => w.hitRate < 0.80);

  const out = [];
  if(hits.length >= 3) {
    const next = ctx.weekStatus.find(w => w.isCurrent || (!w.isPast));
    out.push({
      id: `volume-on-track-${past[past.length-1].week.num}`,
      priority: 'info', category: 'affirm',
      title: `Volume execution: ${hits.length} of last ${past.length} weeks on plan`,
      rationale: `You've hit ≥95% of planned run mileage in ${hits.map(w=>`W${w.week.num} (${w.actualMi.toFixed(1)}/${w.plannedMi})`).join(', ')}. Consistent execution at the prescribed volume is the right pattern — no adjustment recommended yet. If this continues through the recovery week (W6), eligible for a 5% bump starting W7.`,
      current: 'Plan volume as-is',
      proposed: null,
      targets: [],
    });
  }
  if(misses.length >= 2) {
    out.push({
      id: `volume-misses-${misses[misses.length-1].week.num}`,
      priority: 'high', category: 'volume',
      title: `${misses.length} recent weeks under-executed planned volume`,
      rationale: `Volume hit rate was below 80% in ${misses.map(w=>`W${w.week.num} (${w.actualMi.toFixed(1)}/${w.plannedMi})`).join(', ')}. Consider scaling the next long run by 10–15% or trimming a midweek easy day to consolidate quality work. Recurring misses are a signal that ramp is too steep, not a moral failure.`,
      current: `Next long run as prescribed`,
      proposed: `Reduce next long run by 10–15%`,
      targets: [],
    });
  }
  return out;
}

// R-CYCLING: Cycling hours vs structured plan
function ruleCyclingDrift(ctx) {
  const past = ctx.weekStatus.filter(w => w.isPast).slice(-4);
  if(past.length < 2) return [];
  const drifters = past.filter(w => w.cycleRatio > 2 && w.actualCycleHrs > 2);
  if(drifters.length < 2) return [];

  const totalActual = drifters.reduce((s,w)=>s+w.actualCycleHrs,0);
  const totalPlanned = drifters.reduce((s,w)=>s+w.plannedCycleHrs,0);
  const avgRatio = totalActual / Math.max(totalPlanned, 0.1);

  return [{
    id: `cycling-drift-${drifters[drifters.length-1].week.num}`,
    priority: 'medium', category: 'cycling',
    title: `Cycling load running ~${avgRatio.toFixed(1)}× planned`,
    rationale: `Across ${drifters.map(w=>`W${w.week.num}`).join(', ')} you logged ${totalActual.toFixed(1)}h of cycling vs ~${totalPlanned.toFixed(1)}h structured in the plan. The bike fitness is welcome but it's unbudgeted aerobic load. Two options: (1) self-cap cycling at 3.5–4h/week during quality weeks (W5, W7, W8, W9) and reserve long rides for recovery weeks (W6, W10); (2) update the plan to formally include a long-ride slot on recovery weeks so cycling isn't competing with the run prescription. Both are valid — option 2 is more honest about how you actually train.`,
    current: `~${totalPlanned.toFixed(1)}h/wk structured`,
    proposed: `Cap at 3.5–4h/wk during quality weeks; add long-ride slot to recovery weeks`,
    targets: [],
  }];
}

// R-AFFIRM: Long-run progression on target
function ruleLongRunProgression(ctx) {
  const past = ctx.weekStatus.filter(w => w.isPast).slice(-3);
  if(past.length < 2) return [];
  const longRunsOnTarget = past.filter(w => {
    const longest = Math.max(...(w.runs||[]).map(r=>r.Distance||0), 0);
    const planLongest = Math.max(...(w.week.days||[]).map(d=>{
      const m = (d.stats||'').match(/(\d+(?:\.\d+)?)\s*mi/);
      return m ? parseFloat(m[1]) : 0;
    }), 0);
    return planLongest && longest >= planLongest * 0.95;
  });
  if(longRunsOnTarget.length !== past.length) return [];

  return [{
    id: `longrun-on-track-${past[past.length-1].week.num}`,
    priority: 'info', category: 'affirm',
    title: `Long-run progression on target`,
    rationale: `Each of the last ${past.length} weekly long runs hit the prescribed distance: ${past.map(w=>{
      const longest = Math.max(...(w.runs||[]).map(r=>r.Distance||0), 0);
      return `W${w.week.num} ${longest.toFixed(1)} mi`;
    }).join(' · ')}. Stay the course — the next planned step is the W4 13-miler with a 9:00–9:10 finish.`,
    current: 'Long-run ladder as planned',
    proposed: null,
    targets: [],
  }];
}

// ── public API ───────────────────────────────────────────────────────────────

const RULES = [ruleRaceRecalibration, ruleVolumeExecution, ruleCyclingDrift, ruleLongRunProgression];

function evaluateSuggestions() {
  if(typeof WEEKS === 'undefined') return [];
  const ctx = _buildContext();
  const out = [];
  for(const rule of RULES) {
    try { out.push(...rule(ctx)); }
    catch(e) { console.warn('Suggestion rule errored:', rule.name, e); }
  }
  // Attach persisted state
  return out.map(s => ({ ...s, state: getSuggestionState(s.id) }))
            .sort((a,b)=>{
              const order = {high:0, medium:1, info:2};
              return order[a.priority] - order[b.priority];
            });
}

function acceptSuggestion(id) {
  setSuggestionState(id, { status: 'accepted' });
  renderSuggestionsTab();
}

function dismissSuggestion(id) {
  setSuggestionState(id, { status: 'dismissed' });
  renderSuggestionsTab();
}

function reopenSuggestion(id) {
  setSuggestionState(id, { status: 'pending' });
  renderSuggestionsTab();
}

// ── rendering ────────────────────────────────────────────────────────────────

function renderSuggestionsTab() {
  const root = document.getElementById('tab-suggestions');
  if(!root) return;
  const suggestions = evaluateSuggestions();
  const pending   = suggestions.filter(s=>s.state.status==='pending');
  const accepted  = suggestions.filter(s=>s.state.status==='accepted');
  const dismissed = suggestions.filter(s=>s.state.status==='dismissed');

  const card = (s) => {
    const priClass = `sg-pri-${s.priority}`;
    const isDone = s.state.status !== 'pending';
    const actions = isDone
      ? `<button class="sg-btn sg-btn-undo" data-action="reopen-suggestion" data-sid="${s.id}">↺ Reopen</button>`
      : `<button class="sg-btn sg-btn-accept" data-action="accept-suggestion" data-sid="${s.id}">✓ Accept</button>
         <button class="sg-btn sg-btn-dismiss" data-action="dismiss-suggestion" data-sid="${s.id}">Dismiss</button>`;
    const stamp = s.state.status==='accepted' ? '<span class="sg-stamp sg-stamp-accept">Accepted</span>'
                : s.state.status==='dismissed' ? '<span class="sg-stamp sg-stamp-dismiss">Dismissed</span>'
                : '';
    const proposedRow = s.proposed
      ? `<div class="sg-diff">
           <div class="sg-diff-row"><span class="sg-diff-key">Current</span><span class="sg-diff-val sg-diff-current">${s.current}</span></div>
           <div class="sg-diff-row"><span class="sg-diff-key">Proposed</span><span class="sg-diff-val sg-diff-proposed">${s.proposed}</span></div>
         </div>`
      : `<div class="sg-diff">
           <div class="sg-diff-row"><span class="sg-diff-key">Status</span><span class="sg-diff-val sg-diff-current">${s.current}</span></div>
         </div>`;
    const targetsRow = s.targets && s.targets.length
      ? `<div class="sg-targets">Affects ${s.targets.length} session${s.targets.length>1?'s':''}: ${s.targets.slice(0,4).map(t=>`W${t.weekNum}${t.dayName?' '+t.dayName:''}`).join(' · ')}${s.targets.length>4?' …':''}</div>`
      : '';
    return `<div class="sg-card ${priClass} ${isDone?'sg-done':''}">
      <div class="sg-head">
        <div class="sg-cat">${s.category}</div>
        ${stamp}
      </div>
      <div class="sg-title">${s.title}</div>
      ${proposedRow}
      ${targetsRow}
      <div class="sg-rationale">${s.rationale}</div>
      <div class="sg-actions">${actions}</div>
    </div>`;
  };

  let html = '';
  html += `<div class="sg-intro">
    <div class="sg-intro-title">Plan adjustments</div>
    <div class="sg-intro-sub">Suggestions generated from your completed activities. Nothing here changes the plan automatically — accept to mark applied, dismiss to hide.</div>
  </div>`;

  if(pending.length) {
    html += `<div class="sg-section-head">Pending · ${pending.length}</div>`;
    html += pending.map(card).join('');
  } else {
    html += `<div class="sg-empty">No pending suggestions. Plan is on track based on your most recent activity.</div>`;
  }

  if(accepted.length) {
    html += `<div class="sg-section-head sg-section-muted">Accepted · ${accepted.length}</div>`;
    html += accepted.map(card).join('');
  }
  if(dismissed.length) {
    html += `<div class="sg-section-head sg-section-muted">Dismissed · ${dismissed.length}</div>`;
    html += dismissed.map(card).join('');
  }

  root.innerHTML = html;
}

// Expose globals expected by app.js
window.evaluateSuggestions = evaluateSuggestions;
window.renderSuggestionsTab = renderSuggestionsTab;
window.acceptSuggestion = acceptSuggestion;
window.dismissSuggestion = dismissSuggestion;
window.reopenSuggestion = reopenSuggestion;
