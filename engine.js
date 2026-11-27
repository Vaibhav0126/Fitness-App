// Rules engine: turns stored data into today's insights, the next workout and chart data.
// Edit CONFIG to change your plan, routines, targets, trips or goals.

export const CONFIG = {
  tzOffsetMin: 9 * 60, // Japan
  planStart: '2026-11-18',
  // 0 = Sunday ... 6 = Saturday
  schedule: { 0: { type: 'rest' }, 1: { type: 'lift', routine: 'Lower A' }, 2: { type: 'lift', routine: 'Upper A' }, 3: { type: 'run' }, 4: { type: 'lift', routine: 'Lower B' }, 5: { type: 'lift', routine: 'Upper B' }, 6: { type: 'run' } },
  runPlan: [
    { week: 1, reps: 8, run: '1:00', walk: '2:00' },
    { week: 2, reps: 8, run: '1:30', walk: '2:00' },
    { week: 3, reps: 6, run: '2:00', walk: '1:30' },
    { week: 4, reps: 6, run: '2:00', walk: '2:00', note: 'Easier week' },
    { week: 5, reps: 5, run: '3:00', walk: '1:30' },
    { week: 6, reps: 4, run: '4:00', walk: '1:00' },
    { week: 7, reps: 3, run: '7:00', walk: '1:00' },
    { week: 8, reps: 2, run: '10:00', walk: '1:00', note: 'Then try 20 min nonstop' },
  ],
  runTargets: { speed: [7.5, 8.5], hrCap: 150, cadence: [165, 175], shinMax: 3 },
  // [exercise, sets, repLow, repHigh]
  routines: {
    'Lower A': [['Squat (Barbell)', 3, 5, 8], ['Leg Press (Machine)', 2, 10, 12], ['Seated Leg Curl (Machine)', 2, 12, 15], ['Leg Extension (Machine)', 2, 12, 15], ['Standing Calf Raise (Barbell)', 2, 12, 16], ['Tibialis Raise', 3, 15, 25], ['Seated Calf Raise', 3, 15, 20]],
    'Upper A': [['Bench Press (Barbell)', 3, 5, 8], ['Pull Up (Weighted)', 3, 6, 10], ['Shoulder Press (Dumbbell)', 2, 8, 12], ['Seated Cable Row - V Grip (Cable)', 2, 10, 12], ['Lateral Raise (Dumbbell)', 2, 15, 20], ['Triceps Rope Pushdown', 2, 12, 15], ['Seated Incline Curl (Dumbbell)', 2, 12, 15], ['Cable Crunch', 3, 15, 20]],
    'Lower B': [['Romanian Deadlift (Smith Machine)', 3, 8, 10], ['Bulgarian Split Squat (Dumbbell)', 2, 8, 10], ['Seated Leg Curl (Machine)', 2, 10, 12], ['Leg Extension (Machine)', 2, 12, 15], ['Calf Press (Machine)', 2, 15, 20], ['Tibialis Raise', 3, 15, 25], ['Seated Calf Raise', 3, 15, 20]],
    'Upper B': [['Incline Bench Press (Dumbbell)', 3, 8, 12], ['Lat Pulldown (Cable)', 3, 8, 10], ['Chest Supported Incline Row (Dumbbell)', 2, 10, 12], ['Cable Fly Crossovers', 2, 12, 15], ['Rear Delt Reverse Fly (Machine)', 2, 12, 15], ['Overhead Triceps Extension (Cable)', 2, 12, 15], ['Preacher Curl (Barbell)', 2, 10, 12], ['Hanging Leg Raise', 3, 15, 20]],
  },
  hotelRoutine: ['Tibialis raises against the wall 3 × 25', 'Single-leg calf raises on a step 3 × 15 per leg', 'Bulgarian split squats (foot on the bed) 3 × 12 per leg', 'Push-ups 3 sets to near failure'],
  trips: [
    { name: 'Tokyo', from: '2026-12-25', to: '2027-01-04', note: 'Two runs this week (Imperial Palace loop or Yoyogi Park) and the 15-minute hotel leg routine twice. Lifting is optional.' },
  ],
  keyLifts: ['Squat (Barbell)', 'Bench Press (Barbell)', 'Romanian Deadlift (Smith Machine)', 'Pull Up (Weighted)', 'Incline Bench Press (Dumbbell)', 'Shoulder Press (Dumbbell)'],
  goals: [
    { label: 'Squat 120 × 5', exercise: 'Squat (Barbell)', weight: 120, reps: 5 },
    { label: 'Bench 85 × 5', exercise: 'Bench Press (Barbell)', weight: 85, reps: 5 },
    { label: 'Weighted pull-up 30 × 10', exercise: 'Pull Up (Weighted)', weight: 30, reps: 10 },
    { label: 'Tibialis 20 kg × 25', exercise: 'Tibialis Raise', weight: 20, reps: 25 },
  ],
};

