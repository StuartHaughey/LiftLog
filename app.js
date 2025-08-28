// --- App metadata ---
const APP_VERSION = "v0.5"; // bump this when you release

// Tiny utilities
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const notice = (msg, ms=1600) => { const n = $('#notice'); n.textContent = msg; n.classList.add('show'); setTimeout(()=>n.classList.remove('show'), ms); };
const todayISO = () => new Date().toISOString().slice(0,10);

// CSV helper
function toCSV(rows, cols){ const head = cols.join(','); const data = rows.map(r => cols.map(k => JSON.stringify(r[k] ?? '')).join(',')).join('\n'); return head + '\n' + data + '\n'; }
function download(content, filename, mime){ const blob = new Blob([content], { type: mime }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(()=> URL.revokeObjectURL(url), 500); }

// Router helpers
function parseHash(){ const raw = location.hash.replace('#','') || '/sessions'; const [path, queryStr] = raw.split('?'); const q = Object.fromEntries(new URLSearchParams(queryStr || '')); return { path, q }; }

// Store
const Store = {
  KEY: 'liftlog:v1',
  data: { exercises: [], sessions: [] },
  load(){ try { const raw = localStorage.getItem(this.KEY); if (raw) this.data = JSON.parse(raw); } catch(e){ console.warn('store parse fail', e); } },
  save(){ localStorage.setItem(this.KEY, JSON.stringify(this.data)); },
  reset(){ this.data = { exercises: [], sessions: [] }; this.save(); }
};
Store.load();

// Domain helpers
const MUSCLES = ['Chest','Back','Shoulders','Biceps','Triceps','Legs','Glutes','Core','Calves','Other'];
function uid(){ return Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }
function getExercise(id){ return Store.data.exercises.find(e => e.id === id); }
function getSession(id){ return Store.data.sessions.find(s => s.id === id); }
function upsertSessionItem(session, exerciseId){ let item = session.items.find(i => i.exerciseId === exerciseId); if (!item){ item = { exerciseId, sets: [] }; session.items.push(item); } return item; }

// Stats
function computeStats(){
  const byExercise = {}, byMuscle = {};
  for (const s of Store.data.sessions){
    for (const it of s.items){
      const ex = getExercise(it.exerciseId); if(!ex) continue;
      const key = ex.id; const ms = ex.muscle || 'Other';
      if(!byExercise[key]) byExercise[key] = { exerciseId: ex.id, name: ex.name, muscle: ex.muscle, sets: 0, reps: 0, maxWeight: 0 };
      for (const set of it.sets){
        byExercise[key].sets += 1;
        byExercise[key].reps += Number(set.reps)||0;
        byExercise[key].maxWeight = Math.max(byExercise[key].maxWeight, Number(set.weight)||0);
        if(!byMuscle[ms]) byMuscle[ms] = { muscle: ms, sets: 0, reps: 0 };
        byMuscle[ms].sets += 1;
        byMuscle[ms].reps += Number(set.reps)||0;
      }
    }
  }
  return { byExercise: Object.values(byExercise), byMuscle: Object.values(byMuscle) };
}

// Router
const Router = {
  routes: {},
  go(path){ location.hash = path; },
  on(path, fn){ this.routes[path] = fn; },
  start(){
    const handle = () => {
      const { path } = parseHash();
      $$('#nav-sessions, #nav-exercises, #nav-stats, #nav-about').forEach(a => a.classList.remove('active'));
      const active = $('#nav-' + (path.split('/')[1] || 'sessions')); if (active) active.classList.add('active');
      const view = this.routes[path] || Views.NotFound;
      $('#app').replaceChildren(view());
    };
    window.addEventListener('hashchange', handle);
    handle();
  }
};

// Views
const Views = {
  Sessions(){
    const wrap = document.createElement('div'); wrap.className = 'stack';
    wrap.innerHTML = `
    <section class="panel card stack" aria-labelledby="s-h1">
      <div style="display:flex; align-items:center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
        <h1 id="s-h1" class="headline" style="margin:0;">Training Sessions</h1>
        <div class="stack" style="grid-auto-flow: column; gap: 8px; display:grid;">
          <button class="btn primary" id="start">Start new session</button>
          <button class="btn" id="export">Export all sessions (CSV)</button>
        </div>
      </div>
      <div class="card">
        <table role="table" aria-label="Sessions table">
          <thead><tr><th>Date</th><th>Notes</th><th>Status</th><th>Exercises</th><th>Sets</th><th>Actions</th></tr></thead>
          <tbody id="tbody"></tbody>
        </table>
        <p id="empty" class="muted" style="display:none; text-align:center; margin: 12px 0;">No sessions yet. Start one above.</p>
      </div>
    </section>`;
    const tbody = $('#tbody', wrap); const empty = $('#empty', wrap);
    function render(){
      tbody.innerHTML='';
      const sessions = [...Store.data.sessions].sort((a,b)=> (b.date||'').localeCompare(a.date||''));
      empty.style.display = sessions.length ? 'none' : 'block';
      for (const s of sessions){
        const counts = { exercises: s.items.length, sets: s.items.reduce((t,i)=> t + i.sets.length, 0) };
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><span class="chip">${s.date||''}</span></td>
                        <td class="muted">${s.notes||''}</td>
                        <td>${s.done?'<span class="chip">Done</span>':'<span class="chip">In progress</span>'}</td>
                        <td>${counts.exercises}</td>
                        <td>${counts.sets}</td>
                        <td><a class="btn" href="#/session?id=${s.id}">Open</a> <button class="btn danger" data-del="${s.id}">Delete</button></td>`;
        tbody.appendChild(tr);
      }
    }
    render();
    $('#start', wrap).addEventListener('click', ()=>{
      const s = { id: uid(), date: todayISO(), notes:'', done:false, items:[] };
      Store.data.sessions.push(s); Store.save(); notice('Session started'); Router.go('/session?id='+s.id);
    });
    wrap.addEventListener('click', (e)=>{
      const id = e.target?.dataset?.del; if(!id) return;
      if(confirm('Delete this session?')){ Store.data.sessions = Store.data.sessions.filter(x=>x.id!==id); Store.save(); render(); notice('Session deleted'); }
    });
    $('#export', wrap).addEventListener('click', ()=>{
      const flat=[];
      for (const s of Store.data.sessions){
        for (const it of s.items){
          const ex=getExercise(it.exerciseId)||{name:'(deleted)',muscle:'Other'};
          for (const set of it.sets){
            flat.push({ date:s.date, sessionId:s.id, exercise:ex.name, muscle:ex.muscle||'Other', weight:set.weight, reps:set.reps });
          }
        }
      }
      download(toCSV(flat,['date','sessionId','exercise','muscle','weight','reps']),'liftlog_sessions.csv','text/csv');
      notice('Exported sessions CSV');
    });
    return wrap;
  },

  SessionDetail(){
    const { q } = parseHash(); const s = getSession(q.id);
    const wrap = document.createElement('div');
    if(!s){ wrap.innerHTML = `<div class="panel card" style="padding:18px;">Session not found. <a href="#/sessions">Back to sessions</a>.</div>`; return wrap; }
    wrap.className = 'stack';
    wrap.innerHTML = `
      <section class="panel card stack" aria-labelledby="sd-h1">
        <div style="display:flex; align-items:center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
          <h1 id="sd-h1" class="headline" style="margin:0;">Session — ${s.date}</h1>
          <div class="stack" style="grid-auto-flow: column; gap: 8px; display:grid;">
            <button class="btn" id="export">Export (CSV)</button>
            ${s.done ? '' : '<button class="btn primary" id="finish">Finish Session</button>'}
            <a class="btn" href="#/sessions">Back</a>
          </div>
        </div>
        <form id="meta" class="stack">
          <div class="row">
            <div>
              <label for="date">Date</label>
              <input id="date" type="date" value="${s.date}" />
            </div>
            <div>
              <label for="notes">Notes</label>
              <input id="notes" placeholder="Optional" value="${s.notes||''}" />
            </div>
          </div>
        </form>
        <div class="card stack">
          <h3>Add exercise & set</h3>
          <form id="add" class="stack">
            <div class="row">
              <div>
                <label for="exercise">Exercise</label>
                <select id="exercise"></select>
              </div>
              <div>
                <label for="weight">Weight</label>
                <input id="weight" type="number" step="0.5" min="0" placeholder="kg" />
              </div>
            </div>
            <div class="row">
              <div>
                <label for="reps">Reps</label>
                <input id="reps" type="number" step="1" min="1" placeholder="e.g. 8" />
                <div><span class="chip" id="prefillFlag" style="display:none; margin-top:6px;">↺ repeated</span></div>
              </div>
              <div style="display:flex; align-items:end; gap:8px;">
                <button class="btn primary" type="submit">Add set</button>
                <button class="btn" type="button" id="startTimer">Start 120s timer</button>
                <span class="chip" id="timerDisplay">120s</span>
              </div>
            </div>
          </form>
        </div>
        <div id="blocks" class="stack"></div>
      </section>`;

    // Timer
    let tLeft = 120; let tId = null; const tDisp = $('#timerDisplay', wrap);
    function tick(){ tLeft -= 1; if(tLeft < 0){ clearInterval(tId); tId=null; tLeft=0; onTimerEnd(); } renderTimer(); }
    function renderTimer(){ tDisp.textContent = tLeft + 's'; }
    function startTimer(){ if(tId) clearInterval(tId); tLeft = 120; renderTimer(); tId = setInterval(tick, 1000); toastTimer('Timer started: 120s'); }
    function stopTimer(){ if(tId) { clearInterval(tId); tId=null; toastTimer('Timer stopped'); } }
    function onTimerEnd(){ toastTimer('Rest done — lift!'); try{ navigator.vibrate?.(200); }catch{} beep(); }
    function toastTimer(msg){ const el = $('#timerToast'); el.textContent = msg; el.classList.add('show'); setTimeout(()=> el.classList.remove('show'), 1800); }
    function beep(){
      // Guard iOS first-use audio jank
      const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isiOS) return;
      try{
        const ctx = new (window.AudioContext||window.webkitAudioContext)();
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 880; g.gain.value = 0.05;
        o.start(); setTimeout(()=>{ o.stop(); ctx.close(); }, 300);
      }catch{}
    }

    // --- PB helpers -------------------------------------------------
    function priorMaxWeightOtherSessions(exerciseId, currentSessionId){
      let max = 0;
      for (const sess of Store.data.sessions){
        if (sess.id === currentSessionId) continue;
        const it = sess.items.find(i => i.exerciseId === exerciseId);
        if (!it) continue;
        for (const st of it.sets) max = Math.max(max, Number(st.weight)||0);
      }
      return max;
    }

    // --- Auto-repeat helpers -------------------------------------------------
    function ensurePrefillFlag() {
      let flag = $('#prefillFlag', wrap);
      if (!flag) {
        const repsInput = $('#reps', wrap);
        const holder = document.createElement('div');
        holder.style.marginTop = '6px';
        flag = document.createElement('span');
        flag.id = 'prefillFlag';
        flag.className = 'chip';
        flag.style.display = 'none';
        flag.textContent = '↺ repeated';
        holder.appendChild(flag);
        repsInput.parentElement.appendChild(holder);
      }
      return flag;
    }

    function findLastSetForExercise(exerciseId, currentSession) {
      // Phase 1: latest set for this exercise in this session
      const itemNow = currentSession.items.find(i => i.exerciseId === exerciseId);
      if (itemNow && itemNow.sets.length) return itemNow.sets[itemNow.sets.length - 1];
      // Phase 2: search past sessions (newest → oldest by ISO date)
      const sessions = [...Store.data.sessions]
        .filter(x => x.id !== currentSession.id)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      for (const sess of sessions) {
        const it = sess.items.find(i => i.exerciseId === exerciseId);
        if (it && it.sets.length) return it.sets[it.sets.length - 1];
      }
      return null;
    }

    function prefillFromLast(exerciseId) {
      const last = findLastSetForExercise(exerciseId, s);
      const wEl = $('#weight', wrap);
      const rEl = $('#reps', wrap);
      const flag = ensurePrefillFlag();
      if (last) {
        wEl.value = Number(last.weight) || 0;
        rEl.value = Number(last.reps) || 1;
        flag.style.display = 'inline-block';
      } else {
        flag.style.display = 'none';
      }
    }

    // Hook up timer button AFTER helpers are defined
    $('#startTimer', wrap).addEventListener('click', startTimer);

    // Session logic
    const exerciseSelect = $('#exercise', wrap);

    function refreshExerciseOptions(){
      const groups = {};
      for (const ex of Store.data.exercises) {
        const m = ex.muscle || 'Other';
        (groups[m] ||= []).push(ex);
      }
      // Sort muscles A–Z, then exercises A–Z
      const muscles = Object.keys(groups).sort((a,b)=>a.localeCompare(b));

      // iOS-friendly: include a placeholder
      const parts = [`<option value="">— Select exercise —</option>`];
      if (!muscles.length) {
        parts.push(`<option value="" disabled>No exercises — add some first</option>`);
      } else {
        for (const m of muscles) {
          parts.push(`<optgroup label="${m}">`);
          for (const ex of groups[m].sort((a,b)=>a.name.localeCompare(b.name))) {
            parts.push(`<option value="${ex.id}">${ex.name}</option>`);
          }
          parts.push(`</optgroup>`);
        }
      }
      exerciseSelect.innerHTML = parts.join('');
    }
    refreshExerciseOptions();

    // Prefill as soon as an exercise is selected
    exerciseSelect.addEventListener('change', () => {
      const exId = exerciseSelect.value;
      if (exId) prefillFromLast(exId);
    });
    // If something is selected on load, prefill once
    if (exerciseSelect.value) prefillFromLast(exerciseSelect.value);

    const blocks = $('#blocks', wrap);
    function renderBlocks(){
      blocks.innerHTML='';
      for (const it of s.items){
        const ex=getExercise(it.exerciseId)||{name:'(deleted)', muscle:'Other'};
        const div=document.createElement('div'); div.className='card stack';

        // Starting PB threshold = historical max outside this session
        let runningPB = priorMaxWeightOtherSessions(it.exerciseId, s.id);

        const max=Math.max(0,...it.sets.map(x=>Number(x.weight)||0));
        const totalReps=it.sets.reduce((t,x)=>t+(Number(x.reps)||0),0);

        div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
          <div>
            <strong>${ex.name}</strong> <span class="chip">${ex.muscle}</span>
            <span class="muted" style="margin-left:8px;">${it.sets.length} sets • ${totalReps} reps • max ${max}kg</span>
          </div>
          <div>
            <button class="btn" data-addset="${it.exerciseId}">Add set</button>
            <button class="btn danger" data-delblock="${it.exerciseId}">Remove exercise</button>
          </div>
        </div>
        <table role="table" aria-label="Sets table">
          <thead><tr><th>#</th><th>Weight (kg)</th><th>Reps</th><th>Actions</th></tr></thead>
          <tbody>
            ${it.sets.map((st,idx)=>{
              const w = Number(st.weight)||0;
              const isPB = w > runningPB;
              if (isPB) runningPB = w;
              const pbChip = isPB ? `<span class="chip pb" style="margin-left:6px;">PB</span>` : '';
              return `<tr>
                <td>${idx+1}</td>
                <td>${w}${pbChip}</td>
                <td>${st.reps}</td>
                <td><button class="btn danger" data-dels="${it.exerciseId}:${idx}">Delete</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`;
        blocks.appendChild(div);
      }
    }
    renderBlocks();

    $('#meta', wrap).addEventListener('input', ()=>{
      s.date = $('#date', wrap).value || s.date;
      s.notes = $('#notes', wrap).value || '';
      Store.save();
    });

    $('#add', wrap).addEventListener('submit', (e)=>{
      e.preventDefault();
      const exId = exerciseSelect.value;
      if(!exId) return notice('Pick an exercise');
      const weight = Number($('#weight', wrap).value);
      const reps = Number($('#reps', wrap).value);
      if(!Number.isFinite(weight) || weight < 0) return notice('Enter weight');
      if(!Number.isInteger(reps) || reps <= 0) return notice('Enter reps');

      // PB check: prior max = other sessions + any sets already in this session
      const item = upsertSessionItem(s, exId);
      const priorInThisSession = Math.max(0, ...item.sets.map(st => Number(st.weight)||0));
      const priorOutside = priorMaxWeightOtherSessions(exId, s.id);
      const priorMax = Math.max(priorInThisSession, priorOutside);
      const isPB = weight > priorMax;

      item.sets.push({ weight, reps });
      Store.save();

      $('#weight', wrap).value='';
      $('#reps', wrap).value='';
      renderBlocks();
      if (isPB) {
        const exName = (getExercise(exId)?.name) || 'exercise';
        notice(`New PB for ${exName}: ${weight} kg`);
      } else {
        notice('Set added');
      }
      startTimer();

      // Prefill next set for convenience
      prefillFromLast(exId);
    });

    blocks.addEventListener('click', (e)=>{
      const addId = e.target?.dataset?.addset;
      if(addId){
        const w = Number(prompt('Weight (kg)','0'));
        const r = Number(prompt('Reps','8'));
        if(Number.isFinite(w) && Number.isFinite(r) && r>0){
          upsertSessionItem(s, addId).sets.push({ weight:w, reps:r });
          Store.save(); renderBlocks(); notice('Set added'); startTimer();
        }
      }
      const delBlock = e.target?.dataset?.delblock;
      if(delBlock){
        if(confirm('Remove this exercise from session?')){
          s.items = s.items.filter(i=>i.exerciseId!==delBlock);
          Store.save(); renderBlocks(); notice('Exercise removed');
        }
      }
      const delSet = e.target?.dataset?.dels;
      if(delSet){
        const [exId, idxStr] = delSet.split(':'); const idx = Number(idxStr);
        const item = s.items.find(i=>i.exerciseId===exId);
        if(item && item.sets[idx]){ item.sets.splice(idx,1); Store.save(); renderBlocks(); notice('Set deleted'); }
      }
    });

    $('#finish', wrap)?.addEventListener('click', ()=>{ s.done = true; Store.save(); notice('Session finished'); Router.go('/sessions'); });
    $('#export', wrap).addEventListener('click', ()=>{
      const flat=[];
      for (const it of s.items){
        const ex=getExercise(it.exerciseId)||{name:'(deleted)',muscle:'Other'};
        for (const set of it.sets){
          flat.push({ date:s.date, exercise:ex.name, muscle:ex.muscle||'Other', weight:set.weight, reps:set.reps });
        }
      }
      download(toCSV(flat,['date','exercise','muscle','weight','reps']), `session_${s.date}.csv`, 'text/csv');
      notice('Session CSV exported');
    });

    return wrap;
  },

  Exercises(){
    const wrap = document.createElement('div'); wrap.className='stack';
    wrap.innerHTML = `
    <section class="panel card stack" aria-labelledby="e-h1">
      <div style="display:flex; align-items:center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
        <h1 id="e-h1" class="headline" style="margin:0;">Exercises Catalogue</h1>
        <div class="stack" style="grid-auto-flow: column; gap: 8px; display:grid;">
          <button class="btn" id="seed">Seed common lifts</button>
          <button class="btn" id="export">Export (CSV)</button>
        </div>
      </div>
      <form id="addEx" class="stack">
        <div class="row">
          <div>
            <label for="exName">Name</label>
            <input id="exName" placeholder="e.g. Bench Press" required />
          </div>
          <div>
            <label for="exMuscle">Muscle group</label>
            <select id="exMuscle"></select>
          </div>
        </div>
        <div style="display:flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn primary" type="submit">Add Exercise</button>
        </div>
      </form>
      <div class="card">
        <table role="table" aria-label="Exercises table">
          <thead><tr><th>Name</th><th>Muscle</th><th>Actions</th></tr></thead>
          <tbody id="tbody"></tbody>
        </table>
        <p id="empty" class="muted" style="display:none; text-align:center; margin: 12px 0;">No exercises yet. Add some above.</p>
      </div>
    </section>`;
    const sel = $('#exMuscle', wrap); for (const m of MUSCLES){ const o=document.createElement('option'); o.value=m; o.textContent=m; sel.appendChild(o); }
    const tbody = $('#tbody', wrap); const empty = $('#empty', wrap);
    function render(){
      tbody.innerHTML='';
      const list=[...Store.data.exercises].sort((a,b)=>a.name.localeCompare(b.name));
      empty.style.display = list.length ? 'none' : 'block';
      for (const ex of list){
        const tr=document.createElement('tr');
        tr.innerHTML = `<td>${ex.name}</td><td><span class="chip">${ex.muscle}</span></td><td><button class="btn" data-edit="${ex.id}">Edit</button> <button class="btn danger" data-del="${ex.id}">Delete</button></td>`;
        tbody.appendChild(tr);
      }
    }
    render();
    $('#addEx', wrap).addEventListener('submit', (e)=>{
      e.preventDefault();
      const name=$('#exName', wrap).value.trim();
      const muscle=$('#exMuscle', wrap).value;
      if(!name) return notice('Name required');
      Store.data.exercises.push({ id: uid(), name, muscle });
      Store.save(); $('#exName', wrap).value=''; render(); notice('Exercise added');
    });
    wrap.addEventListener('click', (e)=>{
      const del=e.target?.dataset?.del;
      if(del){
        if(confirm('Delete exercise? Existing session data will keep the name as (deleted).')){
          Store.data.exercises = Store.data.exercises.filter(x=>x.id!==del); Store.save(); render(); notice('Exercise deleted');
        }
      }
      const edit=e.target?.dataset?.edit;
      if(edit){
        const ex=getExercise(edit); if(!ex) return;
        const nn=prompt('Exercise name', ex.name); if(nn===null) return;
        const mm=prompt('Muscle group', ex.muscle||'Other');
        ex.name=(nn||ex.name).trim(); ex.muscle=(mm||ex.muscle).trim();
        Store.save(); render(); notice('Exercise updated');
      }
    });
    $('#seed', wrap).addEventListener('click', ()=>{
      const seeds = [
        // Chest
        ['Barbell Bench Press','Chest'],['Incline Barbell Bench Press','Chest'],['Decline Barbell Bench Press','Chest'],
        ['Dumbbell Bench Press','Chest'],['Incline Dumbbell Bench Press','Chest'],['Decline Dumbbell Bench Press','Chest'],
        ['Machine Chest Press','Chest'],['Cable Chest Fly','Chest'],['Dumbbell Chest Fly','Chest'],['Pec Deck Fly','Chest'],['Dips (Chest)','Chest'],
        // Back
        ['Pull-Up (Bodyweight)','Back'],['Chin-Up','Back'],
        ['Barbell Row','Back'],['Dumbbell Row','Back'],['T-Bar Row','Back'],['Chest-Supported Row','Back'],
        ['Seated Cable Row','Back'],['Lat Pulldown (Wide-Grip)','Back'],['Lat Pulldown (Close-Grip)','Back'],
        ['Machine Row','Back'],['Straight-Arm Cable Pulldown','Back'],
        // Shoulders
        ['Overhead Press (Barbell)','Shoulders'],['Overhead Press (Dumbbell)','Shoulders'],['Arnold Press','Shoulders'],
        ['Dumbbell Side Lateral Raise','Shoulders'],['Cable Side Lateral Raise','Shoulders'],['Machine Side Lateral Raise','Shoulders'],
        ['Rear Delt Dumbbell Fly','Shoulders'],['Rear Delt Cable Fly','Shoulders'],['Face Pull (Cable)','Shoulders'],
        // Biceps
        ['Barbell Curl','Biceps'],['Dumbbell Curl','Biceps'],['Hammer Curl (DB)','Biceps'],['Incline Dumbbell Curl','Biceps'],
        ['Preacher Curl (Barbell/DB)','Biceps'],['Cable Curl','Biceps'],['Machine Curl','Biceps'],
        // Triceps
        ['Triceps Pushdown (Cable)','Triceps'],['Overhead Dumbbell Extension','Triceps'],['Overhead Cable Extension','Triceps'],
        ['EZ-Bar Skullcrusher','Triceps'],['Dumbbell Skullcrusher','Triceps'],['Close-Grip Bench Press','Triceps'],
        ['Triceps Kickback (DB)','Triceps'],['Triceps Dip (Bench/Parallel Bar)','Triceps'],
        // Legs / Glutes
        ['Back Squat (Barbell)','Legs'],['Front Squat (Barbell)','Legs'],['Goblet Squat (DB)','Legs'],['Hack Squat (Machine)','Legs'],
        ['Bulgarian Split Squat (DB/BB)','Legs'],['Walking Lunge (DB/BB)','Legs'],['Leg Press (Machine)','Legs'],
        ['Leg Extension (Machine)','Legs'],['Leg Curl (Machine - Seated)','Legs'],['Leg Curl (Machine - Lying)','Legs'],
        ['Romanian Deadlift (Barbell)','Glutes'],['Romanian Deadlift (Dumbbell)','Glutes'],
        ['Conventional Deadlift (Barbell)','Legs'],['Sumo Deadlift (Barbell)','Legs'],
        ['Hip Thrust (Barbell)','Glutes'],['Glute Bridge (Bodyweight/BB)','Glutes'],
        ['Good Morning (Barbell)','Legs'],
        ['Standing Calf Raise (Machine)','Calves'],['Seated Calf Raise (Machine)','Calves'],
        // Core
        ['Plank','Core'],['Hanging Leg Raise','Core'],['Captain’s Chair Knee Raise','Core'],
        ['Cable Crunch','Core'],['Ab Wheel Rollout','Core'],['Russian Twist (DB/Plate)','Core'],
        // Carry / Other
        ['Farmer\'s Carry (DB)','Core'],['Farmer\'s Carry (KB)','Core'],['Farmer\'s Carry (Trap Bar)','Core']
      ];
      const have=new Set(Store.data.exercises.map(e=>e.name.toLowerCase()));
      for (const [n,m] of seeds){ if(!have.has(n.toLowerCase())) Store.data.exercises.push({ id: uid(), name:n, muscle:m }); }
      Store.save(); render(); notice('Seeded common lifts');
    });
    $('#export', wrap).addEventListener('click', ()=>{
      download(toCSV(Store.data.exercises, ['id','name','muscle']), 'liftlog_exercises.csv', 'text/csv');
      notice('Exercises CSV exported');
    });
    return wrap;
  },

  Stats(){
    const wrap=document.createElement('div'); wrap.className='stack';
    const { byExercise, byMuscle } = computeStats();
    wrap.innerHTML = `
    <section class="panel card stack" aria-labelledby="st-h1">
      <div style="display:flex; align-items:center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
        <h1 id="st-h1" class="headline" style="margin:0;">Stats</h1>
        <div class="stack" style="grid-auto-flow: column; gap: 8px; display:grid;">
          <button class="btn" id="exportEx">Export by exercise (CSV)</button>
          <button class="btn" id="exportMu">Export by muscle (CSV)</button>
        </div>
      </div>
      <div class="grid">
        <div class="card" style="grid-column: span 7;">
          <h3>By Exercise</h3>
          <table role="table" aria-label="By exercise table">
            <thead><tr><th>Exercise</th><th>Muscle</th><th>Sets</th><th>Reps</th><th>Max Weight (kg)</th></tr></thead>
            <tbody id="exBody">${byExercise.map(r=>`<tr><td>${r.name}</td><td><span class="chip">${r.muscle}</span></td><td>${r.sets}</td><td>${r.reps}</td><td>${r.maxWeight}</td></tr>`).join('')}</tbody>
          </table>
          ${byExercise.length?'' : '<p class="muted">No data yet — do a session.</p>'}
        </div>
        <div class="card" style="grid-column: span 5;">
          <h3>By Muscle Group</h3>
          <table role="table" aria-label="By muscle table">
            <thead><tr><th>Muscle</th><th>Sets</th><th>Reps</th></tr></thead>
            <tbody id="muBody">${byMuscle.map(r=>`<tr><td><span class="chip">${r.muscle}</span></td><td>${r.sets}</td><td>${r.reps}</td></tr>`).join('')}</tbody>
          </table>
          ${byMuscle.length?'' : '<p class="muted">No data yet — do a session.</p>'}
        </div>
      </div>
    </section>`;
    $('#exportEx', wrap).addEventListener('click', ()=>{
      download(toCSV(computeStats().byExercise, ['name','muscle','sets','reps','maxWeight']), 'liftlog_stats_by_exercise.csv', 'text/csv');
      notice('Exported by-exercise');
    });
    $('#exportMu', wrap).addEventListener('click', ()=>{
      download(toCSV(computeStats().byMuscle, ['muscle','sets','reps']), 'liftlog_stats_by_muscle.csv', 'text/csv');
      notice('Exported by-muscle');
    });
    return wrap;
  },

  About(){
    const wrap=document.createElement('div'); wrap.className='stack';
    wrap.innerHTML = `
    <section class="panel card stack">
      <h1 class="headline" style="margin:0;">About LiftLog</h1>
      <p class="muted">A single-file weight training tracker. Catalogue your exercises, run sessions, log sets, and see stats — all in your browser.</p>
      <details class="card"><summary>Data model</summary>
        <pre class="muted" style="white-space:pre-wrap;">{
exercises: [{ id, name, muscle }],
sessions: [{ id, date, notes, done, items: [ { exerciseId, sets: [ { weight, reps } ] } ] }]
}</pre>
      </details>
      <div class="card"><button class="btn" id="reset">Reset all data</button></div>
      <div class="card"><h3>Install on mobile</h3><p class="muted">Android Chrome/Edge: use the <em>Install App</em> button in the top nav when eligible. iPhone Safari: Share → <strong>Add to Home Screen</strong>.</p></div>
    </section>`;
    $('#reset', wrap).addEventListener('click', ()=>{
      if(confirm('This will erase everything.')){
        Store.reset(); notice('Data cleared'); Router.go('/exercises');
      }
    });
    return wrap;
  },

  NotFound(){
    const div=document.createElement('div');
    div.innerHTML = `<div class="panel card" style="padding:18px;">Route not found. <a href="#/sessions">Go to sessions</a>.</div>`;
    return div;
  }
};

// Routes
Router.on('/sessions', Views.Sessions);
Router.on('/session', Views.SessionDetail);
Router.on('/exercises', Views.Exercises);
Router.on('/stats', Views.Stats);
Router.on('/about', Views.About);

// PWA: service worker register
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW register failed', err));
}

// A2HS button
(function setupA2HS(){
  const btn = document.getElementById('installBtn'); let deferred;
  window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferred = e; btn.style.display='inline-flex'; });
  btn?.addEventListener('click', async ()=>{ if(!deferred) return; deferred.prompt(); const { outcome } = await deferred.userChoice; notice('Install: '+ outcome); deferred = null; btn.style.display='none'; });
})();

// Boot (first-run seed)
if(!Store.data.exercises.length && !Store.data.sessions.length){
  Store.data.exercises.push(
    { id: uid(), name: 'Bench Press', muscle: 'Chest' },
    { id: uid(), name: 'Lat Pulldown', muscle: 'Back' },
    { id: uid(), name: 'Shoulder Press', muscle: 'Shoulders' }
  );
  Store.save();
}

// Start app
Router.start();

// --- Footer version text ---
const footer = document.getElementById("footer");
if (footer) {
  footer.textContent = `LiftLog ${APP_VERSION} — stores everything in your browser (localStorage). Export CSV any time.`;
}
