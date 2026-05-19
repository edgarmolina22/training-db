// plan.js — extracted from the original monolithic js/app.js
// Sourced ranges:
//   lines 453–993  (Plan render + dynamic header + week notes)
//   lines 1871–2153  (Plan health flags)

// ════════════════════════════════════════
// PLAN DATA + RENDER
// ════════════════════════════════════════
const PHASES = [
  { id:'rehab',   name:'Phase 1 — IT band rehab + easy base', weeks:[1,2],     desc:'Easy running only · Daily strength · No intensity' },
  { id:'rebuild', name:'Phase 2 — Base rebuild',               weeks:[3,4,5,6], desc:'Reintroduce tempo · Build to 34mi/wk · 1 recovery week' },
  { id:'build',   name:'Phase 3 — Build + quality',            weeks:[7,8,9,10],desc:'Peak quality work · 40–42mi · 1 recovery week' },
  { id:'peak',    name:'Phase 4 — Peak',                       weeks:[11,12],   desc:'Max fitness stimulus · Long race-practice runs' },
  { id:'taper',   name:'Phase 5 — Taper',                      weeks:[13,14,15],desc:'Reduce volume · Sharpen · Race day' },
];

const ITB_DAILY = [
  { name:'Clamshells', detail:'3×15 each side, resistance band' },
  { name:'Lateral band walks', detail:'2×20 steps each direction' },
  { name:'Single-leg step-downs', detail:'3×10 each side, slow and controlled' },
  { name:'Hip 90/90 stretch', detail:'60 sec each side' },
  { name:'IT band foam roll', detail:'60 sec each side, slow' },
];

const ITB_STRENGTH_A = [
  { name:'Bulgarian split squat', detail:'3×10 each leg, bodyweight or light DB' },
  { name:'Single-leg RDL', detail:'3×10 each leg, focus on left hip stability' },
  { name:'Lateral band walks', detail:'3×20 steps each direction' },
  { name:'Clamshells', detail:'3×20 each side, heavy band' },
  { name:'Side-lying hip abduction', detail:'3×15 each side' },
  { name:'Glute bridge (single-leg)', detail:'3×12 each side' },
];