const DAY = 864e5;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const e1 = (w, r) => w * (1 + r / 30);
const r1 = (v) => Math.round(v * 10) / 10;
const dObj = (s) => new Date(s + 'T00:00:00Z');
const addDays = (s, n) => new Date(dObj(s).getTime() + n * DAY).toISOString().slice(0, 10);
const weekday = (s) => dObj(s).getUTCDay();
export const fmtDay = (s) => { const d = dObj(s); return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const increment = (ex) => (/dumbbell/i.test(ex) ? 2 : 2.5);
const isBodyweight = (ex) => /hanging leg raise/i.test(ex);

function localNow(nowMs, cfg) {
  const t = new Date(nowMs + cfg.tzOffsetMin * 60000);
  return { date: t.toISOString().slice(0, 10), hour: t.getUTCHours() };
}

function tripOn(date, cfg) { return cfg.trips.find((t) => date >= t.from && date <= t.to) || null; }

// ---------- runs ----------
function dedupeRuns(workouts) {
  const runs = workouts.filter((w) => w.isRun).sort((a, b) => a.ms - b.ms);
  const out = [];
  for (const r of runs) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(r.ms - prev.ms) < 20 * 60000) {
      // Same run from two devices: keep the one with intervals, borrow HR from the other.
      const keep = (r.intervals.length > prev.intervals.length) ? r : prev;
      const other = keep === r ? prev : r;
      keep.avgHr ??= other.avgHr; keep.maxHr ??= other.maxHr;
      out[out.length - 1] = keep;
    } else out.push(r);
  }
  return out;
}

function runSummary(r) {
  const work = r.intervals.filter((i) => i.kind === 'run');
  const spd = work.map((i) => i.speedKmh).filter((v) => v != null);
  const hr = work.map((i) => i.maxHr).filter((v) => v != null);
  const cad = work.map((i) => i.cadence).filter((v) => v != null);
  return {
    runIntervals: work.length,
    avgSpeed: spd.length ? r1(mean(spd)) : null,
    firstSpeed: spd[0] ?? null,
    lastSpeed: spd[spd.length - 1] ?? null,
    peakHr: hr.length ? Math.max(...hr) : r.maxHr,
    avgCadence: cad.length ? Math.round(mean(cad)) : null,
  };
}

function planProgress(runs, feedback, cfg, today = '9999') {
  let week = 1, count = 0, repeat = false;
  const log = [];
  for (const r of runs.filter((x) => x.date >= cfg.planStart && x.date <= today)) {
    const fb = feedback[r.date] || null;
    log.push({ ...r, planWeek: Math.min(week, 8), runInWeek: count + 1, feedback: fb, summary: runSummary(r) });
    count++;
    if (fb && fb.shins != null && fb.shins > cfg.runTargets.shinMax) repeat = true;
    if (count >= 2) { if (!repeat) week++; count = 0; repeat = false; }
  }
  return { log, week: Math.min(week, 9), count, repeatPending: repeat };
}

