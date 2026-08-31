import { useEffect, useMemo, useState } from 'react';
import { format, addMonths, differenceInDays } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useVehicle } from '../contexts/VehicleContext';
import { db } from '../config/firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { ServiceRecord, ServiceType } from '../types';
import { DEMO_MODE } from '../config/demo';
import { DEMO_SERVICES, DEMO_FILLUPS } from '../config/demoData';
import { Button, Input, Field, Textarea, IconPlus, IconClose, IconTrash, cx } from '../components/ui';

const TYPES: ServiceType[] = [
  'Oil change', 'Tyre rotation', 'Tyres new', 'Brake pads', 'Air filter', 'Battery', 'Coolant',
  'Wheel alignment', 'General service', 'Insurance', 'PUC', 'RTO tax', 'Fastag', 'Other',
];

export interface Reminder {
  service: ServiceRecord;
  type: ServiceType;
  daysDue?: number;         // negative if overdue
  kmDue?: number;           // negative if overdue
  tone: 'overdue' | 'soon' | 'ok';
}

export function computeReminders(services: ServiceRecord[], currentOdo: number): Reminder[] {
  const now = new Date();
  return services
    .filter(s => s.nextDueDate || s.nextDueOdometer)
    .map(s => {
      const daysDue = s.nextDueDate ? differenceInDays(s.nextDueDate, now) : undefined;
      const kmDue = s.nextDueOdometer ? s.nextDueOdometer - currentOdo : undefined;
      const worst = Math.min(daysDue ?? Infinity, kmDue ?? Infinity);
      const tone: Reminder['tone'] = worst < 0 ? 'overdue' : worst < 30 ? 'soon' : 'ok';
      return { service: s, type: s.type, daysDue, kmDue, tone };
    })
    .sort((a, b) => {
      const av = Math.min(a.daysDue ?? Infinity, a.kmDue ?? Infinity);
      const bv = Math.min(b.daysDue ?? Infinity, b.kmDue ?? Infinity);
      return av - bv;
    });
}