const ITB_STRENGTH_B = [
  { name:'Step-down (eccentric)', detail:'4×8 each leg, 4-count down' },
  { name:'Lateral lunge', detail:'3×10 each side' },
  { name:'Monster walks', detail:'3×15 steps each direction' },
  { name:'Copenhagen plank', detail:'3×20 sec each side' },
  { name:'TFL stretch + foam roll', detail:'90 sec each side' },
  { name:'Pigeon pose', detail:'90 sec each side' },
];
const WEEKS = [
  // PHASE 1 — REHAB
  {
    num:1, phase:'rehab', dates:'May 11–17', miles:26, note:'Active IT band rehab week. All runs easy, no hills, no intensity. If any lateral knee pain appears, walk.',
    optionalCycling:'30–45 min easy road ride (Z1, HR ≤120) if schedule allows. Friday evening or weekend works well — keeps the IT band activation pattern going without taxing the legs. Skip if rest day is what your body wants.',
    hasRace:false,
    days:[
      { name:'Mon', type:'run', title:'Easy run — 4.5 miles', detail:'9:45–10:15/mi, HR ≤143. If any lateral knee pain, stop and walk.', stats:'4.5 mi · HR ≤143' },
      { name:'Tue', type:'run', title:'Easy run — 3.5 miles', detail:'9:45–10:15/mi, HR ≤143. Shortened slightly since you ran Monday. If any lateral knee pain, stop and walk.', stats:'3.5 mi · HR ≤143' },
      { name:'Wed', type:'run+strength', title:'Easy run — 5 miles + Strength B', detail:'9:45–10:15/mi. Strength B circuit after — focus on controlled single-leg movements.', stats:'5 mi · Strength B' },
      { name:'Thu', type:'cycle', title:'Easy cycling — 45 min', detail:'Flat route or stationary, Z1–Z2 effort. Shifted from Monday to here. Gives aerobic stimulus with no impact stress on IT band.', stats:'45 min · Z1–Z2' },
      { name:'Fri', type:'run', title:'Easy run — 5 miles', detail:'Easy effort only. Add 4 strides (20 sec each) at the very end if completely pain-free.', stats:'5 mi · HR ≤145' },
      { name:'Sat', type:'run', title:'Long run — 8 miles', detail:'9:30–10:00/mi, HR ≤150. Flat route only. Walk the last 0.5mi as cooldown. Daily ITB routine before and foam roll after.', stats:'8 mi · HR ≤150 · flat only' },
      { name:'Sun', type:'rest', title:'Rest day', detail:'Full rest. No running, no cross-training. Foam roll IT band, do your daily activation routine. Recovery is when adaptation happens.', stats:'Rest · recovery day' },
    ],
    strength:{ title:'Daily ITB activation (every day, ~10 min)', exercises:ITB_DAILY },
  },
  {
    num:2, phase:'rehab', dates:'May 18–24', miles:25, note:'Second and final rehab week — build mileage gently heading into the half marathon on May 31. No intensity, no hills. All easy.',
    optionalCycling:'30–45 min easy road ride (Z1, HR ≤120) if schedule allows. Already a built-in Monday + Thursday cycle this week — this would be a third, recreational ride. Skip if you feel taxed before the half.',
    hasRace:false,
    days:[
      { name:'Mon', type:'strength', title:'Strength A + easy bike', detail:'30 min easy cycling. Strength circuit A — increase clamshell resistance if last week felt easy.', stats:'30 min cycling · Strength A' },
      { name:'Tue', type:'run', title:'Easy run — 4 miles', detail:'9:45–10:15/mi, HR ≤143. Keep it truly easy — you have a half marathon in 10 days.', stats:'4 mi · HR ≤143' },
      { name:'Wed', type:'run+strength', title:'Easy run — 5 miles + Strength B', detail:'9:45–10:15/mi. Strength B circuit after — controlled single-leg work, focus on left hip stability.', stats:'5 mi · Strength B' },
      { name:'Thu', type:'cycle', title:'Easy cycling — 45 min', detail:'Z1–Z2 effort. Impact-free aerobic work — legs stay fresh for the weekend.', stats:'45 min · Z1–Z2' },
      { name:'Fri', type:'run', title:'Easy run — 5 miles + strides', detail:'9:30–10:00/mi. Add 4 strides (20 sec each) if IT band is completely pain-free.', stats:'5 mi + strides · HR ≤145' },
      { name:'Sat', type:'run', title:'Long run — 11 miles', detail:'9:30–10:00/mi, HR ≤150. Flat route only. Walk the last 0.5mi as cooldown. Last long run before the half — keep it easy.', stats:'11 mi · HR ≤150 · flat only' },
      { name:'Sun', type:'rest', title:'Rest day', detail:'Full rest. You have a half marathon in 8 days — keep the legs fresh. Foam roll and stretch.', stats:'Rest · recovery day' },
    ],
    strength:{ title:'Daily ITB activation (every day, ~10 min)', exercises:ITB_DAILY },
  },
  // PHASE 2 — REBUILD
  {
    num:3, phase:'rebuild', dates:'May 25–31', miles:25, note:'Race week — San Jose Half Marathon on Sunday. Keep all runs easy leading in. Treat the race as a hard training effort, not a peak performance.',
    optionalCycling:'Skip the optional ride this week — half marathon Sunday. If you must spin, 20–30 min very easy on Wednesday max.',
    hasRace:true, raceName:'Half marathon — San Jose, CA · May 31 · flat course',
    days:[
      { name:'Mon', type:'strength', title:'Strength A + easy bike', detail:'35 min easy cycling Z1. Strength circuit A — keep it light, legs need to stay fresh this week.', stats:'35 min cycling · Strength A' },
      { name:'Tue', type:'run', title:'Easy run — 5 miles', detail:'9:30–10:00/mi, HR ≤145. All easy, no strides. Last real mileage day before the race.', stats:'5 mi · HR ≤145' },
      { name:'Wed', type:'run+strength', title:'Easy run — 4 miles + Strength B (light)', detail:'9:45–10:00/mi. Short and easy — just keeping legs turning over. Light Strength B after, half the sets.', stats:'4 mi easy · Strength B (light)' },
      { name:'Thu', type:'cycle', title:'Easy cycling — 30 min', detail:'Z1 only — pure leg flush, no effort. Keep it short and easy ahead of the race.', stats:'30 min · Z1' },
      { name:'Fri', type:'run', title:'Pre-race shakeout — 3 miles', detail:'9:45–10:00/mi with 4 strides at race pace (8:50–9:00/mi) at the end. Confirm your shoes, kit, and nutrition plan for tomorrow.', stats:'3 mi + 4 strides at MP' },
      { name:'Sat', type:'rest', title:'Rest — race eve', detail:'Full rest. Stay off your feet as much as possible. Light stretching, early dinner, early bed. Everything is ready — trust your preparation.', stats:'Rest · race eve' },
      { name:'Sun', type:'race', title:'Half marathon — San Jose · sub-2:00', detail:'Flat course — take advantage of it. Miles 1–6 at 9:05–9:10/mi (conservative start), miles 7–10 settle into 8:55–9:05/mi, miles 11–13.1 push to whatever you have. Monitor IT band from mile 8 onward. This is your first real fitness test of the block.', stats:'13.1 mi · goal sub-2:00 · flat course · HR watch' },
    ],
    strength:{ title:'IT band activation daily (10 min) — light week, no full circuits Th/Fr/Sa', exercises:ITB_DAILY },
  },
  {
    num:4, phase:'rebuild', dates:'Jun 1–7', miles:29, note:'Recovery and first tempo of the block. Monitor IT band response after the half before introducing quality work.',
    optionalCycling:'30–45 min easy road ride if recovery feels good post-race. Friday evening or Sunday. Cap at 45 min — first tempo of the block is Wednesday, legs need to be there.',
    hasRace:false,
    days:[
      { name:'Mon', type:'strength', title:'Strength A + easy bike', detail:'40 min easy cycling Z1 — legs will be tired from the race. Strength circuit A, light load. Foam roll IT band thoroughly.', stats:'40 min cycling · Strength A · foam roll' },
      { name:'Tue', type:'run', title:'Easy recovery run — 5 miles', detail:'9:30–10:00/mi, HR ≤145. First run post-half. If IT band is tender, cut to 3 miles and stay easy.', stats:'5 mi · HR ≤145 · monitor IT band' },
      { name:'Wed', type:'run+strength', title:'Tempo intro — 6 miles + Strength B', detail:'2 mi easy → 2 mi tempo (8:10–8:20/mi, HR 153–160) → 2 mi easy. First tempo of the rebuild — be conservative. Skip tempo and run easy if IT band is still talking to you. Strength B after.', stats:'6 mi · 2 mi @ 8:10–8:20 · Strength B' },
      { name:'Thu', type:'cycle', title:'Cycling — 50 min', detail:'Z1–Z2, comfortable effort. Include 4×2 min at Z3 if legs feel good.', stats:'50 min · Z1–Z2' },
      { name:'Fri', type:'run', title:'Easy run — 5 miles + strides', detail:'9:15–9:45/mi. 6 strides at end (20 sec accelerations, full recovery between).', stats:'5 mi + 6 strides' },
      { name:'Sat', type:'run', title:'Long run — 13 miles', detail:'Miles 1–10 easy (9:00–9:30/mi), miles 11–13 at 8:50–9:00/mi. Fuel at miles 5 and 9. First real long run of the rebuild phase.', stats:'13 mi · progression finish' },
      { name:'Sun', type:'rest', title:'Rest day', detail:'Full rest. Stretch, foam roll, and reflect on the week. First tempo of the block is done — the body needs time to absorb it.', stats:'Rest · recovery day' },
    ],
    strength:{ title:'IT band strength — Circuit A (Mon) · Circuit B (Wed)', exercises:ITB_STRENGTH_A, exercisesB:ITB_STRENGTH_B, labelA:'Circuit A', sublabelA:'Monday', labelB:'Circuit B', sublabelB:'Wednesday' },
  },
  {
    num:5, phase:'rebuild', dates:'Jun 8–14', miles:34, note:'800m repeats return. Focus on maintaining 175+ spm through all reps — cadence tends to drop under interval effort.',
    optionalCycling:'30–45 min easy road ride OK if you want it. Friday evening best — gives 36+ hours to Sunday long run. Avoid the day before or after Tuesday’s 800m session.',
    hasRace:false,
    days:[
      { name:'Mon', type:'strength', title:'Strength B + easy bike', detail:'40 min easy cycling. Strength circuit B — step-downs especially important for IT band.', stats:'40 min cycling · Strength B' },
      { name:'Tue', type:'run', title:'Easy run — 6 miles', detail:'9:15–9:45/mi, HR ≤147.', stats:'6 mi' },
      { name:'Wed', type:'run+strength', title:'800m repeats — 7 miles + Strength A', detail:'2 mi easy → 6×800m at 3:55–4:05 per 800 (~7:50–8:10/mi) with 90 sec recovery → 2 mi easy. Strength A after.', stats:'7 mi · 6×800m · Strength A' },
      { name:'Thu', type:'cycle', title:'Cycling — 60 min', detail:'Z1–Z2 steady. Good legs after Wednesday intervals.', stats:'60 min · Z1–Z2' },
      { name:'Fri', type:'run', title:'Easy run — 6 miles + strides', detail:'9:15–9:45/mi. 6 strides.', stats:'6 mi + strides' },
      { name:'Sat', type:'run', title:'Long run — 15 miles', detail:'9:00–9:30/mi for miles 1–12, then 8:50–9:00/mi for miles 13–15. Fuel every 45 min. This is the biggest long run yet — respect it.', stats:'15 mi · HR ≤155' },
      { name:'Sun', type:'rest', title:'Rest day', detail:'Full rest. Biggest long run of the rebuild phase is behind you. Let the legs recover fully before the next build week.', stats:'Rest · recovery day' },
    ],
    strength:{ title:'IT band strength — Circuit B (Mon) · Circuit A (Wed)', exercises:ITB_STRENGTH_B, exercisesB:ITB_STRENGTH_A, labelA:'Circuit B', sublabelA:'Monday', labelB:'Circuit A', sublabelB:'Wednesday' },
  },
  {
    num:6, phase:'rebuild', dates:'Jun 15–21', miles:26, note:'Planned recovery week. Volume drops ~25% — this is intentional. Adaptation happens during rest, not just work.',
    optionalCycling:'Easy recreational ride encouraged this week — recovery weeks are for movement, not couch. 45–60 min flat Z1, anywhere in the week. This is the last "easy add" window before Build phase ramps up.',
    hasRace:false,
    days:[
      { name:'Mon', type:'cycle', title:'Easy cycling — 45 min', detail:'Pure recovery. Z1 only, no efforts. Light legs.', stats:'45 min · Z1' },
      { name:'Tue', type:'run', title:'Easy run — 5 miles', detail:'9:30–10:00/mi, HR ≤143. Very easy.', stats:'5 mi' },
      { name:'Wed', type:'run+strength', title:'Short tempo — 6 miles + Strength A', detail:'2 mi easy → 2 mi tempo (8:05–8:15/mi) → 2 mi easy. Abbreviated. Strength A.', stats:'6 mi · 2 mi tempo · Strength A' },
      { name:'Thu', type:'cycle', title:'Easy cycling — 45 min', detail:'Z1–Z2. No hard efforts this week.', stats:'45 min' },
      { name:'Fri', type:'run', title:'Easy run — 5 miles', detail:'Easy shakeout. 9:30–10:00/mi.', stats:'5 mi' },
      { name:'Sat', type:'run', title:'Long run — 10 miles', detail:'9:00–9:30/mi, all easy. No progression. Enjoy the easier week.', stats:'10 mi · all easy' },
      { name:'Sun', type:'rest', title:'Rest day', detail:'Full rest. Recovery week complete. You should feel noticeably fresher — that is the point.', stats:'Rest · recovery day' },
    ],
    strength:{ title:'IT band strength A (Wed only — reduced week)', exercises:ITB_STRENGTH_A },
  },
  // PHASE 3 — BUILD
  {
    num:7, phase:'build', dates:'Jun 22–28', miles:36, note:'Build phase begins. Tempo extends to 4 miles and the long run reaches 16 miles for the first time.',
    hasRace:false,
    days:[
      { name:'Mon', type:'strength', title:'Strength A + cycling', detail:'50 min cycling Z1–Z2. Strength circuit A — increase load on split squats if bodyweight feels easy.', stats:'50 min cycling · Strength A' },
      { name:'Tue', type:'run', title:'Easy run — 6 miles', detail:'9:00–9:30/mi, HR ≤148.', stats:'6 mi' },
      { name:'Wed', type:'run+strength', title:'Tempo run — 8 miles + Strength B', detail:'2 mi easy → 4 mi tempo (8:00–8:10/mi, HR 155–162) → 2 mi easy. Strength B after.', stats:'8 mi · 4 mi tempo · Strength B' },
      { name:'Thu', type:'cycle', title:'Cycling — 60 min', detail:'Z1–Z2 with 5×2 min Z3. Building cycling fitness alongside running.', stats:'60 min · with intervals' },
      { name:'Fri', type:'run', title:'Easy run — 6 miles + strides', detail:'9:00–9:30/mi. 6–8 strides.', stats:'6 mi + strides' },
      { name:'Sat', type:'run', title:'Long run — 16 miles', detail:'Miles 1–13 easy (9:00–9:30/mi), miles 14–16 at marathon goal pace (9:00–9:10/mi). Fuel at 45, 90 min.', stats:'16 mi · goal-pace finish' },
      { name:'Sun', type:'rest', title:'Rest day', detail:'Full rest. 16 miles is behind you. Foam roll, hydrate well, and sleep — the build continues next week.', stats:'Rest · recovery day' },
    ],
    strength:{ title:'IT band strength — Circuit A (Mon) · Circuit B (Wed)', exercises:ITB_STRENGTH_A, exercisesB:ITB_STRENGTH_B, labelA:'Circuit A', sublabelA:'Monday', labelB:'Circuit B', sublabelB:'Wednesday' },
  },
  {
    num:8, phase:'build', dates:'Jun 29–Jul 5', miles:38, note:'1km repeats. Aim for even splits across all 5 reps — resist going out hard on rep 1.',
    hasRace:false,
    days:[
      { name:'Mon', type:'strength', title:'Strength A + cycling', detail:'50 min cycling. Strength A with added resistance on all banded exercises.', stats:'50 min cycling · Strength A' },
      { name:'Tue', type:'run', title:'Tempo run — 8 miles', detail:'2 mi easy → 4 mi tempo (8:00–8:10/mi) → 2 mi easy.', stats:'8 mi · 4 mi @ 8:00–8:10' },
      { name:'Wed', type:'run+strength', title:'Easy run — 6 miles + Strength B', detail:'9:00–9:30/mi recovery run. Strength B after.', stats:'6 mi easy · Strength B' },
      { name:'Thu', type:'run', title:'1km repeats — 7 miles', detail:'2 mi easy → 5×1km at 8:05–8:20/mi with 90 sec recovery → 2 mi easy.', stats:'7 mi · 5×1km' },
      { name:'Fri', type:'run', title:'Easy shakeout — 3 miles', detail:'10:00–10:30/mi, very easy pre-long-run shakeout.', stats:'3 mi · very easy' },
      { name:'Sat', type:'run', title:'Long run — 14 miles with MP finish', detail:'Miles 1–10 easy (9:00–9:30/mi), miles 11–14 at marathon pace (9:00–9:10/mi). Fuel every 45 min.', stats:'14 mi · MP last 4' },
      { name:'Sun', type:'rest', title:'Rest day', detail:'Full rest. Two quality sessions and a 14-miler this week — the body needs today completely off.', stats:'Rest · recovery day' },
    ],
    strength:{ title:'IT band strength (A on Mon, B on Wed)', exercises:ITB_STRENGTH_B },
  },
  {
    num:9, phase:'build', dates:'Jul 6–12', miles:39, note:'First 40-mile week. Summer heat means easy runs should be HR-governed, not pace-governed. Slow down to stay aerobic.',
    hasRace:false,
    days:[
      { name:'Mon', type:'strength', title:'Strength B + cycling', detail:'55 min cycling Z1–Z2. Strength B — Copenhagen planks should feel challenging by now.', stats:'55 min cycling · Strength B' },
      { name:'Tue', type:'run', title:'Easy run — 7 miles', detail:'9:00–9:30/mi, HR ≤148. If temp is above 75°F by the time you run, allow up to 10:00/mi.', stats:'7 mi · HR ≤148' },
      { name:'Wed', type:'run+strength', title:'Rolling 800s — 7 miles + Strength A', detail:'2 mi easy → 5×800m at 3:55–4:05 (7:50–8:10/mi) with 90 sec jog recovery → 2 mi easy. Strength A.', stats:'7 mi · 5×800m · Strength A' },
      { name:'Thu', type:'cycle', title:'Cycling — 65 min', detail:'Z1–Z2. Active recovery from Wednesday. Stay hydrated — July heat.', stats:'65 min' },
      { name:'Fri', type:'run', title:'Easy run — 7 miles + strides', detail:'9:00–9:30/mi. 6 strides. Monitor how legs feel — big long run tomorrow.', stats:'7 mi + strides' },
      { name:'Sat', type:'run', title:'Long run — 18 miles', detail:'Start at 7:00am. Miles 1–15 easy (9:00–9:30/mi), miles 16–18 at marathon pace (9:00–9:10/mi). Fuel at 45, 90, 120 min. This is a landmark run.', stats:'18 mi · MP last 3 · early start' },
      { name:'Sun', type:'rest', title:'Rest day', detail:'Full rest. 18-mile landmark run is done. This is the most important rest day of the build phase — do not skip it.', stats:'Rest · recovery day' },
    ],
    strength:{ title:'IT band strength — Circuit B (Mon) · Circuit A (Wed)', exercises:ITB_STRENGTH_B, exercisesB:ITB_STRENGTH_A, labelA:'Circuit B', sublabelA:'Monday', labelB:'Circuit A', sublabelB:'Wednesday' },
  },
  {
    num:10, phase:'build', dates:'Jul 13–19', miles:32, note:'Second recovery week. Critical after back-to-back build weeks — do not add miles or skip rest days.',
    hasRace:false,
    days:[
      { name:'Mon', type:'cycle', title:'Easy cycling — 45 min', detail:'Z1 only. Pure recovery. No running today.', stats:'45 min · Z1' },
      { name:'Tue', type:'run', title:'Easy run — 6 miles', detail:'9:15–9:45/mi. No strides, no effort.', stats:'6 mi' },
      { name:'Wed', type:'run+strength', title:'Short tempo — 6 miles + Strength A', detail:'2 mi easy → 2 mi tempo → 2 mi easy. Abbreviated quality. Strength A.', stats:'6 mi · 2 mi tempo · Strength A' },
      { name:'Thu', type:'cycle', title:'Easy cycling — 45 min', detail:'Z1–Z2. Keep it light.', stats:'45 min' },
      { name:'Fri', type:'run', title:'Easy run — 6 miles', detail:'9:15–9:45/mi.', stats:'6 mi' },
      { name:'Sat', type:'run', title:'Long run — 14 miles', detail:'9:00–9:30/mi, all easy, no progression. Notice how much stronger 14 miles feels compared to week 4.', stats:'14 mi · all easy' },
      { name:'Sun', type:'rest', title:'Rest day', detail:'Full rest. Recovery week complete. Two more hard weeks ahead — arrive at them fresh.', stats:'Rest · recovery day' },
    ],
    strength:{ title:'IT band strength A (Wed only — reduced week)', exercises:ITB_STRENGTH_A },
  },
  // PHASE 4 — PEAK
  {
    num:11, phase:'peak', dates:'Jul 20–26', miles:42, note:'Peak week. The 20-mile long run is the most important session of the entire plan. Early start, full fueling, respect the distance.',
    hasRace:false,
    days:[
      { name:'Mon', type:'strength', title:'Strength A + cycling', detail:'55 min cycling Z1–Z2. Strength A — maintain intensity but prioritize form over load.', stats:'55 min cycling · Strength A' },
      { name:'Tue', type:'run', title:'Easy run — 7 miles', detail:'9:00–9:30/mi, HR ≤148.', stats:'7 mi' },
      { name:'Wed', type:'run+strength', title:'Tempo run — 9 miles + Strength B', detail:'2 mi easy → 5 mi tempo (7:58–8:08/mi, HR 155–165) → 2 mi easy. Longest tempo of the block. Strength B after.', stats:'9 mi · 5 mi tempo · Strength B' },
      { name:'Thu', type:'cycle', title:'Cycling — 60 min', detail:'Z1–Z2. Legs may be heavy from Wednesday — keep it easy.', stats:'60 min · easy' },
      { name:'Fri', type:'run', title:'Easy run — 6 miles + strides', detail:'9:00–9:30/mi. 6 strides. Loosen up before the big long run.', stats:'6 mi + strides' },
      { name:'Sat', type:'run', title:'Long run — 20 miles', detail:'Start at 7:00am. Miles 1–16 easy (9:00–9:30/mi), miles 17–20 at marathon pace (9:00–9:10/mi). Fuel every 40 min. This is the peak run of your entire block.', stats:'20 mi · MP last 4 · PEAK RUN' },
      { name:'Sun', type:'rest', title:'Rest day', detail:'Full rest. The 20-miler is done. This is when the fitness gets locked in — protect this rest day completely.', stats:'Rest · recovery day' },
    ],
    strength:{ title:'IT band strength — Circuit A (Mon) · Circuit B (Wed)', exercises:ITB_STRENGTH_A, exercisesB:ITB_STRENGTH_B, labelA:'Circuit A', sublabelA:'Monday', labelB:'Circuit B', sublabelB:'Wednesday' },
  },
  {
    num:12, phase:'peak', dates:'Jul 27–Aug 2', miles:38, note:'Second peak week. Slightly reduced volume but high quality. 18-mile long run with marathon pace miles at the end.',
    hasRace:false,
    days:[
      { name:'Mon', type:'strength', title:'Strength B + easy cycling', detail:'50 min cycling Z1. Strength B — legs may still be recovering from the 20-miler.', stats:'50 min cycling · Strength B' },
      { name:'Tue', type:'run', title:'Easy run — 7 miles', detail:'9:00–9:30/mi. Take it easy — you\'re coming off a massive week.', stats:'7 mi · easy recovery' },
      { name:'Wed', type:'run+strength', title:'1km repeats — 7 miles + Strength A', detail:'2 mi easy → 5×1km at 8:00–8:15/mi with 90 sec recovery → 2 mi easy. These should feel controlled. Strength A after.', stats:'7 mi · 5×1km · Strength A' },
      { name:'Thu', type:'cycle', title:'Cycling — 55 min', detail:'Z1–Z2. Active recovery.', stats:'55 min' },
      { name:'Fri', type:'run', title:'Easy run — 6 miles + strides', detail:'9:00–9:30/mi. 6 strides — keep them controlled.', stats:'6 mi + strides' },
      { name:'Sat', type:'run', title:'Long run — 18 miles', detail:'Miles 1–14 easy (9:00–9:30/mi), miles 15–18 at marathon pace (9:00–9:10/mi). This run simulates late-race conditions. Fuel every 40 min.', stats:'18 mi · MP last 4' },
      { name:'Sun', type:'rest', title:'Rest day', detail:'Full rest. Two peak weeks in the books. Taper starts in 7 days — let the legs absorb everything.', stats:'Rest · recovery day' },
    ],
    strength:{ title:'IT band strength — Circuit B (Mon) · Circuit A (Wed)', exercises:ITB_STRENGTH_B, exercisesB:ITB_STRENGTH_A, labelA:'Circuit B', sublabelA:'Monday', labelB:'Circuit A', sublabelB:'Wednesday' },
  },
  // PHASE 5 — TAPER
  {
    num:13, phase:'taper', dates:'Aug 3–9', miles:28, note:'Taper begins. Volume drops sharply — this is intentional. Feeling flat or sluggish mid-week is normal. Trust your fitness.',
    hasRace:false,
    days:[
      { name:'Mon', type:'cycle', title:'Easy cycling — 40 min', detail:'Z1–Z2. First real taper day. Enjoy the reduced load.', stats:'40 min · easy' },
      { name:'Tue', type:'run', title:'Easy run — 5 miles', detail:'9:00–9:30/mi.', stats:'5 mi' },
      { name:'Wed', type:'run+strength', title:'Tempo run — 7 miles + Strength A (reduced)', detail:'2 mi easy → 3 mi tempo (8:00–8:10/mi) → 2 mi easy. Reduced volume, maintained intensity. Strength A — halve the sets.', stats:'7 mi · 3 mi tempo · Strength A (half volume)' },
      { name:'Thu', type:'cycle', title:'Easy cycling — 35 min', detail:'Z1 only. Keep legs moving.', stats:'35 min · Z1' },
      { name:'Fri', type:'run', title:'Easy run — 5 miles + strides', detail:'9:00–9:30/mi. 6 strides. Legs should start feeling fresh.', stats:'5 mi + strides' },
      { name:'Sat', type:'run', title:'Long run — 14 miles', detail:'Miles 1–11 easy, miles 12–14 at marathon pace. Last long effort before the race. Should feel controlled and strong.', stats:'14 mi · MP last 3' },
      { name:'Sun', type:'rest', title:'Rest day', detail:'Full rest. Taper is underway. Resist the urge to add miles. Trust what you have built.', stats:'Rest · recovery day' },
    ],
    strength:{ title:'IT band strength A — reduced volume (Wed only)', exercises:ITB_STRENGTH_A },
  },
  {
    num:14, phase:'taper', dates:'Aug 10–16', miles:20, note:'Deep taper. Legs should feel fresh and springy. The urge to run more is normal — resist it.',
    hasRace:false,
    days:[
      { name:'Mon', type:'cycle', title:'Easy cycling — 30 min', detail:'Z1 only. Very light.', stats:'30 min · Z1' },
      { name:'Tue', type:'run', title:'Easy run — 5 miles', detail:'9:00–9:15/mi. Legs should feel noticeably better this week.', stats:'5 mi' },
      { name:'Wed', type:'run+strength', title:'Short quality — 5 miles + Strength A (maintenance)', detail:'1.5 mi easy → 3×1mi at marathon pace (9:00–9:10/mi) with 90 sec recovery → 1.5 mi easy. Strength A — 2 sets only, maintenance only.', stats:'5 mi · 3×1mi @ MP · Strength A' },
      { name:'Thu', type:'cycle', title:'Easy cycling — 25 min', detail:'Spin legs out. Z1 only.', stats:'25 min · Z1' },
      { name:'Fri', type:'run', title:'Easy run — 4 miles', detail:'9:00–9:15/mi. 4 short strides. Start visualizing the race.', stats:'4 mi + strides' },
      { name:'Sat', type:'run', title:'Easy run — 6 miles', detail:'Last real run before race week. 9:00–9:15/mi, HR ≤148. Relax and enjoy. Confirm your race-day plan.', stats:'6 mi · easy · last long run' },
      { name:'Sun', type:'rest', title:'Rest day', detail:'Full rest. Race day is 6 days away. Sleep, hydrate, eat well. Your fitness is locked in.', stats:'Rest · recovery day' },
    ],
    strength:{ title:'IT band strength A — maintenance only (Wed only)', exercises:ITB_STRENGTH_A },
  },
  {
    num:15, phase:'taper', dates:'Aug 17–23', miles:11, note:'Race week. Sleep, hydrate, eat well. Fitness is locked in — the goal now is to arrive at the start line fresh and healthy.',
    hasRace:true, raceName:'MARATHON — August 23 · 6:30am start',
    days:[
      { name:'Mon', type:'rest', title:'Rest or very easy walk', detail:'Off your feet as much as possible. No workout.', stats:'Rest' },
      { name:'Tue', type:'run', title:'Easy run — 3 miles', detail:'9:00–9:15/mi, HR ≤140. Just to feel the legs. Nothing more.', stats:'3 mi · very easy' },
      { name:'Wed', type:'run', title:'Shakeout — 3 miles + strides', detail:'Easy 3 miles with 4 strides at marathon pace. Confirm your shoes, kit, nutrition plan.', stats:'3 mi + 4 strides' },
      { name:'Thu', type:'rest', title:'Rest', detail:'Full rest. Prepare gear, finalize nutrition. Early dinner, early bed tonight and Friday.', stats:'Rest · prep day' },
      { name:'Fri', type:'run', title:'Pre-race shakeout — 2 miles', detail:'Very easy 2-mile shakeout. 4 strides at marathon pace to remind legs what\'s coming. Done by 9am. Race is Sunday — two more easy days to go.', stats:'2 mi · 4 strides at MP' },
      { name:'Sat', type:'rest', title:'Rest — race eve', detail:'Full rest. Gear laid out, nutrition plan confirmed, early dinner, early bed. Your fitness is locked in — nothing you do today can help you, but plenty can hurt you. Sleep is the last performance enhancer.', stats:'Rest · race eve · Aug 22' },
      { name:'Sun', type:'race', title:'MARATHON — Race day · 6:30am', detail:'Start conservative — 9:10–9:15/mi for miles 1–8. Settle into 9:00–9:10/mi for miles 9–20. If you feel good at mile 20, run the last 6.2 miles with everything you have.', stats:'26.2 mi · goal 3:58–4:05' },
    ],
    strength:{ title:'No strength this week — full rest for legs', exercises:[] },
  },
];
// ── Local-date helpers ────────────────────────────────────────────────
// Using toISOString().slice(0,10) gives the UTC calendar date, which means
// late-evening Pacific users (after 5 PM PDT) see "tomorrow" in the hub.
// These helpers always return the LOCAL calendar date as 'YYYY-MM-DD'.
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addDays(dateStr, days) {
  // Parse at noon to immunize against DST shifts on the day boundary.
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const WEEK_START_DATES = {
  1:'2026-05-11',2:'2026-05-18',3:'2026-05-25',4:'2026-06-01',
  5:'2026-06-08',6:'2026-06-15',7:'2026-06-22',8:'2026-06-29',
  9:'2026-07-06',10:'2026-07-13',11:'2026-07-20',12:'2026-07-27',
  13:'2026-08-03',14:'2026-08-10',15:'2026-08-17',
};

function weekDateForDay(weekNum, dayIndex) {
  const base = new Date(WEEK_START_DATES[weekNum] + 'T00:00:00');
  base.setDate(base.getDate() + dayIndex);
  return base.toISOString().slice(0,10);
}

function parseCSVRow(line) {
  const result=[]; let cur='', inQ=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){inQ=!inQ;continue;}
    if(ch===','&&!inQ){result.push(cur);cur='';continue;}
    cur+=ch;
  }
  result.push(cur);
  return result;
}