// ---------- recovery ----------
function series(metrics, name, today, days, pick = (v) => (typeof v === 'object' ? v?.hours ?? v?.avg : v)) {
  const m = metrics[name] || {};
  return Object.keys(m).filter((d) => d <= today && d > addDays(today, -days)).sort().map((d) => ({ date: d, v: pick(m[d]) })).filter((x) => x.v != null);
}

function readiness(metrics, today) {
  const flags = [];
  const lines = [];
  const latest = (name, pick) => { const s = series(metrics, name, today, 30, pick); return { s, last: s[s.length - 1] || null }; };
  const cmp = (s, last) => { const prev = s.filter((x) => x.date < last.date).slice(-7).map((x) => x.v); return prev.length >= 3 ? mean(prev) : null; };

  const hrv = latest('heart_rate_variability');
  if (hrv.last) {
    const base = cmp(hrv.s, hrv.last);
    const pct = base ? Math.round(((hrv.last.v - base) / base) * 100) : null;
    if (pct != null && pct <= -15) flags.push('hrv');
    lines.push({ title: 'HRV', text: `${Math.round(hrv.last.v)} ms (${fmtDay(hrv.last.date)})` + (pct == null ? ' — needs a few more nights for a baseline.' : `, ${pct >= 0 ? '+' : ''}${pct}% vs your 7-day average of ${Math.round(base)} ms.`) });
  }
  const rhr = latest('resting_heart_rate');
  if (rhr.last) {
    const base = cmp(rhr.s, rhr.last);
    const diff = base ? Math.round(rhr.last.v - base) : null;
    if (diff != null && diff >= 5) flags.push('rhr');
    lines.push({ title: 'Resting heart rate', text: `${Math.round(rhr.last.v)} bpm` + (diff == null ? '.' : `, ${diff >= 0 ? '+' : ''}${diff} vs your 7-day average.`) });
  }
  const sleep = latest('sleep_analysis', (v) => v?.hours);
  if (sleep.last) {
    const base = cmp(sleep.s, sleep.last);
    if (sleep.last.v < 6) flags.push('sleep');
    lines.push({ title: 'Sleep', text: `${r1(sleep.last.v)} h last night` + (base ? ` (average ${r1(base)} h).` : '.') + (sleep.last.v < 6 ? ' Short night — keep the next session easier.' : '') });
  }
  const level = flags.length >= 2 ? 'low' : flags.length === 1 ? 'ok' : (lines.length ? 'good' : 'unknown');
  return { level, flags, lines, trends: { hrv: hrv.s, rhr: rhr.s, sleep: sleep.s } };
}

// ---------- strength ----------
function sessionsByExercise(sets) {
  const map = {};
  for (const s of sets) {
    if (!s.exercise) continue;
    ((map[s.exercise] ||= {})[s.start] ||= []).push(s);
  }
  return map;
}

function lastPerformance(byEx, ex, beforeStart = '9999') {
  const sess = byEx[ex];
  if (!sess) return null;
  const starts = Object.keys(sess).filter((s) => s < beforeStart).sort();
  if (!starts.length) return null;
  const start = starts[starts.length - 1];
  const rs = sess[start];
  const topW = Math.max(...rs.map((r) => r.weight || 0));
  const top = rs.filter((r) => (r.weight || 0) === topW);
  const best = rs.reduce((b, r) => (e1(r.weight || 0, r.reps || 0) > e1(b.weight || 0, b.reps || 0) ? r : b), rs[0]);
  return { start, date: start.slice(0, 10), sets: rs, topW, topReps: top.map((r) => r.reps || 0), best, bestE1: r1(e1(best.weight || 0, best.reps || 0)) };
}

