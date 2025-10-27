import { ReactNode, useMemo, useState } from 'react';

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

const randomId = () => Math.random().toString(36).slice(2, 11);

const createBill = (label: string, amount = 0): BillItem => ({
  id: `bill-${randomId()}`,
  label,
  amount,
});

type PanelKey = 'income' | 'essentials' | 'goals';

interface PanelProps {
  id: PanelKey;
  title: string;
  description: string;
  children: ReactNode;
}

const PersonCard = ({ person, rentShare, budget, payoff, savingsPoints, onChange }: PersonCardProps) => {
  const [openPanels, setOpenPanels] = useState<Record<PanelKey, boolean>>({
    income: true,
    essentials: false,
    goals: false,
  });

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

  const togglePanel = (key: PanelKey) => {
    setOpenPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const sliderValueSavings = Math.min(Math.round(person.savingsRate * 100), 80);
  const sliderValueWants = Math.min(Math.round(person.wantsRate * 100), 80);
  const rentPercent = budget.monthlyIncome > 0 ? (rentShare / budget.monthlyIncome) * 100 : 0;

  const finalSavings = savingsPoints.length > 0 ? savingsPoints[savingsPoints.length - 1].amount : person.startingSavings;
  const billCount = person.bills.length;

  const summaryItems = useMemo(
    () => [
      {
        label: 'Rent share',
        value: formatCurrency(rentShare),
        helper: `${rentPercent.toFixed(1)}% of income`,
      },
      {
        label: 'Monthly bills',
        value: formatCurrency(budget.bills),
        helper: `${billCount} recurring bill${billCount === 1 ? '' : 's'}`,
      },
      {
        label: 'Savings / month',
        value: formatCurrency(budget.savings),
        helper: `${sliderValueSavings}% slider`,
      },
      {
        label: 'Debt snowball',
        value: formatCurrency(budget.debt),
        helper: budget.debt > 0 ? 'Rolls into savings after payoff' : 'No extra debt this month',
      },
    ],
    [billCount, budget.bills, budget.debt, budget.savings, rentPercent, rentShare, sliderValueSavings],
  );

  const allocationEntries = useMemo(
    () =>
      Object.entries(budget.totals).map(([label, amount]) => ({
        label,
        amount,
        percentage: budget.percentages[label] ?? 0,
      })),
    [budget],
  );

  const Panel = ({ id, title, description, children }: PanelProps) => (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60">
      <button
        type="button"
        onClick={() => togglePanel(id)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-expanded={openPanels[id]}
      >
        <div>
          <p className="text-base font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        <span className="text-xl font-semibold text-primary" aria-hidden>
          {openPanels[id] ? '−' : '+'}
        </span>
      </button>
      {openPanels[id] ? (
        <div className="space-y-4 border-t border-slate-200 bg-white px-4 py-4 sm:px-6">{children}</div>
      ) : null}
    </div>
  );

  return (
    <section className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wide text-slate-400">Budget owner</p>
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-lg font-semibold text-slate-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            value={person.name}
            onChange={(event) => handleFieldChange('name', event.target.value)}
            placeholder="Name"
          />
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs uppercase tracking-wide text-slate-400">Monthly income</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(budget.monthlyIncome)}</p>
          <p className="text-xs text-slate-500">Averaged from recent paychecks.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryItems.map((item) => (
          <div key={item.label} className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{item.label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{item.value}</p>
            <p className="mt-1 text-xs text-slate-500">{item.helper}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-start">
        <div className="space-y-4">
          <Panel
            id="income"
            title="Income & paychecks"
            description="Capture frequency and keep pay history up to date."
          >
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-600" htmlFor={`${person.id}-pay-period`}>
                  Pay frequency
                </label>
                <select
                  id={`${person.id}-pay-period`}
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
                  <p className="text-sm font-semibold text-slate-600">Recent paychecks</p>
                  <button
                    type="button"
                    onClick={addPaycheck}
                    className="text-sm font-semibold text-primary hover:text-primary/80"
                  >
                    + Add paycheck
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {person.paychecks.map((value, index) => (
                    <div key={`paycheck-${person.id}-${index}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
                        className="self-start rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 hover:border-danger/30 hover:text-danger"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-500">We average these to calculate monthly income.</p>
              </div>

              <div className="rounded-2xl bg-slate-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Rent share</p>
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">{formatCurrency(rentShare)}</p>
                  <p className="text-sm font-semibold text-slate-700">{rentPercent.toFixed(1)}%</p>
                </div>
                <p className="mt-1 text-xs text-slate-500">Switch between fair and equal split from the rent section above.</p>
              </div>
            </div>
          </Panel>

          <Panel
            id="essentials"
            title="Essentials & bills"
            description="Tune groceries, gas, and recurring monthly bills."
          >
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold text-slate-600" htmlFor={`${person.id}-groceries`}>
                    Groceries / month
                  </label>
                  <input
                    id={`${person.id}-groceries`}
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
                  <label className="text-sm font-semibold text-slate-600" htmlFor={`${person.id}-gas`}>
                    Gas / month
                  </label>
                  <input
                    id={`${person.id}-gas`}
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

              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-600">Monthly bills</p>
                  <button
                    type="button"
                    onClick={addBill}
                    className="text-sm font-semibold text-primary hover:text-primary/80"
                  >
                    + Add bill
                  </button>
                </div>
                <div className="mt-2 space-y-3">
                  {person.bills.map((bill, index) => (
                    <div
                      key={bill.id}
                      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center"
                    >
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
              </div>

              <div className="rounded-2xl bg-white p-4">
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
          </Panel>

          <Panel
            id="goals"
            title="Goals & safety nets"
            description="Allocate savings and wants, then track balances."
          >
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold text-slate-600" htmlFor={`${person.id}-savings-slider`}>
                    Savings rate
                  </label>
                  <div className="mt-1 rounded-2xl bg-slate-100 px-3 py-2">
                    <input
                      id={`${person.id}-savings-slider`}
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
                  <label className="text-sm font-semibold text-slate-600" htmlFor={`${person.id}-wants-slider`}>
                    Wants rate
                  </label>
                  <div className="mt-1 rounded-2xl bg-slate-100 px-3 py-2">
                    <input
                      id={`${person.id}-wants-slider`}
                      type="range"
                      min={0}
                      max={80}
                      value={clampPercentage(sliderValueWants)}
                      onChange={(event) => handleFieldChange('wantsRate', numberFromInput(event.target.value) / 100)}
                      className="w-full accent-primary"
                    />
                    <p className="mt-1 text-xs font-semibold text-slate-600">{sliderValueWants}% of income</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold text-slate-600" htmlFor={`${person.id}-starting-savings`}>
                    Starting savings
                  </label>
                  <input
                    id={`${person.id}-starting-savings`}
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
                  <label className="text-sm font-semibold text-slate-600" htmlFor={`${person.id}-starting-debt`}>
                    Current debt
                  </label>
                  <input
                    id={`${person.id}-starting-debt`}
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

              <p className="text-xs text-slate-500">
                Debt contributions roll into savings once balances hit zero. Final savings after 12 months: {formatCurrency(finalSavings)}.
              </p>
            </div>
          </Panel>
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-600">Monthly allocation</p>
            <p className="text-xs text-slate-500">Includes rent share, fixed bills, essentials, and sliders.</p>
            <div className="mt-4 space-y-3">
              {allocationEntries.map((entry) => (
                <div
                  key={entry.label}
                  className="flex items-center justify-between rounded-xl bg-white/70 px-4 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{entry.label}</p>
                    <p className="text-xs text-slate-500">{entry.percentage.toFixed(1)}%</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{formatCurrency(entry.amount)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-600">50 / 30 / 20 alignment</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-600">Needs</span>
                <span className="font-semibold text-slate-900">{budget.needsPercentage.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-600">Wants</span>
                <span className="font-semibold text-slate-900">{budget.wantsPercentage.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-600">Savings / debt</span>
                <span className="font-semibold text-slate-900">{budget.savingsDebtPercentage.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-600">Debt & savings outlook</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>
                <span className="font-semibold text-slate-700">Debt contribution:</span> {formatCurrency(budget.debt)} per month
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
                <span className="font-semibold text-slate-700">12-month savings:</span> {formatCurrency(finalSavings)}
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default PersonCard;