function normalizeDate(raw) {
  if(!raw) return null;
  const iso=raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if(iso) return iso[1];
  const mdy=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
  const named=raw.match(/([A-Za-z]+)\s+(\d+),\s*(\d{4})/);
  if(named){
    const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    const m=months[named[1].toLowerCase().slice(0,3)];
    if(m) return `${named[3]}-${String(m).padStart(2,'0')}-${named[2].padStart(2,'0')}`;
  }
  return null;
}


function paceDeviation(plannedStats, actual) {
  if(!actual||actual==='--'||actual==='') return '';
  const toSec=p=>{const m=p.match(/(\d+):(\d+)/);return m?parseInt(m[1])*60+parseInt(m[2]):0;};
  const range=plannedStats.match(/(\d+:\d+)[–\-](\d+:\d+)/);
  if(!range) return '';
  const lo=toSec(range[1]),hi=toSec(range[2]),act=toSec(actual);
  if(!act) return '';
  if(act<lo-15) return '<span class="deviation over">▲ fast</span>';
  if(act>hi+15) return '<span class="deviation under">▼ slow</span>';
  return '<span class="deviation good">✓ on pace</span>';
}

function hrDeviation(plannedStats, actual) {
  if(!actual) return '';
  const m=plannedStats.match(/HR[^\d]*(\d+)/);
  if(!m) return '';
  const planned=parseInt(m[1]);
  if(actual<=planned) return '<span class="deviation good">✓ HR ok</span>';
  if(actual<=planned+5) return `<span class="deviation over">▲ HR +${actual-planned}</span>`;
  return `<span class="deviation over">▲ HR +${actual-planned} high</span>`;
}

