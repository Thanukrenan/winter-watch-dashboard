// Winter Watch dashboard — data-driven exercise frontend.
// Public GitHub Pages files must never contain API keys or secrets.

const DATA_URLS = {
  tonight: "https://bdaib-hub.pages.dev/data/winter/tonight.csv",
  routes: "https://bdaib-hub.pages.dev/data/winter/routes.csv",
  history: "https://bdaib-hub.pages.dev/data/winter/history.csv"
};

let loaded = { tonight: [], routes: [], history: [] };
let charts = {};

const $ = (id) => document.getElementById(id);
const norm = (value) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const first = (row, candidates) => {
  const keys = Object.keys(row || {});
  for (const candidate of candidates) {
    const key = keys.find(k => norm(k) === norm(candidate));
    if (key && row[key] !== "") return row[key];
  }
  return "";
};
const number = (value) => {
  const parsed = Number(String(value ?? "").replace(/[€,t% ]/gi, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};
const esc = (value) => String(value ?? "—").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

async function loadCsv(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const csv = await response.text();
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true, dynamicTyping: false });
  if (parsed.errors?.length && !parsed.data.length) throw new Error(parsed.errors[0].message);
  return parsed.data.filter(row => Object.values(row).some(v => String(v ?? "").trim() !== ""));
}

function setNotice(message, error = false) {
  const notice = $("dataNotice");
  notice.classList.toggle("error", error);
  notice.innerHTML = `<span>${error ? "!" : "●"}</span><div><b>${error ? "Data connection issue" : "Data connection"}</b><p>${esc(message)}</p></div>`;
}

async function refreshData() {
  $("refreshBtn").disabled = true;
  $("refreshBtn").textContent = "↻ Loading…";
  const results = await Promise.allSettled(Object.entries(DATA_URLS).map(async ([key, url]) => [key, await loadCsv(url)]));
  let success = 0;
  const failures = [];
  results.forEach(result => {
    if (result.status === "fulfilled") {
      loaded[result.value[0]] = result.value[1];
      success++;
    } else failures.push(result.reason?.message || "Unknown error");
  });
  renderAll();
  const stamp = new Date().toLocaleString();
  $("lastUpdated").textContent = `Last refresh attempt: ${stamp}`;
  if (success === 3) setNotice("All three exercise datasets loaded successfully. Dashboard figures are calculated from the source files.");
  else if (success > 0) setNotice(`${success} of 3 datasets loaded. Some sections may be incomplete. ${failures.join("; ")}`, true);
  else setNotice("The exercise CSV files could not be fetched. Check the source URLs or open the project through a local web server. No sample figures have been substituted.", true);
  $("refreshBtn").disabled = false;
  $("refreshBtn").innerHTML = "↻ <span>Refresh data</span>";
}

function renderRoutes() {
  const rows = loaded.routes;
  $("routeCount").textContent = rows.length || "—";
  $("routeStatus").textContent = rows.length ? `${rows.length} records loaded` : "Awaiting data";
  if (!rows.length) return;
  $("routesBody").innerHTML = rows.slice(0, 100).map(row => {
    const id = first(row, ["route_id","route","route_code","id","code","name"]);
    const priorityRaw = first(row, ["priority","priority_level","service_priority"]);
    const p = number(priorityRaw);
    const description = first(row, ["description","route_name","road","route_description","location"]);
    const length = first(row, ["length_km","length","distance_km","km"]);
    const badge = p ? `p${p}` : "";
    return `<tr><td><b>${esc(id || "—")}</b></td><td>${p ? `<span class="priority ${badge}">Priority ${p}</span>` : esc(priorityRaw || "—")}</td><td>${esc(description || "—")}</td><td>${esc(length ? `${length} km` : "—")}</td><td><span class="pill neutral">Registered</span></td></tr>`;
  }).join("");
}

function renderDepots() {
  const rows = loaded.tonight;
  if (!rows.length) return;
  // Tonight snapshot schema can vary by exercise release; identify depot-like records safely.
  const depotRows = rows.filter(r => first(r, ["depot","depot_name","depot_id","location"]));
  if (!depotRows.length) {
    $("depotsBody").innerHTML = `<tr><td colspan="3" class="empty">The loaded snapshot does not expose depot rows in the expected format. See source file fields.</td></tr>`;
    return;
  }
  const labels = [], stockValues = [], capacities = [];
  $("depotsBody").innerHTML = depotRows.map(row => {
    const name = first(row, ["depot","depot_name","depot_id","location"]);
    const stock = number(first(row, ["salt_stock_t","salt_stock","stock_tonnes","stock","salt_tonnes"]));
    const capacity = number(first(row, ["capacity_t","capacity","capacity_tonnes"]));
    const trucks = first(row, ["trucks_ready","vehicles_ready","trucks","vehicles"]);
    const pct = stock !== null && capacity > 0 ? Math.max(0, Math.min(100, stock / capacity * 100)) : null;
    if (stock !== null) { labels.push(name); stockValues.push(stock); capacities.push(capacity ?? 0); }
    return `<tr><td><b>${esc(name)}</b><br><small>${esc(trucks ? `${trucks} vehicles ready` : "Vehicle count unavailable")}</small></td><td>${stock === null ? "—" : `${stock} t`}</td><td class="stock-cell">${pct === null ? "—" : `${pct.toFixed(1)}%`}<div class="stock-track"><div class="stock-fill" style="width:${pct ?? 0}%"></div></div></td></tr>`;
  }).join("");
  drawChart("depotChart", "bar", { labels, datasets: [{ label: "Salt stock (tonnes)", data: stockValues, backgroundColor: "#5a9fba", borderRadius: 5 }, { label: "Capacity (tonnes)", data: capacities, backgroundColor: "#e5edf3", borderRadius: 5 }] });
}

