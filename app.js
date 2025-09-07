/* ============================================================================
   LIFT LOG – Training Diary Edition
   Cleaner, modular structure with big headers for easy editing
   =========================================================================== */

/* =========================
   0) CONFIG & GLOBALS
   ========================= */
const APP = {
  storageKey: "liftlog.v3.records",
  ui: {
    metrics: document.getElementById("metricsWrap"),
    table: document.getElementById("tableWrap"),
    chart: document.getElementById("trendCanvas"),
    form: document.getElementById("addForm"),
    clearBtn: document.getElementById("clearBtn"),
  }
};

/* =========================
   1) UTILITIES
   ========================= */
function fmtNum(n, dp = 2) {
  return (n === null || n === undefined || isNaN(n)) ? "—" : Number(n).toFixed(dp);
}
function toISODate(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return null;
  return dt.toISOString().slice(0, 10);
}
function calcVolume(r) {
  return r.weight * r.reps * r.sets;
}
function epley1RM(weight, reps) {
  if (!weight || !reps) return null;
  return weight * (1 + reps / 30);
}

/* =========================
   2) DATA STORAGE
   ========================= */
const Store = {
  _cache: [],
  load() {
    try {
      this._cache = JSON.parse(localStorage.getItem(APP.storageKey)) || [];
    } catch {
      this._cache = [];
    }
    return this._cache;
  },
  save() {
    localStorage.setItem(APP.storageKey, JSON.stringify(this._cache));
  },
  all() {
    return this._cache.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  },
  add(rec) {
    rec.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    this._cache.push(rec);
    this.save();
  },
  clear() {
    this._cache = [];
    this.save();
  }
};

/* =========================
   3) RENDER: METRICS
   ========================= */
function renderMetrics(records) {
  if (!APP.ui.metrics) return;

  const totalVol = records.reduce((s, r) => s + calcVolume(r), 0);
  const sessions = records.length;
  const bestSet = records.reduce((m, r) => Math.max(m, r.weight * r.reps), 0);
  const best1RM = records.reduce((m, r) => Math.max(m, epley1RM(r.weight, r.reps) || 0), 0);

  APP.ui.metrics.innerHTML = `
    <div class="cards">
      <div class="card"><div class="label">Total Volume</div><div class="value">${fmtNum(totalVol, 0)}</div></div>
      <div class="card"><div class="label">Sessions</div><div class="value">${sessions}</div></div>
      <div class="card"><div class="label">Best Set</div><div class="value">${fmtNum(bestSet, 0)}</div></div>
      <div class="card"><div class="label">Est. 1RM</div><div class="value">${fmtNum(best1RM, 1)}</div></div>
    </div>
  `;
}

/* =========================
   4) RENDER: TABLE
   ========================= */
function renderTable(records) {
  if (!APP.ui.table) return;

  const rows = records.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${escapeHTML(r.lift)}</td>
      <td>${fmtNum(r.weight, 2)}</td>
      <td>${r.reps}</td>
      <td>${r.sets}</td>
      <td>${fmtNum(calcVolume(r), 0)}</td>
      <td>${escapeHTML(r.notes)}</td>
    </tr>
  `).join("");

  APP.ui.table.innerHTML = `
    <table class="logTable">
      <thead>
        <tr>
          <th>Date</th><th>Lift</th><th>Weight</th><th>Reps</th><th>Sets</th><th>Volume</th><th>Notes</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, m => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]
  ));
}

/* =========================
   5) RENDER: CHART (optional)
   ========================= */
function renderChart(records) {
  if (!APP.ui.chart || !window.Chart) return;

  const byDate = {};
  records.forEach(r => {
    byDate[r.date] = (byDate[r.date] || 0) + calcVolume(r);
  });

  const labels = Object.keys(byDate).sort();
  const data = labels.map(d => byDate[d]);

  if (APP.ui.chart._chart) APP.ui.chart._chart.destroy();

  const ctx = APP.ui.chart.getContext("2d");
  APP.ui.chart._chart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "Volume", data }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
}

/* =========================
   6) FORM HANDLING
   ========================= */
function wireForm(records) {
  if (!APP.ui.form) return;
  APP.ui.form.addEventListener("submit", e => {
    e.preventDefault();
    const fd = new FormData(APP.ui.form);
    const rec = {
      date: toISODate(fd.get("date")) || toISODate(new Date()),
      lift: fd.get("lift"),
      weight: Number(fd.get("weight")),
      reps: Number(fd.get("reps")),
      sets: Number(fd.get("sets")),
      notes: fd.get("notes") || ""
    };
    Store.add(rec);
    records.push(rec);
    renderAll(records);
    APP.ui.form.reset();
  });
}

/* =========================
   7) CLEAR DATA
   ========================= */
function wireClear(records) {
  if (!APP.ui.clearBtn) return;
  APP.ui.clearBtn.addEventListener("click", () => {
    if (!confirm("Clear all log entries?")) return;
    Store.clear();
    records.length = 0;
    renderAll(records);
  });
}

/* =========================
   8) MASTER RENDER
   ========================= */
function renderAll(records) {
  renderMetrics(records);
  renderTable(records);
  renderChart(records);
}

/* =========================
   9) INIT
   ========================= */
(function init() {
  const records = Store.load();
  renderAll(records);
  wireForm(records);
  wireClear(records);
  console.log("[LiftLog] Ready. Records:", records.length);
})();
