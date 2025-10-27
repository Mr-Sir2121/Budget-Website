export type PayPeriod = 'Semimonthly' | 'Weekly' | 'Biweekly';

export const PAY_PERIODS: PayPeriod[] = ['Semimonthly', 'Weekly', 'Biweekly'];

export interface BillItem {
  id: string;
  label: string;
  amount: number;
}

export interface PersonFinancialProfile {
  paychecks: number[];
  payPeriod: PayPeriod;
  bills: BillItem[];
  groceries: number;
  gas: number;
  savingsRate: number; // slider value 0-1
  wantsRate: number; // slider value 0-1
  startingDebt: number;
  startingSavings: number;
}

export interface BudgetPersonResult {
  monthlyIncome: number;
  rent: number;
  bills: number;
  groceries: number;
  gas: number;
  savings: number;
  wants: number;
  debt: number;
  totals: Record<string, number>;
  percentages: Record<string, number>;
  needsPercentage: number;
  wantsPercentage: number;
  savingsDebtPercentage: number;
}

export interface PayoffResult {
  months: number | typeof Infinity;
  debtSeries: { month: number; amount: number }[];
}

export interface SavingsProjectionInput {
  startingSavings: number;
  monthlySavings: number;
  months: number;
  debtContribution: number;
  payoff: PayoffResult;
}

export interface SavingsPoint {
  month: number;
  amount: number;
}

export const MONTHS_IN_YEAR = 12;

const MONTHLY_FACTORS: Record<PayPeriod, number> = {
  Semimonthly: 2,
  Weekly: 52 / MONTHS_IN_YEAR,
  Biweekly: 26 / MONTHS_IN_YEAR,
};

const clampCurrency = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

const roundCurrency = (value: number): number => Math.round(value * 100) / 100;

export const average = (values: number[]): number => {
  const cleaned = values.map((v) => clampCurrency(v));
  if (cleaned.length === 0) {
    return 0;
  }
  const total = cleaned.reduce((acc, v) => acc + v, 0);
  return total / cleaned.length;
};

export const monthlyFromPay = (averagePaycheck: number, period: PayPeriod): number => {
  const normalized = clampCurrency(averagePaycheck);
  const factor = MONTHLY_FACTORS[period];
  if (!factor) {
    throw new Error(`Unknown pay period: ${period}`);
  }
  return roundCurrency(normalized * factor);
};

export const sum = (values: number[]): number => values.reduce((acc, value) => acc + clampCurrency(value), 0);

export const computeBudgetPerson = (
  person: PersonFinancialProfile,
  rentShare: number,
): BudgetPersonResult => {
  const monthlyIncome = monthlyFromPay(average(person.paychecks), person.payPeriod);
  const rent = clampCurrency(rentShare);
  const bills = roundCurrency(sum(person.bills.map((bill) => bill.amount)));
  const groceries = roundCurrency(clampCurrency(person.groceries));
  const gas = roundCurrency(clampCurrency(person.gas));
  const savings = roundCurrency(clampCurrency(monthlyIncome * clampBetween(person.savingsRate, 0, 1)));
  const wants = roundCurrency(clampCurrency(monthlyIncome * clampBetween(person.wantsRate, 0, 1)));

  const remaining = monthlyIncome - (rent + bills + groceries + gas + savings + wants);
  const debt = roundCurrency(remaining > 0 ? remaining : 0);

  const totals: Record<string, number> = {
    Rent: rent,
    Bills: bills,
    Groceries: groceries,
    Gas: gas,
    Savings: savings,
    Wants: wants,
    Debt: debt,
  };

  const percentages: Record<string, number> = {};
  const base = monthlyIncome > 0 ? monthlyIncome : 1;
  Object.entries(totals).forEach(([key, value]) => {
    percentages[key] = Math.min(100, roundCurrency((value / base) * 100));
  });

  const needs = rent + bills + groceries + gas;
  const wantsBucket = wants;
  const savingsDebt = savings + debt;

  return {
    monthlyIncome,
    rent,
    bills,
    groceries,
    gas,
    savings,
    wants,
    debt,
    totals,
    percentages,
    needsPercentage: monthlyIncome > 0 ? roundCurrency((needs / monthlyIncome) * 100) : 0,
    wantsPercentage: monthlyIncome > 0 ? roundCurrency((wantsBucket / monthlyIncome) * 100) : 0,
    savingsDebtPercentage: monthlyIncome > 0 ? roundCurrency((savingsDebt / monthlyIncome) * 100) : 0,
  };
};

export const payoffMonths = (startingDebt: number, monthlyPayment: number): PayoffResult => {
  const debt = clampCurrency(startingDebt);
  const payment = clampCurrency(monthlyPayment);

  if (debt === 0) {
    return { months: 0, debtSeries: [] };
  }

  if (payment <= 0) {
    return { months: Infinity, debtSeries: [] };
  }

  const months = Math.ceil(debt / payment);
  const series: { month: number; amount: number }[] = [];
  for (let month = 0; month <= months; month += 1) {
    const remaining = Math.max(0, debt - payment * month);
    series.push({ month, amount: roundCurrency(remaining) });
  }
  if (series.length > 0) {
    series[series.length - 1].amount = 0;
  }
  return { months, debtSeries: series };
};

export const savingsProjection = ({
  startingSavings,
  monthlySavings,
  months,
  debtContribution,
  payoff,
}: SavingsProjectionInput): SavingsPoint[] => {
  const points: SavingsPoint[] = [];
  const baseSavings = clampCurrency(startingSavings);
  const monthly = clampCurrency(monthlySavings);
  const debtRoll = clampCurrency(debtContribution);
  let balance = baseSavings;

  for (let month = 1; month <= months; month += 1) {
    balance += monthly;
    if (Number.isFinite(payoff.months) && payoff.months > 0 && debtRoll > 0 && month > (payoff.months as number)) {
      balance += debtRoll;
    }
    points.push({ month, amount: roundCurrency(balance) });
  }
  return points;
};

const clampBetween = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
};

export const formatCurrency = (value: number, maximumFractionDigits = 2): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits,
  }).format(value);

export const verdictColor = (condition: boolean): 'success' | 'danger' => (condition ? 'success' : 'danger');
