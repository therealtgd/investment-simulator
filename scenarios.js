/**
 * Scenarios — each has { name, annualReturn, returnsOverride }
 * Add new ones by pushing to SCENARIOS or using makeScenario().
 */

const { YEARS } = require("./config");

const SCENARIOS = [
  { name: "Base Case (7%)",          annualReturn: 0.07, returnsOverride: null },
  { name: "Conservative (5%)",       annualReturn: 0.05, returnsOverride: null },
  { name: "Aggressive (10%)",        annualReturn: 0.10, returnsOverride: null },
  { name: "Bull Market (12%)",       annualReturn: 0.12, returnsOverride: null },
  { name: "Bear (0% 5y → 7%)",      annualReturn: 0.07, returnsOverride: [...Array(5).fill(0), ...Array(Math.max(0, YEARS-5)).fill(0.07)] },
  { name: "Crash (−30% Y1 → 7%)",   annualReturn: 0.07, returnsOverride: [-0.30, ...Array(Math.max(0, YEARS-1)).fill(0.07)] },
  { name: "Stagflation (2% 10y → 7%)", annualReturn: 0.07, returnsOverride: [...Array(10).fill(0.02), ...Array(Math.max(0, YEARS-10)).fill(0.07)] },
  { name: "Boom-Bust (15%/−10%)",    annualReturn: 0.07, returnsOverride: Array.from({length: YEARS}, (_, y) => y % 2 === 0 ? 0.15 : -0.10) },
];

function makeScenario(name, annualReturn, returnsOverride = null) {
  return { name, annualReturn, returnsOverride };
}

module.exports = { SCENARIOS, makeScenario };