function buildActualPanel(dayType, dateStr, dayStats) {
  const runs = getForDate(dateStr, 'run');
  const cycles = analyticsCycles.filter(a => {
    const d = (a.date || (a.Date||'').slice(0,10));
    const t = (a.ActivityType || a.type || a.Type || '').toLowerCase();
    return d === dateStr && (t.includes('cycl') || t.includes('ride') || t.includes('virtual'));
  });
  const parts = [];

  if(runs.length) {
    const norm = r => ({
      distance: r.distance || r.Distance || 0,
      avgHR:    r.avgHR    || r.hr       || 0,
      cadence:  r.cadence  || 0,
      pace:     r.pace     || r['Avg Pace'] || '',
      time:     r.time     || r.Time     || '',
      title:    r.title    || r.Title    || '',
    });

    const sorted = [...runs].map(norm).sort((a,b) => b.distance - a.distance);
    const primary = sorted[0];
    const totalDist = sorted.reduce((s,r) => s + r.distance, 0);
    const hrRuns = sorted.filter(r=>r.avgHR);
    const avgHR = hrRuns.length ? Math.round(hrRuns.reduce((s,r)=>s+r.avgHR,0)/hrRuns.length) : 0;
    const cadRuns = sorted.filter(r=>r.cadence);
    const avgCad = cadRuns.length ? Math.round(cadRuns.reduce((s,r)=>s+r.cadence,0)/cadRuns.length) : 0;

    if(sorted.length > 1) {
      parts.push(`<span>🏃 ${totalDist.toFixed(2)} mi total (${sorted.length} runs)</span>`);
      sorted.forEach(r => {
        parts.push(`<span style="padding-left:10px">↳ ${r.distance.toFixed(2)} mi · ${r.pace}/mi${r.title ? ' · '+r.title : ''}</span>`);
      });
      if(avgHR) parts.push(`<span>❤️ avg HR ${avgHR} ${hrDeviation(dayStats, avgHR)}</span>`);
      if(avgCad) parts.push(`<span>👟 ${avgCad} spm avg cadence</span>`);
    } else {
      parts.push(`<span>🏃 ${primary.distance.toFixed(2)} mi · ${primary.pace}/mi ${paceDeviation(dayStats, primary.pace)}</span>`);
      if(primary.avgHR) parts.push(`<span>❤️ avg HR ${primary.avgHR} ${hrDeviation(dayStats, primary.avgHR)}</span>`);
      if(primary.cadence) parts.push(`<span>👟 ${primary.cadence} spm</span>`);
      if(primary.time) parts.push(`<span>⏱ ${primary.time}</span>`);
    }
  }

  if(cycles.length) {
    const totalCycDist = cycles.reduce((s,c) => s+(c.Distance||c.distance||0), 0);
    if(cycles.length > 1) {
      parts.push(`<span>🚴 ${cycles.length} cycling activities · ${totalCycDist.toFixed(1)} mi combined</span>`);
    } else {
      const c = cycles[0];
      const dist = (c.Distance||c.distance||0);
      const spd  = c.avg_speed||0;
      parts.push(`<span>🚴 ${c.Time||c.time||'—'}${dist>0?' · '+dist.toFixed(1)+' mi':''}${spd>0?' · '+spd+' mph':''}</span>`);
      if(c.hr) parts.push(`<span>❤️ avg HR ${c.hr}</span>`);
    }
  }

  if(!parts.length) return '';
  return `<div class="garmin-actual"><div class="garmin-actual-label">Actual · Garmin</div><div class="garmin-actual-stats">${parts.join('')}</div></div>`;
}


