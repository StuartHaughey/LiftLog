/* ============================================================================
   LIFT LOG — CLEAN MODULAR APP.JS (GitHub Pages, no build tools)
   ----------------------------------------------------------------------------
   What you get:
   - Clear sections with banner headers (searchable “================”)
   - LocalStorage persistence (no backend)
   - CSV import/export (PapaParse optional; falls back to simple parser)
   - Metrics: total volume, sessions, top set, estimated 1RM (Epley)
   - Session table with sorting + filters
   - Trends: weekly volume chart (Chart.js if available, else skipped)
   - Comparisons: Last 4 weeks vs Prior 4 (deltas with colour)
   - Idiot-proof guards: missing DOM elements or libs won’t break the app
   ----------------------------------------------------------------------------
   Minimal HTML expectations (IDs):
     #uploadInput         <input type="file" />
     #exportBtn           <button>Export CSV</button>
     #addForm             <form> with fields: date, lift, weight, reps, sets, notes
     #metricsWrap         <div> metrics cards go here
     #tableWrap           <div> session table renders here
     #trendCanvas         <canvas> weekly chart (optional)
     #compareWrap         <div> comparison panel here
     #clearBtn            <button> clear all data
   ===========================================================================*/

/* =========================
   0) GLOBAL CONFIG & GUARDS
   ========================= */
const APP = {
  storageKey: "liftlog.v2.records",
  dateFormat: "YYYY-MM-DD",   // stored format
  ui: {
    metricsWrap:     document.getElementById("metricsWrap"),
    tableWrap:       document.getElementById("tableWrap"),
    trendCanvas:     document.getElementById("trendCanvas"),
    compareWrap:     document.getElementById("compareWrap"),
    uploadInput:     document.getElementById("uploadInput"),
    exportBtn:       document.getElementById("exportBtn"),
    clearBtn:        document.getElementById("clearBtn"),
    addForm:         document.getElementById("addForm")
  },
  colors: {
    green: "#1f9d55",
    red:   "#e3342f",
    amber: "#f2d024",
    gray:  "#94a3b8"
  }
};

// Defensive log helper
function logInfo(...args){ console.log("[LiftLog]", ...args); }
function logWarn(...args){ console.warn("[LiftLog]", ...args); }

/* =========================
   1) UTILITIES
   ========================= */
// Simple date helpers (no moment.js)
function toISODate(d) {
  if (!d) return null;
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt)) return null;
  return dt.toISOString().slice(0,10); // YYYY-MM-DD
}
function weekKey(isoDate) {
  // YYYY-Www (ISO week-ish; simple variant by taking Monday as first day)
  const d = new Date(isoDate + "T00:00:00");
  const day = (d.getDay()+6)%7; // Mon=0..Sun=6
  d.setDate(d.getDate() - day + 3); // move to Thu of current week
  const thursday = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(),0,1));
  const week = Math.floor((thursday - yearStart) / (7*24*3600*1000)) + 1;
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2,"0")}`;
}
function pad2(n){ return String(n).padStart(2,"0"); }
function fmtNumber(n, dp=2){ return (n===null||n===undefined||isNaN(n)) ? "—" : Number(n).toFixed(dp); }
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function epley1RM(weight, reps){
  // Epley formula: 1RM ≈ w * (1 + reps/30)
  if (!weight || !reps) return null;
  return weight * (1 + reps/30);
}
function csvEscape(val){
  if (val==null) return "";
  const s = String(val);
  return (/[",\n]/.test(s)) ? `"${s.replace(/"/g,'""')}"` : s;
}

/* =========================
   2) DATA MODEL & STORAGE
   ========================= */
// Record shape:
// { id, date: "YYYY-MM-DD", lift: "Bench Press", weight: 80, reps: 8, sets: 3, notes: "" }

