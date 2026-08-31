import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../config/firebase';
import { collection, addDoc, updateDoc, doc, Timestamp, getDocs, query, where } from 'firebase/firestore';
import { Fillup } from '../types';
import { DEMO_MODE } from '../config/demo';
import { DEMO_FILLUPS } from '../config/demoData';
import { Button, Input, Field, Textarea, IconClose, cx } from '../components/ui';

export default function AddFillup() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const editId = sp.get('edit');
  const { user } = useAuth();

  const [previousFillups, setPreviousFillups] = useState<Fillup[]>([]);
  const [date, setDate] = useState<Date>(new Date());
  const [odometer, setOdometer] = useState<string>('');
  const [volume, setVolume] = useState<string>('');
  const [pricePerLitre, setPricePerLitre] = useState<string>('');
  const [station, setStation] = useState<string>('');
  const [fuelGrade, setFuelGrade] = useState<string>('Petrol');
  const [isFull, setIsFull] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      if (DEMO_MODE) { setPreviousFillups(DEMO_FILLUPS); return; }
      const snap = await getDocs(query(collection(db, 'fillups'), where('userId', '==', user.uid)));
      const list: Fillup[] = [];
      snap.forEach(d => { const data = d.data(); list.push({ id: d.id, ...data, date: data.date.toDate() } as Fillup); });
      setPreviousFillups(list);
    })();
  }, [user]);

  // Load edit target
  useEffect(() => {
    if (!editId) return;
    const f = previousFillups.find(x => x.id === editId);
    if (!f) return;
    setDate(f.date);
    setOdometer(String(f.odometer));
    setVolume(f.volume.toFixed(2));
    setPricePerLitre(f.pricePerLitre.toFixed(2));
    setStation(f.station || '');
    setFuelGrade(f.fuelGrade || 'Petrol');
    setIsFull(f.isFull);
    setNotes(f.notes || '');
  }, [editId, previousFillups]);

  const parsedOdo = Number(odometer) || 0;
  const parsedVol = Number(volume) || 0;
  const parsedPrice = Number(pricePerLitre) || 0;
  const total = Number((parsedVol * parsedPrice).toFixed(2));

  // Compute inferred mileage since last full fill
  const inferred = useMemo(() => {
    if (!isFull || parsedOdo <= 0 || parsedVol <= 0) return null;
    const asc = [...previousFillups]
      .filter(f => f.id !== editId && f.date.getTime() < date.getTime())
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    let lastFull: Fillup | null = null;
    let interimVolume = 0;
    for (let i = asc.length - 1; i >= 0; i--) {
      if (asc[i].isFull) { lastFull = asc[i]; break; }
      interimVolume += asc[i].volume;
    }
    if (!lastFull) return null;
    const distance = parsedOdo - lastFull.odometer;
    const volumeTotal = parsedVol + interimVolume;
    if (distance <= 0 || volumeTotal <= 0) return null;
    return { distance, mileage: distance / volumeTotal };
  }, [isFull, parsedOdo, parsedVol, previousFillups, date, editId]);

  const cancel = () => navigate('/');

  const save = async () => {
    if (!user) return alert('Sign in first.');
    if (!parsedOdo) return alert('Odometer is required.');
    if (!parsedVol) return alert('Volume is required.');
    if (!parsedPrice) return alert('Price per litre is required.');
    if (DEMO_MODE) { alert('Demo mode: writes disabled. Real data will save in production.'); navigate('/'); return; }
    try {
      setSaving(true);
      const data: any = {
        userId: user.uid,
        vehicleId: 'default',
        date: Timestamp.fromDate(date),
        odometer: parsedOdo,
        volume: parsedVol,
        pricePerLitre: parsedPrice,
        totalCost: total,
        isFull,
      };
      if (station.trim()) data.station = station.trim();
      if (fuelGrade.trim()) data.fuelGrade = fuelGrade.trim();
      if (notes.trim()) data.notes = notes.trim();
      if (editId) await updateDoc(doc(db, 'fillups', editId), data);
      else await addDoc(collection(db, 'fillups'), data);
      navigate('/fillups');
    } catch (e: any) {
      console.error(e);
      alert(`Save failed: ${e?.message || 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto w-full px-4 md:px-6 py-6 md:py-10 rise pb-32 md:pb-6">
      <div className="flex items-baseline justify-between mb-6 md:mb-8">
        <div>
          <div className="text-2xs uppercase tracking-[0.1em] font-semibold text-ink3">{editId ? 'Edit' : 'New'}</div>
          <h1 className="text-xl md:text-2xl font-semibold text-ink tracking-[-0.02em]">{editId ? 'Edit fill-up' : 'Log fill-up'}</h1>
        </div>
        <button onClick={cancel} className="inline-flex items-center justify-center w-9 h-9 rounded-md text-ink3 hover:text-ink hover:bg-card2 transition-colors" aria-label="Cancel"><IconClose /></button>
      </div>

      {/* Live summary strip - sticks near the top on mobile so it stays visible while filling the form */}
      <div className="sticky top-14 z-10 md:relative md:top-0 -mx-4 md:mx-0 px-4 md:px-0 pb-3 md:pb-0 md:mb-6 bg-bg/95 backdrop-blur md:bg-transparent md:backdrop-blur-none">
      <div className="border border-rule rounded-lg bg-card p-4 md:p-5">
        <div className="grid grid-cols-3 gap-4">
          <SummaryStat label="Total" value={parsedPrice && parsedVol ? `₹${total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'} sub={parsedPrice ? `${parsedVol.toFixed(1)} L × ₹${parsedPrice.toFixed(2)}` : ' '} />
          <SummaryStat label="Distance" value={inferred ? `${inferred.distance.toLocaleString('en-IN')} km` : '—'} sub="since last full" />
          <SummaryStat label="Mileage" value={inferred ? inferred.mileage.toFixed(1) : '—'} sub="km/L" />
        </div>
      </div>
      </div>

      <div className="grid grid-cols-1 gap-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Date">
            <Input
              type="datetime-local"
              value={format(date, "yyyy-MM-dd'T'HH:mm")}
              onChange={(e) => setDate(new Date(e.target.value))}
            />
          </Field>
          <Field label="Odometer (km)">
            <Input type="number" inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder="e.g. 26550" />
          </Field>
          <Field label="Fuel grade">
            <select
              value={fuelGrade}
              onChange={(e) => setFuelGrade(e.target.value)}
              className="block w-full bg-card border border-rule rounded-md text-ink text-sm outline-none focus:border-ink2 h-9 pl-3 pr-8 appearance-none bg-[url('data:image/svg+xml;utf8,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2016%2016%27%20fill=%27none%27%20stroke=%27currentColor%27%20stroke-width=%271.5%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m4%206%204%204%204-4%27/%3E%3C/svg%3E')] bg-[length:14px_14px] bg-no-repeat bg-[right_10px_center]"
            >
              <option>Petrol</option>
              <option>XP 95</option>
              <option>Speed 97</option>
              <option>Diesel</option>
              <option>Premium diesel</option>
              <option>CNG</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Volume (L)">
            <Input type="number" inputMode="decimal" step="0.01" value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="e.g. 32.10" />
          </Field>
          <Field label="Price per litre (₹)">
            <Input type="number" inputMode="decimal" step="0.01" value={pricePerLitre} onChange={(e) => setPricePerLitre(e.target.value)} placeholder="e.g. 96.30" />
          </Field>
          <Field label="Total (₹)" hint="Computed">
            <Input type="text" readOnly value={total.toLocaleString('en-IN', { maximumFractionDigits: 2 })} className="!bg-card2" />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Station (optional)">
            <Input type="text" value={station} onChange={(e) => setStation(e.target.value)} placeholder="IOCL Anna Nagar" />
          </Field>
          <div>
            <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3 mb-1.5">Fill type</div>
            <div className="inline-flex bg-card2 border border-rule rounded-md p-0.5 h-9">
              <button
                type="button"
                onClick={() => setIsFull(true)}
                className={cx('h-full px-3 rounded text-xs font-medium transition-colors', isFull ? 'bg-card text-ink shadow-sm' : 'text-ink3 hover:text-ink')}
              >
                Full tank
              </button>
              <button
                type="button"
                onClick={() => setIsFull(false)}
                className={cx('h-full px-3 rounded text-xs font-medium transition-colors', !isFull ? 'bg-card text-ink shadow-sm' : 'text-ink3 hover:text-ink')}
              >
                Partial
              </button>
            </div>
            <p className="text-2xs text-ink3 mt-1.5">
              Mileage math only runs on full-tank fills.
            </p>
          </div>
        </div>

        <Field label="Notes (optional)">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any details worth remembering." />
        </Field>
      </div>

      <div className="hidden md:flex items-center justify-end gap-2 mt-8 pt-6 border-t border-rule">
        <Button onClick={cancel}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : editId ? 'Save changes' : 'Save fill-up'}
        </Button>
      </div>

      {/* Mobile sticky save bar */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-bg/95 backdrop-blur border-t border-rule px-4 py-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full h-12 rounded-md bg-ink text-bg font-semibold text-md flex items-center justify-center gap-2 transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? 'Saving…' : (
            <>
              {editId ? 'Save changes' : 'Save fill-up'}
              {parsedPrice && parsedVol ? <span className="opacity-70 font-mono tabular text-sm">· ₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span> : null}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3">{label}</div>
      <div className="text-2xl font-semibold text-ink tabular tracking-[-0.02em] mt-1">{value}</div>
      <div className="text-2xs text-ink3 mt-0.5 tabular truncate">{sub}</div>
    </div>
  );
}