function activitiesSource() {
  // Returns all activities — runs + cycles — for plan completion checking
  return [...analyticsRuns, ...analyticsCycles];
}

function getForDate(dateStr, typeMatch) {
  return activitiesSource().filter(a => {
    const d = (a.date || (a.Date||'').slice(0,10));
    if(d !== dateStr) return false;
    const t = (a.ActivityType || a.type || a.Type || '');
    if(!t) return typeMatch === 'run'; // BUILTIN_RUNS have no type field — all are runs
    return t.toLowerCase().includes(typeMatch);
  });
}

function isCompleted(dateStr, dayType) {
  const today = todayLocal();
  if(dateStr > today) return false;
  // For rest + strength we can't detect completion from activity data, so we
  // fall back to "is this day in the past?". Strict `<` here — TODAY isn't
  // marked complete until the day actually ends (you might still do the
  // session tonight, or skip the rest day with an evening run).
  if(dayType==='rest') return dateStr < today;

  const runs   = getForDate(dateStr, 'run');
  const cycles = analyticsCycles.filter(a => {
    const d = (a.date || (a.Date||'').slice(0,10));
    const t = (a.ActivityType || a.type || a.Type || '').toLowerCase();
    return d === dateStr && (t.includes('cycl') || t.includes('ride') || t.includes('virtual'));
  });

  if(dayType==='run' || dayType==='run+strength' || dayType==='race') return runs.length > 0;
  if(dayType==='cycle') return cycles.length > 0;
  if(dayType==='strength') return dateStr < today; // same as rest — only past days
  return runs.length > 0 || cycles.length > 0;
}

