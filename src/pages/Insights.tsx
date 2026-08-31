import { useEffect, useMemo, useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../config/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Fillup } from '../types';
import { DEMO_MODE } from '../config/demo';
import { DEMO_FILLUPS } from '../config/demoData';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function Insights() {
  const { user } = useAuth();
  const [fillups, setFillups] = useState<Fillup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) load(); /* eslint-disable-line */ }, [user]);
  const load = async () => {
    if (!user) return;
    if (DEMO_MODE) { setFillups([...DEMO_FILLUPS]); setLoading(false); return; }
    try {
      setLoading(true);
      const snap = await getDocs(query(collection(db, 'fillups'), where('userId', '==', user.uid), orderBy('date', 'desc')));
      const list: Fillup[] = [];
      snap.forEach(d => { const data = d.data(); list.push({ id: d.id, ...data, date: data.date.toDate() } as Fillup); });
      setFillups(list);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const withStats = useMemo(() => {
    const asc = [...fillups].sort((a, b) => a.date.getTime() - b.date.getTime());
    let lastFullOdo: number | null = null;
    let interimVolume = 0;
    return asc.map(f => {
      if (lastFullOdo == null) { if (f.isFull) lastFullOdo = f.odometer; return { ...f }; }
      if (!f.isFull) { interimVolume += f.volume; return { ...f }; }
      const distance = f.odometer - lastFullOdo;
      const volume = f.volume + interimVolume;
      const mileage = volume > 0 ? distance / volume : 0;
      lastFullOdo = f.odometer;
      interimVolume = 0;
      return { ...f, distance, mileage };
    });
  }, [fillups]);

  const stations = useMemo(() => {
    const map = new Map<string, { name: string; count: number; totalSpend: number; avgPrice: number; prices: number[] }>();
    withStats.forEach(f => {
      const name = f.station || 'Unknown';
      const cur = map.get(name) || { name, count: 0, totalSpend: 0, avgPrice: 0, prices: [] };
      cur.count++;
      cur.totalSpend += f.totalCost;
      cur.prices.push(f.pricePerLitre);
      map.set(name, cur);
    });
    return Array.from(map.values())
      .map(s => ({ ...s, avgPrice: s.prices.reduce((a, b) => a + b, 0) / s.prices.length }))
      .sort((a, b) => a.avgPrice - b.avgPrice);
  }, [withStats]);

  const monthly = useMemo(() => {
    const map = new Map<string, { key: string; spend: number; volume: number; distance: number }>();
    let prevOdo = withStats[0]?.odometer ?? 0;
    withStats.forEach(f => {
      const key = format(startOfMonth(f.date), 'MMM yyyy');
      const cur = map.get(key) || { key, spend: 0, volume: 0, distance: 0 };
      cur.spend += f.totalCost;
      cur.volume += f.volume;
      cur.distance += Math.max(0, f.odometer - prevOdo);
      prevOdo = f.odometer;
      map.set(key, cur);
    });
    return Array.from(map.values());
  }, [withStats]);

  if (loading) return <div className="max-w-page mx-auto px-4 md:px-6 py-16 text-sm text-ink3 text-center">Loading…</div>;

  const cheapest = stations[0];
  const priciest = stations[stations.length - 1];
  const diff = cheapest && priciest ? priciest.avgPrice - cheapest.avgPrice : 0;

  return (
    <div className="max-w-page mx-auto w-full px-4 md:px-6 py-6 md:py-8 rise">
      <div className="mb-8">
        <div className="text-2xs uppercase tracking-[0.1em] font-semibold text-ink3">Analysis</div>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.02em]">Insights</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <div>
          <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3 mb-3">Monthly spend</div>
          <div className="border border-rule rounded-lg bg-card p-4">
            {monthly.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: -14, bottom: 6 }}>
                  <XAxis dataKey="key" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={44} />
                  <Tooltip cursor={{ fill: 'var(--card-2)' }} />
                  <Bar dataKey="spend" radius={[4, 4, 0, 0]}>
                    {monthly.map((_, i) => <Cell key={i} fill="var(--ink)" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-16 text-center text-sm text-ink3">Not enough data.</div>
            )}
          </div>
        </div>

        <div>
          <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3 mb-3">Distance covered</div>
          <div className="border border-rule rounded-lg bg-card p-4">
            {monthly.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: -14, bottom: 6 }}>
                  <XAxis dataKey="key" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={44} />
                  <Tooltip cursor={{ fill: 'var(--card-2)' }} />
                  <Bar dataKey="distance" radius={[4, 4, 0, 0]}>
                    {monthly.map((_, i) => <Cell key={i} fill="var(--ink-3)" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-16 text-center text-sm text-ink3">Not enough data.</div>
            )}
          </div>
        </div>
      </div>

      <div className="mb-8">
        <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3 mb-3">Stations</div>
        {stations.length === 0 ? (
          <div className="border border-dashed border-rule2 rounded-lg py-12 text-center text-sm text-ink3">Log entries with station names to see this.</div>
        ) : (
          <div className="border border-rule rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-card2 text-2xs uppercase tracking-[0.06em] font-semibold text-ink3">
                <tr>
                  <th className="text-left px-4 py-2.5">Station</th>
                  <th className="text-right px-4 py-2.5">Fills</th>
                  <th className="text-right px-4 py-2.5">Avg ₹/L</th>
                  <th className="text-right px-4 py-2.5">Total spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {stations.map(s => (
                  <tr key={s.name} className="hover:bg-card2/50 transition-colors">
                    <td className="px-4 py-3 text-ink font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink2">{s.count}</td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink">₹{s.avgPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink font-semibold">₹{s.totalSpend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cheapest && priciest && diff > 0.5 && (
        <div className="border border-rule rounded-lg bg-card2 p-4 text-sm">
          <span className="text-ink font-semibold">{cheapest.name}</span>{' '}
          <span className="text-ink3">is ₹{diff.toFixed(2)}/L cheaper than</span>{' '}
          <span className="text-ink font-semibold">{priciest.name}</span>
          <span className="text-ink3"> on average — roughly ₹{(diff * 30).toFixed(0)} saved per full tank.</span>
        </div>
      )}
    </div>
  );
}
