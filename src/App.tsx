import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BillItem,
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
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Label,
} from 'recharts';
import type { TooltipProps } from 'recharts';

const STORAGE_KEY = 'budget-blueprint-state-v1';
const SAVINGS_MONTHS = 12;

const SECTION_IDS = {
  overview: 'overview',
  income: 'income',
  rent: 'rent',
  bills: 'bills',
  breakdown: 'breakdown',
  projections: 'projections',
} as const;

const NAV_ITEMS = [
  { id: SECTION_IDS.overview, label: 'Overview' },
  { id: SECTION_IDS.income, label: 'Income' },
  { id: SECTION_IDS.rent, label: 'Rent' },
  { id: SECTION_IDS.bills, label: 'Bills' },
  { id: SECTION_IDS.breakdown, label: 'Breakdown' },
  { id: SECTION_IDS.projections, label: 'Projections' },
];

const formatRelativeTime = (timestamp: Date | null): string => {
  if (!timestamp) return 'Saved locally';
  const diff = Date.now() - timestamp.getTime();
  if (diff < 15_000) return 'Saved just now';
  if (diff < 60_000) return `Saved ${Math.floor(diff / 1000)}s ago`;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `Saved ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Saved ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Saved ${days}d ago`;
};

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

const createBill = (personId: string, index: number, label: string, amount: number): BillItem => ({
  id: `${personId}-bill-${index + 1}`,
  label,
  amount,
});