const typeColors={
  run:{bg:'var(--run-bg)',color:'var(--run)',label:'Run'},
  'run+strength':{bg:'var(--run-bg)',color:'var(--run)',label:'Run'},
  strength:{bg:'var(--strength-bg)',color:'var(--strength)',label:'Strength'},
  cycle:{bg:'var(--cycle-bg)',color:'var(--cycle)',label:'Cycling'},
  rest:{bg:'var(--rest-bg)',color:'var(--rest)',label:'Rest'},
  race:{bg:'var(--race-bg)',color:'var(--race)',label:'Race'},
};
const phaseColors={rehab:'#c84b2f',rebuild:'#b85c00',build:'#185FA5',peak:'#2d6a4f',taper:'#534AB7'};

// Split a combined day entry into separate workout blocks
// Build inline circuit HTML for embedding in a strength workout block
function circuitHTML(exercises) {
  if(!exercises||!exercises.length) return '';
  return `<div class="inline-circuit">
    ${exercises.map((e,i)=>`<div class="inline-ex"><span class="inline-ex-num">${i+1}</span><span class="inline-ex-name">${e.name}</span><span class="inline-ex-detail">${e.detail}</span></div>`).join('')}
  </div>`;
}

function splitWorkouts(d, weekStrength) {
  const title = d.title;
  const detail = d.detail;
  const stats = d.stats;
  const type = d.type;

  // Pattern 1: Mon "Strength X + easy bike/cycling" → cycling block + strength block
  if(type === 'strength' && (title.includes('+ easy bike') || title.includes('+ cycling') || title.includes('+ easy cycling'))) {
    const plusIdx = title.indexOf('+');
    const strengthTitle = title.slice(0, plusIdx).trim();
    const cycleTitle = title.slice(plusIdx + 1).trim();
    const detailParts = detail.split('. ');
    const cycleDetail = detailParts[0] || detail;
    const strengthDetail = detailParts.slice(1).join('. ') || detail;
    const statsParts = stats.split('·').map(s=>s.trim()).filter(Boolean);
    const cycleStats = statsParts.filter(s=>s.toLowerCase().includes('min')||s.toLowerCase().includes('cycling')||s.toLowerCase().includes('z1')||s.toLowerCase().includes('z2')).join(' · ');
    const strengthStats = statsParts.filter(s=>s.toLowerCase().includes('strength')||s.toLowerCase().includes('foam')).join(' · ');
    return [
      { type:'cycle',    title:cycleTitle,    detail:cycleDetail,    stats:cycleStats||stats },
      { type:'strength', title:strengthTitle, detail:strengthDetail, stats:strengthStats||stats },
    ];
  }

  // Pattern 2: Wed "Run description + Strength X" → run block + strength block
  if(type === 'run+strength') {
    const plusIdx = title.lastIndexOf(' + Strength');
    if(plusIdx > -1) {
      const runTitle = title.slice(0, plusIdx).trim();
      const strengthTitle = title.slice(plusIdx + 3).trim();
      const strengthIdx = detail.indexOf('Strength');
      const runDetail = strengthIdx > 0 ? detail.slice(0, strengthIdx).replace(/\.\s*$/, '').trim() : detail;
      const strengthDetail = strengthIdx > 0 ? detail.slice(strengthIdx).trim() : 'Strength circuit after run.';
      const statsParts = stats.split('·').map(s=>s.trim()).filter(Boolean);
      const runStats = statsParts.filter(s=>!s.toLowerCase().includes('strength')).join(' · ');
      const strengthStats = statsParts.filter(s=>s.toLowerCase().includes('strength')).join(' · ');
      return [
        { type:'run',      title:runTitle,      detail:runDetail,      stats:runStats||stats },
        { type:'strength', title:strengthTitle, detail:strengthDetail, stats:strengthStats||strengthTitle },
      ];
    }
  }

  // Default: single block
  return [{ type:d.type, title:d.title, detail:d.detail, stats:d.stats }];
}

// ════════════════════════════════════════
// DYNAMIC HEADER — pace, finish, week
// ════════════════════════════════════════
function updateDynamicHeader() {
  const today = todayLocal();

  // Current week & phase
  let currentWeekNum = 0;
  Object.entries(WEEK_START_DATES).forEach(([num, date]) => {
    const end = addDays(date, 7);
    if(today >= date && today < end) currentWeekNum = parseInt(num);
  });
  const currentPhase = PHASE_CONFIG.find(p=>p.weeks.includes(currentWeekNum));
  const phaseName = currentPhase ? currentPhase.name.split('—')[1]?.trim() : '';
  const weekEl = document.getElementById('headerWeekNum');
  const weekLabelEl = document.getElementById('headerWeekLabel');
  if(weekEl) weekEl.textContent = currentWeekNum ? `Week ${currentWeekNum}` : 'Race week';
  if(weekLabelEl) weekLabelEl.textContent = currentWeekNum ? `of 15 · ${phaseName}` : 'Aug 23, 2026';
}

// ════════════════════════════════════════
// DYNAMIC WEEK NOTES — IT band aware
// ════════════════════════════════════════
function getDynamicWeekNote(week) {
  const today = todayLocal();
  const weekStart = WEEK_START_DATES[week.num];
  const weekEnd = addDays(weekStart, 7);
  const isCurrentWeek = today >= weekStart && today < weekEnd;
  const isPastWeek = weekEnd <= today;

  if(!isCurrentWeek && !isPastWeek) return week.note; // future week — show as-is

  // Check actual mileage this week vs planned
  let actualMiles = 0;
  analyticsRuns.forEach(r => {
    const d = (r.Date||r.date||'').slice(0,10);
    if(d >= weekStart && d < weekEnd) actualMiles += (r.Distance||r.distance||0);
  });
  actualMiles = Math.round(actualMiles*10)/10;

  // Check for IT band signals — any run with lower-than-normal GCT balance
  const weekRuns = analyticsRuns.filter(r=>{
    const d=(r.Date||r.date||'').slice(0,10);
    return d>=weekStart&&d<weekEnd&&r.left_pct;
  });
  const avgGCT = weekRuns.length ? weekRuns.reduce((s,r)=>s+r.left_pct,0)/weekRuns.length : null;
  const itbWarning = avgGCT && avgGCT < 47.5;

  if(isPastWeek) {
    const pctDone = week.miles > 0 ? Math.round((actualMiles/week.miles)*100) : 0;
    const status = pctDone >= 90 ? '✓ Completed' : pctDone >= 60 ? 'Partially completed' : 'Under-completed';
    let note = `${status} — ${actualMiles} of ${week.miles} planned miles (${pctDone}%).`;
    if(itbWarning) note += ` ⚠ Left GCT averaged ${avgGCT.toFixed(1)}% this week — watch IT band.`;
    return note;
  }

  if(isCurrentWeek) {
    const remaining = Math.max(0, week.miles - actualMiles).toFixed(1);
    let note = `${actualMiles} of ${week.miles} miles done this week · ${remaining} mi remaining.`;
    if(itbWarning) note += ` ⚠ Left GCT averaging ${avgGCT.toFixed(1)}% — stay easy, monitor IT band.`;
    else note += ' ' + week.note;
    return note;
  }

  return week.note;
}