const Store = {
  _cache: [],
  load(){
    try{
      const raw = localStorage.getItem(APP.storageKey);
      this._cache = raw ? JSON.parse(raw) : [];
    }catch(e){
      logWarn("Failed to read storage; starting empty", e);
      this._cache = [];
    }
    return this._cache;
  },
  save(){
    localStorage.setItem(APP.storageKey, JSON.stringify(this._cache));
  },
  all(){
    return this._cache.slice().sort((a,b)=> (a.date<b.date?-1: a.date>b.date?1:0));
  },
  add(rec){
    rec.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random());
    this._cache.push(rec); this.save();
  },
  replaceAll(list){
    this._cache = list.map(r=>({ ...r, id: r.id || (crypto.randomUUID?crypto.randomUUID():String(Math.random())) }));
    this.save();
  },
  clear(){
    this._cache = []; this.save();
  }
};

/* =========================
   3) CSV IMPORT / EXPORT
   ========================= */
// Light CSV parse (uses PapaParse if available)
function parseCSV(text){
  if (window.Papa){
    const out = Papa.parse(text, { header:true, skipEmptyLines:true });
    return out.data;
  }
  // simple parser: commas, basic quotes
  const lines = text.replace(/\r/g,"").split("\n").filter(Boolean);
  const header = splitCSVLine(lines.shift());
  return lines.map(line=>{
    const cols = splitCSVLine(line);
    const obj = {};
    header.forEach((h,i)=> obj[h.trim()] = cols[i]??"");
    return obj;
  });
}
function splitCSVLine(line){
  const out=[], re=/\s*(?:"([^"]*(?:""[^"]*)*)"|([^,]*))\s*(,|$)/gy;
  let m;
  while ((m=re.exec(line))){ out.push((m[1]||m[2]||"").replace(/""/g,'"')); if (!m[3]) break; }
  return out;
}
function exportCSV(records){
  const header = ["date","lift","weight","reps","sets","notes"];
  const rows = [header.join(",")].concat(
    records.map(r=> header.map(h=> csvEscape(r[h])).join(","))
  );
  return rows.join("\n");
}

/* =========================
   4) TRANSFORMS & METRICS
   ========================= */
function normaliseRecord(r){
  return {
    id: r.id || (crypto.randomUUID? crypto.randomUUID(): String(Math.random())),
    date: toISODate(r.date) || toISODate(new Date()),
    lift: (r.lift||"").trim(),
    weight: Number(r.weight)||0,
    reps: Number(r.reps)||0,
    sets: Number(r.sets)||0,
    notes: (r.notes||"").trim()
  };
}
function calcSessionVolume(r){ return r.weight*r.reps*r.sets; }
function aggregate(records){
  const byWeek = new Map();
  let totalVol = 0, totalSessions = 0, topSet = 0, top1RM = 0;

  records.forEach(r=>{
    const vol = calcSessionVolume(r);
    totalVol += vol;
    totalSessions += 1;
    topSet = Math.max(topSet, r.weight*r.reps);
    top1RM = Math.max(top1RM, epley1RM(r.weight, r.reps) || 0);
    const wk = weekKey(r.date);
    byWeek.set(wk, (byWeek.get(wk)||0) + vol);
  });

  // produce sorted weekly arrays
  const weeks = Array.from(byWeek.entries()).sort((a,b)=> a[0]<b[0]?-1:1);
  return { totalVol, totalSessions, topSet, top1RM, weeks };
}
function lastNWeeks(weeksArr, n){
  if (!weeksArr.length) return [];
  return weeksArr.slice(-n);
}
function sum(arr){ return arr.reduce((s,[,v])=> s+(v||0), 0); }

/* =========================
   5) RENDER: METRICS CARDS
   ========================= */
function renderMetrics(records){
  const el = APP.ui.metricsWrap;
  if (!el) return logWarn("metricsWrap missing; skipping metrics render.");
  const { totalVol, totalSessions, topSet, top1RM, weeks } = aggregate(records);

  el.innerHTML = `
    <div class="cards">
      <div class="card"><div class="label">Total Volume</div><div class="value">${fmtNumber(totalVol,0)}</div></div>
      <div class="card"><div class="label">Sessions</div><div class="value">${totalSessions}</div></div>
      <div class="card"><div class="label">Best Set (w×r)</div><div class="value">${fmtNumber(topSet,0)}</div></div>
      <div class="card"><div class="label">Est. 1RM</div><div class="value">${fmtNumber(top1RM,1)}</div></div>
    </div>
  `;

  // Mini 4-week momentum indicator (colour by delta)
  const last4 = sum(lastNWeeks(weeks,4));
  const prev4 = sum(lastNWeeks(weeks.slice(0,-4),4));
  const delta = last4 - prev4;
  const colour = delta > 0 ? APP.colors.green : (delta < 0 ? APP.colors.red : APP.colors.gray);
  const sign = delta>0 ? "+" : (delta<0 ? "−" : "");
  const note = weeks.length >= 8 ? `
    <div class="delta" style="color:${colour}">
      Last 4 weeks vs prior 4: ${sign}${fmtNumber(Math.abs(delta),0)}
    </div>` : `<div class="delta" style="color:${APP.colors.gray}">Not enough weeks for 4v4 yet</div>`;
  el.insertAdjacentHTML("beforeend", note);
}

/* =========================
   6) RENDER: SESSION TABLE
   ========================= */
function renderTable(records){
  const wrap = APP.ui.tableWrap;
  if (!wrap) return logWarn("tableWrap missing; skipping table render.");

  // Basic filters (optional: you can add inputs with these IDs)
  const liftFilter = (document.getElementById("filterLift")?.value || "").toLowerCase().trim();
  const fromDate = document.getElementById("filterFrom")?.value || "";
  const toDate   = document.getElementById("filterTo")?.value || "";

  const rows = records
    .filter(r => !liftFilter || r.lift.toLowerCase().includes(liftFilter))
    .filter(r => !fromDate || r.date >= fromDate)
    .filter(r => !toDate || r.date <= toDate)
    .sort((a,b)=> a.date<b.date ? 1 : (a.date>b.date ? -1 : 0)); // newest first

  const html = [
    `<table class="logTable">
       <thead>
         <tr>
          <th>Date</th><th>Lift</th><th>Weight</th><th>Reps</th><th>Sets</th><th>Volume</th><th>Notes</th>
         </tr>
       </thead>
       <tbody>
         ${rows.map(r=>`
           <tr>
            <td>${r.date}</td>
            <td>${escapeHTML(r.lift)}</td>
            <td>${fmtNumber(r.weight,2)}</td>
            <td>${r.reps}</td>
            <td>${r.sets}</td>
            <td>${fmtNumber(calcSessionVolume(r),0)}</td>
            <td>${escapeHTML(r.notes)}</td>
           </tr>`).join("")}
       </tbody>
     </table>`
  ].join("");

  wrap.innerHTML = html;
}
function escapeHTML(s){ return String(s).replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m])); }

