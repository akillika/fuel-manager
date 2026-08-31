import { useEffect, useMemo, useRef, useState } from 'react';
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
// Type-only import - doesn't ship anything at runtime.
import type { ReceiptExtract } from '../lib/receiptOcr';

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
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<{ pct: number; stage: string } | null>(null);
  const [ocrResult, setOcrResult] = useState<ReceiptExtract | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
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

  // Prior stations, sorted by how often the user has filled up there.
  // Falls back to the full history if the current vehicle has none yet.
  const stationOptions = useMemo(() => {
    const scope = vehicleFillups.length ? vehicleFillups : previousFillups;
    const counts = new Map<string, number>();
    for (const f of scope) {
      const name = f.station?.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
  }, [vehicleFillups, previousFillups]);

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

  const handleReceiptFile = async (f: File | null) => {
    if (!f) return;
    setOcrOpen(true);
    setOcrProgress({ pct: 0, stage: 'loading' });
    setOcrResult(null);
    setOcrError(null);
    try {
      // Dynamic import so the OCR module (and its network call) is only
      // pulled in when Scan receipt is actually tapped.
      const mod = await import('../lib/receiptOcr');
      const res = await mod.ocrImage(f, (pct, stage) => setOcrProgress({ pct, stage }));
      setOcrResult(res);
    } catch (e: any) {
      setOcrError(e?.message || 'OCR failed');
    } finally {
      setOcrProgress(null);
    }
  };

  const applyOcr = () => {
    if (!ocrResult) return;
    if (ocrResult.volume) { setVolume(ocrResult.volume.toFixed(2)); setLastEdited('volume'); }
    if (ocrResult.pricePerLitre) { setPricePerLitre(ocrResult.pricePerLitre.toFixed(2)); setLastEdited('price'); }
    if (ocrResult.total) { setTotal(ocrResult.total.toFixed(2)); setLastEdited('total'); }
    if (ocrResult.station && !station) setStation(ocrResult.station);
    if (ocrResult.fuelGrade && !fuelGrade) setFuelGrade(ocrResult.fuelGrade);
    setOcrOpen(false);
    setOcrResult(null);
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

      {/* Auto-fill helpers */}
      <div className="mb-5 flex items-center gap-4 flex-wrap">
        <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-ink text-bg text-sm font-medium cursor-pointer hover:opacity-90 transition-opacity">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleReceiptFile(e.target.files?.[0] || null)}
          />
          Scan receipt
        </label>
        <button
          type="button"
          onClick={() => setShowSms(v => !v)}
          className="text-xs text-ink3 hover:text-ink underline underline-offset-2 decoration-dotted"
        >
          {showSms ? 'Hide SMS import' : 'or paste bank SMS'}
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
            <StationCombobox
              value={station}
              onChange={setStation}
              options={stationOptions}
              placeholder="IOCL Anna Nagar"
            />
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

      {/* OCR modal */}
      {ocrOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { if (!ocrProgress) { setOcrOpen(false); setOcrResult(null); setOcrError(null); } }} />
          <div className="relative bg-card border-t md:border border-rule rounded-t-lg md:rounded-lg shadow-popover w-full md:max-w-lg md:w-full max-h-[92vh] overflow-hidden flex flex-col rise" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="md:hidden mx-auto mt-2 mb-1 w-10 h-1 rounded-full bg-rule2" />
            <div className="flex items-center justify-between p-4 border-b border-rule">
              <h3 className="text-md font-semibold text-ink">Scan receipt</h3>
              {!ocrProgress && <button onClick={() => { setOcrOpen(false); setOcrResult(null); setOcrError(null); }} className="inline-flex items-center justify-center w-8 h-8 rounded-md text-ink3 hover:text-ink hover:bg-card2 transition-colors"><IconClose /></button>}
            </div>
            <div className="p-5 overflow-y-auto">
              {ocrProgress ? (
                <div>
                  <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3">{ocrProgress.stage || 'Working'}</div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-ink tabular tracking-[-0.02em]">{ocrProgress.pct}%</span>
                    <span className="text-sm text-ink3 font-mono tabular">reading receipt</span>
                  </div>
                  <div className="mt-4 h-1 bg-card2 rounded-full overflow-hidden">
                    <div className="h-full bg-ink transition-[width] duration-200" style={{ width: `${ocrProgress.pct}%` }} />
                  </div>
                  <p className="mt-4 text-xs text-ink3">
                    First run downloads ~4 MB of the OCR model. Later scans are instant.
                  </p>
                </div>
              ) : ocrError ? (
                <div>
                  <div className="text-md font-semibold text-down mb-2">Scan failed</div>
                  <div className="text-sm text-ink3">{ocrError}</div>
                </div>
              ) : ocrResult ? (
                <div>
                  <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3 mb-2">Detected values</div>
                  <div className="grid grid-cols-3 gap-px bg-rule border border-rule rounded-md overflow-hidden mb-4">
                    <ReadCell label="Volume" value={ocrResult.volume ? `${ocrResult.volume.toFixed(2)} L` : '—'} />
                    <ReadCell label="Rs/L"   value={ocrResult.pricePerLitre ? `Rs ${ocrResult.pricePerLitre.toFixed(2)}` : '—'} />
                    <ReadCell label="Total"  value={ocrResult.total ? `Rs ${ocrResult.total.toFixed(0)}` : '—'} />
                  </div>
                  {(ocrResult.station || ocrResult.fuelGrade) && (
                    <div className="text-xs text-ink3 tabular mb-4">
                      {ocrResult.station && <>Station <span className="text-ink font-mono">{ocrResult.station}</span></>}
                      {ocrResult.station && ocrResult.fuelGrade && ' · '}
                      {ocrResult.fuelGrade && <>Grade <span className="text-ink font-mono">{ocrResult.fuelGrade}</span></>}
                    </div>
                  )}
                  <details className="text-xs text-ink3">
                    <summary className="cursor-pointer hover:text-ink">See raw text (confidence {Math.round(ocrResult.confidence)}%)</summary>
                    <pre className="mt-2 p-3 bg-card2 rounded-md text-2xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">{ocrResult.rawText || '(empty)'}</pre>
                  </details>
                </div>
              ) : null}
            </div>
            {!ocrProgress && ocrResult && (
              <div className="flex items-center justify-end gap-2 p-4 border-t border-rule">
                <Button onClick={() => { setOcrOpen(false); setOcrResult(null); }}>Cancel</Button>
                <Button variant="primary" onClick={applyOcr}>Apply to form</Button>
              </div>
            )}
          </div>
        </div>
      )}
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

function ReadCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-3">
      <div className="text-2xs uppercase tracking-[0.06em] font-semibold text-ink3">{label}</div>
      <div className="text-md font-semibold text-ink tabular mt-1">{value}</div>
    </div>
  );
}

/**
 * Typeahead combobox: an app-styled text input that shows a floating panel of
 * matching prior stations as the user types. Free text is still accepted so
 * a brand-new station name can be entered.
 */
function StationCombobox({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options.slice(0, 20);
    return options
      .filter(o => o.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts;
      })
      .slice(0, 20);
  }, [value, options]);

  useEffect(() => { setActive(0); }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive(a => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      if (open && filtered[active]) {
        e.preventDefault();
        pick(filtered[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const hasQuery = value.trim().length > 0;
  const exact = hasQuery && options.some(o => o.toLowerCase() === value.trim().toLowerCase());
  const showAddNew = hasQuery && !exact;

  return (
    <div ref={rootRef} className="relative">
      <Input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onKeyDown={onKey}
        aria-expanded={open}
        aria-autocomplete="list"
        role="combobox"
      />
      {open && (filtered.length > 0 || showAddNew) && (
        <div
          className="absolute left-0 right-0 z-30 mt-1 rounded-md border border-rule2 bg-card shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] overflow-hidden"
          role="listbox"
        >
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.map((name, i) => (
              <button
                key={name}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(name)}
                className={cx(
                  'w-full text-left px-3 py-1.5 text-sm flex items-center justify-between transition-colors',
                  i === active ? 'bg-card2 text-ink' : 'text-ink2 hover:bg-card2',
                )}
                role="option"
                aria-selected={i === active}
              >
                <span>{name}</span>
                {i === active && <span className="text-2xs text-ink3 font-mono">↵</span>}
              </button>
            ))}
            {showAddNew && (
              <div
                className={cx(
                  'px-3 py-1.5 text-sm text-ink3 flex items-center justify-between',
                  filtered.length > 0 ? 'border-t border-rule mt-1 pt-2' : '',
                )}
              >
                <span>Use “<span className="text-ink font-medium">{value.trim()}</span>”</span>
                <span className="text-2xs font-mono">new</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