// ════════════════════════════════════════
// PLAN HEALTH — light-touch flags
// ════════════════════════════════════════
function renderPlanHealth() {
  const el = document.getElementById('planHealth');
  if(!el) return;

  const today = todayLocal();
  const flags = [];

  // ── Gather per-week stats for completed + current in-progress weeks ──
  const weekStats = [];
  for(const [wkStr, startStr] of Object.entries(WEEK_START_DATES)) {
    const wk = parseInt(wkStr);
    // Skip future weeks (haven't started yet)
    if(startStr > today) break;

    const endStr = addDays(startStr, 7);
    const isComplete = endStr <= today;

    const wkRuns = analyticsRuns.filter(r=>{
      const d=(r.Date||r.date||'').slice(0,10);
      return d>=startStr && d<endStr;
    });
    // Skip weeks with no runs yet (future or empty)
    if(!wkRuns.length && !isComplete) continue;

    const actual = wkRuns.reduce((s,r)=>s+(r.Distance||0),0);
    const planned = WEEKS.find(w=>w.num===wk)?.miles || 0;

    const easyPaces = wkRuns
      .filter(r=>r.pace_sec&&!r.is_race&&(r.Distance||0)>=2)
      .map(r=>r.pace_sec);
    const avgPace = easyPaces.length ? easyPaces.reduce((a,b)=>a+b,0)/easyPaces.length : null;

    const leftPcts = wkRuns.filter(r=>r.left_pct).map(r=>r.left_pct);
    const minLeftPct = leftPcts.length ? Math.min(...leftPcts) : null;

    weekStats.push({ wk, startStr, planned, actual, avgPace, minLeftPct, isComplete });
  }

  if(!weekStats.length){
    el.innerHTML=''; return;
  }

  const latest = weekStats[weekStats.length-1];

  // ── Flag 1: Mileage ──
  if(latest.planned > 0) {
    const pct = latest.actual / latest.planned * 100;
    const inProgress = !latest.isComplete;
    if(pct < 80 && latest.isComplete) {
      flags.push({ type:'warn', icon:'⚠', label:'Mileage — Week '+latest.wk,
        msg:`Ran ${latest.actual.toFixed(1)}mi of ${latest.planned}mi planned (${Math.round(pct)}%). Consider holding current load next week rather than making up the difference.` });
    } else if(pct > 115) {
      flags.push({ type:'warn', icon:'⚠', label:'Mileage — Week '+latest.wk,
        msg:`${inProgress?'Tracking':'Ran'} ${latest.actual.toFixed(1)}mi — ${Math.round(pct-100)}% above plan. Watch cumulative load, especially with the active IT band.` });
    } else {
      flags.push({ type:'ok', icon:'✓', label:`Mileage — Week ${latest.wk}${inProgress?' so far':''}`,
        msg:`${latest.actual.toFixed(1)}mi${inProgress?' so far':''} of ${latest.planned}mi planned (${Math.round(pct)}%).${inProgress?' On pace for the week.':' On track.'}` });
    }
  }

  // ── Flag 2: Pace trend (need at least 2 completed weeks) ──
  if(weekStats.length >= 2) {
    const withPace = weekStats.filter(w=>w.avgPace);
    if(withPace.length >= 2) {
      const oldest = withPace[0];
      const newest = withPace[withPace.length-1];
      const delta = newest.avgPace - oldest.avgPace; // positive = slower
      const oldPaceStr = secToMin(Math.round(oldest.avgPace));
      const newPaceStr = secToMin(Math.round(newest.avgPace));
      if(delta > 30) {
        flags.push({ type:'warn', icon:'↑', label:'Pace trend',
          msg:`Avg easy pace has slowed ${Math.round(delta)}s/mi over ${withPace.length} weeks (${oldPaceStr} → ${newPaceStr}/mi). Could be fatigue or heat — monitor HR alongside pace.` });
      } else if(delta < -20) {
        flags.push({ type:'ok', icon:'↓', label:'Pace trend',
          msg:`Easy pace improving — ${Math.abs(Math.round(delta))}s/mi faster over ${withPace.length} weeks (${oldPaceStr} → ${newPaceStr}/mi). Aerobic fitness building well.` });
      } else {
        flags.push({ type:'ok', icon:'→', label:'Pace trend',
          msg:`Pace steady at ~${newPaceStr}/mi easy. Consistent aerobic base — ${delta>0?'+'+Math.round(delta):Math.round(delta)}s/mi change over ${withPace.length} weeks.` });
      }
    }
  }

  // ── Flag 3: IT band risk ──
  if(latest.minLeftPct !== null) {
    if(latest.minLeftPct < 47.5) {
      flags.push({ type:'warn', icon:'🦵', label:'IT band — Week '+latest.wk,
        msg:`Left GCT balance hit ${latest.minLeftPct.toFixed(1)}% this week (risk threshold: 47.5%). Consider extra activation work and monitor for lateral knee discomfort.` });
    } else if(latest.minLeftPct < 48.5) {
      flags.push({ type:'info', icon:'🦵', label:'IT band — Week '+latest.wk,
        msg:`Left GCT at ${latest.minLeftPct.toFixed(1)}% — near threshold. Staying above 47.5% but worth watching. Keep up daily activation.` });
    } else {
      flags.push({ type:'ok', icon:'✓', label:'IT band — Week '+latest.wk,
        msg:`Left GCT balance at ${latest.minLeftPct.toFixed(1)}% — healthy. Well above 47.5% risk threshold.` });
    }
  }

  // ── Render ──
  if(!flags.length){ el.innerHTML=''; return; }

  const flagsHTML = flags.map(f=>`
    <div class="ph-flag ${f.type}">
      <div class="ph-flag-icon">${f.icon}</div>
      <div class="ph-flag-body">
        <div class="ph-flag-label">${f.label}</div>
        <div class="ph-flag-msg">${f.msg}</div>
      </div>
    </div>`).join('');

  const isOpen = document.getElementById('planHealth')?.dataset.open === '1';

  el.innerHTML=`<div class="plan-health">
    <div class="snapshot-toggle" style="padding:9px 40px;" data-action="toggle-plan-health">
      <span class="snapshot-toggle-label">Plan health · Week ${latest.wk}${latest.isComplete?'':' (in progress)'}</span>
      <div class="snapshot-toggle-summary">
        ${flags.filter(f=>f.type==='warn').length
          ? `<span class="snapshot-toggle-item flag">${flags.filter(f=>f.type==='warn').length} flag${flags.filter(f=>f.type==='warn').length>1?'s':''} need attention</span>`
          : `<span class="snapshot-toggle-item">No issues</span>`}
        ${flags.filter(f=>f.type==='ok').map(f=>`<span class="snapshot-toggle-item"><span>${f.label}</span> ✓</span>`).join('')}
      </div>
      <span class="snapshot-toggle-chevron">${isOpen?'▲ collapse':'▼ expand'}</span>
    </div>
    <div class="snapshot-detail${isOpen?' open':''}">
      <div style="padding:10px 40px 14px;">
        <div class="plan-health-flags">${flagsHTML}</div>
      </div>
    </div>
  </div>`;
}