function prescribe(ex, nSets, lo, hi, last, easy) {
  if (!last) return { exercise: ex, target: `${nSets} × ${lo}–${hi}`, note: 'No history yet — pick a weight that leaves 1–2 reps in reserve.' };
  const bw = isBodyweight(ex) || last.topW === 0;
  const minTop = Math.min(...last.topReps);
  const maxTop = Math.max(...last.topReps);
  const lastTxt = `Last (${fmtDay(last.date)}): ${last.sets.map((s) => (bw ? `${s.reps}` : `${s.weight}×${s.reps}`)).join(', ')}`;
  const sets = easy ? Math.max(1, nSets - 1) : nSets;
  if (bw) {
    const reps = Math.min(hi, maxTop + 1);
    return { exercise: ex, target: `${sets} × ${reps}`, note: lastTxt };
  }
  if (!easy && minTop >= hi) {
    const w = r1(last.topW + increment(ex));
    return { exercise: ex, target: `${w} kg × ${sets} × ${lo}–${hi}`, note: `${lastTxt}. You hit ${hi}+ on every top set — add weight.`, up: true };
  }
  const reps = Math.min(hi, Math.max(lo, maxTop + (easy ? 0 : 1)));
  return { exercise: ex, target: `${last.topW} kg × ${sets} × ${reps}`, note: `${lastTxt}.${easy ? ' Easier day: same weight, one set fewer.' : ` Aim for ${reps} reps before adding weight.`}` };
}

function strengthSummary(sets, date) {
  const today = sets.filter((s) => s.date === date);
  if (!today.length) return null;
  const byEx = sessionsByExercise(sets);
  const workout = today[0].workout;
  const start = today[0].start;
  const lines = [];
  const exs = [...new Set(today.map((s) => s.exercise))];
  for (const ex of exs) {
    const now = lastPerformance({ [ex]: { [start]: today.filter((s) => s.exercise === ex) } }, ex);
    const prev = lastPerformance(byEx, ex, start);
    if (!now || now.topW === 0) continue;
    const d = prev ? r1(now.bestE1 - prev.bestE1) : null;
    lines.push({ ex, best: `${now.best.weight}×${now.best.reps}`, change: d });
  }
  const ups = lines.filter((l) => l.change > 0).map((l) => `${l.ex.replace(/ \(.*\)/, '')} ${l.best}`);
  const downs = lines.filter((l) => l.change < 0).map((l) => l.ex.replace(/ \(.*\)/, ''));
  return { workout, sets: today.length, exercises: exs.length, ups, downs, lines };
}

