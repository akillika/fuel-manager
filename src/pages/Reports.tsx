import { useEffect, useMemo, useState } from 'react';
import { format, startOfMonth, subMonths, startOfYear, subDays } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useVehicle } from '../contexts/VehicleContext';
import { db } from '../config/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Fillup } from '../types';
import { DEMO_MODE } from '../config/demo';
import { DEMO_FILLUPS } from '../config/demoData';
import { Button, cx } from '../components/ui';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

type Range = 'week' | 'month' | '3m' | '6m' | 'ytd' | 'all';
type Scope = 'active' | 'all';
type TagFilter = 'all' | 'personal' | 'work';
type Metric = 'spend' | 'distance' | 'mileage' | 'price';

const RANGE_LABEL: Record<Range, string> = {
  week: 'Week',
  month: 'Month',
  '3m':  '3 months',
  '6m':  '6 months',
  ytd:   'YTD',
  all:   'All-time',
};

const METRIC_LABEL: Record<Metric, string> = {
  spend: 'Spend (₹)',
  distance: 'Distance (km)',
  mileage: 'Mileage (km/L)',
  price: 'Price (₹/L)',
};

export default function Reports() {
  const { user } = useAuth();
  const { vehicles, activeVehicleId, activeVehicle } = useVehicle();

  const [all, setAll] = useState<Fillup[]>([]);
  const [loading, setLoading] = useState(true);

  const [range, setRange]   = useState<Range>('6m');
  const [scope, setScope]   = useState<Scope>('active');
  const [tag, setTag]       = useState<TagFilter>('all');
  const [metric, setMetric] = useState<Metric>('spend');

  useEffect(() => { if (user) load(); /* eslint-disable-line */ }, [user]);

  const load = async () => {
    if (!user) return;
    if (DEMO_MODE) { setAll([...DEMO_FILLUPS]); setLoading(false); return; }
    try {
      setLoading(true);
      const snap = await getDocs(query(collection(db, 'fillups'), where('userId', '==', user.uid)));
      const list: Fillup[] = [];
      snap.forEach(d => { const data = d.data(); list.push({ id: d.id, ...data, date: data.date.toDate() } as Fillup); });
      list.sort((a, b) => b.date.getTime() - a.date.getTime());
      setAll(list);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  // Compute the date-range cutoff
  const now = new Date();
  const cutoff: Date | null = useMemo(() => {
    switch (range) {
      case 'week':  return subDays(now, 7);
      case 'month': return startOfMonth(now);
      case '3m':    return startOfMonth(subMonths(now, 3));
      case '6m':    return startOfMonth(subMonths(now, 6));
      case 'ytd':   return startOfYear(now);
      case 'all':   return null;
    }
  }, [range]);

  // Filter by scope + tag + range
  const filtered = useMemo(() => {
    let list = all;
    if (scope === 'active') list = list.filter(f => f.vehicleId === activeVehicleId);
    if (tag !== 'all') list = list.filter(f => (f.tag || 'personal') === tag);
    if (cutoff) list = list.filter(f => f.date >= cutoff);
    return list;
  }, [all, scope, tag, cutoff, activeVehicleId]);

  // Sort ascending for streak calculations
  const asc = useMemo(() => [...filtered].sort((a, b) => a.date.getTime() - b.date.getTime()), [filtered]);

  // Distance in range = latest odometer in range - odometer of last fill BEFORE range (per vehicle).
  // In all-time mode there is nothing "before", so the range's own earliest odometer is the start.
  const distance = useMemo(() => {
    if (asc.length === 0) return 0;
    const priorFor = (vehicleId: string, fallbackOdo: number): number => {
      if (!cutoff) return fallbackOdo;
      const prior = all
        .filter(f => f.vehicleId === vehicleId && f.date < cutoff)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .at(-1);
      return prior?.odometer ?? fallbackOdo;
    };
    if (scope === 'active') {
      return Math.max(0, asc[asc.length - 1].odometer - priorFor(activeVehicleId, asc[0].odometer));
    }
    return vehicles.reduce((sum, v) => {
      const vAsc = asc.filter(f => f.vehicleId === v.id);
      if (vAsc.length === 0) return sum;
      return sum + Math.max(0, vAsc[vAsc.length - 1].odometer - priorFor(v.id, vAsc[0].odometer));
    }, 0);
  }, [asc, all, cutoff, scope, activeVehicleId, vehicles]);

  const totalSpend  = useMemo(() => filtered.reduce((s, f) => s + f.totalCost, 0), [filtered]);
  const totalVolume = useMemo(() => filtered.reduce((s, f) => s + f.volume, 0), [filtered]);
  const avgKmL      = totalVolume > 0 ? distance / totalVolume : 0;
  const avgPrice    = filtered.length ? filtered.reduce((s, f) => s + f.pricePerLitre, 0) / filtered.length : 0;
  const costPerKm   = distance > 0 ? totalSpend / distance : 0;

  // Monthly breakdown
  const monthlyRows = useMemo(() => {
    const map = new Map<string, { key: string; date: Date; spend: number; volume: number; count: number; startOdo: number; endOdo: number; prices: number[] }>();
    let prevOdo: number | null = null;
    for (const f of asc) {
      const key = format(startOfMonth(f.date), 'MMM yyyy');
      let cur = map.get(key);
      if (!cur) {
        cur = { key, date: startOfMonth(f.date), spend: 0, volume: 0, count: 0, startOdo: prevOdo ?? f.odometer, endOdo: f.odometer, prices: [] };
        map.set(key, cur);
      }
      cur.spend += f.totalCost;
      cur.volume += f.volume;
      cur.prices.push(f.pricePerLitre);
      cur.endOdo = f.odometer;
      cur.count++;
      prevOdo = f.odometer;
    }
    return Array.from(map.values())
      .map(r => {
        const distance = Math.max(0, r.endOdo - r.startOdo);
        const kmL = r.volume > 0 ? distance / r.volume : 0;
        const avgP = r.prices.length ? r.prices.reduce((a, b) => a + b, 0) / r.prices.length : 0;
        const cpk = distance > 0 ? r.spend / distance : 0;
        return { key: r.key, date: r.date, spend: r.spend, volume: r.volume, distance, kmL, avgP, cpk, count: r.count };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [asc]);

  // Vehicle comparison (respects range + tag, ignores scope)
  const vehicleRows = useMemo(() => {
    return vehicles.map(v => {
      const list = all.filter(f => f.vehicleId === v.id)
        .filter(f => tag === 'all' || (f.tag || 'personal') === tag)
        .filter(f => !cutoff || f.date >= cutoff)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      if (list.length === 0) return { vehicle: v, count: 0, spend: 0, volume: 0, distance: 0, kmL: 0, avgP: 0, cpk: 0 };
      const priorOdo = cutoff
        ? all.filter(f => f.vehicleId === v.id && f.date < cutoff)
            .sort((a, b) => a.date.getTime() - b.date.getTime())
            .at(-1)?.odometer
        : undefined;
      const startOdo = priorOdo ?? list[0].odometer;
      const endOdo = list[list.length - 1].odometer;
      const distance = Math.max(0, endOdo - startOdo);
      const spend = list.reduce((s, f) => s + f.totalCost, 0);
      const volume = list.reduce((s, f) => s + f.volume, 0);
      const kmL = volume > 0 ? distance / volume : 0;
      const avgP = list.reduce((s, f) => s + f.pricePerLitre, 0) / list.length;
      const cpk = distance > 0 ? spend / distance : 0;
      return { vehicle: v, count: list.length, spend, volume, distance, kmL, avgP, cpk };
    }).sort((a, b) => b.spend - a.spend);
  }, [vehicles, all, cutoff, tag]);

  // Station report
  const stationRows = useMemo(() => {
    const map = new Map<string, { name: string; count: number; spend: number; volume: number; prices: number[] }>();
    filtered.forEach(f => {
      const name = f.station?.trim() || 'Unknown';
      const cur = map.get(name) || { name, count: 0, spend: 0, volume: 0, prices: [] };
      cur.count++;
      cur.spend += f.totalCost;
      cur.volume += f.volume;
      cur.prices.push(f.pricePerLitre);
      map.set(name, cur);
    });
    return Array.from(map.values())
      .map(s => ({ ...s, avgP: s.prices.reduce((a, b) => a + b, 0) / s.prices.length }))
      .sort((a, b) => b.spend - a.spend);
  }, [filtered]);

  // Trend chart data: per-fillup entries with the chosen metric
  const trendData = useMemo(() => {
    const asc2 = [...filtered].sort((a, b) => a.date.getTime() - b.date.getTime());
    // Prior odometer per vehicle so distance-since-last is per-vehicle, not global.
    const prevOdoByVehicle = new Map<string, number>();
    let lastFullOdo: number | null = null;
    let interim = 0;
    return asc2.map((f, i) => {
      // Distance since previous fill-up on this vehicle.
      const prevOdo = prevOdoByVehicle.get(f.vehicleId);
      const distanceSinceLast = prevOdo != null ? Math.max(0, f.odometer - prevOdo) : 0;
      prevOdoByVehicle.set(f.vehicleId, f.odometer);

      // Mileage between full tanks (only when scope is a single vehicle it's clean; still OK across vehicles).
      let mileage: number | null = null;
      if (lastFullOdo == null) { if (f.isFull) lastFullOdo = f.odometer; }
      else if (!f.isFull) { interim += f.volume; }
      else {
        const distance = f.odometer - lastFullOdo;
        const volume = f.volume + interim;
        mileage = volume > 0 ? distance / volume : null;
        lastFullOdo = f.odometer;
        interim = 0;
      }
      return {
        i,
        date: format(f.date, 'MMM d'),
        spend: Math.round(f.totalCost),
        distance: distanceSinceLast,
        mileage: mileage != null ? Number(mileage.toFixed(2)) : null,
        price: Number(f.pricePerLitre.toFixed(2)),
      };
    });
  }, [filtered]);

  const exportCsv = (name: string, headers: string[], rows: (string | number)[][]) => {
    const escape = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers, ...rows].map(row => row.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const rangeSuffix = cutoff ? `-${range}` : '-all';
  const scopeSuffix = scope === 'active' && activeVehicle ? `-${activeVehicle.name.toLowerCase().replace(/\s+/g, '-')}` : '-all-vehicles';

  const exportMonthly = () => exportCsv(
    `report-monthly${rangeSuffix}${scopeSuffix}`,
    ['Month', 'Fills', 'Distance (km)', 'Volume (L)', 'Spend (₹)', 'Avg ₹/L', 'km/L', '₹/km'],
    monthlyRows.map(r => [r.key, r.count, r.distance, r.volume.toFixed(2), r.spend.toFixed(2), r.avgP.toFixed(2), r.kmL.toFixed(2), r.cpk.toFixed(2)]),
  );

  const exportVehicles = () => exportCsv(
    `report-vehicles${rangeSuffix}`,
    ['Vehicle', 'Plate', 'Fills', 'Distance (km)', 'Volume (L)', 'Spend (₹)', 'Avg ₹/L', 'km/L', '₹/km'],
    vehicleRows.map(r => [r.vehicle.name, r.vehicle.plate || '', r.count, r.distance, r.volume.toFixed(2), r.spend.toFixed(2), r.avgP.toFixed(2), r.kmL.toFixed(2), r.cpk.toFixed(2)]),
  );

  const exportStations = () => exportCsv(
    `report-stations${rangeSuffix}${scopeSuffix}`,
    ['Station', 'Fills', 'Volume (L)', 'Spend (₹)', 'Avg ₹/L'],
    stationRows.map(r => [r.name, r.count, r.volume.toFixed(2), r.spend.toFixed(2), r.avgP.toFixed(2)]),
  );

  if (loading) return <div className="max-w-page mx-auto px-4 md:px-6 py-16 text-sm text-ink3 text-center">Loading…</div>;

  return (
    <div className="max-w-page mx-auto w-full px-4 md:px-6 py-6 md:py-8 rise">
      <div className="mb-6">
        <div className="text-2xs uppercase tracking-[0.1em] font-semibold text-ink3">Analysis</div>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.02em]">Reports</h1>
        <p className="text-sm text-ink3 mt-1 max-w-xl">
          Filter by date range, vehicle, or tag. Every table exports to CSV.
        </p>
      </div>

      {/* Filter row */}
      <div className="border border-rule rounded-lg bg-card mb-6">
        <div className="flex flex-col md:flex-row md:items-stretch md:divide-x md:divide-rule">
          <FilterGroup label="Date range">
            <div className="flex flex-wrap gap-1">
              {(Object.keys(RANGE_LABEL) as Range[]).map(r => (
                <Chip key={r} active={range === r} onClick={() => setRange(r)}>{RANGE_LABEL[r]}</Chip>
              ))}
            </div>
          </FilterGroup>
          <FilterGroup label="Vehicle">
            <div className="flex flex-wrap gap-1">
              <Chip active={scope === 'active'} onClick={() => setScope('active')}>
                {activeVehicle?.name || 'Active'}
              </Chip>
              <Chip active={scope === 'all'} onClick={() => setScope('all')}>All vehicles</Chip>
            </div>
          </FilterGroup>
          <FilterGroup label="Tag">
            <div className="flex flex-wrap gap-1">
              <Chip active={tag === 'all'} onClick={() => setTag('all')}>All</Chip>
              <Chip active={tag === 'personal'} onClick={() => setTag('personal')}>Personal</Chip>
              <Chip active={tag === 'work'} onClick={() => setTag('work')}>Work</Chip>
            </div>
          </FilterGroup>
        </div>
      </div>

      {/* Summary */}
      <SectionTitle>Summary · {RANGE_LABEL[range]}</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-rule border-y border-rule mb-8">
        <BigStat label="Distance"  value={distance.toLocaleString('en-IN')} unit="km"    />
        <BigStat label="Spend"     value={`₹${totalSpend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} unit="" />
        <BigStat label="Volume"    value={totalVolume.toFixed(0)} unit="L"    />
        <BigStat label="Mileage"   value={avgKmL.toFixed(1)}      unit="km/L" />
        <BigStat label="Avg ₹/L"   value={avgPrice.toFixed(2)}    unit=""     />
        <BigStat label="Cost / km" value={`₹${costPerKm.toFixed(2)}`} unit="" />
      </div>

      {/* Trend chart */}
      <div className="flex items-baseline justify-between mb-3">
        <SectionTitle noMargin>Trend · {METRIC_LABEL[metric]}</SectionTitle>
        <div className="inline-flex bg-card2 border border-rule rounded-md p-0.5 h-8">
          {(Object.keys(METRIC_LABEL) as Metric[]).map(m => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={cx('h-full px-2.5 rounded text-2xs font-medium capitalize transition-colors', metric === m ? 'bg-card text-ink shadow-sm' : 'text-ink3 hover:text-ink')}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="border border-rule rounded-lg bg-card p-3 mb-8 h-56">
        {trendData.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} width={40} />
              <Tooltip />
              <Line type="monotone" dataKey={metric} stroke="var(--ink)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-2xs text-ink3">No fill-ups in this range.</div>
        )}
      </div>

      {/* Monthly breakdown */}
      <div className="flex items-baseline justify-between mb-3">
        <SectionTitle noMargin>Monthly breakdown</SectionTitle>
        <Button size="sm" onClick={exportMonthly} disabled={monthlyRows.length === 0}>Export CSV</Button>
      </div>
      <div className="border border-rule rounded-lg bg-card overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead className="bg-card2 text-2xs uppercase tracking-[0.08em] font-semibold text-ink3">
            <tr>
              <th className="text-left px-3 py-2">Month</th>
              <th className="text-right px-3 py-2">Fills</th>
              <th className="text-right px-3 py-2">Distance</th>
              <th className="text-right px-3 py-2">Volume</th>
              <th className="text-right px-3 py-2">Spend</th>
              <th className="text-right px-3 py-2">Avg ₹/L</th>
              <th className="text-right px-3 py-2">km/L</th>
              <th className="text-right px-3 py-2">₹/km</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {monthlyRows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-2xs text-ink3">No fill-ups in this range.</td></tr>
            )}
            {monthlyRows.map(r => (
              <tr key={r.key}>
                <td className="px-3 py-2 text-ink">{r.key}</td>
                <td className="px-3 py-2 text-right font-mono tabular text-ink2">{r.count}</td>
                <td className="px-3 py-2 text-right font-mono tabular text-ink">{r.distance.toLocaleString('en-IN')}<span className="text-ink3"> km</span></td>
                <td className="px-3 py-2 text-right font-mono tabular text-ink">{r.volume.toFixed(1)}<span className="text-ink3"> L</span></td>
                <td className="px-3 py-2 text-right font-mono tabular text-ink font-semibold">₹{r.spend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td className="px-3 py-2 text-right font-mono tabular text-ink2">{r.avgP.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-mono tabular text-ink">{r.kmL > 0 ? r.kmL.toFixed(1) : '—'}</td>
                <td className="px-3 py-2 text-right font-mono tabular text-ink">{r.cpk > 0 ? r.cpk.toFixed(2) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vehicle comparison — always across all vehicles */}
      <div className="flex items-baseline justify-between mb-3">
        <SectionTitle noMargin>By vehicle · {RANGE_LABEL[range]}</SectionTitle>
        <Button size="sm" onClick={exportVehicles} disabled={vehicleRows.every(r => r.count === 0)}>Export CSV</Button>
      </div>
      <div className="border border-rule rounded-lg bg-card overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead className="bg-card2 text-2xs uppercase tracking-[0.08em] font-semibold text-ink3">
            <tr>
              <th className="text-left px-3 py-2">Vehicle</th>
              <th className="text-right px-3 py-2">Fills</th>
              <th className="text-right px-3 py-2">Distance</th>
              <th className="text-right px-3 py-2">Volume</th>
              <th className="text-right px-3 py-2">Spend</th>
              <th className="text-right px-3 py-2">Avg ₹/L</th>
              <th className="text-right px-3 py-2">km/L</th>
              <th className="text-right px-3 py-2">₹/km</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {vehicleRows.every(r => r.count === 0) && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-2xs text-ink3">No fill-ups in this range.</td></tr>
            )}
            {vehicleRows.filter(r => r.count > 0).map(r => (
              <tr key={r.vehicle.id}>
                <td className="px-3 py-2 text-ink">
                  <div className="font-medium">{r.vehicle.name}</div>
                  {r.vehicle.plate && <div className="text-2xs text-ink3 font-mono tabular">{r.vehicle.plate}</div>}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular text-ink2">{r.count}</td>
                <td className="px-3 py-2 text-right font-mono tabular text-ink">{r.distance.toLocaleString('en-IN')}<span className="text-ink3"> km</span></td>
                <td className="px-3 py-2 text-right font-mono tabular text-ink">{r.volume.toFixed(1)}<span className="text-ink3"> L</span></td>
                <td className="px-3 py-2 text-right font-mono tabular text-ink font-semibold">₹{r.spend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td className="px-3 py-2 text-right font-mono tabular text-ink2">{r.avgP.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-mono tabular text-ink">{r.kmL > 0 ? r.kmL.toFixed(1) : '—'}</td>
                <td className="px-3 py-2 text-right font-mono tabular text-ink">{r.cpk > 0 ? r.cpk.toFixed(2) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stations */}
      <div className="flex items-baseline justify-between mb-3">
        <SectionTitle noMargin>By station · {RANGE_LABEL[range]}</SectionTitle>
        <Button size="sm" onClick={exportStations} disabled={stationRows.length === 0}>Export CSV</Button>
      </div>
      <div className="border border-rule rounded-lg bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-card2 text-2xs uppercase tracking-[0.08em] font-semibold text-ink3">
            <tr>
              <th className="text-left px-3 py-2">Station</th>
              <th className="text-right px-3 py-2">Fills</th>
              <th className="text-right px-3 py-2">Volume</th>
              <th className="text-right px-3 py-2">Spend</th>
              <th className="text-right px-3 py-2">Avg ₹/L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {stationRows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-2xs text-ink3">No fill-ups in this range.</td></tr>
            )}
            {stationRows.map(s => (
              <tr key={s.name}>
                <td className="px-3 py-2 text-ink">{s.name}</td>
                <td className="px-3 py-2 text-right font-mono tabular text-ink2">{s.count}</td>
                <td className="px-3 py-2 text-right font-mono tabular text-ink">{s.volume.toFixed(1)}<span className="text-ink3"> L</span></td>
                <td className="px-3 py-2 text-right font-mono tabular text-ink font-semibold">₹{s.spend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td className="px-3 py-2 text-right font-mono tabular text-ink2">{s.avgP.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 px-4 py-3 md:px-5 md:py-4">
      <div className="text-2xs uppercase tracking-[0.1em] font-semibold text-ink3 mb-2">{label}</div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'h-8 px-3 rounded-md text-2xs uppercase tracking-[0.06em] font-semibold transition-colors',
        active
          ? 'bg-ink text-bg'
          : 'bg-card2 border border-rule text-ink3 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function SectionTitle({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return (
    <div className={cx('text-2xs uppercase tracking-[0.1em] font-semibold text-ink3', noMargin ? '' : 'mb-3')}>
      {children}
    </div>
  );
}

function BigStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="bg-bg p-4">
      <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3">{label}</div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-lg md:text-xl font-semibold text-ink tabular tracking-[-0.02em]">{value}</span>
        {unit && <span className="text-2xs text-ink3 font-mono tabular">{unit}</span>}
      </div>
    </div>
  );
}
