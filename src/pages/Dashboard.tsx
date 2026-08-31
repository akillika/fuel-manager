import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, startOfYear, subMonths, differenceInDays } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useVehicle } from '../contexts/VehicleContext';
import { db } from '../config/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Fillup, FuelGoals, ServiceRecord } from '../types';
import { DEMO_MODE } from '../config/demo';
import { DEMO_FILLUPS, DEMO_GOALS, DEMO_SERVICES } from '../config/demoData';
import { Delta, Button, IconPlus, IconArrowRight, cx } from '../components/ui';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { computeReminders } from './Service';

export default function Dashboard() {
  const { user } = useAuth();
  const { activeVehicleId, activeVehicle, vehicles, setActiveVehicleId } = useVehicle();
  const [allFillups, setAllFillups] = useState<Fillup[]>([]);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [goals, setGoals] = useState<FuelGoals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) load(); /* eslint-disable-line */ }, [user]);

  const load = async () => {
    if (!user) return;
    if (DEMO_MODE) {
      setAllFillups([...DEMO_FILLUPS].sort((a, b) => b.date.getTime() - a.date.getTime()));
      setServices(DEMO_SERVICES);
      setGoals(DEMO_GOALS[0]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const snap = await getDocs(query(collection(db, 'fillups'), where('userId', '==', user.uid)));
      const loaded: Fillup[] = [];
      snap.forEach(d => { const data = d.data(); loaded.push({ id: d.id, ...data, date: data.date.toDate() } as Fillup); });
      loaded.sort((a, b) => b.date.getTime() - a.date.getTime());
      setAllFillups(loaded);
      const svcSnap = await getDocs(query(collection(db, 'services'), where('userId', '==', user.uid)));
      const svc: ServiceRecord[] = [];
      svcSnap.forEach(d => {
        const data = d.data();
        svc.push({ id: d.id, ...data, date: data.date.toDate(), nextDueDate: data.nextDueDate?.toDate() } as ServiceRecord);
      });
      setServices(svc);
      const gSnap = await getDocs(query(collection(db, 'fuelGoals'), where('userId', '==', user.uid)));
      gSnap.forEach(d => { const data = d.data(); setGoals({ id: d.id, ...data, createdAt: data.createdAt.toDate(), updatedAt: data.updatedAt.toDate() } as FuelGoals); });
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const fillups = useMemo(() => allFillups.filter(f => f.vehicleId === activeVehicleId), [allFillups, activeVehicleId]);
  const vehicleServices = useMemo(() => services.filter(s => s.vehicleId === activeVehicleId), [services, activeVehicleId]);

  if (loading) return <div className="max-w-page mx-auto px-4 md:px-6 py-16 text-sm text-ink3 text-center">Loading…</div>;

  // Sort ascending to compute deltas
  const asc = [...fillups].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Compute per-fill-up mileage (km/L) - between full-tank fills only, distance since previous full
  let lastFullOdo: number | null = null;
  let interimVolume = 0;
  const withStats: (Fillup & { distance?: number; mileage?: number })[] = asc.map(f => {
    if (lastFullOdo == null) { if (f.isFull) lastFullOdo = f.odometer; return { ...f }; }
    if (!f.isFull) { interimVolume += f.volume; return { ...f }; }
    const distance = f.odometer - lastFullOdo;
    const volume = f.volume + interimVolume;
    const mileage = volume > 0 ? distance / volume : 0;
    lastFullOdo = f.odometer;
    interimVolume = 0;
    return { ...f, distance, mileage };
  });

  // Reverse for display
  const feed = [...withStats].reverse();
  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  const inRange = (f: Fillup, s: Date, e: Date) => f.date >= s && f.date <= e;
  const thisMonth = withStats.filter(f => inRange(f, thisMonthStart, thisMonthEnd));
  const lastMonth = withStats.filter(f => inRange(f, lastMonthStart, lastMonthEnd));

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const monthSpend = sum(thisMonth.map(f => f.totalCost));
  const monthLastSpend = sum(lastMonth.map(f => f.totalCost));

  // Distance driven in a given month = latest odometer in the month minus the last odometer recorded BEFORE the month started.
  // Falls back to the earliest odometer of the month itself if there is no prior fill-up (first-ever month).
  const priorOdoBefore = (cutoff: Date): number | null => {
    let odo: number | null = null;
    for (const f of asc) {
      if (f.date < cutoff) odo = f.odometer;
      else break;
    }
    return odo;
  };
  const monthDistance = thisMonth.length >= 1
    ? Math.max(0, thisMonth[thisMonth.length - 1].odometer - (priorOdoBefore(thisMonthStart) ?? thisMonth[0].odometer))
    : 0;
  const monthLastDistance = lastMonth.length >= 1
    ? Math.max(0, lastMonth[lastMonth.length - 1].odometer - (priorOdoBefore(lastMonthStart) ?? lastMonth[0].odometer))
    : 0;

  // Avg mileage: from withStats entries with mileage computed
  const mileageThisMonth = thisMonth.filter(f => (f as any).mileage != null).map(f => (f as any).mileage as number);
  const mileageLastMonth = lastMonth.filter(f => (f as any).mileage != null).map(f => (f as any).mileage as number);
  const avgMileage = mileageThisMonth.length ? sum(mileageThisMonth) / mileageThisMonth.length : (avgOfLastN(withStats, 3) || 0);
  const avgMileageLast = mileageLastMonth.length ? sum(mileageLastMonth) / mileageLastMonth.length : 0;
  const mileageDelta = avgMileageLast > 0 ? ((avgMileage - avgMileageLast) / avgMileageLast) * 100 : 0;

  const spendDelta = monthLastSpend > 0 ? monthSpend - monthLastSpend : 0;
  const distanceDelta = monthLastDistance > 0 ? monthDistance - monthLastDistance : 0;

  const latest = feed[0];
  const avgPrice = latest ? latest.pricePerLitre : 0;

  // Yearly totals and projection
  const yearStart = startOfYear(now);
  const daysIntoYear = Math.max(1, differenceInDays(now, yearStart));
  const daysInYear = 365;
  const yearSoFar = withStats.filter(f => f.date >= yearStart);
  const yearSpend = sum(yearSoFar.map(f => f.totalCost));
  const projected = Math.round((yearSpend / daysIntoYear) * daysInYear);

  // Station comparison
  const stationStats = new Map<string, { spends: number[]; prices: number[]; totalSpend: number }>();
  withStats.forEach(f => {
    if (!f.station) return;
    const cur = stationStats.get(f.station) || { spends: [], prices: [], totalSpend: 0 };
    cur.prices.push(f.pricePerLitre);
    cur.totalSpend += f.totalCost;
    stationStats.set(f.station, cur);
  });
  const stationArray = Array.from(stationStats.entries()).map(([name, s]) => ({
    name, avgPrice: s.prices.reduce((a, b) => a + b, 0) / s.prices.length, totalSpend: s.totalSpend, count: s.prices.length,
  })).sort((a, b) => a.avgPrice - b.avgPrice);
  const cheapest = stationArray[0];
  const priciest = stationArray[stationArray.length - 1];
  const priceGap = cheapest && priciest && cheapest !== priciest ? priciest.avgPrice - cheapest.avgPrice : 0;

  // Service reminders (already in an active/dueSoon/overdue shape)
  const reminders = computeReminders(vehicleServices, latest?.odometer || 0);
  const urgentReminders = reminders.filter(r => r.tone !== 'ok').slice(0, 3);

  // Trend data: 30 days of fill-up mileage values as points
  const trendData = withStats
    .filter(f => (f as any).mileage != null && f.date >= subMonths(now, 6))
    .map(f => ({ date: format(f.date, 'dd MMM'), mileage: Number(((f as any).mileage as number).toFixed(2)), spend: f.totalCost }));

  const budget = goals?.monthlyBudget ?? 0;
  const budgetPct = budget > 0 ? Math.round((monthSpend / budget) * 100) : 0;
  const budgetOver = budget > 0 && monthSpend > budget;

  return (
    <div className="max-w-page mx-auto w-full px-4 md:px-6 py-6 md:py-8 rise">
      {/* Big hero numbers */}
      <div className="flex items-start justify-between mb-8 md:mb-10 flex-wrap gap-3">
        <div>
          <div className="text-2xs uppercase tracking-[0.1em] font-semibold text-ink3">Fuel · {format(now, 'MMMM yyyy')}</div>
          <h1 className="text-lg font-semibold text-ink mt-0.5">{activeVehicle?.name || 'Vehicle'}{activeVehicle?.plate ? ` · ${activeVehicle.plate}` : ''}</h1>
          {vehicles.length > 1 && (
            <div className="inline-flex bg-card border border-rule rounded-md p-0.5 mt-3">
              {vehicles.map(v => (
                <button
                  key={v.id}
                  onClick={() => setActiveVehicleId(v.id)}
                  className={cx('h-7 px-3 rounded text-xs font-medium transition-colors', activeVehicleId === v.id ? 'bg-card2 text-ink' : 'text-ink3 hover:text-ink')}
                >
                  {v.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="text-2xs text-ink3 font-mono tabular">
          Latest odometer <span className="text-ink font-semibold">{latest?.odometer.toLocaleString('en-IN') ?? '—'} km</span>
        </div>
      </div>

      {/* Service reminder strip */}
      {urgentReminders.length > 0 && (
        <div className="mb-6 flex items-center gap-3 border border-rule rounded-lg bg-card px-4 py-3 flex-wrap">
          <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3">Upcoming</div>
          <div className="flex items-center gap-2 flex-wrap flex-1">
            {urgentReminders.map(r => (
              <div key={r.service.id} className={cx('inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-2xs font-mono tabular border',
                r.tone === 'overdue' ? 'text-down border-down/40 bg-down/5' : 'text-warn border-warn/40 bg-warn/5')}>
                <span className="font-semibold uppercase tracking-[0.06em]">{r.type}</span>
                <span className="text-ink3">·</span>
                {r.daysDue !== undefined && <span>{r.daysDue < 0 ? `${Math.abs(r.daysDue)}d overdue` : `${r.daysDue}d`}</span>}
                {r.daysDue !== undefined && r.kmDue !== undefined && <span className="text-ink3">·</span>}
                {r.kmDue !== undefined && <span>{r.kmDue < 0 ? `${Math.abs(r.kmDue).toLocaleString('en-IN')}km past` : `${r.kmDue.toLocaleString('en-IN')}km`}</span>}
              </div>
            ))}
          </div>
          <Link to="/service" className="text-xs text-ink3 hover:text-ink inline-flex items-center gap-1">Service log <IconArrowRight width={11} height={11} /></Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border-y border-rule mb-10 md:mb-12">
        <HeroStat
          label="Mileage this month"
          value={avgMileage.toFixed(1)}
          unit="km/L"
          delta={mileageDelta}
          deltaUnit="%"
        />
        <HeroStat
          label="Spend this month"
          value={monthSpend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          unit="₹"
          prefix
          delta={monthLastSpend > 0 ? (spendDelta / monthLastSpend) * 100 : 0}
          deltaUnit="%"
          deltaInvert
          hint={budget > 0 ? `${budgetPct}% of ₹${budget.toLocaleString('en-IN')} budget` : 'No budget set'}
          hintTone={budgetOver ? 'down' : budgetPct > 80 ? 'warn' : 'ink3'}
        />
        <HeroStat
          label="Distance this month"
          value={monthDistance.toLocaleString('en-IN')}
          unit="km"
          delta={monthLastDistance > 0 ? (distanceDelta / monthLastDistance) * 100 : 0}
          deltaUnit="%"
        />
      </div>

      {/* Secondary stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-rule border-y border-rule mb-10">
        <SmallStat label="Last price" value={`₹${avgPrice.toFixed(2)}`} sub={latest?.station || '—'} />
        <SmallStat label="Cost per km" value={monthDistance > 0 ? `₹${(monthSpend / monthDistance).toFixed(2)}` : '—'} sub="this month" />
        <SmallStat label="Fills this month" value={String(thisMonth.length)} sub={`${thisMonth.length !== 1 ? 'entries' : 'entry'}`} />
        <SmallStat label="All-time total" value={`₹${sum(withStats.map(f => f.totalCost)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} sub={`${withStats.length} fills`} />
      </div>

      {/* Trend chart */}
      <div className="mb-10">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <div className="text-2xs uppercase tracking-[0.1em] font-semibold text-ink3">Mileage trend</div>
            <div className="text-md font-semibold text-ink mt-0.5">Last 6 months · km/L per fill</div>
          </div>
          {goals?.mileageTarget && (
            <div className="text-2xs font-mono tabular text-ink3">Target <span className="text-ink font-semibold">{goals.mileageTarget} km/L</span></div>
          )}
        </div>
        <div className="border border-rule rounded-lg bg-card p-4">
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData} margin={{ top: 6, right: 12, left: -14, bottom: 6 }}>
                <XAxis dataKey="date" tickLine={false} axisLine={false} interval="preserveEnd" />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={38}
                  domain={([min, max]: [number, number]) => [Math.floor(min) - 1, Math.ceil(max) + 1]}
                  allowDecimals={false}
                />
                <Tooltip cursor={{ stroke: 'var(--rule-2)', strokeWidth: 1 }} />
                {goals?.mileageTarget && (
                  <ReferenceLine y={goals.mileageTarget} stroke="var(--rule-2)" strokeDasharray="3 3" />
                )}
                <Line
                  type="monotone"
                  dataKey="mileage"
                  stroke="var(--ink)"
                  strokeWidth={1.5}
                  dot={{ fill: 'var(--ink)', r: 2.5, stroke: 'var(--card)', strokeWidth: 1.5 }}
                  activeDot={{ r: 4, fill: 'var(--ink)', stroke: 'var(--card)', strokeWidth: 2 }}
                  animationDuration={500}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="py-16 text-center text-sm text-ink3">Log more fill-ups to see a trend.</div>
          )}
        </div>
      </div>

      {/* Yearly projection + cheapest-station callout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-10">
        <div className="border border-rule rounded-lg p-5 bg-card">
          <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3">Year to date</div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold text-ink tabular tracking-[-0.02em]">₹{yearSpend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            <span className="text-sm text-ink3 font-mono tabular">spent</span>
          </div>
          <div className="mt-2 text-2xs text-ink3 font-mono tabular flex items-baseline gap-2">
            <span>Projected <span className="text-ink font-semibold">₹{projected.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span> for {format(now, 'yyyy')}</span>
            {goals?.yearlyBudget ? (
              <span className={cx('font-semibold', projected > goals.yearlyBudget ? 'text-down' : 'text-up')}>
                {projected > goals.yearlyBudget ? '↑' : '↓'} vs ₹{goals.yearlyBudget.toLocaleString('en-IN')} budget
              </span>
            ) : null}
          </div>
        </div>

        {cheapest && priciest && priceGap > 0.1 ? (
          <div className="border border-rule rounded-lg p-5 bg-card">
            <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3">Best-priced station</div>
            <div className="mt-2 text-md text-ink">
              <span className="font-bold">{cheapest.name}</span>
              <span className="text-ink3"> · avg <span className="font-mono tabular">₹{cheapest.avgPrice.toFixed(2)}/L</span></span>
            </div>
            <div className="mt-2 text-2xs text-ink3 font-mono tabular">
              ₹{priceGap.toFixed(2)}/L cheaper than <span className="text-ink font-semibold">{priciest.name}</span>{' '}
              <span className="text-up font-semibold">· ~₹{(priceGap * (activeVehicle?.tankCapacity || 32)).toFixed(0)}/full tank saved</span>
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-rule2 rounded-lg p-5 flex items-center justify-center text-xs text-ink3">
            Log fill-ups with a station name to unlock the comparison.
          </div>
        )}
      </div>

      {/* Recent fills */}
      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <div className="text-2xs uppercase tracking-[0.1em] font-semibold text-ink3">Recent fill-ups</div>
            <div className="text-md font-semibold text-ink mt-0.5">Latest {Math.min(feed.length, 6)} entries</div>
          </div>
          <Link to="/fillups" className="text-xs text-ink3 hover:text-ink inline-flex items-center gap-1">See all <IconArrowRight width={11} height={11} /></Link>
        </div>
        {feed.length > 0 ? (
          <div className="border border-rule rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-card2 text-ink3 text-2xs uppercase tracking-[0.06em] font-semibold">
                  <th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-right px-4 py-2.5">Odometer</th>
                  <th className="text-right px-4 py-2.5">Litres</th>
                  <th className="text-right px-4 py-2.5">₹/L</th>
                  <th className="text-right px-4 py-2.5">Total</th>
                  <th className="text-right px-4 py-2.5 hidden sm:table-cell">km/L</th>
                  <th className="text-left px-4 py-2.5 hidden md:table-cell">Station</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {feed.slice(0, 6).map(f => (
                  <tr key={f.id} className="hover:bg-card2/50 transition-colors">
                    <td className="px-4 py-3 text-ink tabular">
                      <div className="font-medium">{format(f.date, 'dd MMM')}</div>
                      <div className="text-2xs text-ink3">{format(f.date, 'HH:mm')}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink">{f.odometer.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink">{f.volume.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink2">{f.pricePerLitre.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink font-semibold">₹{f.totalCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right font-mono tabular hidden sm:table-cell">
                      {(f as any).mileage ? <span className="text-ink">{((f as any).mileage as number).toFixed(1)}</span> : <span className="text-ink3">—</span>}
                    </td>
                    <td className="px-4 py-3 text-ink3 text-xs hidden md:table-cell truncate">{f.station || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border border-dashed border-rule2 rounded-lg py-16 px-6 text-center">
            <div className="text-md font-semibold text-ink mb-1">No fill-ups yet</div>
            <div className="text-sm text-ink3 mb-4 max-w-sm mx-auto">Log your first fill-up and mileage, spend and distance will start showing up here.</div>
            <Link to="/add"><Button variant="primary"><IconPlus /> Log first fill-up</Button></Link>
          </div>
        )}
      </div>
    </div>
  );
}

function avgOfLastN(arr: any[], n: number): number {
  const withMileage = arr.filter(f => f.mileage != null).slice(-n).map(f => f.mileage as number);
  if (!withMileage.length) return 0;
  return withMileage.reduce((a, b) => a + b, 0) / withMileage.length;
}

function HeroStat({
  label, value, unit, prefix, delta, deltaUnit, deltaInvert, hint, hintTone,
}: {
  label: string; value: string; unit: string; prefix?: boolean;
  delta?: number; deltaUnit?: string; deltaInvert?: boolean;
  hint?: string; hintTone?: 'ink3' | 'down' | 'warn';
}) {
  const toneClass = hintTone === 'down' ? 'text-down' : hintTone === 'warn' ? 'text-warn' : 'text-ink3';
  return (
    <div className="bg-bg p-5 md:p-7">
      <div className="text-2xs uppercase tracking-[0.1em] font-semibold text-ink3">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-3">
        {prefix && <span className="text-2xl md:text-3xl font-semibold text-ink3 tabular">{unit}</span>}
        <span className="text-5xl md:text-6xl font-bold text-ink tabular tracking-[-0.035em]">{value}</span>
        {!prefix && <span className="text-md text-ink3 font-mono tabular ml-0.5">{unit}</span>}
      </div>
      <div className="mt-3 flex items-baseline gap-3">
        {delta != null && !isNaN(delta) && (
          <Delta value={Number(delta.toFixed(1))} unit={deltaUnit} invert={deltaInvert} />
        )}
        {hint && <span className={cx('text-2xs font-mono tabular', toneClass)}>{hint}</span>}
      </div>
    </div>
  );
}

function SmallStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-bg p-4">
      <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3">{label}</div>
      <div className="text-xl font-semibold text-ink tabular mt-1">{value}</div>
      <div className="text-2xs text-ink3 mt-0.5 tabular truncate">{sub}</div>
    </div>
  );
}
