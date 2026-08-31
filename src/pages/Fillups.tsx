import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useVehicle } from '../contexts/VehicleContext';
import { db } from '../config/firebase';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { Fillup } from '../types';
import { DEMO_MODE } from '../config/demo';
import { DEMO_FILLUPS } from '../config/demoData';
import { Button, IconPlus, IconSearch, IconTrash, IconEdit, IconArrowUp, IconArrowDown, cx } from '../components/ui';

type SortField = 'date' | 'odometer' | 'volume' | 'totalCost' | 'mileage';

export default function Fillups() {
  const { user } = useAuth();
  const { activeVehicleId, vehicles, setActiveVehicleId } = useVehicle();
  const [allFillups, setAllFillups] = useState<Fillup[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [tagFilter, setTagFilter] = useState<'all' | 'personal' | 'work'>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fillups = useMemo(() => allFillups.filter(f => f.vehicleId === activeVehicleId), [allFillups, activeVehicleId]);

  useEffect(() => { if (user) load(); /* eslint-disable-line */ }, [user]);

  const load = async () => {
    if (!user) return;
    if (DEMO_MODE) {
      setAllFillups([...DEMO_FILLUPS]);
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
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  // Compute mileage for each fill-up (from previous full-tank entry)
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

  const filtered = useMemo(() => {
    let list = withStats;
    if (tagFilter !== 'all') {
      list = list.filter(f => (f.tag || 'personal') === tagFilter);
    }
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter(f =>
        f.station?.toLowerCase().includes(s) ||
        f.fuelGrade?.toLowerCase().includes(s) ||
        format(f.date, 'dd MMM yyyy').toLowerCase().includes(s) ||
        String(f.odometer).includes(s),
      );
    }
    list = [...list].sort((a, b) => {
      const av = (a as any)[sortField] ?? 0;
      const bv = (b as any)[sortField] ?? 0;
      if (sortField === 'date') return sortDir === 'asc' ? a.date.getTime() - b.date.getTime() : b.date.getTime() - a.date.getTime();
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [withStats, q, sortField, sortDir, tagFilter]);

  const toggleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir(f === 'date' ? 'desc' : 'desc'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this fill-up?')) return;
    if (DEMO_MODE) { setAllFillups(allFillups.filter(f => f.id !== id)); return; }
    try { await deleteDoc(doc(db, 'fillups', id)); setAllFillups(allFillups.filter(f => f.id !== id)); }
    catch (e) { console.error(e); alert('Delete failed'); }
  };

  const exportCsv = () => {
    const rows = [
      ['Date', 'Odometer', 'Litres', 'Rs/L', 'Total', 'Distance', 'Mileage', 'Station', 'Grade', 'Tag', 'Full', 'Notes'],
      ...filtered.map(f => [
        format(f.date, 'yyyy-MM-dd HH:mm'),
        String(f.odometer),
        f.volume.toFixed(2),
        f.pricePerLitre.toFixed(2),
        f.totalCost.toFixed(2),
        (f as any).distance ? String((f as any).distance) : '',
        (f as any).mileage ? ((f as any).mileage as number).toFixed(2) : '',
        f.station || '',
        f.fuelGrade || '',
        f.tag || 'personal',
        f.isFull ? 'yes' : 'no',
        (f.notes || '').replace(/"/g, '""'),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fuel-fillups-${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExpenseReport = () => {
    const work = filtered.filter(f => f.tag === 'work');
    if (work.length === 0) { alert('No work-tagged fill-ups to export.'); return; }
    // Group by month, compute total spend and estimated work km
    const totalSpend = work.reduce((s, f) => s + f.totalCost, 0);
    const totalDistance = work.reduce((s, f) => s + ((f as any).distance || 0), 0);
    const rows = [
      ['Fuel expense report'],
      ['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')],
      ['Vehicle', vehicles.find(v => v.id === activeVehicleId)?.name || ''],
      [''],
      ['Date', 'Odometer', 'Litres', 'Rs/L', 'Total', 'Distance', 'Station'],
      ...work.map(f => [
        format(f.date, 'yyyy-MM-dd'),
        String(f.odometer),
        f.volume.toFixed(2),
        f.pricePerLitre.toFixed(2),
        f.totalCost.toFixed(2),
        (f as any).distance ? String((f as any).distance) : '',
        f.station || '',
      ]),
      [''],
      ['Totals', '', '', '', totalSpend.toFixed(2), String(totalDistance)],
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fuel-expense-${format(new Date(), 'yyyyMM')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortHead = ({ field, label, align = 'right' }: { field: SortField; label: string; align?: 'left' | 'right' }) => (
    <th className={cx('px-4 py-2.5', align === 'right' ? 'text-right' : 'text-left')}>
      <button
        onClick={() => toggleSort(field)}
        className={cx('inline-flex items-center gap-1 uppercase text-2xs tracking-[0.06em] font-semibold transition-colors', sortField === field ? 'text-ink' : 'text-ink3 hover:text-ink')}
      >
        {label}
        {sortField === field && (sortDir === 'asc' ? <IconArrowUp width={9} height={9} /> : <IconArrowDown width={9} height={9} />)}
      </button>
    </th>
  );

  return (
    <div className="max-w-page mx-auto w-full px-4 md:px-6 py-6 md:py-8 rise">
      <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="text-2xs uppercase tracking-[0.1em] font-semibold text-ink3">All entries</div>
          <h1 className="text-2xl font-semibold text-ink tracking-[-0.02em]">Fill-ups</h1>
        </div>
        <div className="flex items-center gap-2">
          {vehicles.length > 1 && (
            <div className="inline-flex bg-card border border-rule rounded-md p-0.5 h-9">
              {vehicles.map(v => (
                <button
                  key={v.id}
                  onClick={() => setActiveVehicleId(v.id)}
                  className={cx('h-full px-3 rounded text-xs font-medium transition-colors', activeVehicleId === v.id ? 'bg-card2 text-ink' : 'text-ink3 hover:text-ink')}
                >
                  {v.name}
                </button>
              ))}
            </div>
          )}
          <Link to="/add">
            <Button variant="primary"><IconPlus /> New fill-up</Button>
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex-1 max-w-sm flex items-center gap-2 h-9 bg-card border border-rule rounded-md px-3">
          <IconSearch className="text-ink3" width={13} height={13} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search date, station, odometer…"
            className="flex-1 outline-none bg-transparent text-sm text-ink placeholder:text-ink3"
          />
        </div>
        <div className="inline-flex bg-card border border-rule rounded-md p-0.5 h-9">
          {(['all', 'personal', 'work'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTagFilter(t)}
              className={cx('h-full px-3 rounded text-xs font-medium capitalize transition-colors', tagFilter === t ? 'bg-card2 text-ink' : 'text-ink3 hover:text-ink')}
            >
              {t}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={exportCsv}>Export CSV</Button>
        <Button size="sm" onClick={exportExpenseReport}>Expense report</Button>
        <span className="ml-auto text-2xs font-mono tabular text-ink3">{filtered.length} of {fillups.length}</span>
      </div>

      {loading ? (
        <div className="py-24 text-center text-sm text-ink3">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-rule2 rounded-lg py-16 px-6 text-center">
          <div className="text-md font-semibold text-ink mb-1">
            {q ? 'No matches' : 'No fill-ups yet'}
          </div>
          <div className="text-sm text-ink3 max-w-sm mx-auto mb-4">
            {q ? 'Try a shorter query.' : 'Log your first fill-up to start tracking.'}
          </div>
          {!q && <Link to="/add"><Button variant="primary"><IconPlus /> New fill-up</Button></Link>}
        </div>
      ) : (
        <div className="border border-rule rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-card2">
                <tr>
                  <SortHead field="date" label="Date" align="left" />
                  <SortHead field="odometer" label="Odometer" />
                  <SortHead field="volume" label="Litres" />
                  <th className="px-4 py-2.5 text-right text-2xs uppercase tracking-[0.06em] font-semibold text-ink3">₹/L</th>
                  <SortHead field="totalCost" label="Total" />
                  <SortHead field="mileage" label="km/L" />
                  <th className="px-4 py-2.5 text-left text-2xs uppercase tracking-[0.06em] font-semibold text-ink3 hidden md:table-cell">Station</th>
                  <th className="px-4 py-2.5 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {filtered.map(f => (
                  <tr key={f.id} className="hover:bg-card2/50 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="text-ink font-medium tabular">{format(f.date, 'dd MMM yyyy')}</div>
                      <div className="text-2xs text-ink3 tabular">{format(f.date, 'HH:mm')}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink">{f.odometer.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink">
                      {f.volume.toFixed(2)}
                      {!f.isFull && <span className="ml-1 text-2xs text-warn">·part</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink2">{f.pricePerLitre.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink font-semibold">₹{f.totalCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right font-mono tabular">
                      {(f as any).mileage ? <span className="text-ink">{((f as any).mileage as number).toFixed(1)}</span> : <span className="text-ink3">—</span>}
                    </td>
                    <td className="px-4 py-3 text-ink3 text-xs hidden md:table-cell max-w-[180px] truncate">{f.station || ''}</td>
                    <td className="px-2 py-3 text-right">
                      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link to={`/add?edit=${f.id}`} className="inline-flex items-center justify-center w-7 h-7 rounded-md text-ink3 hover:text-ink hover:bg-card2 transition-colors" title="Edit"><IconEdit /></Link>
                        <button onClick={() => handleDelete(f.id)} className="inline-flex items-center justify-center w-7 h-7 rounded-md text-ink3 hover:text-down hover:bg-card2 transition-colors" title="Delete"><IconTrash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
