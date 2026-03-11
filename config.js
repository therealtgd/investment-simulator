/**
 * Investment Simulation Configuration
 * ====================================
 * Serbian capital gains tax rule: tax only on assets held < 10 years.
 */

module.exports = {
  INITIAL_INVESTMENT: 10_000,
  MONTHLY_INVESTMENT: 500,
  INVESTMENT_GROWTH_RATE: 0.07,
  YEARS: 20,

  LOAN_AMOUNT: 50_000,
  LOAN_INTEREST_RATE: 0.05,
  LOAN_YEARS: 10,

  /**
   * Monthly budget available for investing. For the loan strategy,
   * the loan payment is deducted first and the remainder is invested.
   * After the loan is repaid, the full budget goes to investing.
   * Set this equal to MONTHLY_INVESTMENT for a fair comparison.
   */
  MONTHLY_BUDGET: 2_000,

  INFLATION_RATE: 0.03,

  // Serbian rule: 15% tax, exempt after 10 years
  TAX_RATE: 0.15,
  TAX_EXEMPT_YEARS: 10,

  YEARLY_INVESTMENT_INCREASE_RATE: 0.03,
  FIRE_ANNUAL_EXPENSES: 30_000,
  FIRE_WITHDRAWAL_RATE: 0.04,

  ENABLE_VOLATILITY: false,
  VOLATILITY_STD: 0.15,
  OUTPUT_DIR: "output",
};