function renderHistory() {
  const rows = loaded.history;
  if (!rows.length) return;
  const grouped = new Map();
  rows.forEach(row => {
    const winter = first(row, ["winter","winter_year","season","year"]);
    if (!winter) return;
    if (!grouped.has(winter)) grouped.set(winter, { runs: 0, incidents: 0 });
    const item = grouped.get(winter);
    const run = first(row, ["gritting_run","run","treated","treatment_run","is_treated"]);
    const incident = first(row, ["ice_incident","incident","ice_report","incident_count"]);
    if (["1","true","yes","y","treated"].includes(String(run).toLowerCase())) item.runs++;
    else if (number(run) !== null && number(run) > 0) item.runs += number(run);
    if (["1","true","yes","y","incident"].includes(String(incident).toLowerCase())) item.incidents++;
    else if (number(incident) !== null && number(incident) > 0) item.incidents += number(incident);
  });
  const labels = [...grouped.keys()].sort();
  const runValues = labels.map(k => grouped.get(k).runs);
  const incidentValues = labels.map(k => grouped.get(k).incidents);
  if (!labels.length) {
    $("runCount").textContent = "—";
    $("incidentCount").textContent = "—";
    return;
  }
  $("runCount").textContent = runValues.reduce((a,b)=>a+b,0).toLocaleString();
  $("incidentCount").textContent = incidentValues.reduce((a,b)=>a+b,0).toLocaleString();
  drawChart("historyChart", "bar", { labels, datasets: [{ label: "Treatment runs", data: runValues, backgroundColor: "#438bb8", borderRadius: 5 }] });
  drawChart("incidentChart", "line", { labels, datasets: [{ label: "Ice incidents", data: incidentValues, borderColor: "#d69a43", backgroundColor: "#f8e9d0", fill: true, tension: .35 }] });
}

function drawChart(id, type, data) {
  if (!window.Chart) return;
  if (charts[id]) charts[id].destroy();
  const ctx = $(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, {
    type, data,
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 9, usePointStyle: true, font: { family: "DM Sans", size: 10 } } } },
      scales: { x: { grid: { display: false }, ticks: { color: "#8191a0", font: { size: 9 } } }, y: { beginAtZero: true, grid: { color: "#edf1f4" }, ticks: { color: "#8191a0", font: { size: 9 } } } } }
  });
}

function renderAll() {
  renderRoutes();
  renderDepots();
  renderHistory();
}

function planAnswer(question) {
  const q = question.toLowerCase();
  if (q.includes("priority") || q.includes("route")) return "The 2026/27 plan sets Priority 1 routes (R01, R02, R07, R08 and R09) for treatment whenever ice is possible. Priority 2 routes (R03, R04 and R05) are treated when ice is likely. Priority 3 routes (R06 and R10) are treated only when ice is near certain and depot salt stock is at least 40%. The Duty Engineer makes the final decision.";
  if (q.includes("salt") || q.includes("stock")) return "The plan uses different ground-temperature thresholds by route priority. Priority 3 treatment also requires depot stock of at least 40% of capacity. Restocking should be ordered below 30% and typically takes about 9 days. When salt is short, protect the reserve for three Priority 1 nights.";
  if (q.includes("history") || q.includes("historical") || q.includes("winter")) return loaded.history.length ? `The history dataset currently contains ${loaded.history.length.toLocaleString()} rows. The charts summarise fields that could be identified in the supplied file. Please verify the source column definitions before using these totals in an operational report.` : "The historical dataset has not loaded yet, so I cannot provide a reliable historical summary.";
  if (q.includes("temperature") || q.includes("wet") || q.includes("ground")) return "The plan says to use forecast overnight ground or road-surface temperature, not air temperature. The road must also be wet or potentially wet (rain/drizzle, or dew point within 1°C of ground temperature). Thresholds: Priority 1 at or below +1.0°C; Priority 2 at or below +0.5°C; Priority 3 at or below −1.0°C, with the additional stock condition.";
  if (q.includes("truck") || q.includes("dispatch") || q.includes("leave")) return "This dashboard must never dispatch vehicles. The plan says spreading should finish at least one hour before ground temperature reaches 0°C. Allow about one hour per 20 km of route. Trucks cannot leave before 17:00 or after 05:00. The Duty Engineer must authorise and record the decision.";
  return "I can currently explain the service-plan rules and summarise datasets loaded on this page. The live AI connection is not configured yet. Try asking about route priorities, salt stock, ground temperature or truck timing.";
}

function addMessage(text, who) {
  const windowEl = $("chatWindow");
  const div = document.createElement("div");
  div.className = `chat-message ${who}`;
  if (who === "user") div.innerHTML = `<div class="bubble">${esc(text)}</div>`;
  else div.innerHTML = `<span class="avatar">✧</span><div><b>Winter Watch</b><p>${esc(text)}</p></div>`;
  windowEl.appendChild(div);
  windowEl.scrollTop = windowEl.scrollHeight;
}

$("chatForm").addEventListener("submit", event => {
  event.preventDefault();
  const input = $("chatInput");
  const question = input.value.trim();
  if (!question) return;
  addMessage(question, "user");
  addMessage(planAnswer(question), "assistant");
  input.value = "";
});
document.querySelectorAll(".suggestion").forEach(button => button.addEventListener("click", () => {
  $("chatInput").value = button.textContent;
  $("chatForm").requestSubmit();
}));
$("refreshBtn").addEventListener("click", refreshData);
refreshData();