/* =========================
   7) RENDER: WEEKLY TREND CHART
   ========================= */
function renderTrend(records){
  const canvas = APP.ui.trendCanvas;
  if (!canvas) return logWarn("trendCanvas missing; skipping chart.");
  const { weeks } = aggregate(records);
  const labels = weeks.map(([k])=>k);
  const data = weeks.map(([,v])=>v);

  if (!window.Chart){
    // No Chart.js loaded — clear canvas label area and bail gracefully
    const parent = canvas.parentElement;
    if (parent && !parent.querySelector(".noChart")){
      const div = document.createElement("div");
      div.className = "noChart";
      div.style.color = APP.colors.gray;
      div.style.padding = "8px 0";
      div.textContent = "Chart.js not detected — weekly trend chart skipped.";
      parent.appendChild(div);
    }
    return;
  }

  // If a chart instance already exists on this canvas, destroy it
  if (canvas._chartInstance){ canvas._chartInstance.destroy(); }

  const ctx = canvas.getContext("2d");
  canvas._chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Weekly Volume",
        data,
        borderWidth: 2,
        fill: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { autoSkip: true, maxTicksLimit: 12 }},
        y: { beginAtZero: true }
      }
    }
  });
}

/* =========================
   8) RENDER: COMPARISONS PANEL
   ========================= */
