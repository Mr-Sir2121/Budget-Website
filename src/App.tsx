import { useEffect, useMemo, useState } from 'react';
import {
  BudgetPersonResult,
  PayPeriod,
  PayoffResult,
  SavingsPoint,
  average,
  computeBudgetPerson,
  formatCurrency,
  monthlyFromPay,
  payoffMonths,
  savingsProjection,
} from './lib/finance';
import PersonCard, { PersonState } from './components/PersonCard';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const STORAGE_KEY = 'budget-blueprint-state-v1';
const SAVINGS_MONTHS = 12;

const RECOMMENDED_BREAKDOWN = {
  Needs: 50,
  Wants: 30,
  'Savings & Debt': 20,
};

const CATEGORY_COLORS: Record<string, string> = {
  Rent: '#2563eb',
  Bills: '#9333ea',
  Groceries: '#f97316',
  Gas: '#facc15',
  Savings: '#10b981',
  Wants: '#ec4899',
  Debt: '#ef4444',
};

const PERSON_COLORS = ['#2563eb', '#9333ea', '#0ea5e9', '#14b8a6', '#f97316'];

type RentMode = 'fair' | 'equal';

interface BudgetState {
  rent: number;
  rentMode: RentMode;
  persons: PersonState[];
}

const PERSON_TEMPLATES: PersonState[] = [
  {
    id: 'person-1',
    name: 'Person 1',
    paychecks: [2342.97, 2342.97, 2342.97, 2342.97, 2342.97],
    payPeriod: 'Semimonthly',
    bills: [130.0, 228.0, 45.0, 16.0, 6.37, 21.26, 10.0],
    groceries: 400,
    gas: 120,
    savingsRate: 0.2,
    wantsRate: 0.2,
    startingDebt: 1765.01,
    startingSavings: 515.62,
  },
  {
    id: 'person-2',
    name: 'Person 2',
    paychecks: [
      421.98,
      473.98,
      599.3,
      826.44,
      624.78,
      873.6,
      451.88,
      682.76,
      475.8,
      730.08,
      835.24,
      759.2,
    ],
    payPeriod: 'Weekly',
    bills: [59.44, 150.0, 20.0, 16.0],
    groceries: 400,
    gas: 120,
    savingsRate: 0.2,
    wantsRate: 0.2,
    startingDebt: 5000,
    startingSavings: 11057.34,
  },
];

const clonePerson = (person: PersonState): PersonState => ({
  ...person,
  paychecks: [...person.paychecks],
  bills: [...person.bills],
});

const createDefaultState = (): BudgetState => ({
  rent: 2169.17,
  rentMode: 'fair',
  persons: PERSON_TEMPLATES.map(clonePerson),
});

const clampNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
};

const clampRate = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, 0), 1);
};

const sanitizePayPeriod = (value: unknown, fallback: PayPeriod): PayPeriod => {
  if (value === 'Semimonthly' || value === 'Weekly' || value === 'Biweekly') {
    return value;
  }
  return fallback;
};

const loadInitialState = (): BudgetState => {
  if (typeof window === 'undefined') {
    return createDefaultState();
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createDefaultState();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BudgetState>;
    const fallbackState = createDefaultState();

    if (!parsed || !Array.isArray(parsed.persons)) {
      return fallbackState;
    }

    const persons = fallbackState.persons.map((fallback, index) => {
      const stored = parsed.persons?.[index];
      if (!stored) {
        return fallback;
      }
      const paychecks = Array.isArray((stored as PersonState).paychecks) && (stored as PersonState).paychecks.length > 0
        ? (stored as PersonState).paychecks.map((value) => clampNumber(value, 0))
        : fallback.paychecks;

      const bills = Array.isArray((stored as PersonState).bills) && (stored as PersonState).bills.length > 0
        ? (stored as PersonState).bills.map((value) => clampNumber(value, 0))
        : fallback.bills;

      return {
        ...fallback,
        ...stored,
        id: fallback.id,
        name: typeof (stored as PersonState).name === 'string' && (stored as PersonState).name.trim().length > 0
          ? (stored as PersonState).name
          : fallback.name,
        payPeriod: sanitizePayPeriod((stored as PersonState).payPeriod, fallback.payPeriod),
        paychecks,
        bills,
        groceries: clampNumber((stored as PersonState).groceries, fallback.groceries),
        gas: clampNumber((stored as PersonState).gas, fallback.gas),
        savingsRate: clampRate((stored as PersonState).savingsRate, fallback.savingsRate),
        wantsRate: clampRate((stored as PersonState).wantsRate, fallback.wantsRate),
        startingDebt: clampNumber((stored as PersonState).startingDebt, fallback.startingDebt),
        startingSavings: clampNumber((stored as PersonState).startingSavings, fallback.startingSavings),
      } satisfies PersonState;
    });

    return {
      rent: clampNumber(parsed.rent, fallbackState.rent),
      rentMode: parsed.rentMode === 'equal' ? 'equal' : 'fair',
      persons,
    };
  } catch (error) {
    console.error('Failed to parse budget state', error);
    return createDefaultState();
  }
};

