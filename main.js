#!/usr/bin/env node
/**
 * Investment Strategy Simulator
 * ==============================
 * Run:  node main.js
 *
 * 1. Prints a summary to the terminal
 * 2. Generates output/dashboard.html — a fully interactive dashboard
 *    with live parameter controls (no server needed, just open in browser)
 */

const fs = require("fs");
const path = require("path");
const cfg = require("./config");
const {
  simulateLumpSum, simulateMonthly, simulateLoanInvest, simulateMixed,
  applyInflation, applySerbianTax, fireNumber, monthsToFire,
} = require("./simulation");
const { SCENARIOS } = require("./scenarios");

// ── helpers ──────────────────────────────────────────────────────

function fmt(v) {
  if (Math.abs(v) >= 1e6) return v.toLocaleString("en", { maximumFractionDigits: 0 });
  return v.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pad(s, n, a = "right") { s = String(s); return a === "right" ? s.padStart(n) : s.padEnd(n); }

// ── strategies ───────────────────────────────────────────────────

function buildStrategies() {
  return [
    { label: "A: Monthly Only", fn: simulateMonthly, params: { monthly: cfg.MONTHLY_INVESTMENT, years: cfg.YEARS, yearlyIncreaseRate: 0 } },
    { label: "B: Loan + Invest", fn: simulateLoanInvest, params: { loanAmount: cfg.LOAN_AMOUNT, loanRate: cfg.LOAN_INTEREST_RATE, loanYears: cfg.LOAN_YEARS, investYears: cfg.YEARS, monthlyBudget: cfg.MONTHLY_BUDGET } },
    { label: "C: Lump Sum + Monthly", fn: simulateMixed, params: { initial: cfg.INITIAL_INVESTMENT, monthly: cfg.MONTHLY_INVESTMENT, years: cfg.YEARS, yearlyIncreaseRate: 0 } },
    { label: "D: Monthly + Yearly Raise", fn: simulateMonthly, params: { monthly: cfg.MONTHLY_INVESTMENT, years: cfg.YEARS, yearlyIncreaseRate: cfg.YEARLY_INVESTMENT_INCREASE_RATE } },
    { label: "E: Full Mixed + Raise", fn: simulateMixed, params: { initial: cfg.INITIAL_INVESTMENT, monthly: cfg.MONTHLY_INVESTMENT, years: cfg.YEARS, yearlyIncreaseRate: cfg.YEARLY_INVESTMENT_INCREASE_RATE } },
  ];
}

function runStrategy(label, fn, params, scenario) {
  const args = { ...params, annualReturn: scenario.annualReturn };
  if (scenario.returnsOverride) args.returnsOverride = scenario.returnsOverride;
  if (cfg.ENABLE_VOLATILITY) { args.enableVolatility = true; args.volatilityStd = cfg.VOLATILITY_STD; }

  const result = fn(args);
  result.strategy = label;
  result.scenario = scenario.name;
  result.realValues = applyInflation(result.monthlyValues, cfg.INFLATION_RATE);
  result.realFinal = result.realValues[result.realValues.length - 1];

  const taxInfo = applySerbianTax(result.contributions, result.growthFactors, cfg.TAX_RATE, cfg.TAX_EXEMPT_YEARS);
  Object.assign(result, taxInfo);

  return result;
}

// ── terminal summary ─────────────────────────────────────────────

function printSummary(results) {
  const div = "=".repeat(120);
  console.log(`\n${div}`);
  console.log(`INVESTMENT SIMULATION — Serbian Tax Rule (exempt after ${cfg.TAX_EXEMPT_YEARS}y, ${(cfg.TAX_RATE*100).toFixed(0)}% on gains held <${cfg.TAX_EXEMPT_YEARS}y)`);
  console.log(`Duration: ${cfg.YEARS}y | Inflation: ${(cfg.INFLATION_RATE*100).toFixed(1)}%`);
  console.log(div);

  let cur = null;
  for (const r of results) {
    if (r.scenario !== cur) {
      cur = r.scenario;
      console.log(`\n  ▸ ${cur}`);
      console.log(`  ${pad("Strategy",28,"left")} ${pad("Invested",14)} ${pad("Final",14)} ${pad("Profit",14)} ${pad("Tax",12)} ${pad("After Tax",14)} ${pad("Exempt%",8)}`);
      console.log(`  ${"-".repeat(28)} ${"-".repeat(14)} ${"-".repeat(14)} ${"-".repeat(14)} ${"-".repeat(12)} ${"-".repeat(14)} ${"-".repeat(8)}`);
    }
    let note = "";
    if (r.extra.totalInterestPaid != null) {
      note = `  [budget: ${fmt(r.extra.monthlyBudget)}/mo, loan: ${fmt(r.extra.monthlyPayment)}/mo, invest surplus: ${fmt(r.extra.monthlySurplus)}/mo, interest: ${fmt(r.extra.totalInterestPaid)}]`;
    }
    console.log(
      `  ${pad(r.strategy,28,"left")} ${pad(fmt(r.totalInvested),14)} ${pad(fmt(r.finalValue),14)} ${pad(fmt(r.profit),14)} ${pad(fmt(r.tax),12)} ${pad(fmt(r.profit - r.tax),14)} ${pad(r.exemptPct.toFixed(0)+"%",8)}${note}`
    );
  }

  const ft = fireNumber(cfg.FIRE_ANNUAL_EXPENSES, cfg.FIRE_WITHDRAWAL_RATE);
  console.log(`\n  FIRE target: ${fmt(ft)}`);
  for (const r of results.filter(r => r.scenario.includes("Base"))) {
    const m = monthsToFire(r.monthlyValues, ft);
    console.log(`    ${pad(r.strategy,28,"left")} ${m !== null ? `${Math.floor(m/12)}y ${m%12}m` : "not reached"}`);
  }
  console.log(`\n${div}\n`);
}

// ── Generate interactive HTML dashboard ──────────────────────────

function generateDashboard() {
  // Read the simulation.js source to embed in the HTML
  const simSource = fs.readFileSync(path.join(__dirname, "simulation.js"), "utf8")
    .replace(/if\s*\(typeof module[\s\S]*$/, ""); // strip the module.exports block

  const html = /*html*/`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Investment Simulator — Interactive</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js"><\/script>
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');

:root {
  --bg: #090b10;
  --surface: #12151e;
  --surface2: #1a1e2c;
  --surface3: #222738;
  --border: #2d3348;
  --text: #dfe1ec;
  --text-dim: #7c809a;
  --accent: #637cf7;
  --accent-glow: rgba(99,124,247,0.15);
  --green: #34d399;
  --red: #f87171;
  --orange: #fb923c;
  --cyan: #22d3ee;
  --purple: #a78bfa;
  --pink: #f472b6;
  --yellow: #fbbf24;
  --radius: 10px;
}

* { margin:0; padding:0; box-sizing:border-box; }

body {
  font-family: 'DM Sans', sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.55;
  min-height: 100vh;
}

/* ── Layout ────────────────────────────── */

.app { display: grid; grid-template-columns: 340px 1fr; min-height: 100vh; }

@media (max-width: 1100px) {
  .app { grid-template-columns: 1fr; }
  .sidebar { position: static; height: auto; border-right: none; border-bottom: 1px solid var(--border); }
}

/* ── Sidebar ───────────────────────────── */

.sidebar {
  background: var(--surface);
  border-right: 1px solid var(--border);
  padding: 28px 22px;
  overflow-y: auto;
  position: sticky;
  top: 0;
  height: 100vh;
}

.sidebar h1 {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.5px;
  background: linear-gradient(135deg, var(--accent), var(--cyan));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 6px;
}

.sidebar .tagline { font-size: 0.78rem; color: var(--text-dim); margin-bottom: 24px; }

.section-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--text-dim);
  margin: 20px 0 10px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.section-label:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }

.field { margin-bottom: 12px; }

.field label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 0.8rem;
  color: var(--text-dim);
  margin-bottom: 4px;
}

.field label .val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.78rem;
  color: var(--accent);
  font-weight: 600;
  min-width: 65px;
  text-align: right;
}

input[type="range"] {
  -webkit-appearance: none;
  width: 100%;
  height: 5px;
  border-radius: 3px;
  background: var(--surface3);
  outline: none;
  cursor: pointer;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--bg);
  box-shadow: 0 0 8px var(--accent-glow);
  cursor: pointer;
}

input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--bg);
  cursor: pointer;
}

.tax-badge {
  display: inline-block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(34,211,238,0.1);
  color: var(--cyan);
  border: 1px solid rgba(34,211,238,0.2);
  margin-top: 6px;
}

.run-btn {
  width: 100%;
  padding: 12px;
  margin-top: 20px;
  border: none;
  border-radius: var(--radius);
  background: linear-gradient(135deg, var(--accent), #4f5fd5);
  color: white;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all 0.2s;
  text-transform: uppercase;
}

.run-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 20px var(--accent-glow); }
.run-btn:active { transform: translateY(0); }

.auto-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--text-dim);
  margin-top: 10px;
  cursor: pointer;
}

.auto-label input { accent-color: var(--accent); cursor: pointer; }

/* ── Main content ──────────────────────── */

.main { padding: 32px 28px; overflow-x: hidden; }

/* ── Tabs ──────────────────────────────── */

.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 28px;
  background: var(--surface);
  border-radius: var(--radius);
  padding: 4px;
  border: 1px solid var(--border);
  overflow-x: auto;
}

.tab {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem;
  font-weight: 500;
  padding: 8px 16px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.tab:hover { color: var(--text); background: var(--surface2); }
.tab.active { background: var(--accent); color: white; }

.tab-content { display: none; }
.tab-content.active { display: block; }

/* ── Chart grid ────────────────────────── */

.chart-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(520px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.chart-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  transition: border-color 0.25s;
}

.chart-card:hover { border-color: var(--accent); }

.chart-card h3 {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 12px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.chart-card canvas { width: 100% !important; height: 300px !important; }
.chart-card.wide canvas { height: 380px !important; }

.dual { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
@media (max-width: 900px) { .dual { grid-template-columns: 1fr; } }

/* ── Table ─────────────────────────────── */

.table-wrap {
  overflow-x: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }

thead th {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-dim);
  padding: 12px 14px;
  text-align: right;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--surface);
}

thead th:first-child, thead th:nth-child(2) { text-align: left; }

tbody tr { transition: background 0.15s; }
tbody tr:hover { background: var(--surface2); }

tbody td {
  padding: 8px 14px;
  text-align: right;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.74rem;
  border-bottom: 1px solid rgba(45,51,72,0.4);
}

tbody td:first-child, tbody td:nth-child(2) {
  text-align: left;
  font-family: 'DM Sans', sans-serif;
  font-weight: 500;
}

.positive { color: var(--green); }
.negative { color: var(--red); }
.exempt-badge { color: var(--cyan); font-size: 0.68rem; }
.loan-note { font-size: 0.65rem; color: var(--orange); display: block; margin-top: 1px; }

/* ── FIRE banner ───────────────────────── */

.fire-banner {
  background: linear-gradient(135deg, rgba(99,124,247,0.08), rgba(34,211,238,0.08));
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px 24px;
  margin-bottom: 20px;
}

.fire-banner h3 {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  color: var(--cyan);
  margin-bottom: 4px;
}

.fire-banner p { color: var(--text-dim); font-size: 0.82rem; }
.fire-target { color: var(--yellow); font-weight: 700; font-size: 1.15rem; }

.fire-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }

.fire-chip {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--surface2);
  border: 1px solid var(--border);
}

/* ── Scenario filter ───────────────────── */

.scenario-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 20px;
}

.sc-btn {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.68rem;
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-dim);
  cursor: pointer;
  transition: all 0.2s;
}

.sc-btn:hover { border-color: var(--accent); color: var(--text); }
.sc-btn.active { background: var(--accent); color: white; border-color: var(--accent); }

footer {
  text-align: center;
  padding: 24px;
  color: var(--text-dim);
  font-size: 0.72rem;
  border-top: 1px solid var(--border);
  margin-top: 40px;
}
</style>
</head>
<body>
<div class="app">

<!-- ── SIDEBAR ──────────────────────────── -->
<aside class="sidebar">
  <h1>/// Invest Sim</h1>
  <p class="tagline">Interactive strategy analyzer</p>

  <div class="section-label">Investment</div>
  <div class="field">
    <label>Initial lump sum <span class="val" id="v_initial"></span></label>
    <input type="range" id="initial" min="0" max="100000" step="1000" value="${cfg.INITIAL_INVESTMENT}">
  </div>
  <div class="field">
    <label>Monthly contribution <span class="val" id="v_monthly"></span></label>
    <input type="range" id="monthly" min="0" max="5000" step="50" value="${cfg.MONTHLY_INVESTMENT}">
  </div>
  <div class="field">
    <label>Expected return <span class="val" id="v_return"></span></label>
    <input type="range" id="annualReturn" min="0" max="0.20" step="0.005" value="${cfg.INVESTMENT_GROWTH_RATE}">
  </div>
  <div class="field">
    <label>Years <span class="val" id="v_years"></span></label>
    <input type="range" id="years" min="5" max="50" step="1" value="${cfg.YEARS}">
  </div>

  <div class="section-label">Loan</div>
  <div class="field">
    <label>Loan amount <span class="val" id="v_loan"></span></label>
    <input type="range" id="loanAmount" min="0" max="200000" step="5000" value="${cfg.LOAN_AMOUNT}">
  </div>
  <div class="field">
    <label>Loan interest <span class="val" id="v_loanRate"></span></label>
    <input type="range" id="loanRate" min="0.01" max="0.15" step="0.005" value="${cfg.LOAN_INTEREST_RATE}">
  </div>
  <div class="field">
    <label>Loan term (years) <span class="val" id="v_loanYears"></span></label>
    <input type="range" id="loanYears" min="1" max="30" step="1" value="${cfg.LOAN_YEARS}">
  </div>
  <div class="field">
    <label>Monthly budget <span class="val" id="v_budget"></span></label>
    <input type="range" id="monthlyBudget" min="0" max="10000" step="100" value="${cfg.MONTHLY_BUDGET}">
  </div>
  <div class="tax-badge" style="background:rgba(251,146,60,0.1);color:var(--orange);border-color:rgba(251,146,60,0.2)">Budget → loan payment first, remainder invested</div>

  <div class="section-label">Tax (Serbian Rule)</div>
  <div class="field">
    <label>Tax rate <span class="val" id="v_tax"></span></label>
    <input type="range" id="taxRate" min="0" max="0.30" step="0.01" value="${cfg.TAX_RATE}">
  </div>
  <div class="field">
    <label>Tax-exempt after <span class="val" id="v_exemptYears"></span></label>
    <input type="range" id="exemptYears" min="0" max="30" step="1" value="${cfg.TAX_EXEMPT_YEARS}">
  </div>
  <div class="tax-badge">Gains on holdings ≥ exempt period = 0% tax</div>

  <div class="section-label">Other</div>
  <div class="field">
    <label>Inflation <span class="val" id="v_inflation"></span></label>
    <input type="range" id="inflation" min="0" max="0.10" step="0.005" value="${cfg.INFLATION_RATE}">
  </div>
  <div class="field">
    <label>Yearly raise <span class="val" id="v_raise"></span></label>
    <input type="range" id="raise" min="0" max="0.10" step="0.005" value="${cfg.YEARLY_INVESTMENT_INCREASE_RATE}">
  </div>

  <div class="section-label">FIRE</div>
  <div class="field">
    <label>Annual expenses <span class="val" id="v_fireExp"></span></label>
    <input type="range" id="fireExp" min="5000" max="100000" step="1000" value="${cfg.FIRE_ANNUAL_EXPENSES}">
  </div>
  <div class="field">
    <label>Withdrawal rate <span class="val" id="v_fireWr"></span></label>
    <input type="range" id="fireWr" min="0.02" max="0.08" step="0.005" value="${cfg.FIRE_WITHDRAWAL_RATE}">
  </div>

  <button class="run-btn" onclick="runAll()">▶ Run Simulation</button>
  <label class="auto-label"><input type="checkbox" id="autoRun" checked> Auto-run on change</label>
</aside>

<!-- ── MAIN ─────────────────────────────── -->
<div class="main">
  <div class="tabs">
    <button class="tab active" data-tab="byScenario">By Scenario</button>
    <button class="tab" data-tab="byStrategy">By Strategy</button>
    <button class="tab" data-tab="realNom">Real vs Nominal</button>
    <button class="tab" data-tab="fire">FIRE</button>
    <button class="tab" data-tab="table">Full Table</button>
    <button class="tab" data-tab="taxBreakdown">Tax Breakdown</button>
  </div>

  <!-- BY SCENARIO -->
  <div class="tab-content active" id="tab_byScenario">
    <div class="scenario-filter" id="scenarioFilter"></div>
    <div class="chart-grid" id="byScenarioCharts"></div>
  </div>

  <!-- BY STRATEGY -->
  <div class="tab-content" id="tab_byStrategy">
    <div class="chart-grid" id="byStrategyCharts"></div>
  </div>

  <!-- REAL VS NOMINAL -->
  <div class="tab-content" id="tab_realNom">
    <div class="dual" id="realNomCharts"></div>
  </div>

  <!-- FIRE -->
  <div class="tab-content" id="tab_fire">
    <div class="fire-banner" id="fireBanner"></div>
    <div class="chart-grid"><div class="chart-card wide"><h3>FIRE Progress — Base Case</h3><canvas id="fireChart"></canvas></div></div>
  </div>

  <!-- TABLE -->
  <div class="tab-content" id="tab_table">
    <div class="table-wrap">
      <table><thead><tr>
        <th>Scenario</th><th>Strategy</th><th>Invested</th><th>Final</th>
        <th>Profit</th><th>Taxable</th><th>Tax</th><th>After Tax</th><th>Exempt %</th>
      </tr></thead><tbody id="tableBody"></tbody></table>
    </div>
  </div>

  <!-- TAX BREAKDOWN -->
  <div class="tab-content" id="tab_taxBreakdown">
    <div class="chart-grid" id="taxCharts"></div>
  </div>

  <footer>Investment Simulator &middot; Serbian 10-year tax exemption rule &middot; Edit sliders and re-run</footer>
</div>

</div>

<script>
// ═══════════════════════════════════════════════════════════════════
// EMBEDDED SIMULATION ENGINE
// ═══════════════════════════════════════════════════════════════════
${simSource}

// ═══════════════════════════════════════════════════════════════════
// SCENARIOS (rebuilt dynamically based on current YEARS slider)
// ═══════════════════════════════════════════════════════════════════
function buildScenarios(years) {
  return [
    { name: "Base Case (7%)", annualReturn: 0.07, returnsOverride: null },
    { name: "Conservative (5%)", annualReturn: 0.05, returnsOverride: null },
    { name: "Aggressive (10%)", annualReturn: 0.10, returnsOverride: null },
    { name: "Bull Market (12%)", annualReturn: 0.12, returnsOverride: null },
    { name: "Bear (0% 5y→7%)", annualReturn: 0.07, returnsOverride: [...Array(Math.min(5,years)).fill(0), ...Array(Math.max(0,years-5)).fill(0.07)] },
    { name: "Crash (−30% Y1→7%)", annualReturn: 0.07, returnsOverride: [-0.30, ...Array(Math.max(0,years-1)).fill(0.07)] },
    { name: "Stagflation (2% 10y→7%)", annualReturn: 0.07, returnsOverride: [...Array(Math.min(10,years)).fill(0.02), ...Array(Math.max(0,years-10)).fill(0.07)] },
    { name: "Boom-Bust (15%/−10%)", annualReturn: 0.07, returnsOverride: Array.from({length:years}, (_,y) => y%2===0?0.15:-0.10) },
  ];
}

// ═══════════════════════════════════════════════════════════════════
// CHART MANAGEMENT
// ═══════════════════════════════════════════════════════════════════
const COLORS = ['#637cf7','#f87171','#34d399','#a78bfa','#fb923c','#22d3ee','#f472b6','#fbbf24'];
const chartInstances = {};

Chart.defaults.color = '#7c809a';
Chart.defaults.borderColor = 'rgba(45,51,72,0.5)';
Chart.defaults.font.family = "'DM Sans', sans-serif";

function makeChart(id, datasets, extra = {}) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
  const el = document.getElementById(id);
  if (!el) return;
  chartInstances[id] = new Chart(el.getContext('2d'), {
    type: 'line',
    data: {
      labels: extra.labels || [],
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        borderColor: ds.color || COLORS[i % COLORS.length],
        backgroundColor: (ds.color || COLORS[i % COLORS.length]) + '15',
        borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, fill: false,
        ...(ds.opts || {}),
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, font: { size: 10 } } },
        tooltip: {
          backgroundColor: '#1a1e2c', borderColor: '#2d3348', borderWidth: 1,
          titleFont: { family: "'JetBrains Mono',monospace", size: 10 },
          bodyFont: { family: "'JetBrains Mono',monospace", size: 10 },
          callbacks: { label: c => c.dataset.label + ': ' + c.parsed.y.toLocaleString('en',{maximumFractionDigits:0}) },
        },
      },
      scales: {
        x: { title: { display: true, text: 'Year' }, grid: { display: false } },
        y: {
          title: { display: true, text: extra.yLabel || 'Portfolio Value' },
          ticks: { callback: v => Math.abs(v)>=1e6?(v/1e6).toFixed(1)+'M':Math.abs(v)>=1e3?(v/1e3).toFixed(0)+'K':v },
        },
      },
    },
  });
}

function downsample(values) {
  const y = [];
  for (let i = 0; i < values.length; i += 12) y.push(Math.round(values[i]*100)/100);
  if ((values.length-1)%12!==0) y.push(Math.round(values[values.length-1]*100)/100);
  return y;
}

// ═══════════════════════════════════════════════════════════════════
// PARAM READING
// ═══════════════════════════════════════════════════════════════════
function getParams() {
  return {
    initial:     +document.getElementById('initial').value,
    monthly:     +document.getElementById('monthly').value,
    annualReturn:+document.getElementById('annualReturn').value,
    years:       +document.getElementById('years').value,
    loanAmount:  +document.getElementById('loanAmount').value,
    loanRate:    +document.getElementById('loanRate').value,
    loanYears:   +document.getElementById('loanYears').value,
    monthlyBudget: +document.getElementById('monthlyBudget').value,
    taxRate:     +document.getElementById('taxRate').value,
    exemptYears: +document.getElementById('exemptYears').value,
    inflation:   +document.getElementById('inflation').value,
    raise:       +document.getElementById('raise').value,
    fireExp:     +document.getElementById('fireExp').value,
    fireWr:      +document.getElementById('fireWr').value,
  };
}

function updateLabels() {
  const p = getParams();
  document.getElementById('v_initial').textContent     = p.initial.toLocaleString();
  document.getElementById('v_monthly').textContent     = p.monthly.toLocaleString();
  document.getElementById('v_return').textContent      = (p.annualReturn*100).toFixed(1)+'%';
  document.getElementById('v_years').textContent       = p.years+'y';
  document.getElementById('v_loan').textContent        = p.loanAmount.toLocaleString();
  document.getElementById('v_loanRate').textContent    = (p.loanRate*100).toFixed(1)+'%';
  document.getElementById('v_loanYears').textContent   = p.loanYears+'y';
  document.getElementById('v_budget').textContent      = p.monthlyBudget.toLocaleString();
  document.getElementById('v_tax').textContent         = (p.taxRate*100).toFixed(0)+'%';
  document.getElementById('v_exemptYears').textContent = p.exemptYears+'y';
  document.getElementById('v_inflation').textContent   = (p.inflation*100).toFixed(1)+'%';
  document.getElementById('v_raise').textContent       = (p.raise*100).toFixed(1)+'%';
  document.getElementById('v_fireExp').textContent     = p.fireExp.toLocaleString();
  document.getElementById('v_fireWr').textContent      = (p.fireWr*100).toFixed(1)+'%';
}

// ═══════════════════════════════════════════════════════════════════
// RUN SIMULATION
// ═══════════════════════════════════════════════════════════════════
let allResults = [];
let activeScenario = 'all';

function runAll() {
  const p = getParams();
  const scenarios = buildScenarios(p.years);
  const strategies = [
    { label:'A: Monthly Only', fn: simulateMonthly, params: {monthly:p.monthly, years:p.years, yearlyIncreaseRate:0} },
    { label:'B: Loan + Invest', fn: simulateLoanInvest, params: {loanAmount:p.loanAmount, loanRate:p.loanRate, loanYears:Math.min(p.loanYears,p.years), investYears:p.years, monthlyBudget:p.monthlyBudget} },
    { label:'C: Lump Sum + Monthly', fn: simulateMixed, params: {initial:p.initial, monthly:p.monthly, years:p.years, yearlyIncreaseRate:0} },
    { label:'D: Monthly + Yearly Raise', fn: simulateMonthly, params: {monthly:p.monthly, years:p.years, yearlyIncreaseRate:p.raise} },
    { label:'E: Full Mixed + Raise', fn: simulateMixed, params: {initial:p.initial, monthly:p.monthly, years:p.years, yearlyIncreaseRate:p.raise} },
  ];

  allResults = [];
  for (const sc of scenarios) {
    for (const st of strategies) {
      const args = { ...st.params, annualReturn: sc.annualReturn };
      if (sc.returnsOverride) args.returnsOverride = sc.returnsOverride;
      const r = st.fn(args);
      r.strategy = st.label;
      r.scenario = sc.name;
      r.realValues = applyInflation(r.monthlyValues, p.inflation);
      r.realFinal = r.realValues[r.realValues.length-1];
      const tax = applySerbianTax(r.contributions, r.growthFactors, p.taxRate, p.exemptYears);
      Object.assign(r, tax);
      allResults.push(r);
    }
  }

  renderAll(p);
}

// ═══════════════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════════════
function renderAll(p) {
  const scenarios = [...new Set(allResults.map(r=>r.scenario))];
  const strategies = [...new Set(allResults.map(r=>r.strategy))];
  const labels = Array.from({length:p.years+1},(_,i)=>i);

  // ── Scenario filter buttons
  const filterEl = document.getElementById('scenarioFilter');
  filterEl.innerHTML = '<button class="sc-btn '+(activeScenario==='all'?'active':'')+'" data-sc="all">All Scenarios</button>'
    + scenarios.map(sc => '<button class="sc-btn '+(activeScenario===sc?'active':'')+'" data-sc="'+sc+'">'+sc+'</button>').join('');

  // ── By Scenario charts
  const bsc = document.getElementById('byScenarioCharts');
  const visibleScenarios = activeScenario === 'all' ? scenarios : [activeScenario];
  bsc.innerHTML = visibleScenarios.map((sc,i) =>
    '<div class="chart-card"><h3>'+sc+'</h3><canvas id="bsc'+i+'"></canvas></div>'
  ).join('');
  visibleScenarios.forEach((sc,i) => {
    const ds = allResults.filter(r=>r.scenario===sc).map(r=>({label:r.strategy, data:downsample(r.monthlyValues)}));
    makeChart('bsc'+i, ds, {labels});
  });

  // ── By Strategy charts
  const bst = document.getElementById('byStrategyCharts');
  bst.innerHTML = strategies.map((st,i) =>
    '<div class="chart-card"><h3>'+st+'</h3><canvas id="bst'+i+'"></canvas></div>'
  ).join('');
  strategies.forEach((st,i) => {
    const ds = allResults.filter(r=>r.strategy===st).map(r=>({label:r.scenario, data:downsample(r.monthlyValues)}));
    makeChart('bst'+i, ds, {labels});
  });

  // ── Real vs Nominal
  const rvn = document.getElementById('realNomCharts');
  const baseR = allResults.filter(r=>r.scenario.includes('Base'));
  rvn.innerHTML = '<div class="chart-card"><h3>Nominal — Base Case</h3><canvas id="rvnNom"></canvas></div>'
                + '<div class="chart-card"><h3>Inflation-Adjusted — Base Case</h3><canvas id="rvnReal"></canvas></div>';
  makeChart('rvnNom', baseR.map(r=>({label:r.strategy, data:downsample(r.monthlyValues)})), {labels});
  makeChart('rvnReal', baseR.map(r=>({label:r.strategy, data:downsample(r.realValues)})), {labels, yLabel:'Real Value'});

  // ── FIRE
  const ft = fireNumber(p.fireExp, p.fireWr);
  const fb = document.getElementById('fireBanner');
  let fireHtml = '<h3>FIRE Analysis</h3><p>Target: <span class="fire-target">'+ft.toLocaleString('en',{maximumFractionDigits:0})+'</span>'
    + ' &nbsp;('+p.fireExp.toLocaleString()+'/yr at '+(p.fireWr*100).toFixed(1)+'% SWR)</p><div class="fire-chips">';
  for (const r of baseR) {
    const m = monthsToFire(r.monthlyValues, ft);
    fireHtml += '<div class="fire-chip">'+r.strategy+': '
      + (m!==null ? '<span class="positive">'+Math.floor(m/12)+'y '+m%12+'m</span>' : '<span class="negative">not reached</span>')
      + '</div>';
  }
  fb.innerHTML = fireHtml + '</div>';

  const fireDS = baseR.map(r=>({label:r.strategy, data:downsample(r.monthlyValues)}));
  fireDS.push({ label:'FIRE Target ('+ft.toLocaleString('en',{maximumFractionDigits:0})+')', data:Array(labels.length).fill(ft), opts:{borderDash:[8,4], borderWidth:2, borderColor:'#fbbf24'}, color:'#fbbf24' });
  makeChart('fireChart', fireDS, {labels});

  // ── Table
  const tbody = document.getElementById('tableBody');
  let html = '', lastSc = '';
  for (const r of allResults) {
    const scCell = r.scenario !== lastSc ? r.scenario : '';
    lastSc = r.scenario;
    const pc = r.profit >= 0 ? 'positive' : 'negative';
    const loan = r.extra.totalInterestPaid != null ? '<span class="loan-note">budget: '+r.extra.monthlyBudget.toLocaleString('en',{maximumFractionDigits:0})+'/mo, loan: '+Math.round(r.extra.monthlyPayment).toLocaleString('en')+'/mo, surplus: '+Math.round(r.extra.monthlySurplus).toLocaleString('en')+'/mo</span>' : '';
    html += '<tr>'
      +'<td>'+scCell+'</td>'
      +'<td>'+r.strategy+'</td>'
      +'<td>'+r.totalInvested.toLocaleString('en',{maximumFractionDigits:0})+'</td>'
      +'<td>'+r.finalValue.toLocaleString('en',{maximumFractionDigits:0})+'</td>'
      +'<td class="'+pc+'">'+r.profit.toLocaleString('en',{maximumFractionDigits:0})+loan+'</td>'
      +'<td>'+r.taxableGain.toLocaleString('en',{maximumFractionDigits:0})+'</td>'
      +'<td>'+r.tax.toLocaleString('en',{maximumFractionDigits:0})+'</td>'
      +'<td class="'+pc+'">'+(r.profit - r.tax).toLocaleString('en',{maximumFractionDigits:0})+'</td>'
      +'<td class="exempt-badge">'+r.exemptPct.toFixed(0)+'%</td>'
      +'</tr>';
  }
  tbody.innerHTML = html;

  // ── Tax Breakdown charts (base case: taxable vs exempt gain per strategy)
  const taxC = document.getElementById('taxCharts');
  taxC.innerHTML = '<div class="chart-card wide"><h3>Tax Breakdown by Strategy — Base Case</h3><canvas id="taxBar"></canvas></div>'
    + '<div class="chart-card wide"><h3>Tax-Exempt % Across All Scenarios</h3><canvas id="exemptBar"></canvas></div>';

  // Stacked bar: taxable vs exempt for base case
  if (chartInstances['taxBar']) { chartInstances['taxBar'].destroy(); }
  const taxBarEl = document.getElementById('taxBar');
  chartInstances['taxBar'] = new Chart(taxBarEl.getContext('2d'), {
    type: 'bar',
    data: {
      labels: baseR.map(r=>r.strategy),
      datasets: [
        { label:'Tax-Exempt Gain', data: baseR.map(r=>Math.round(r.exemptGain)), backgroundColor: '#22d3ee88', borderColor: '#22d3ee', borderWidth:1 },
        { label:'Taxable Gain', data: baseR.map(r=>Math.round(r.taxableGain)), backgroundColor: '#f8717188', borderColor: '#f87171', borderWidth:1 },
        { label:'Tax Paid', data: baseR.map(r=>Math.round(r.tax)), backgroundColor: '#fb923c88', borderColor: '#fb923c', borderWidth:1 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: { legend: { labels: { usePointStyle: true, pointStyle: 'rect', padding: 14 } },
        tooltip: { callbacks: { label: c => c.dataset.label+': '+c.parsed.y.toLocaleString('en',{maximumFractionDigits:0}) } } },
      scales: {
        x: { stacked: false, grid: { display: false } },
        y: { ticks: { callback: v => Math.abs(v)>=1e6?(v/1e6).toFixed(1)+'M':Math.abs(v)>=1e3?(v/1e3).toFixed(0)+'K':v } },
      },
    },
  });

  // Exempt % heatmap-style grouped bar
  if (chartInstances['exemptBar']) { chartInstances['exemptBar'].destroy(); }
  const exemptEl = document.getElementById('exemptBar');
  chartInstances['exemptBar'] = new Chart(exemptEl.getContext('2d'), {
    type: 'bar',
    data: {
      labels: scenarios,
      datasets: strategies.map((st, i) => ({
        label: st,
        data: scenarios.map(sc => {
          const r = allResults.find(r => r.strategy === st && r.scenario === sc);
          return r ? Math.round(r.exemptPct) : 0;
        }),
        backgroundColor: COLORS[i % COLORS.length] + 'aa',
        borderColor: COLORS[i % COLORS.length],
        borderWidth: 1,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: { legend: { labels: { usePointStyle: true, pointStyle: 'rect', padding: 14, font: { size: 10 } } },
        tooltip: { callbacks: { label: c => c.dataset.label+': '+c.parsed.y+'% exempt' } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 } } },
        y: { title: { display: true, text: '% of gains tax-exempt' }, max: 100, ticks: { callback: v => v+'%' } },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// EVENT WIRING
// ═══════════════════════════════════════════════════════════════════

// Tabs
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab_' + btn.dataset.tab).classList.add('active');
    // Resize charts in newly visible tab
    setTimeout(() => Object.values(chartInstances).forEach(c => c && c.resize()), 50);
  });
});

// Scenario filter (delegated)
document.getElementById('scenarioFilter').addEventListener('click', e => {
  if (e.target.classList.contains('sc-btn')) {
    activeScenario = e.target.dataset.sc;
    renderAll(getParams());
  }
});

// Sliders
let debounceTimer;
document.querySelectorAll('input[type="range"]').forEach(input => {
  input.addEventListener('input', () => {
    updateLabels();
    if (document.getElementById('autoRun').checked) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runAll, 200);
    }
  });
});

// Init
updateLabels();
runAll();
<\/script>
</body>
</html>`;

  return html;
}


// ── Main ─────────────────────────────────────────────────────────

function main() {
  console.log("\n🚀 Running investment simulations...\n");

  const strategies = buildStrategies();
  const allResults = [];
  for (const sc of SCENARIOS) {
    for (const { label, fn, params } of strategies) {
      allResults.push(runStrategy(label, fn, params, sc));
    }
  }

  printSummary(allResults);

  console.log("Generating interactive dashboard...\n");
  fs.mkdirSync(cfg.OUTPUT_DIR, { recursive: true });
  const html = generateDashboard();
  const outPath = path.join(cfg.OUTPUT_DIR, "dashboard.html");
  fs.writeFileSync(outPath, html);
  console.log("  Saved: " + outPath);
  console.log("  Open in your browser — all controls are interactive.\n");
  console.log("Done! ✅\n");
}

main();