// ════════════════════════════════════════
// STRENGTH REFERENCE CARD
// ════════════════════════════════════════
// One global card at the top of the Plan tab showing all three IT-band
// routines. Replaces the per-week strength sections that used to repeat the
// same exercise lists 15 times. Day rows still call out "Strength A/B" — this
// card is where the exercises themselves live.
function renderStrengthCard() {
  const host = document.getElementById('strengthReference');
  if (!host) return;

  const routines = [
    { label:'Daily activation', meta:'every day · ~10 min', exercises: ITB_DAILY },
    { label:'Strength A',       meta:'Mon',                  exercises: ITB_STRENGTH_A },
    { label:'Strength B',       meta:'Wed',                  exercises: ITB_STRENGTH_B },
  ];

  const exHTML = ex => ex.map((e, i) => `
    <div class="strength-ex">
      <div class="strength-ex-num">${i+1}</div>
      <div><span class="strength-ex-name">${e.name}</span> <span class="strength-ex-detail">${e.detail}</span></div>
    </div>`).join('');

  // Single open/closed state for the whole card.
  let saved = null;
  try { saved = localStorage.getItem('emt:strength:all'); } catch {}
  const open = saved === '0' ? false : true;   // default open

  host.innerHTML = `
    <div class="strength-card">
      <div class="strength-card-header ${open ? '' : 'collapsed'}" data-action="toggle-strength">
        <span class="strength-routine-chev">▼</span>
        <span class="strength-card-title">IT Band Strength Reference</span>
        <span class="strength-card-sub">Daily activation every day · Circuits A &amp; B alternate by week</span>
      </div>
      <div class="strength-routines ${open ? '' : 'collapsed'}" id="strength-body">
        ${routines.map(r => `
          <div class="strength-routine">
            <div class="strength-routine-head" style="cursor:default">
              <span class="strength-routine-label">${r.label}</span>
              <span class="strength-routine-meta">${r.exercises.length} ex · ${r.meta}</span>
            </div>
            <div class="strength-routine-body">
              ${exHTML(r.exercises)}
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function toggleStrengthRoutine(_key, headerEl) {
  const body = document.getElementById('strength-body');
  if (!body || !headerEl) return;
  const willCollapse = !headerEl.classList.contains('collapsed');
  headerEl.classList.toggle('collapsed', willCollapse);
  body.classList.toggle('collapsed', willCollapse);
  try { localStorage.setItem('emt:strength:all', willCollapse ? '0' : '1'); } catch {}
}

function renderPlan() {
  renderPlanHealth();
  renderStrengthCard();
  const main=document.getElementById('planMain');
  main.innerHTML='';
  PHASES.forEach(phase=>{
    const phaseWeeks=WEEKS.filter(w=>phase.weeks.includes(w.num));
    if(!phaseWeeks.length)return;
    const block=document.createElement('div');
    block.dataset.phase=phase.id;
    const header=document.createElement('div');
    header.className='phase-header';
    header.innerHTML=`<span class="phase-name" style="color:${phaseColors[phase.id]}">${phase.name}</span><span class="phase-dates">Weeks ${phase.weeks[0]}–${phase.weeks[phase.weeks.length-1]}</span><span class="phase-desc">${phase.desc}</span>`;
    block.appendChild(header);
    phaseWeeks.forEach(week=>{
      const maxMiles=42;
      const barPct=Math.min(100,Math.round((week.miles/maxMiles)*100));
      const wBlock=document.createElement('div');
      wBlock.className='week-block';
      wBlock.dataset.week=week.num;
      // Expand combined types (e.g. 'run+strength') into individual component types
      const expandType = t => t === 'run+strength' ? ['run','strength']
                            : t === 'strength' && week.days.find(d=>d.type===t&&(d.title.includes('+ easy bike')||d.title.includes('+ cycling')||d.title.includes('+ easy cycling'))) ? ['cycle','strength']
                            : [t];
      const badges = week.days.reduce((acc,d)=>{
        expandType(d.type).forEach(t=>{ if(!acc.includes(t)) acc.push(t); });
        return acc;
      },[]);
      const badgeHtml=badges.map(t=>{const c=typeColors[t]||typeColors.rest;return`<span class="badge" style="background:${c.bg};color:${c.color}">${c.label}</span>`;}).join('');
      const showRaceBadge=week.hasRace&&!badges.includes('race');
      // Inline optional-cycling indicator on the week header — full text in the
      // tooltip. Replaces the old full-width banner that used to sit inside the
      // week body and ate a lot of vertical space.
      const optEmoji = week.optionalCycling
        ? `<span class="week-optional" title="Optional this week: ${week.optionalCycling.replace(/"/g,'&quot;')}">🚴</span>`
        : '';
      wBlock.innerHTML=`
        <div class="week-header" data-action="toggle-week">
          <span class="week-num">WK ${week.num}</span>
          <span class="week-dates">${week.dates}</span>
          <div class="week-badges">${badgeHtml}${showRaceBadge?`<span class="badge" style="background:var(--race-bg);color:var(--race)">Race</span>`:''}${optEmoji}</div>
          <span class="week-miles">${week.miles} mi</span>
          <div class="week-bar-wrap"><div class="week-bar" style="width:${barPct}%;background:${phaseColors[week.phase]}"></div></div>
          <span class="chevron">▼</span>
        </div>
        <div class="week-body">
          ${week.hasRace?`<div class="race-banner">★ ${week.raceName}</div>`:''}
          ${week.note?`<div class="week-note">${getDynamicWeekNote(week)}</div>`:''}
          <div class="days-grid">
            ${week.days.map((d,dayIdx)=>{
              const c=typeColors[d.type]||typeColors.rest;
              const dateStr=weekDateForDay(week.num,dayIdx);
              const done=isCompleted(dateStr,d.type);
              const actualPanel=activitiesSource().length?buildActualPanel(d.type,dateStr,d.stats):'';
              const isSunday = d.type==='rest';
              const dateLabel=new Date(dateStr+'T12:00:00').toLocaleString('en',{month:'short',day:'numeric'});

              // Split combined workouts into separate blocks
              const workouts = splitWorkouts(d);

              const workoutHTML = workouts.map((w,wi)=>{
                const wc = typeColors[w.type]||typeColors.rest;
                return `<div class="workout-block">
                  <span class="activity-tag" style="background:${wc.bg};color:${wc.color}">${wc.label}</span>
                  <div class="day-title">${w.title}</div>
                  <div class="day-detail">${w.detail}</div>
                  <div class="day-stats">${w.stats.split('·').map(s=>`<span>· ${s.trim()}</span>`).join('')}</div>
                  ${wi===0&&actualPanel?actualPanel:''}
                </div>`;
              }).join('');

              return`<div class="day-cell${done?' completed':''}${isSunday?' rest-day':''}">
                <div class="day-name">${d.name}</div>
                <div class="day-date">${dateLabel}</div>
                ${workoutHTML}
              </div>`;
            }).join('')}
          </div>
          ${week.strength?`<div class="week-note" style="background:transparent;border-top:1px solid var(--border);color:var(--text3);font-style:normal;">Strength this week: <strong style="color:var(--strength);font-weight:500">${week.strength.title}</strong></div>`:''}
        </div>`;
      block.appendChild(wBlock);
    });
    main.appendChild(block);
  });
  // Open the CURRENT week by default (was: always W1). Past + future weeks
  // stay collapsed; user can expand any of them manually. If today is past the
  // race (curWeek = 0), fall back to opening the first week.
  const today = todayLocal();
  let curWeek = 0;
  Object.entries(WEEK_START_DATES).forEach(([num, date]) => {
    const end = addDays(date, 7);
    if (today >= date && today < end) curWeek = parseInt(num);
  });
  const openTarget = curWeek > 0
    ? document.querySelector(`#planMain [data-week="${curWeek}"] .week-header`)
    : document.querySelector('#planMain .week-header');
  if (openTarget) {
    openTarget.classList.add('open');
    openTarget.nextElementSibling.classList.add('open');
  }
  renderProgress();
  updateDynamicHeader();
  // Scroll to current week after a short delay (allow DOM paint)
  if (!renderPlan._scrolled) {
    renderPlan._scrolled = true;
    setTimeout(() => {
      const target = document.querySelector(`[data-week="${curWeek}"]`);
      if (target) target.scrollIntoView({ behavior:'smooth', block:'start' });
    }, 400);
  }
}

function toggleWeek(h){h.classList.toggle('open');h.nextElementSibling.classList.toggle('open');}

function toggleAllWeeks(btn){
  const headers=[...document.querySelectorAll('#planMain .week-header:not([style*="display:none"])')];
  const allOpen=headers.every(h=>h.classList.contains('open'));
  headers.forEach(h=>{
    if(allOpen){h.classList.remove('open');h.nextElementSibling.classList.remove('open');}
    else{h.classList.add('open');h.nextElementSibling.classList.add('open');}
  });
  btn.textContent=allOpen?'Expand all':'Collapse all';
}
function filterPhase(phase,btn){
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#planMain [data-phase]').forEach(el=>{
    el.style.display=(phase==='all'||el.dataset.phase===phase)?'':'none';
  });
}