// ---------- main ----------
export function computeState(store, nowMs = Date.now(), cfg = CONFIG) {
  const metrics = store.metrics || {};
  const workouts = Object.values(store.workouts || {});
  const sets = store.sets || [];
  const feedback = store.feedback || {};
  const { date: today, hour } = localNow(nowMs, cfg);

  const runs = dedupeRuns(workouts.map((w) => ({ ...w, intervals: [...(w.intervals || [])] })));
  const plan = planProgress(runs, feedback, cfg, today);
  const rd = readiness(metrics, today);
  const easy = rd.level === 'low';

  // ---- Today ----
  const todayInsights = [];
  const trip = tripOn(today, cfg);
  if (trip) todayInsights.push({ title: `Travelling: ${trip.name}`, text: trip.note });
  const todaysRuns = plan.log.filter((r) => r.date === today);
  for (const r of todaysRuns) {
    const s = r.summary;
    let t = `Week ${r.planWeek} run ${r.runInWeek}: ${r.distanceKm ?? '?'} km in ${r.durationMin} min, avg HR ${r.avgHr ?? '—'}, max ${r.maxHr ?? '—'}.`;
    if (s.avgSpeed != null) t += ` Run intervals averaged ${s.avgSpeed} km/h`;
    if (s.peakHr != null) t += `, peaking at ${s.peakHr} bpm`;
    t += '.';
    const notes = [];
    if (s.avgSpeed != null && s.avgSpeed > cfg.runTargets.speed[1]) notes.push(`a bit fast — aim for ${cfg.runTargets.speed.join('–')} km/h`);
    if (s.peakHr != null && s.peakHr > cfg.runTargets.hrCap + 5) notes.push(`heart rate went above ${cfg.runTargets.hrCap} — slow the run intervals`);
    if (s.firstSpeed != null && s.lastSpeed != null && s.lastSpeed > s.firstSpeed + 0.7) notes.push('the last interval was faster than the first — keep it even');
    if (notes.length) t += ' Note: ' + notes.join('; ') + '.';
    todayInsights.push({ title: 'Today\'s run', text: t });
    if (!r.feedback) todayInsights.push({ title: 'Log your shins', text: 'Rate shin and calf pain (0–10) for today\'s run below — it decides whether you move up a week.', action: 'feedback', date: r.date });
  }
  const str = strengthSummary(sets, today);
  const todaysLift = workouts.find((w) => w.date === today && w.isStrength);
  if (str) {
    let t = `${str.workout}: ${str.exercises} exercises, ${str.sets} sets`;
    if (todaysLift) t += `, ${todaysLift.durationMin} min, avg HR ${todaysLift.avgHr ?? '—'}`;
    t += '.';
    if (str.ups.length) t += ` Up from last time: ${str.ups.join(', ')}.`;
    if (str.downs.length) t += ` Lower than last time: ${str.downs.join(', ')}.`;
    todayInsights.push({ title: 'Today\'s lifting', text: t });
  } else if (todaysLift) {
    todayInsights.push({ title: 'Today\'s lifting', text: `Strength session: ${todaysLift.durationMin} min, avg HR ${todaysLift.avgHr ?? '—'}, max ${todaysLift.maxHr ?? '—'}. Export Hevy to see your sets compared with last time.` });
  }
  const sched = cfg.schedule[weekday(today)];
  if (!todaysRuns.length && !str && !todaysLift && !trip) {
    if (sched.type === 'rest') todayInsights.push({ title: 'Rest day', text: 'Recovery is training too: easy walk, calf stretches, and a good night\'s sleep.' });
    else if (hour >= 10) todayInsights.push({ title: 'No session logged yet', text: `Scheduled today: ${sched.type === 'run' ? 'run' : sched.routine}. If you trained, the next export will pick it up.` });
  }
  const steps = series(metrics, 'step_count', today, 2).pop();
  if (steps) todayInsights.push({ title: 'Steps', text: `${Math.round(steps.v).toLocaleString('en-US')} on ${fmtDay(steps.date)}.` });
  todayInsights.push(...rd.lines);
  if (rd.level === 'low') todayInsights.push({ title: 'Recovery flag', text: 'Two or more recovery signals are down (HRV, resting HR or sleep). The next session below is adjusted to be easier.' });

  // ---- Next workout ----
  const doneToday = todaysRuns.length || str || todaysLift;
  let nd = today;
  if (doneToday || hour >= 12) nd = addDays(today, 1);
  for (let i = 0; i < 7 && cfg.schedule[weekday(nd)].type === 'rest'; i++) nd = addDays(nd, 1);
  const ns = cfg.schedule[weekday(nd)];
  const nTrip = tripOn(nd, cfg);
  const next = { date: nd, label: fmtDay(nd), items: [] };
  if (ns.type === 'run') {
    const wk = Math.min(plan.week, 8);
    const p = cfg.runPlan[wk - 1];
    next.title = plan.week > 8 ? 'Run — 20–25 min nonstop at an easy pace' : `Run — Week ${wk} (${p.reps} × ${p.run} run / ${p.walk} walk)`;
    next.goal = plan.week > 8 ? 'Plan complete: build continuous running by about 5 minutes a week.' : `Run ${plan.count + 1} of 2 this week.${p.note ? ' ' + p.note + '.' : ''}`;
    next.items.push({ title: 'Pace and heart rate', text: `Run intervals at ${cfg.runTargets.speed.join('–')} km/h, heart rate under about ${cfg.runTargets.hrCap} bpm, cadence ${cfg.runTargets.cadence.join('–')} steps/min. Last interval no faster than the first.` });
    const last = plan.log[plan.log.length - 1];
    if (last && !last.feedback) next.items.push({ title: 'Shin check', text: `You haven't logged shin pain for your ${fmtDay(last.date)} run. If it was above ${cfg.runTargets.shinMax}/10, repeat Week ${last.planWeek} instead.` });
    if (plan.repeatPending) next.items.push({ title: 'Repeating a week', text: 'Shins were above 3/10 on a run this week, so this week will be repeated before moving up.' });
    if (easy) next.items.push({ title: 'Recovery is low', text: 'Walk the whole session, or do the previous week\'s intervals.' });
    next.items.push({ title: 'After the run', text: 'Calf stretches (knee straight, then bent) and a 250–400 kcal snack. Log your shin pain here.' });
  } else {
    const routine = cfg.routines[ns.routine];
    next.title = ns.routine;
    next.goal = easy ? 'Recovery is low — same weights, one set fewer, stop 2 reps short of failure.' : 'Beat last time by one rep or one weight step on each main lift.';
    const byEx = sessionsByExercise(sets);
    next.exercises = routine.map(([ex, n, lo, hi]) => prescribe(ex, n, lo, hi, lastPerformance(byEx, ex), easy));
  }
  if (nTrip) { next.items.unshift({ title: `Travelling: ${nTrip.name}`, text: nTrip.note }); if (ns.type === 'lift') next.items.push({ title: 'Hotel routine (15 min)', text: cfg.hotelRoutine.join(' · ') }); }

  // ---- Charts / history ----
  const byEx = sessionsByExercise(sets);
  const lifts = cfg.keyLifts.concat(['Tibialis Raise']).map((ex) => ({
    exercise: ex,
    points: Object.keys(byEx[ex] || {}).sort().map((st) => { const l = lastPerformance(byEx, ex, st + '~'); return { date: l.date, e1rm: l.bestE1, top: `${l.best.weight}×${l.best.reps}` }; }).filter((p) => p.e1rm > 0),
  }));
  const goals = cfg.goals.map((g) => { const l = lastPerformance(byEx, g.exercise); const cur = l ? l.bestE1 : 0; const target = r1(e1(g.weight, g.reps)); return { ...g, current: cur, target, pct: target ? Math.min(100, Math.round((cur / target) * 100)) : 0, best: l ? `${l.best.weight}×${l.best.reps}` : '—' }; });
  const weekKey = (d) => addDays(d, -((weekday(d) + 6) % 7));
  const weeks = {};
  for (const s of sets) { const k = weekKey(s.date); (weeks[k] ||= { week: k, sets: 0, sessions: new Set() }); weeks[k].sets++; weeks[k].sessions.add(s.start); }
  for (const r of runs) { const k = weekKey(r.date); (weeks[k] ||= { week: k, sets: 0, sessions: new Set() }); weeks[k].runs = (weeks[k].runs || 0) + 1; }
  const weekly = Object.values(weeks).sort((a, b) => (a.week < b.week ? -1 : 1)).map((w) => ({ week: w.week, sets: w.sets, sessions: w.sessions.size, runs: w.runs || 0 }));

  return {
    generatedAt: new Date(nowMs).toISOString(),
    today: { date: today, label: fmtDay(today), readiness: rd.level, insights: todayInsights },
    next,
    plan: { week: plan.week, runsThisWeek: plan.count, weeks: cfg.runPlan.map((p) => ({ ...p, status: p.week < plan.week ? 'done' : p.week === plan.week ? 'current' : 'upcoming' })) },
    runs: plan.log.slice(-12).map((r) => ({ date: r.date, label: fmtDay(r.date), planWeek: r.planWeek, runInWeek: r.runInWeek, distanceKm: r.distanceKm, durationMin: r.durationMin, avgHr: r.avgHr, maxHr: r.maxHr, effort: r.effort, feedback: r.feedback, ...r.summary, intervals: r.intervals.filter((i) => i.kind === 'run') })),
    lifts,
    goals,
    weekly,
    recovery: rd.trends,
    lastUploads: store.meta || {},
  };
}