function renderComparisons(records){
  const wrap = APP.ui.compareWrap;
  if (!wrap) return logWarn("compareWrap missing; skipping comparisons.");

  const { weeks } = aggregate(records);
  const w = weeks.slice(); // [ [wkKey, volume], ... ]
  if (w.length < 8){
    wrap.innerHTML = `<div class="muted">Not enough weeks for comparisons (need ≥ 8).</div>`;
    return;
  }
  const current4 = w.slice(-4);
  const prior4   = w.slice(-8, -4);
  const curSum   = sum(current4), priSum = sum(prior4);
  const delta    = curSum - priSum;

  const colour = delta > 0 ? APP.colors.green : (delta < 0 ? APP.colors.red : APP.colors.gray);
  const sign   = delta > 0 ? "+" : (delta < 0 ? "−" : "");

  wrap.innerHTML = `
    <div class="compareRow">
      <div class="tile">
        <div class="label">Last 4 weeks</div>
        <div class="value">${fmtNumber(curSum,0)}</div>
      </div>
      <div class="tile">
        <div class="label">Prior 4 weeks</div>
        <div class="value">${fmtNumber(priSum,0)}</div>
      </div>
      <div class="tile">
        <div class="label">Δ Volume</div>
        <div class="value" style="color:${colour}">${sign}${fmtNumber(Math.abs(delta),0)}</div>
      </div>
    </div>
  `;
}

/* =========================
   9) CSV WIRING (UPLOAD / EXPORT)
   ========================= */
function wireCSV(recordsRef){
  const up = APP.ui.uploadInput;
  if (up){
    up.addEventListener("change", async (e)=>{
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const rows = parseCSV(text);
      // Expect headers: date,lift,weight,reps,sets,notes  (case-insensitive ok)
      const norm = rows.map(r => normaliseRecord({
        date: r.date || r.Date,
        lift: r.lift || r.Lift,
        weight: r.weight || r.Weight,
        reps: r.reps || r.Reps,
        sets: r.sets || r.Sets,
        notes: r.notes || r.Notes
      }));
      Store.replaceAll(norm);
      recordsRef.splice(0, recordsRef.length, ...Store.all()); // keep ref identity
      renderAll(recordsRef);
      up.value = ""; // reset
    });
  }

  const ex = APP.ui.exportBtn;
  if (ex){
    ex.addEventListener("click", ()=>{
      const csv = exportCSV(recordsRef);
      const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "liftlog_export.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }
}

/* =========================
   10) ADD-ENTRY FORM WIRING
   ========================= */
function wireAddForm(recordsRef){
  const form = APP.ui.addForm;
  if (!form) return;
  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    const fd = new FormData(form);
    const rec = normaliseRecord({
      date: fd.get("date"),
      lift: fd.get("lift"),
      weight: fd.get("weight"),
      reps: fd.get("reps"),
      sets: fd.get("sets"),
      notes: fd.get("notes")
    });
    Store.add(rec);
    recordsRef.push(rec);
    renderAll(recordsRef);
    form.reset();
  });
}

/* =========================
   11) CLEAR DATA
   ========================= */
function wireClear(recordsRef){
  const btn = APP.ui.clearBtn;
  if (!btn) return;
  btn.addEventListener("click", ()=>{
    if (!confirm("Clear all log entries? This cannot be undone.")) return;
    Store.clear();
    recordsRef.splice(0, recordsRef.length);
    renderAll(recordsRef);
  });
}

/* =========================
   12) MASTER RENDER
   ========================= */
function renderAll(records){
  renderMetrics(records);
  renderTable(records);
  renderTrend(records);
  renderComparisons(records);
}

/* =========================
   13) BOOTSTRAP
   ========================= */
(function init(){
  const records = Store.load().map(normaliseRecord); // harden
  Store.replaceAll(records); // ensure consistent schema
  const dataRef = Store.all(); // fresh sorted copy

  wireCSV(dataRef);
  wireAddForm(dataRef);
  wireClear(dataRef);

  renderAll(dataRef);
  logInfo("App initialised. Records:", dataRef.length);

  // Optional: live filters refresh (if you add #filterLift/#filterFrom/#filterTo)
  ["filterLift","filterFrom","filterTo"].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", ()=> renderTable(dataRef));
  });
})();