const App = () => {
  const [state, setState] = useState<BudgetState>(() => loadInitialState());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const setRent = (value: string) => {
    setState((prev) => ({ ...prev, rent: clampNumber(value, prev.rent) }));
  };

  const toggleRentMode = (mode: RentMode) => {
    setState((prev) => ({ ...prev, rentMode: mode }));
  };

  const updatePerson = (id: string, nextPerson: PersonState) => {
    setState((prev) => ({
      ...prev,
      persons: prev.persons.map((person) => (person.id === id ? { ...nextPerson, id } : person)),
    }));
  };

  const resetState = () => {
    const defaults = createDefaultState();
    setState(defaults);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    }
  };

  const clearPersistedState = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  };

  const persons = state.persons;

  const incomes = useMemo(
    () =>
      persons.map((person) =>
        monthlyFromPay(average(person.paychecks), person.payPeriod),
      ),
    [persons],
  );

  const totalIncome = incomes.reduce((acc, value) => acc + value, 0);
  const peopleCount = persons.length || 1;

  const rentSharesFair = incomes.map((income) => {
    if (totalIncome <= 0) {
      return state.rent / peopleCount;
    }
    return (income / totalIncome) * state.rent;
  });

  const rentSharesEqual = persons.map(() => (peopleCount > 0 ? state.rent / peopleCount : 0));

  const rentShares = state.rentMode === 'fair' ? rentSharesFair : rentSharesEqual;

  const budgets: BudgetPersonResult[] = persons.map((person, index) =>
    computeBudgetPerson(person, rentShares[index] ?? 0),
  );

  const payoffs: PayoffResult[] = persons.map((person, index) =>
    payoffMonths(person.startingDebt, budgets[index]?.debt ?? 0),
  );

  const savingsSeries: SavingsPoint[][] = persons.map((person, index) =>
    savingsProjection({
      startingSavings: person.startingSavings,
      monthlySavings: budgets[index]?.savings ?? 0,
      months: SAVINGS_MONTHS,
      debtContribution: budgets[index]?.debt ?? 0,
      payoff: payoffs[index] ?? { months: Infinity, debtSeries: [] },
    }),
  );

  const thirtyRule = incomes.map((income) => income * 0.3);
  const totalAffordableRent = thirtyRule.reduce((acc, value) => acc + value, 0);
  const affordable = state.rent <= totalAffordableRent;

  const rentVerdictLabel = affordable ? 'Affordable' : 'Stretch';
  const rentVerdictClass = affordable ? 'text-success' : 'text-danger';

  const rentComparisonRows = persons.map((person, index) => {
    const income = incomes[index] ?? 0;
    const fairShare = rentSharesFair[index] ?? 0;
    const equalShare = rentSharesEqual[index] ?? 0;
    return {
      id: person.id,
      name: person.name,
      income,
      cap: thirtyRule[index] ?? 0,
      fairShare,
      fairPercent: income > 0 ? (fairShare / income) * 100 : 0,
      equalShare,
      equalPercent: income > 0 ? (equalShare / income) * 100 : 0,
    };
  });

  const donutData = budgets.map((budget) =>
    Object.entries(budget.totals).map(([name, value]) => ({
      name,
      value,
    })),
  );

  const breakdownData = Object.keys(RECOMMENDED_BREAKDOWN).map((category) => {
    const row: Record<string, number | string> = {
      category,
      Recommended: RECOMMENDED_BREAKDOWN[category as keyof typeof RECOMMENDED_BREAKDOWN],
    };
    persons.forEach((person, index) => {
      const key = person.name || `Person ${index + 1}`;
      if (category === 'Needs') {
        row[key] = budgets[index]?.needsPercentage ?? 0;
      } else if (category === 'Wants') {
        row[key] = budgets[index]?.wantsPercentage ?? 0;
      } else {
        row[key] = budgets[index]?.savingsDebtPercentage ?? 0;
      }
    });
    return row;
  });

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-10 sm:px-6 lg:px-8">
      <header className="space-y-4 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1 text-sm font-semibold text-primary">
          <span role="img" aria-label="sparkles">
            ✨
          </span>
          Budget Blueprint
        </div>
        <h1 className="font-display text-4xl font-bold text-slate-900 sm:text-5xl">Plan a confident budget together</h1>
        <p className="mx-auto max-w-2xl text-base text-slate-600">
          Adjust pay, rent, bills, and savings goals to instantly see how your money flows. Your inputs are saved locally so you
          can fine-tune over time.
        </p>
      </header>

      <section className="rounded-3xl bg-white p-8 shadow-soft ring-1 ring-slate-200/60">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-slate-900">Rent guardrails</h2>
            <p className="mt-1 text-sm text-slate-600">Use the 30% rule to understand how the current rent fits your income mix.</p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-600">Monthly rent</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={state.rent}
                  onChange={(event) => setRent(event.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-base font-semibold text-slate-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-600">Recommended max (30%)</label>
                <p className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(totalAffordableRent)}</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-slate-600">Rent split mode:</span>
              <div className="inline-flex rounded-full bg-slate-100 p-1 text-sm font-semibold text-slate-600">
                <button
                  type="button"
                  onClick={() => toggleRentMode('fair')}
                  className={`rounded-full px-4 py-1 transition ${
                    state.rentMode === 'fair' ? 'bg-white text-primary shadow' : 'text-slate-500'
                  }`}
                >
                  Fair (income-based)
                </button>
                <button
                  type="button"
                  onClick={() => toggleRentMode('equal')}
                  className={`rounded-full px-4 py-1 transition ${
                    state.rentMode === 'equal' ? 'bg-white text-primary shadow' : 'text-slate-500'
                  }`}
                >
                  50 / 50 split
                </button>
              </div>
              <span className={`text-sm font-semibold ${rentVerdictClass}`}>{rentVerdictLabel}</span>
            </div>
          </div>

          <div className="flex-1 rounded-3xl bg-slate-50 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Rent comparison</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-600">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2">Person</th>
                    <th className="px-3 py-2">Monthly income</th>
                    <th className="px-3 py-2">30% rule</th>
                    <th className="px-3 py-2">Fair share</th>
                    <th className="px-3 py-2">Fair %</th>
                    <th className="px-3 py-2">50/50 share</th>
                    <th className="px-3 py-2">50/50 %</th>
                  </tr>
                </thead>
                <tbody>
                  {rentComparisonRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-200/60">
                      <td className="px-3 py-2 font-semibold text-slate-700">{row.name}</td>
                      <td className="px-3 py-2">{formatCurrency(row.income)}</td>
                      <td className="px-3 py-2">{formatCurrency(row.cap)}</td>
                      <td className={`px-3 py-2 ${state.rentMode === 'fair' ? 'text-primary font-semibold' : ''}`}>
                        {formatCurrency(row.fairShare)}
                      </td>
                      <td className={`px-3 py-2 ${state.rentMode === 'fair' ? 'text-primary font-semibold' : ''}`}>
                        {row.fairPercent.toFixed(1)}%
                      </td>
                      <td className={`px-3 py-2 ${state.rentMode === 'equal' ? 'text-primary font-semibold' : ''}`}>
                        {formatCurrency(row.equalShare)}
                      </td>
                      <td className={`px-3 py-2 ${state.rentMode === 'equal' ? 'text-primary font-semibold' : ''}`}>
                        {row.equalPercent.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-8">
        {persons.map((person, index) => (
          <PersonCard
            key={person.id}
            person={person}
            rentShare={rentShares[index] ?? 0}
            budget={budgets[index] ?? ({} as BudgetPersonResult)}
            payoff={payoffs[index] ?? { months: Infinity, debtSeries: [] }}
            savingsPoints={savingsSeries[index] ?? []}
            onChange={(next) => updatePerson(person.id, next)}
          />
        ))}
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        {persons.map((person, index) => (
          <div key={`donut-${person.id}`} className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{person.name} budget mix</h3>
                <p className="text-sm text-slate-500">Monthly categories as a share of income.</p>
              </div>
              <div className="text-right text-sm font-semibold text-slate-600">
                Income {formatCurrency(budgets[index]?.monthlyIncome ?? 0)}
              </div>
            </div>
            <div className="mt-6 h-72">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={donutData[index] ?? []}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="60%"
                    outerRadius="85%"
                    paddingAngle={4}
                  >
                    {(donutData[index] ?? []).map((entry) => (
                      <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] ?? '#64748b'} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(label) => label}
                  />
                  <Legend
                    align="center"
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ fontSize: '0.75rem' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-3xl bg-white p-8 shadow-soft ring-1 ring-slate-200/60">
        <h2 className="text-lg font-semibold text-slate-900">Recommended vs actual (50 / 30 / 20)</h2>
        <p className="text-sm text-slate-600">See how closely each plan aligns with the classic framework.</p>
        <div className="mt-6 h-96">
          <ResponsiveContainer>
            <BarChart data={breakdownData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5f5" />
              <XAxis dataKey="category" tick={{ fill: '#475569', fontSize: 12 }} />
              <YAxis tick={{ fill: '#475569', fontSize: 12 }} domain={[0, 100]} unit="%" />
              <Tooltip
                formatter={(value: number) => `${value.toFixed(1)}%`}
                labelFormatter={(label) => label}
              />
              <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
              <Bar dataKey="Recommended" fill="#94a3b8" radius={[6, 6, 0, 0]} />
              {persons.map((person, index) => (
                <Bar
                  key={`bar-${person.id}`}
                  dataKey={person.name || `Person ${index + 1}`}
                  fill={PERSON_COLORS[index % PERSON_COLORS.length]}
                  radius={[6, 6, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        {persons.map((person, index) => {
          const payoff = payoffs[index];
          const debtSeries = payoff?.debtSeries ?? [];
          const showDebtChart = Number.isFinite(payoff?.months) && (budgets[index]?.debt ?? 0) > 0 && debtSeries.length > 0;
          const savingsData = savingsSeries[index] ?? [];

          return (
            <div key={`projections-${person.id}`} className="space-y-6">
              <div className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
                <h3 className="text-lg font-semibold text-slate-900">{person.name} • 12-month savings</h3>
                <p className="text-sm text-slate-500">Includes rolled-in debt payments once balances hit zero.</p>
                <div className="mt-4 h-64">
                  <ResponsiveContainer>
                    <LineChart data={savingsData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fill: '#475569', fontSize: 12 }} />
                      <YAxis tick={{ fill: '#475569', fontSize: 12 }} tickFormatter={(value) => `$${value.toLocaleString()}`} />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label) => `Month ${label}`}
                      />
                      <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {showDebtChart ? (
                <div className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
                  <h3 className="text-lg font-semibold text-slate-900">{person.name} • Debt payoff</h3>
                  <p className="text-sm text-slate-500">Track balances as they fall month over month.</p>
                  <div className="mt-4 h-64">
                    <ResponsiveContainer>
                      <LineChart data={debtSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="month" tick={{ fill: '#475569', fontSize: 12 }} />
                        <YAxis tick={{ fill: '#475569', fontSize: 12 }} tickFormatter={(value) => `$${value.toLocaleString()}`} />
                        <Tooltip
                          formatter={(value: number) => formatCurrency(value)}
                          labelFormatter={(label) => `Month ${label}`}
                        />
                        <Line type="monotone" dataKey="amount" stroke="#ef4444" strokeWidth={3} dot />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl bg-slate-50 p-6 text-sm text-slate-600">
                  <p className="font-semibold text-slate-700">No debt payoff chart yet.</p>
                  <p className="mt-1">Increase the monthly debt allocation to reveal a payoff timeline.</p>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <footer className="rounded-3xl bg-slate-900 px-6 py-8 text-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-400">Next steps</p>
            <h2 className="text-2xl font-semibold text-white">Save your plan or refresh with defaults</h2>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={resetState}
              className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 shadow"
            >
              Load defaults
            </button>
            <button
              type="button"
              onClick={clearPersistedState}
              className="rounded-full border border-white/40 px-5 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              Clear saved inputs
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