export default function Service() {
  const { user } = useAuth();
  const { activeVehicleId, vehicles, setActiveVehicleId } = useVehicle();
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [type, setType] = useState<ServiceType>('Oil change');
  const [date, setDate] = useState<Date>(new Date());
  const [serviceOdometer, setServiceOdometer] = useState<string>('');
  const [cost, setCost] = useState<string>('');
  const [workshop, setWorkshop] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [intervalMonths, setIntervalMonths] = useState<string>('6');
  const [intervalKm, setIntervalKm] = useState<string>('10000');

  useEffect(() => { if (user) load(); /* eslint-disable-line */ }, [user, activeVehicleId]);

  const load = async () => {
    if (!user) return;
    if (DEMO_MODE) { setServices(DEMO_SERVICES.filter(s => s.vehicleId === activeVehicleId)); setLoading(false); return; }
    try {
      setLoading(true);
      const snap = await getDocs(query(
        collection(db, 'services'),
        where('userId', '==', user.uid),
        where('vehicleId', '==', activeVehicleId),
      ));
      const list: ServiceRecord[] = [];
      snap.forEach(d => {
        const data = d.data();
        list.push({
          id: d.id, ...data,
          date: data.date.toDate(),
          nextDueDate: data.nextDueDate?.toDate(),
        } as ServiceRecord);
      });
      setServices(list);
    } finally { setLoading(false); }
  };

  // Current odometer from latest fill-up on this vehicle
  const currentOdo = useMemo(() => {
    const list = DEMO_MODE ? DEMO_FILLUPS.filter(f => f.vehicleId === activeVehicleId) : [];
    if (list.length === 0) return 0;
    return list.reduce((m, f) => Math.max(m, f.odometer), 0);
  }, [activeVehicleId]);

  const reminders = useMemo(() => computeReminders(services, currentOdo), [services, currentOdo]);
  const history = useMemo(() => [...services].sort((a, b) => b.date.getTime() - a.date.getTime()), [services]);

  const openCreate = () => {
    setType('Oil change');
    setDate(new Date());
    setServiceOdometer(currentOdo ? String(currentOdo) : '');
    setCost('');
    setWorkshop('');
    setNotes('');
    setIntervalMonths('6');
    setIntervalKm('10000');
    setShowModal(true);
  };
  const closeModal = () => setShowModal(false);

  const save = async () => {
    if (!user) return;
    if (DEMO_MODE) { alert('Demo mode: writes disabled.'); closeModal(); return; }
    const parsedOdo = Number(serviceOdometer);
    const parsedMonths = Number(intervalMonths);
    const parsedKm = Number(intervalKm);
    const data: any = {
      userId: user.uid,
      vehicleId: activeVehicleId,
      type,
      date: Timestamp.fromDate(date),
    };
    if (parsedOdo) data.odometer = parsedOdo;
    if (Number(cost)) data.cost = Number(cost);
    if (workshop.trim()) data.workshop = workshop.trim();
    if (notes.trim()) data.notes = notes.trim();
    if (parsedMonths) { data.reminderIntervalMonths = parsedMonths; data.nextDueDate = Timestamp.fromDate(addMonths(date, parsedMonths)); }
    if (parsedKm && parsedOdo) { data.reminderIntervalKm = parsedKm; data.nextDueOdometer = parsedOdo + parsedKm; }
    await addDoc(collection(db, 'services'), data);
    closeModal();
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this service entry?')) return;
    if (DEMO_MODE) { setServices(services.filter(s => s.id !== id)); return; }
    await deleteDoc(doc(db, 'services', id));
    await load();
  };

  return (
    <div className="max-w-page mx-auto w-full px-4 md:px-6 py-6 md:py-8 rise">
      <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="text-2xs uppercase tracking-[0.1em] font-semibold text-ink3">Maintenance</div>
          <h1 className="text-2xl font-semibold text-ink tracking-[-0.02em]">Service log</h1>
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
          <Button variant="primary" onClick={openCreate}><IconPlus /> Log service</Button>
        </div>
      </div>

      {/* Upcoming reminders */}
      {reminders.length > 0 && (
        <div className="mb-8">
          <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3 mb-3">Upcoming</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {reminders.slice(0, 6).map(r => (
              <ReminderCard key={r.service.id} r={r} />
            ))}
          </div>
        </div>
      )}

      <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3 mb-3">History</div>
      {loading ? (
        <div className="py-16 text-center text-sm text-ink3">Loading…</div>
      ) : history.length === 0 ? (
        <div className="border border-dashed border-rule2 rounded-lg py-16 px-6 text-center">
          <div className="text-md font-semibold text-ink mb-1">No service history yet</div>
          <div className="text-sm text-ink3 max-w-sm mx-auto mb-4">Log an oil change, insurance renewal, or PUC to start tracking.</div>
          <Button variant="primary" onClick={openCreate}><IconPlus /> Log first service</Button>
        </div>
      ) : (
        <div className="border border-rule rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-card2 text-2xs uppercase tracking-[0.06em] font-semibold text-ink3">
              <tr>
                <th className="text-left px-4 py-2.5">Type</th>
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-right px-4 py-2.5">Odometer</th>
                <th className="text-right px-4 py-2.5">Cost</th>
                <th className="text-left px-4 py-2.5 hidden md:table-cell">Workshop</th>
                <th className="text-left px-4 py-2.5">Next due</th>
                <th className="px-4 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {history.map(s => (
                <tr key={s.id} className="hover:bg-card2/50 transition-colors group">
                  <td className="px-4 py-3 text-ink font-medium">{s.type}</td>
                  <td className="px-4 py-3 text-ink2 tabular">{format(s.date, 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3 text-right font-mono tabular text-ink">{s.odometer?.toLocaleString('en-IN') || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono tabular text-ink font-semibold">{s.cost ? `₹${s.cost.toLocaleString('en-IN')}` : '—'}</td>
                  <td className="px-4 py-3 text-ink3 text-xs hidden md:table-cell truncate">{s.workshop || ''}</td>
                  <td className="px-4 py-3 text-2xs text-ink3 font-mono tabular">
                    {s.nextDueDate && format(s.nextDueDate, 'dd MMM yy')}
                    {s.nextDueDate && s.nextDueOdometer && ' · '}
                    {s.nextDueOdometer && `${s.nextDueOdometer.toLocaleString('en-IN')} km`}
                  </td>
                  <td className="px-2 py-3">
                    <button onClick={() => handleDelete(s.id)} className="inline-flex items-center justify-center w-7 h-7 rounded-md text-ink3 hover:text-down hover:bg-card2 transition-colors opacity-0 group-hover:opacity-100" title="Delete"><IconTrash /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-card border-t md:border border-rule rounded-t-lg md:rounded-lg shadow-popover w-full md:max-w-lg md:w-full max-h-[92vh] overflow-hidden flex flex-col rise" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="md:hidden mx-auto mt-2 mb-1 w-10 h-1 rounded-full bg-rule2" />
            <div className="flex items-center justify-between p-4 border-b border-rule">
              <h3 className="text-md font-semibold text-ink">Log service</h3>
              <button onClick={closeModal} className="inline-flex items-center justify-center w-8 h-8 rounded-md text-ink3 hover:text-ink hover:bg-card2 transition-colors"><IconClose /></button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
              <Field label="Type">
                <select value={type} onChange={(e) => setType(e.target.value as ServiceType)} className="block w-full bg-card border border-rule rounded-md text-ink text-sm outline-none focus:border-ink2 h-9 pl-3 pr-8 appearance-none">
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date">
                  <Input type="date" value={format(date, 'yyyy-MM-dd')} onChange={(e) => setDate(new Date(e.target.value))} />
                </Field>
                <Field label="Odometer (km)">
                  <Input type="number" value={serviceOdometer} onChange={(e) => setServiceOdometer(e.target.value)} placeholder={currentOdo ? String(currentOdo) : 'Optional'} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cost (₹)"><Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Optional" /></Field>
                <Field label="Workshop"><Input value={workshop} onChange={(e) => setWorkshop(e.target.value)} placeholder="Optional" /></Field>
              </div>
              <div>
                <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3 mb-1.5">Remind again after</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Months (0 = off)"><Input type="number" value={intervalMonths} onChange={(e) => setIntervalMonths(e.target.value)} /></Field>
                  <Field label="Kilometres (0 = off)"><Input type="number" value={intervalKm} onChange={(e) => setIntervalKm(e.target.value)} /></Field>
                </div>
              </div>
              <Field label="Notes (optional)"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            </div>
            <div className="flex items-center justify-end gap-2 p-4 border-t border-rule">
              <Button onClick={closeModal}>Cancel</Button>
              <Button variant="primary" onClick={save}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReminderCard({ r }: { r: Reminder }) {
  const toneClass = r.tone === 'overdue' ? 'border-down/60 bg-down/5' : r.tone === 'soon' ? 'border-warn/60 bg-warn/5' : 'border-rule bg-card';
  const label =
    r.tone === 'overdue' ? 'Overdue'
    : r.tone === 'soon' ? 'Due soon'
    : 'Upcoming';
  return (
    <div className={cx('border rounded-lg p-4', toneClass)}>
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-md font-semibold text-ink">{r.type}</div>
        <div className={cx('text-2xs uppercase tracking-[0.06em] font-semibold', r.tone === 'overdue' ? 'text-down' : r.tone === 'soon' ? 'text-warn' : 'text-ink3')}>
          {label}
        </div>
      </div>
      <div className="text-2xs text-ink3 font-mono tabular space-y-0.5">
        {r.daysDue !== undefined && (
          <div>{r.daysDue < 0 ? `${Math.abs(r.daysDue)} days ago` : `${r.daysDue} days from now`}</div>
        )}
        {r.kmDue !== undefined && (
          <div>{r.kmDue < 0 ? `${Math.abs(r.kmDue).toLocaleString('en-IN')} km past` : `${r.kmDue.toLocaleString('en-IN')} km away`}</div>
        )}
      </div>
    </div>
  );
}
