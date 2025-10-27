import {
  BillItem,
  BudgetPersonResult,
  PayPeriod,
  PAY_PERIODS,
  PayoffResult,
  PersonFinancialProfile,
  SavingsPoint,
  formatCurrency,
} from '../lib/finance';

export interface PersonState extends PersonFinancialProfile {
  id: string;
  name: string;
}

interface PersonCardProps {
  person: PersonState;
  rentShare: number;
  budget: BudgetPersonResult;
  payoff: PayoffResult;
  savingsPoints: SavingsPoint[];
  onChange: (person: PersonState) => void;
}

const numberFromInput = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
};

const clampPercentage = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 80);
};

const renderCategoryRow = (label: string, amount: number, percentage: number) => (
  <div key={label} className="flex items-center justify-between rounded-lg bg-white/70 px-4 py-2">
    <div>
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <p className="text-xs text-slate-500">{percentage.toFixed(1)}%</p>
    </div>
    <p className="text-sm font-semibold text-slate-900">{formatCurrency(amount)}</p>
  </div>
);

const randomId = () => Math.random().toString(36).slice(2, 11);

const createBill = (label: string, amount = 0): BillItem => ({
  id: `bill-${randomId()}`,
  label,
  amount,
});

const PersonCard = ({ person, rentShare, budget, payoff, savingsPoints, onChange }: PersonCardProps) => {
  const handleFieldChange = <K extends keyof PersonState>(key: K, value: PersonState[K]) => {
    onChange({ ...person, [key]: value });
  };

  const handlePayPeriodChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    handleFieldChange('payPeriod', event.target.value as PayPeriod);
  };

  const handlePaycheckChange = (index: number, value: string) => {
    const next = person.paychecks.map((item, idx) => (idx === index ? numberFromInput(value) : item));
    handleFieldChange('paychecks', next);
  };

  const updateBill = (index: number, updater: (bill: BillItem) => BillItem) => {
    const next = person.bills.map((bill, idx) => (idx === index ? updater(bill) : bill));
    handleFieldChange('bills', next);
  };

  const handleBillAmountChange = (index: number, value: string) => {
    updateBill(index, (bill) => ({ ...bill, amount: numberFromInput(value) }));
  };

  const handleBillLabelChange = (index: number, value: string) => {
    updateBill(index, (bill) => ({ ...bill, label: value }));
  };

  const addPaycheck = () => {
    handleFieldChange('paychecks', [...person.paychecks, 0]);
  };

  const removePaycheck = (index: number) => {
    const next = person.paychecks.filter((_, idx) => idx !== index);
    handleFieldChange('paychecks', next.length > 0 ? next : [0]);
  };

  const addBill = () => {
    const nextLabel = `Bill ${person.bills.length + 1}`;
    handleFieldChange('bills', [...person.bills, createBill(nextLabel)]);
  };

  const removeBill = (index: number) => {
    const next = person.bills.filter((_, idx) => idx !== index);
    handleFieldChange('bills', next.length > 0 ? next : [createBill('Bill 1')]);
  };

  const sliderValueSavings = Math.min(Math.round(person.savingsRate * 100), 80);
  const sliderValueWants = Math.min(Math.round(person.wantsRate * 100), 80);

  const finalSavings = savingsPoints.length > 0 ? savingsPoints[savingsPoints.length - 1].amount : person.startingSavings;

  return (
    <section className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Budget Owner</p>
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-lg font-semibold text-slate-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            value={person.name}
            onChange={(event) => handleFieldChange('name', event.target.value)}
            placeholder="Name"
          />
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-400">Monthly Income</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(budget.monthlyIncome)}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <div>
            <label className="text-sm font-semibold text-slate-600">Pay Frequency</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              value={person.payPeriod}
              onChange={handlePayPeriodChange}
            >
              {PAY_PERIODS.map((period) => (
                <option key={period} value={period}>
                  {period}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-600">Recent Paychecks</label>
              <button
                type="button"
                onClick={addPaycheck}
                className="text-sm font-semibold text-primary hover:text-primary/80"
              >
                + Add Paycheck
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {person.paychecks.map((value, index) => (
                <div key={`paycheck-${person.id}-${index}`} className="flex items-center gap-3">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    value={value}
                    onChange={(event) => handlePaycheckChange(index, event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removePaycheck(index)}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 hover:border-danger/30 hover:text-danger"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-600">Monthly Bills</label>
              <button
                type="button"
                onClick={addBill}
                className="text-sm font-semibold text-primary hover:text-primary/80"
              >
                + Add Bill
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {person.bills.map((bill, index) => (
                <div key={bill.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <input
                    type="text"
                    value={bill.label}
                    onChange={(event) => handleBillLabelChange(index, event.target.value)}
                    placeholder={`Bill ${index + 1}`}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    aria-label={`Label for bill ${index + 1}`}
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    value={bill.amount}
                    onChange={(event) => handleBillAmountChange(index, event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeBill(index)}
                    className="justify-self-end rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 hover:border-danger/30 hover:text-danger"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Bill summary</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {person.bills.map((bill, index) => (
                  <li key={`${bill.id}-summary`} className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">{bill.label || `Bill ${index + 1}`}</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(bill.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-600">Groceries / month</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={person.groceries}
                onChange={(event) => handleFieldChange('groceries', numberFromInput(event.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p className="mt-1 text-xs text-slate-500">
                {budget.monthlyIncome > 0
                  ? `${((budget.groceries / budget.monthlyIncome) * 100).toFixed(1)}% of monthly income`
                  : '0.0% of monthly income'}
              </p>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-600">Gas / month</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={person.gas}
                onChange={(event) => handleFieldChange('gas', numberFromInput(event.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p className="mt-1 text-xs text-slate-500">
                {budget.monthlyIncome > 0
                  ? `${((budget.gas / budget.monthlyIncome) * 100).toFixed(1)}% of monthly income`
                  : '0.0% of monthly income'}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-600">Savings Slider</label>
              <div className="mt-1 rounded-2xl bg-slate-100 px-3 py-2">
                <input
                  type="range"
                  min={0}
                  max={80}
                  value={clampPercentage(sliderValueSavings)}
                  onChange={(event) => handleFieldChange('savingsRate', numberFromInput(event.target.value) / 100)}
                  className="w-full accent-primary"
                />
                <p className="mt-1 text-xs font-semibold text-slate-600">{sliderValueSavings}% of income</p>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-600">Wants Slider</label>
              <div className="mt-1 rounded-2xl bg-slate-100 px-3 py-2">
                <input
                  type="range"
                  min={0}
                  max={80}
                  value={clampPercentage(sliderValueWants)}
                  onChange={(event) => handleFieldChange('wantsRate', numberFromInput(event.target.value) / 100)}
                  className="w-full accent-accent"
                />
                <p className="mt-1 text-xs font-semibold text-slate-600">{sliderValueWants}% of income</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-600">Starting Savings</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={person.startingSavings}
                onChange={(event) => handleFieldChange('startingSavings', numberFromInput(event.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-600">Current Debt</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={person.startingDebt}
                onChange={(event) => handleFieldChange('startingDebt', numberFromInput(event.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-600">Monthly Allocation</p>
            <p className="text-xs text-slate-500">Includes rent share, fixed bills, and sliders.</p>
            <div className="mt-4 grid gap-3">
              {Object.entries(budget.totals).map(([key, value]) =>
                renderCategoryRow(key, value, budget.percentages[key] ?? 0),
              )}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Rent Share</p>
                <p className="text-sm font-semibold text-slate-700">{formatCurrency(rentShare)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-slate-400">% of Income</p>
                <p className="text-sm font-semibold text-slate-700">
                  {budget.monthlyIncome > 0 ? ((rentShare / budget.monthlyIncome) * 100).toFixed(1) : '0.0'}%
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-600">50 / 30 / 20 Alignment</p>
            <div className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-600">Needs</span>
                <span className="font-semibold text-slate-900">{budget.needsPercentage.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-600">Wants</span>
                <span className="font-semibold text-slate-900">{budget.wantsPercentage.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-600">Savings / Debt</span>
                <span className="font-semibold text-slate-900">{budget.savingsDebtPercentage.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-600">Debt & Savings Outlook</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>
                <span className="font-semibold text-slate-700">Debt contribution:</span>{' '}
                {formatCurrency(budget.debt)} per month
              </li>
              <li>
                {Number.isFinite(payoff.months) ? (
                  <>
                    <span className="font-semibold text-slate-700">Debt-free in:</span>{' '}
                    {payoff.months === 0 ? 'Already debt-free' : `${payoff.months} month${payoff.months === 1 ? '' : 's'}`}
                  </>
                ) : (
                  <span className="font-semibold text-danger">Increase debt payment to see a payoff timeline.</span>
                )}
              </li>
              <li>
                <span className="font-semibold text-slate-700">12-month savings:</span>{' '}
                {formatCurrency(finalSavings)}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PersonCard;
