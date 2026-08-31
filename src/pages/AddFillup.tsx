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
import { useVehicle } from '../contexts/VehicleContext';

/**
 * Parses a bank / UPI style SMS and extracts what it can.
 * Looks for a rupee amount and a station-ish string.
 */
function parseSMS(text: string) {
  const out: { total?: number; station?: string } = {};
  const rs = text.match(/(?:Rs\.?|INR|₹)\s?([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (rs) out.total = Number(rs[1].replace(/,/g, ''));
  const at = text.match(/at\s+([A-Z][A-Z0-9 &.'/-]{2,30})/);
  if (at) out.station = at[1].trim().replace(/\s{2,}/g, ' ');
  const dot = text.match(/(?:paid|debited|spent|payment).*?(?:to|at)\s+([A-Za-z][A-Za-z0-9 &.'/-]{2,30})/i);
  if (!at && dot) out.station = dot[1].trim();
  return out;
}

export default function AddFillup() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const editId = sp.get('edit');
  const prefillType = sp.get('type');
  const { user } = useAuth();
  const { activeVehicleId, vehicles } = useVehicle();

  const [previousFillups, setPreviousFillups] = useState<Fillup[]>([]);
  const [vehicleId, setVehicleId] = useState<string>(activeVehicleId);
  const [date, setDate] = useState<Date>(new Date());
  const [odometer, setOdometer] = useState<string>('');
  const [volume, setVolume] = useState<string>('');
  const [pricePerLitre, setPricePerLitre] = useState<string>('');
  const [total, setTotal] = useState<string>('');
  const [lastEdited, setLastEdited] = useState<'volume' | 'price' | 'total'>('total');
  const [station, setStation] = useState<string>('');
  const [fuelGrade, setFuelGrade] = useState<string>('Petrol');
  const [isFull, setIsFull] = useState(true);
  const [notes, setNotes] = useState('');
  const [tag, setTag] = useState<'personal' | 'work'>('personal');
  const [saving, setSaving] = useState(false);
  const [showSms, setShowSms] = useState(false);
  const [smsText, setSmsText] = useState('');

  useEffect(() => { setVehicleId(activeVehicleId); }, [activeVehicleId]);

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

  // Prefill smart defaults - runs once when previous fill-ups load and we're not editing
  const vehicleFillups = useMemo(
    () => previousFillups.filter(f => f.vehicleId === vehicleId).sort((a, b) => a.date.getTime() - b.date.getTime()),
    [previousFillups, vehicleId],
  );

  useEffect(() => {
    if (editId) return;
    if (vehicleFillups.length === 0) return;
    const last = vehicleFillups[vehicleFillups.length - 1];
    if (!odometer) {
      // Estimate km/day from the last 5 full-tank fills
      const recent = vehicleFillups.filter(f => f.isFull).slice(-5);
      let kmPerDay = 50;
      if (recent.length >= 2) {
        const first = recent[0];
        const lastR = recent[recent.length - 1];
        const days = Math.max(1, (lastR.date.getTime() - first.date.getTime()) / (1000 * 60 * 60 * 24));
        const km = lastR.odometer - first.odometer;
        kmPerDay = km / days;
      }
      const now = new Date();
      const daysSince = Math.max(1, (now.getTime() - last.date.getTime()) / (1000 * 60 * 60 * 24));
      const estimate = Math.round(last.odometer + kmPerDay * daysSince);
      setOdometer(String(estimate));
    }
    if (!pricePerLitre) setPricePerLitre(last.pricePerLitre.toFixed(2));
    if (!station && last.station) setStation(last.station);
    if (!fuelGrade && last.fuelGrade) setFuelGrade(last.fuelGrade);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleFillups, editId]);

  useEffect(() => {
    if (prefillType && !editId) setFuelGrade(prefillType);
  }, [prefillType, editId]);

  // Reverse-solve: fill the missing one of (volume, price, total)
  const parsedVol = Number(volume) || 0;
  const parsedPrice = Number(pricePerLitre) || 0;
  const parsedTotal = Number(total) || 0;

  useEffect(() => {
    // When any two are filled, compute the third and set into state
    const filled = [parsedVol > 0, parsedPrice > 0, parsedTotal > 0].filter(Boolean).length;
    if (filled < 2) return;
    if (lastEdited === 'volume' || lastEdited === 'price') {
      if (parsedVol > 0 && parsedPrice > 0) {
        const t = Number((parsedVol * parsedPrice).toFixed(2));
        if (Math.abs(t - parsedTotal) > 0.01) setTotal(String(t));
      }
    } else if (lastEdited === 'total') {
      if (parsedTotal > 0 && parsedVol > 0 && (!parsedPrice || Math.abs(parsedVol * parsedPrice - parsedTotal) > 0.01)) {
        setPricePerLitre((parsedTotal / parsedVol).toFixed(2));
      } else if (parsedTotal > 0 && parsedPrice > 0 && (!parsedVol || Math.abs(parsedVol * parsedPrice - parsedTotal) > 0.01)) {
        setVolume((parsedTotal / parsedPrice).toFixed(2));
      }
    }
  }, [parsedVol, parsedPrice, parsedTotal, lastEdited]);

  useEffect(() => {
    if (editId) {
      const f = previousFillups.find(x => x.id === editId);
      if (!f) return;
      setVehicleId(f.vehicleId);
      setDate(f.date);
      setOdometer(String(f.odometer));
      setVolume(f.volume.toFixed(2));
      setPricePerLitre(f.pricePerLitre.toFixed(2));
      setTotal(f.totalCost.toFixed(2));
      setStation(f.station || '');
      setFuelGrade(f.fuelGrade || 'Petrol');
      setIsFull(f.isFull);
      setNotes(f.notes || '');
      if (f.tag) setTag(f.tag);
    }
  }, [editId, previousFillups]);

  // Compute inferred mileage since last full fill on this vehicle
  const inferred = useMemo(() => {
    const parsedOdo = Number(odometer) || 0;
    if (!isFull || parsedOdo <= 0 || parsedVol <= 0) return null;
    const asc = vehicleFillups
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
  }, [isFull, odometer, parsedVol, vehicleFillups, date, editId]);

  const cancel = () => navigate('/');

  const save = async () => {
    if (!user) return alert('Sign in first.');
    const parsedOdo = Number(odometer) || 0;
    if (!parsedOdo) return alert('Odometer is required.');
    if (!parsedVol) return alert('Volume is required.');
    if (!parsedPrice) return alert('Price per litre is required.');
    if (DEMO_MODE) { alert('Demo mode: writes disabled.'); navigate('/'); return; }
    try {
      setSaving(true);
      const data: any = {
        userId: user.uid,
        vehicleId,
        date: Timestamp.fromDate(date),
        odometer: parsedOdo,
        volume: parsedVol,
        pricePerLitre: parsedPrice,
        totalCost: Number((parsedVol * parsedPrice).toFixed(2)),
        isFull,
        tag,
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

  const applySms = () => {
    const parsed = parseSMS(smsText);
    if (parsed.total) { setTotal(String(parsed.total)); setLastEdited('total'); }
    if (parsed.station) setStation(parsed.station);
    setShowSms(false);
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

      {/* Live summary strip */}
      <div className="sticky top-14 z-10 md:relative md:top-0 -mx-4 md:mx-0 px-4 md:px-0 pb-3 md:pb-0 md:mb-6 bg-bg/95 backdrop-blur md:bg-transparent md:backdrop-blur-none">
      <div className="border border-rule rounded-lg bg-card p-4 md:p-5">
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          <SummaryStat label="Total" value={parsedTotal ? `₹${parsedTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'} sub={parsedPrice && parsedVol ? `${parsedVol.toFixed(1)} L × ₹${parsedPrice.toFixed(2)}` : ' '} />
          <SummaryStat label="Distance" value={inferred ? `${inferred.distance.toLocaleString('en-IN')} km` : '—'} sub="since last full" />
          <SummaryStat label="Mileage" value={inferred ? inferred.mileage.toFixed(1) : '—'} sub="km/L" />
        </div>
      </div>
      </div>

      {/* Vehicle picker (only if more than one) */}
      {vehicles.length > 1 && (
        <div className="mb-5">
          <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3 mb-1.5">Vehicle</div>
          <div className="flex items-center gap-1 border border-rule rounded-md p-0.5 bg-card">
            {vehicles.map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVehicleId(v.id)}
                className={cx('h-8 px-3 rounded text-xs font-medium transition-colors flex-1', vehicleId === v.id ? 'bg-card2 text-ink' : 'text-ink3 hover:text-ink')}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* SMS parser */}
      <div className="mb-5">
        <button
          type="button"
          onClick={() => setShowSms(v => !v)}
          className="text-xs text-ink3 hover:text-ink underline underline-offset-2 decoration-dotted"
        >
          {showSms ? 'Hide SMS import' : 'Paste bank/UPI SMS to auto-fill'}
        </button>
        {showSms && (
          <div className="mt-2 border border-rule rounded-md bg-card p-3">
            <Textarea
              value={smsText}
              onChange={(e) => setSmsText(e.target.value)}
              rows={2}
              placeholder="Rs.1240.00 debited from a/c...at INDIAN OIL CORP..."
              className="!bg-card2 !border-transparent"
            />
            <div className="flex justify-end mt-2 gap-2">
              <Button size="sm" onClick={() => setShowSms(false)}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={applySms}>Extract</Button>
            </div>
          </div>
        )}
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
          <Field label="Odometer (km)" hint={vehicleFillups.length > 0 ? 'Prefilled from your usual km/day' : undefined}>
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

        <div>
          <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3 mb-1.5">Volume, price & total <span className="normal-case tracking-normal text-ink4 font-normal">— fill any two, the third is computed</span></div>
          <div className="grid grid-cols-3 gap-2">
            <Input
              type="number" inputMode="decimal" step="0.01"
              value={volume}
              onChange={(e) => { setVolume(e.target.value); setLastEdited('volume'); }}
              placeholder="Litres"
            />
            <Input
              type="number" inputMode="decimal" step="0.01"
              value={pricePerLitre}
              onChange={(e) => { setPricePerLitre(e.target.value); setLastEdited('price'); }}
              placeholder="₹/L"
            />
            <Input
              type="number" inputMode="decimal" step="0.01"
              value={total}
              onChange={(e) => { setTotal(e.target.value); setLastEdited('total'); }}
              placeholder="Total ₹"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Station (optional)">
            <Input type="text" value={station} onChange={(e) => setStation(e.target.value)} placeholder="IOCL Anna Nagar" />
          </Field>
          <div>
            <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3 mb-1.5">Fill type</div>
            <div className="inline-flex bg-card2 border border-rule rounded-md p-0.5 h-9">
              <button type="button" onClick={() => setIsFull(true)} className={cx('h-full px-3 rounded text-xs font-medium transition-colors', isFull ? 'bg-card text-ink shadow-sm' : 'text-ink3 hover:text-ink')}>Full tank</button>
              <button type="button" onClick={() => setIsFull(false)} className={cx('h-full px-3 rounded text-xs font-medium transition-colors', !isFull ? 'bg-card text-ink shadow-sm' : 'text-ink3 hover:text-ink')}>Partial</button>
            </div>
          </div>
        </div>

        <div>
          <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3 mb-1.5">Tag</div>
          <div className="inline-flex bg-card2 border border-rule rounded-md p-0.5 h-9">
            <button type="button" onClick={() => setTag('personal')} className={cx('h-full px-3 rounded text-xs font-medium transition-colors', tag === 'personal' ? 'bg-card text-ink shadow-sm' : 'text-ink3 hover:text-ink')}>Personal</button>
            <button type="button" onClick={() => setTag('work')} className={cx('h-full px-3 rounded text-xs font-medium transition-colors', tag === 'work' ? 'bg-card text-ink shadow-sm' : 'text-ink3 hover:text-ink')}>Work</button>
          </div>
          <p className="text-2xs text-ink3 mt-1.5">Work-tagged fills roll up into the monthly expense report.</p>
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
              {parsedTotal ? <span className="opacity-70 font-mono tabular text-sm">· ₹{parsedTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span> : null}
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
      <div className="text-xl md:text-2xl font-semibold text-ink tabular tracking-[-0.02em] mt-1">{value}</div>
      <div className="text-2xs text-ink3 mt-0.5 tabular truncate">{sub}</div>
    </div>
  );
}