const PERSON_TEMPLATES: PersonState[] = [
  {
    id: 'person-1',
    name: 'Person 1',
    paychecks: [2342.97, 2342.97, 2342.97, 2342.97, 2342.97],
    payPeriod: 'Semimonthly',
    bills: [
      createBill('person-1', 0, 'Car Payment', 130.0),
      createBill('person-1', 1, 'Utilities', 228.0),
      createBill('person-1', 2, 'Phone', 45.0),
      createBill('person-1', 3, 'Streaming', 16.0),
      createBill('person-1', 4, 'Cloud Storage', 6.37),
      createBill('person-1', 5, 'Music', 21.26),
      createBill('person-1', 6, 'Miscellaneous', 10.0),
    ],
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
    bills: [
      createBill('person-2', 0, 'Car Insurance', 59.44),
      createBill('person-2', 1, 'Utilities', 150.0),
      createBill('person-2', 2, 'Subscriptions', 20.0),
      createBill('person-2', 3, 'Gym', 16.0),
    ],
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
  bills: person.bills.map((bill) => ({ ...bill })),
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

const sanitizeBills = (value: unknown, fallbackBills: BillItem[], personId: string): BillItem[] => {
  if (!Array.isArray(value) || value.length === 0) {
    return fallbackBills.map((bill, index) => ({
      id: bill.id && bill.id.length > 0 ? bill.id : `${personId}-bill-${index + 1}`,
      label: bill.label?.trim().length ? bill.label : `Bill ${index + 1}`,
      amount: clampNumber(bill.amount, 0),
    }));
  }

  const sanitized = (value as unknown[]).map((entry, index) => {
    const fallback = fallbackBills[index] ?? createBill(personId, index, `Bill ${index + 1}`, 0);
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const candidate = entry as Partial<BillItem>;
      const label =
        typeof candidate.label === 'string' && candidate.label.trim().length > 0
          ? candidate.label
          : fallback.label;
      const amount = clampNumber(candidate.amount, fallback.amount);
      const id = typeof candidate.id === 'string' && candidate.id.length > 0 ? candidate.id : fallback.id;
      return { id, label, amount } satisfies BillItem;
    }
    const amount = clampNumber(entry, fallback.amount);
    return { ...fallback, amount } satisfies BillItem;
  });

  return sanitized.map((bill, index) => ({
    id: bill.id && bill.id.length > 0 ? bill.id : `${personId}-bill-${index + 1}`,
    label: bill.label?.trim().length ? bill.label : `Bill ${index + 1}`,
    amount: clampNumber(bill.amount, 0),
  }));
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

      const bills = sanitizeBills((stored as PersonState).bills, fallback.bills, fallback.id);

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
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [highlightSaved, setHighlightSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<string>(SECTION_IDS.overview);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const savedAt = new Date();
    setLastSaved(savedAt);
    setHighlightSaved(true);
    const timeout = window.setTimeout(() => setHighlightSaved(false), 2000);
    return () => window.clearTimeout(timeout);
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

  const handleNavigate = useCallback((sectionId: string) => {
    if (typeof window === 'undefined') return;
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', `#${sectionId}`);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      setActiveSection(hash);
      window.setTimeout(() => handleNavigate(hash), 100);
    } else {
      setActiveSection(SECTION_IDS.overview);
    }
  }, [handleNavigate]);

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
  const rentVerdictBadgeClass = affordable
    ? 'border-success/20 bg-success/10 text-success'
    : 'border-danger/20 bg-danger/10 text-danger';

  const finalSavingsPerPerson = savingsSeries.map((series, index) => {
    if (series.length === 0) {
      return persons[index]?.startingSavings ?? 0;
    }
    return series[series.length - 1]?.amount ?? 0;
  });
  const combinedFinalSavings = finalSavingsPerPerson.reduce((acc, value) => acc + value, 0);
  const combinedStartingSavings = persons.reduce((acc, person) => acc + (person.startingSavings ?? 0), 0);
  const totalMonthlySavings = budgets.reduce((acc, budget) => acc + (budget.savings ?? 0), 0);
  const totalMonthlyDebt = budgets.reduce((acc, budget) => acc + (budget.debt ?? 0), 0);
  const totalBillSpend = budgets.reduce((acc, budget) => acc + (budget.bills ?? 0), 0);
  const savedStatus = formatRelativeTime(lastSaved);
  const savingsGain = Math.max(combinedFinalSavings - combinedStartingSavings, 0);

  const fastestPayoff = useMemo(() => {
    const finite = payoffs
      .map((payoff, index) => ({ payoff, person: persons[index] }))
      .filter(({ payoff }) => Number.isFinite(payoff?.months) && (payoff?.months ?? Infinity) > 0);
    if (finite.length === 0) return null;
    return finite.reduce((best, current) => {
      if (!best) return current;
      return (current.payoff.months as number) < (best.payoff.months as number) ? current : best;
    }, finite[0]);
  }, [payoffs, persons]);

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

  const pieTooltipFormatter = useCallback<NonNullable<TooltipProps<number, string>['formatter']>>((value, _name, payload) => {
    const percentSource = (payload as { percent?: number } | undefined)?.percent;
    const percentValue = typeof percentSource === 'number' ? (percentSource * 100).toFixed(1) : '0.0';
    return [formatCurrency(value), `${percentValue}%`];
  }, []);

  return (

    <div className="bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <header id={SECTION_IDS.overview} className="space-y-6">
          <div className="space-y-4 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1 text-sm font-semibold text-primary">
              <span role="img" aria-label="sparkles">
                ✨
              </span>
              Budget Blueprint
            </div>
            <h1 className="font-display text-4xl font-bold text-slate-900 sm:text-5xl lg:text-6xl">
              Plan a confident budget together
            </h1>
            <p className="mx-auto max-w-2xl text-base text-slate-600 lg:mx-0">
              Adjust income, rent, bills, and savings goals to watch your plan respond instantly. Everything saves securely to
              this browser so you can come back anytime.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-slate-600 sm:justify-between">
            <p className="flex items-center gap-2 text-sm font-medium">
              <span role="img" aria-label="lightbulb">
                💡
              </span>
              Change any number to see the ripple effects across the entire plan in real time.
            </p>
            <div
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                highlightSaved ? 'border-success/40 bg-success/10 text-success' : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              <span role="img" aria-label="disk">
                💾
              </span>
              {savedStatus}
            </div>
          </div>
        </header>

        <nav className="sticky top-4 z-30 mt-8">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-full bg-white/80 px-4 py-3 shadow-soft ring-1 ring-slate-200/60 backdrop-blur">
            <div className="flex flex-wrap gap-2">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`rounded-full px-4 py-1 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    activeSection === item.id ? 'bg-primary text-white shadow' : 'text-slate-600 hover:bg-primary/10 hover:text-primary'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={resetState}
                className="rounded-full bg-primary px-4 py-1 text-sm font-semibold text-white shadow transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Load defaults
              </button>
              <button
                type="button"
                onClick={clearPersistedState}
                className="rounded-full border border-slate-200 px-4 py-1 text-sm font-semibold text-slate-600 transition hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Clear saved inputs
              </button>
            </div>
          </div>
        </nav>

        <section aria-labelledby="overview-heading" className="mt-10 space-y-6">
          <div>
            <h2 id="overview-heading" className="text-lg font-semibold text-slate-900">
              Household snapshot
            </h2>
            <p className="text-sm text-slate-600">Headline numbers that summarize the health of your plan.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Combined monthly income</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{formatCurrency(totalIncome)}</p>
              <p className="mt-1 text-sm text-slate-500">Across {persons.length} income stream{persons.length === 1 ? '' : 's'}.</p>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Monthly rent</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-3xl font-bold text-slate-900">{formatCurrency(state.rent)}</p>
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${rentVerdictBadgeClass}`}>
                  <span className="inline-block h-2 w-2 rounded-full bg-current" aria-hidden />
                  {rentVerdictLabel}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">30% guideline total: {formatCurrency(totalAffordableRent)}</p>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">12-month savings</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{formatCurrency(combinedFinalSavings)}</p>
              <p className="mt-1 text-sm text-slate-500">Projected gain: {formatCurrency(savingsGain)} vs. today.</p>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Debt momentum</p>
              {fastestPayoff ? (
                <>
                  <p className="mt-2 text-3xl font-bold text-slate-900">{(fastestPayoff.payoff.months as number).toFixed(0)} months</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {fastestPayoff.person.name} clears debt first with {formatCurrency(budgets[persons.indexOf(fastestPayoff.person)]?.debt ?? 0)} per month.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-3xl font-bold text-slate-900">No payoff yet</p>
                  <p className="mt-1 text-sm text-slate-500">Increase debt contributions to unlock a timeline.</p>
                </>
              )}
            </div>
          </div>
        </section>

        <section id={SECTION_IDS.income} className="mt-16 space-y-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Income & personal plans</h2>
              <p className="text-sm text-slate-600">
                Capture pay history, essentials, and goals for each person. Inputs are grouped so you can focus on one area at a
                time.
              </p>
            </div>
            <div className="text-sm text-slate-500">
              Monthly savings: {formatCurrency(totalMonthlySavings)} • Extra debt snowball: {formatCurrency(totalMonthlyDebt)}
            </div>
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
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
          </div>
        </section>

        <section id={SECTION_IDS.rent} className="mt-16 space-y-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Rent guardrails</h2>
              <p className="text-sm text-slate-600">Compare your rent against the 30% rule and choose a fair or equal split.</p>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${rentVerdictBadgeClass}`}>
              <span className="inline-block h-2 w-2 rounded-full bg-current" aria-hidden />
              {rentVerdictLabel}
            </span>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-slate-600" htmlFor="rent-input">
                    Monthly rent
                  </label>
                  <input
                    id="rent-input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={state.rent}
                    onChange={(event) => setRent(event.target.value)}
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-base font-semibold text-slate-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    aria-describedby="rent-helper"
                  />
                  <p id="rent-helper" className="mt-1 text-xs text-slate-500">
                    Try adjusting rent to instantly see the affordability verdict.
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">30% guideline</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(totalAffordableRent)}</p>
                  <p className="mt-1 text-xs text-slate-500">Combined cap based on each person's income.</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-600">Rent split mode</p>
                  <div className="mt-2 inline-flex rounded-full bg-slate-100 p-1 text-sm font-semibold text-slate-600">
                    <button
                      type="button"
                      onClick={() => toggleRentMode('fair')}
                      className={`rounded-full px-4 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                        state.rentMode === 'fair' ? 'bg-white text-primary shadow' : 'text-slate-500'
                      }`}
                    >
                      Fair (income-based)
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleRentMode('equal')}
                      className={`rounded-full px-4 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                        state.rentMode === 'equal' ? 'bg-white text-primary shadow' : 'text-slate-500'
                      }`}
                    >
                      50 / 50 split
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Fair mode weights rent by each person's income; equal mode splits it down the middle.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Rent comparison</h3>
              <p className="mt-1 text-xs text-slate-500">Percentages show how much of each income goes to rent.</p>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm text-slate-600">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-2">Person</th>
                      <th className="px-3 py-2">Monthly income</th>
                      <th className="px-3 py-2">30% cap</th>
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

        <section id={SECTION_IDS.bills} className="mt-16 space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Bills & fixed expenses</h2>
              <p className="text-sm text-slate-600">
                Review recurring bills for each person. Expand a card to edit labels and amounts in their plan above.
              </p>
            </div>
            <p className="text-sm text-slate-500">Household fixed bills: {formatCurrency(totalBillSpend)}</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {persons.map((person, index) => (
              <div key={`bills-${person.id}`} className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{person.name}</h3>
                    <p className="text-sm text-slate-500">Fixed bills total each month.</p>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{formatCurrency(budgets[index]?.bills ?? 0)}</p>
                </div>
                <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                    View bill details
                  </summary>
                  <ul className="mt-3 space-y-2 text-sm text-slate-600">
                    {person.bills.map((bill) => (
                      <li key={`${bill.id}-summary`} className="flex items-center justify-between gap-3">
                        <span className="font-medium text-slate-700">{bill.label}</span>
                        <span className="font-semibold text-slate-900">{formatCurrency(bill.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            ))}
          </div>
        </section>

        <section id={SECTION_IDS.breakdown} className="mt-16 space-y-10">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-slate-900">Budget breakdown</h2>
            <p className="text-sm text-slate-600">Visualize where every dollar lands each month.</p>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            {persons.map((person, index) => (
              <div key={`donut-${person.id}`} className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{person.name}</h3>
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
                      <Tooltip formatter={pieTooltipFormatter} />
                      <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-3xl bg-white p-8 shadow-soft ring-1 ring-slate-200/60">
            <h3 className="text-lg font-semibold text-slate-900">Recommended vs. actual (50 / 30 / 20)</h3>
            <p className="text-sm text-slate-600">See how closely each plan aligns with the classic framework.</p>
            <div className="mt-6 h-96">
              <ResponsiveContainer>
                <BarChart data={breakdownData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5f5" />
                  <XAxis dataKey="category" tick={{ fill: '#475569', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#475569', fontSize: 12 }} domain={[0, 100]} unit="%" />
                  <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
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
          </div>
        </section>

        <section id={SECTION_IDS.projections} className="mt-16 space-y-10">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-slate-900">Savings & debt projections</h2>
            <p className="text-sm text-slate-600">Highlight when balances grow and when debts disappear.</p>
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            {persons.map((person, index) => {
              const payoff = payoffs[index];
              const debtSeries = payoff?.debtSeries ?? [];
              const showDebtChart = Number.isFinite(payoff?.months) && (budgets[index]?.debt ?? 0) > 0 && debtSeries.length > 0;
              const savingsData = savingsSeries[index] ?? [];
              const finalSavingsPoint = savingsData.length > 0 ? savingsData[savingsData.length - 1] : null;
              const finalDebtPoint = showDebtChart ? debtSeries[debtSeries.length - 1] : null;

              return (
                <div key={`projections-${person.id}`} className="space-y-6">
                  <div className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
                    <h3 className="text-lg font-semibold text-slate-900">{person.name} · savings runway</h3>
                    <p className="text-sm text-slate-500">Includes rolled-in debt payments once balances hit zero.</p>
                    <div className="mt-4 h-64">
                      <ResponsiveContainer>
                        <LineChart data={savingsData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="month" tick={{ fill: '#475569', fontSize: 12 }} />
                          <YAxis tick={{ fill: '#475569', fontSize: 12 }} tickFormatter={(value) => `$${value.toLocaleString()}`} />
                          <Tooltip formatter={(value: number) => formatCurrency(value)} labelFormatter={(label) => `Month ${label}`} />
                          <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={3} dot={false} />
                          {finalSavingsPoint ? (
                            <ReferenceDot x={finalSavingsPoint.month} y={finalSavingsPoint.amount} r={6} fill="#2563eb" stroke="#fff" strokeWidth={2}>
                              <Label value={formatCurrency(finalSavingsPoint.amount)} position="top" fill="#0f172a" />
                            </ReferenceDot>
                          ) : null}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {showDebtChart ? (
                    <div className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
                      <h3 className="text-lg font-semibold text-slate-900">{person.name} · debt payoff</h3>
                      <p className="text-sm text-slate-500">Track balances as they fall month over month.</p>
                      <div className="mt-4 h-64">
                        <ResponsiveContainer>
                          <LineChart data={debtSeries}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="month" tick={{ fill: '#475569', fontSize: 12 }} />
                            <YAxis tick={{ fill: '#475569', fontSize: 12 }} tickFormatter={(value) => `$${value.toLocaleString()}`} />
                            <Tooltip formatter={(value: number) => formatCurrency(value)} labelFormatter={(label) => `Month ${label}`} />
                            <Line type="monotone" dataKey="amount" stroke="#ef4444" strokeWidth={3} dot />
                            {finalDebtPoint ? (
                              <ReferenceDot x={finalDebtPoint.month} y={finalDebtPoint.amount} r={6} fill="#ef4444" stroke="#fff" strokeWidth={2}>
                                <Label value={formatCurrency(finalDebtPoint.amount)} position="top" fill="#0f172a" />
                              </ReferenceDot>
                            ) : null}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-3xl bg-slate-100 p-6 text-sm text-slate-600">
                      <p className="font-semibold text-slate-700">No debt payoff chart yet.</p>
                      <p className="mt-1">Increase the monthly debt allocation above to reveal a payoff timeline.</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <footer className="mt-16 rounded-3xl bg-primary px-6 py-8 text-white shadow-soft">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-white/70">Next steps</p>
              <h2 className="text-2xl font-semibold">Keep iterating or start over anytime</h2>
              <p className="mt-1 text-sm text-white/80">Inputs stay on this device until you clear them.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={resetState}
                className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-primary shadow transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                Load defaults
              </button>
              <button
                type="button"
                onClick={clearPersistedState}
                className="rounded-full border border-white/50 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                Clear saved inputs
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>

  );
};

export default App;
