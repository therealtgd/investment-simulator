/**
 * Simulation Engine
 * =================
 * Each function returns:
 *   monthlyValues    : number[]   portfolio value at each month
 *   totalInvested    : number
 *   finalValue       : number
 *   profit           : number
 *   contributions    : {month, amount}[]   for tax calculation
 *   growthFactors    : number[]            monthly (1+r) factors
 *   extra            : object              strategy-specific data
 */

// ── helpers ──────────────────────────────────────────────────────

function monthlyRate(annualRate) {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

function loanMonthlyPayment(principal, annualRate, years) {
  const r = monthlyRate(annualRate);
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function randNormal() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function buildMonthlyFactors(months, baseReturn, returnsOverride, enableVolatility, volatilityStd) {
  const yearsNeeded = Math.ceil(months / 12);
  let annual = [];

  if (returnsOverride) {
    annual = [...returnsOverride];
    while (annual.length < yearsNeeded) {
      annual.push(annual.length > 0 ? annual[annual.length - 1] : baseReturn);
    }
    annual = annual.slice(0, yearsNeeded);
  } else if (enableVolatility && volatilityStd > 0) {
    for (let y = 0; y < yearsNeeded; y++) {
      annual.push(baseReturn + volatilityStd * randNormal());
    }
  } else {
    annual = Array(yearsNeeded).fill(baseReturn);
  }

  const factors = new Array(months);
  for (let y = 0; y < yearsNeeded; y++) {
    const start = y * 12;
    const end = Math.min(start + 12, months);
    const mRate = 1 + monthlyRate(annual[y]);
    for (let m = start; m < end; m++) {
      factors[m] = mRate;
    }
  }
  return factors;
}

// ── strategy simulators ──────────────────────────────────────────

function simulateLumpSum({ initial, years, annualReturn = 0.07, returnsOverride = null,
                            enableVolatility = false, volatilityStd = 0 }) {
  const months = years * 12;
  const factors = buildMonthlyFactors(months, annualReturn, returnsOverride, enableVolatility, volatilityStd);
  const contributions = [{ month: 0, amount: initial }];

  const values = [initial];
  for (let m = 0; m < months; m++) {
    values.push(values[m] * factors[m]);
  }

  return {
    monthlyValues: values,
    totalInvested: initial,
    finalValue: values[values.length - 1],
    profit: values[values.length - 1] - initial,
    contributions,
    growthFactors: factors,
    extra: {},
  };
}

function simulateMonthly({ monthly, years, annualReturn = 0.07, yearlyIncreaseRate = 0,
                            returnsOverride = null, enableVolatility = false, volatilityStd = 0 }) {
  const months = years * 12;
  const factors = buildMonthlyFactors(months, annualReturn, returnsOverride, enableVolatility, volatilityStd);
  const contributions = [];

  const values = [0];
  let totalInvested = 0;
  let currentMonthly = monthly;

  for (let m = 0; m < months; m++) {
    if (m > 0 && m % 12 === 0) currentMonthly *= (1 + yearlyIncreaseRate);
    contributions.push({ month: m, amount: currentMonthly });
    values.push((values[m] + currentMonthly) * factors[m]);
    totalInvested += currentMonthly;
  }

  return {
    monthlyValues: values,
    totalInvested,
    finalValue: values[values.length - 1],
    profit: values[values.length - 1] - totalInvested,
    contributions,
    growthFactors: factors,
    extra: {},
  };
}

/**
 * Budget-aware loan investing:
 *  - You have a fixed monthlyBudget (e.g. 2000) for investing.
 *  - Borrow loanAmount, invest it ALL immediately at month 0.
 *  - Each month during loan: pay installment from budget, invest the remainder.
 *  - After loan is repaid: invest the full budget each month.
 *  - Chart shows NET POSITION = portfolio value − remaining loan balance.
 *  - This makes a fair comparison vs "just invest the full budget monthly".
 *
 *  If monthlyBudget < loan payment, the shortfall comes from salary (not portfolio).
 *  Nothing is invested that month, but the loan still gets paid.
 */
function simulateLoanInvest({ loanAmount, loanRate, loanYears, investYears,
                               monthlyBudget = 0,
                               annualReturn = 0.07, returnsOverride = null,
                               enableVolatility = false, volatilityStd = 0 }) {
  const months = investYears * 12;
  const loanMonths = loanYears * 12;
  const payment = loanMonthlyPayment(loanAmount, loanRate, loanYears);
  const factors = buildMonthlyFactors(months, annualReturn, returnsOverride, enableVolatility, volatilityStd);

  // Lump sum contribution at month 0 (the borrowed money)
  const contributions = [{ month: 0, amount: loanAmount }];

  // Simulate portfolio: lump sum grows + monthly surplus contributions
  const values = [loanAmount];
  let totalOutOfPocket = 0;

  // Loan balance amortisation
  const mr = monthlyRate(loanRate);
  const loanBalanceArr = [loanAmount];
  let totalLoanPaid = 0;

  for (let m = 0; m < months; m++) {
    let monthlyInvestment = 0;

    if (m < loanMonths) {
      // Pay loan from budget, invest the rest
      const surplus = Math.max(0, monthlyBudget - payment);
      monthlyInvestment = surplus;
      totalOutOfPocket += monthlyBudget; // entire budget is "spent" (loan + invest)
      totalLoanPaid += payment;

      // Amortise loan
      const interest = loanBalanceArr[m] * mr;
      const principalPaid = payment - interest;
      loanBalanceArr.push(Math.max(0, loanBalanceArr[m] - principalPaid));
    } else {
      // Loan fully repaid — invest the entire budget
      monthlyInvestment = monthlyBudget;
      totalOutOfPocket += monthlyBudget;
      loanBalanceArr.push(0);
    }

    if (monthlyInvestment > 0) {
      contributions.push({ month: m, amount: monthlyInvestment });
    }
    values.push((values[m] + monthlyInvestment) * factors[m]);
  }

  // Net position = portfolio minus outstanding debt
  const netValues = values.map((v, i) => v - loanBalanceArr[i]);

  const totalInterest = totalLoanPaid - loanAmount;
  const finalNet = netValues[netValues.length - 1];

  return {
    monthlyValues: netValues,
    portfolioValues: values,
    totalInvested: totalOutOfPocket,
    finalValue: finalNet,
    profit: finalNet - totalOutOfPocket,
    contributions,
    growthFactors: factors,
    extra: {
      loanAmount,
      monthlyPayment: payment,
      monthlyBudget,
      monthlySurplus: Math.max(0, monthlyBudget - payment),
      totalLoanPaid,
      totalInterestPaid: totalInterest,
      finalPortfolio: values[values.length - 1],
    },
  };
}

function simulateMixed({ initial, monthly, years, annualReturn = 0.07, yearlyIncreaseRate = 0,
                          returnsOverride = null, enableVolatility = false, volatilityStd = 0 }) {
  const months = years * 12;
  const factors = buildMonthlyFactors(months, annualReturn, returnsOverride, enableVolatility, volatilityStd);
  const contributions = [{ month: 0, amount: initial }];

  const values = [initial];
  let totalInvested = initial;
  let currentMonthly = monthly;

  for (let m = 0; m < months; m++) {
    if (m > 0 && m % 12 === 0) currentMonthly *= (1 + yearlyIncreaseRate);
    contributions.push({ month: m, amount: currentMonthly });
    values.push((values[m] + currentMonthly) * factors[m]);
    totalInvested += currentMonthly;
  }

  return {
    monthlyValues: values,
    totalInvested,
    finalValue: values[values.length - 1],
    profit: values[values.length - 1] - totalInvested,
    contributions,
    growthFactors: factors,
    extra: {},
  };
}

// ── post-processing ──────────────────────────────────────────────

function applyInflation(values, inflationRate) {
  const monthlyInf = Math.pow(1 + inflationRate, 1 / 12);
  return values.map((v, i) => v / Math.pow(monthlyInf, i));
}

/**
 * Serbian-style capital gains tax:
 * Tax is only applied on gains from contributions held < taxExemptYears.
 * Contributions held >= taxExemptYears are entirely tax-free.
 *
 * For each contribution, we calculate what it grew to by simulation end,
 * then determine if it qualifies for exemption based on holding period.
 */
function applySerbianTax(contributions, growthFactors, taxRate, taxExemptYears) {
  const totalMonths = growthFactors.length;
  const exemptMonths = taxExemptYears * 12;

  let taxableGain = 0;
  let exemptGain = 0;
  let totalGain = 0;

  for (const { month, amount } of contributions) {
    // Calculate what this contribution grew to by the end
    let grown = amount;
    for (let m = month; m < totalMonths; m++) {
      grown *= growthFactors[m];
    }
    const gain = grown - amount;
    const holdingMonths = totalMonths - month;

    if (holdingMonths >= exemptMonths) {
      exemptGain += gain;
    } else {
      taxableGain += gain;
    }
    totalGain += gain;
  }

  const tax = Math.max(0, taxableGain * taxRate);

  return {
    totalGain,
    taxableGain,
    exemptGain,
    tax,
    afterTaxProfit: totalGain - tax,
    exemptPct: totalGain > 0 ? (exemptGain / totalGain) * 100 : 0,
  };
}

function fireNumber(annualExpenses, withdrawalRate) {
  return annualExpenses / withdrawalRate;
}

function monthsToFire(monthlyValues, fireTarget) {
  const idx = monthlyValues.findIndex(v => v >= fireTarget);
  return idx >= 0 ? idx : null;
}

if (typeof module !== "undefined") {
  module.exports = {
    simulateLumpSum, simulateMonthly, simulateLoanInvest, simulateMixed,
    applyInflation, applySerbianTax, fireNumber, monthsToFire,
  };
}
