import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useVehicle } from '../contexts/VehicleContext';
import { db } from '../config/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { DEMO_MODE } from '../config/demo';
import { parseFuelio, FuelioParsed } from '../lib/fuelio';
import { Button, Field, Textarea, Select, IconArrowRight } from '../components/ui';

type VehicleMapping = { targetVehicleId: string | 'new'; targetName?: string };

export default function Import() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { vehicles, refreshVehicles } = useVehicle();

  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState<FuelioParsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mappings, setMappings] = useState<VehicleMapping[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ vehicles: number; fillups: number } | null>(null);

  const handleFile = async (f: File | null) => {
    if (!f) return;
    try {
      const text = await f.text();
      setCsvText(text);
      handleParse(text);
    } catch (e: any) {
      setError(`Failed to read file: ${e?.message || 'unknown error'}`);
    }
  };

  const handleParse = (text?: string) => {
    setError(null);
    setImportResult(null);
    const source = text ?? csvText;
    if (!source.trim()) { setError('Paste your Fuelio CSV or upload the file first.'); return; }
    try {
      const p = parseFuelio(source);
      if (p.vehicles.length === 0) { setError('No vehicle found in this file. Is it a valid Fuelio export?'); setParsed(null); return; }
      setParsed(p);
      setMappings(p.vehicles.map(v => {
        // Try to match by name to an existing vehicle
        const match = vehicles.find(x => x.name.toLowerCase() === v.vehicle.name.toLowerCase());
        return match
          ? { targetVehicleId: match.id }
          : { targetVehicleId: 'new', targetName: v.vehicle.name };
      }));
    } catch (e: any) {
      setError(`Parse failed: ${e?.message || 'unknown error'}`);
      setParsed(null);
    }
  };

  const doImport = async () => {
    if (!user || !parsed) return;
    if (DEMO_MODE) {
      const totalFills = parsed.vehicles.reduce((s, v) => s + v.fillups.length, 0);
      setImportResult({ vehicles: parsed.vehicles.length, fillups: totalFills });
      return;
    }
    try {
      setImporting(true);
      let vehicleCount = 0;
      let fillCount = 0;
      for (let i = 0; i < parsed.vehicles.length; i++) {
        const src = parsed.vehicles[i];
        const map = mappings[i];
        let targetId = map.targetVehicleId;
        if (targetId === 'new') {
          const vData: any = {
            userId: user.uid,
            name: map.targetName || src.vehicle.name,
            fuelType: src.vehicle.fuelType || 'Petrol',
            createdAt: Timestamp.fromDate(new Date()),
          };
          if (src.vehicle.make) vData.make = src.vehicle.make;
          if (src.vehicle.model) vData.model = src.vehicle.model;
          if (src.vehicle.plate) vData.plate = src.vehicle.plate;
          if (src.vehicle.tankCapacity) vData.tankCapacity = src.vehicle.tankCapacity;
          const ref = await addDoc(collection(db, 'vehicles'), vData);
          targetId = ref.id;
          vehicleCount++;
        }
        // Fill-ups
        for (const f of src.fillups) {
          const fData: any = {
            userId: user.uid,
            vehicleId: targetId,
            date: Timestamp.fromDate(f.date),
            odometer: f.odometer,
            volume: f.volume,
            pricePerLitre: f.pricePerLitre,
            totalCost: f.totalCost,
            isFull: f.isFull,
          };
          if (f.station) fData.station = f.station;
          if (f.fuelGrade) fData.fuelGrade = f.fuelGrade;
          if (f.notes) fData.notes = f.notes;
          await addDoc(collection(db, 'fillups'), fData);
          fillCount++;
        }
      }
      await refreshVehicles();
      setImportResult({ vehicles: vehicleCount, fillups: fillCount });
    } catch (e: any) {
      setError(`Import failed after partial write: ${e?.message || 'unknown error'}`);
    } finally {
      setImporting(false);
    }
  };

  // Preview summary numbers
  const totals = useMemo(() => {
    if (!parsed) return null;
    let fillups = 0;
    let earliest: Date | null = null;
    let latest: Date | null = null;
    let firstOdo: number | null = null;
    let lastOdo: number | null = null;
    let totalCost = 0;
    let totalVolume = 0;
    parsed.vehicles.forEach(v => {
      fillups += v.fillups.length;
      totalCost += v.fillups.reduce((s, f) => s + f.totalCost, 0);
      totalVolume += v.fillups.reduce((s, f) => s + f.volume, 0);
      v.fillups.forEach(f => {
        if (!earliest || f.date < earliest) earliest = f.date;
        if (!latest   || f.date > latest)   latest   = f.date;
        if (firstOdo == null || f.odometer < firstOdo) firstOdo = f.odometer;
        if (lastOdo  == null || f.odometer > lastOdo)  lastOdo  = f.odometer;
      });
    });
    return { fillups, earliest, latest, firstOdo, lastOdo, totalCost, totalVolume };
  }, [parsed]);

  return (
    <div className="max-w-page mx-auto w-full px-4 md:px-6 py-6 md:py-8 rise">
      <div className="mb-8">
        <div className="text-2xs uppercase tracking-[0.1em] font-semibold text-ink3">Data</div>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.02em]">Import from Fuelio</h1>
        <p className="text-sm text-ink3 mt-1 max-w-xl">
          Paste your Fuelio CSV export or upload the file. Vehicles and fill-ups will be previewed before anything is written. Costs/pictures sections are ignored.
        </p>
      </div>

      {!importResult && (
        <div className="border border-rule rounded-lg bg-card p-5 mb-6">
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <label className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-card2 border border-rule text-sm font-medium text-ink cursor-pointer hover:bg-bg3 transition-colors">
              <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] || null)} />
              Choose file
            </label>
            <span className="text-2xs text-ink3">— or paste below</span>
            <div className="ml-auto flex items-center gap-2">
              {csvText && <Button size="sm" onClick={() => { setCsvText(''); setParsed(null); setError(null); }}>Clear</Button>}
              <Button size="sm" variant="primary" onClick={() => handleParse()}>Parse</Button>
            </div>
          </div>
          <Field label="Fuelio CSV">
            <Textarea
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={'## Vehicle\n"Name","Description",...\n"Classic 350",...\n## Log\n...'}
              className="font-mono !text-xs"
            />
          </Field>
          {error && (
            <div className="mt-3 text-xs text-down px-3 py-2 rounded-md border border-down/40 bg-down/5">{error}</div>
          )}
        </div>
      )}

      {parsed && !importResult && totals && (
        <>
          {/* Summary numbers */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-rule border-y border-rule mb-6">
            <SmallStat label="Vehicles"  value={String(parsed.vehicles.length)} sub={parsed.vehicles.map(v => v.vehicle.name).join(', ')} />
            <SmallStat label="Fill-ups"  value={String(totals.fillups)} sub={totals.earliest && totals.latest ? `${format(totals.earliest, 'dd MMM yy')} → ${format(totals.latest, 'dd MMM yy')}` : ''} />
            <SmallStat label="Distance"  value={totals.firstOdo != null && totals.lastOdo != null ? `${(totals.lastOdo - totals.firstOdo).toLocaleString('en-IN')} km` : '—'} sub="between first and last odo" />
            <SmallStat label="Total spend" value={`₹${totals.totalCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} sub={`${totals.totalVolume.toFixed(0)} L`} />
          </div>

          {/* Vehicle mapping */}
          <div className="mb-6">
            <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3 mb-3">Map to my vehicles</div>
            <div className="grid grid-cols-1 gap-3">
              {parsed.vehicles.map((src, i) => {
                const map = mappings[i];
                if (!map) return null;
                return (
                  <div key={i} className="border border-rule rounded-lg bg-card p-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <div className="text-md font-semibold text-ink">{src.vehicle.name}</div>
                        <div className="text-2xs text-ink3 font-mono tabular">
                          {src.fillups.length} fills{src.vehicle.plate ? ` · ${src.vehicle.plate}` : ''}{src.vehicle.fuelType ? ` · ${src.vehicle.fuelType}` : ''}
                        </div>
                      </div>
                      <div className="inline-flex items-center gap-2">
                        <IconArrowRight className="text-ink3" />
                        <Select
                          value={map.targetVehicleId}
                          onChange={(e) => {
                            const next = [...mappings];
                            next[i] = { ...next[i], targetVehicleId: e.target.value };
                            setMappings(next);
                          }}
                        >
                          {vehicles.map(v => (<option key={v.id} value={v.id}>{v.name}</option>))}
                          <option value="new">+ Create new vehicle</option>
                        </Select>
                        {map.targetVehicleId === 'new' && (
                          <input
                            type="text"
                            value={map.targetName || ''}
                            onChange={(e) => {
                              const next = [...mappings];
                              next[i] = { ...next[i], targetName: e.target.value };
                              setMappings(next);
                            }}
                            placeholder="Name"
                            className="h-9 px-3 rounded-md bg-card2 border border-rule text-sm text-ink"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Preview table */}
          {parsed.vehicles.map((src, i) => (
            <div key={i} className="mb-6">
              <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3 mb-3">{src.vehicle.name} · preview (first 8)</div>
              <div className="border border-rule rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-card2 text-2xs uppercase tracking-[0.06em] font-semibold text-ink3">
                    <tr>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-right px-3 py-2">Odometer</th>
                      <th className="text-right px-3 py-2">Litres</th>
                      <th className="text-right px-3 py-2">₹/L</th>
                      <th className="text-right px-3 py-2">Total</th>
                      <th className="text-right px-3 py-2">Full</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {src.fillups.slice(0, 8).map((f, k) => (
                      <tr key={k}>
                        <td className="px-3 py-2 text-ink tabular">{format(f.date, 'yyyy-MM-dd')}</td>
                        <td className="px-3 py-2 text-right font-mono tabular text-ink">{f.odometer.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-right font-mono tabular text-ink">{f.volume.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular text-ink2">{f.pricePerLitre.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular text-ink font-semibold">₹{f.totalCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                        <td className="px-3 py-2 text-right text-2xs">{f.isFull ? '✓' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {src.fillups.length > 8 && <div className="text-2xs text-ink3 mt-2 tabular">+ {src.fillups.length - 8} more rows will be imported.</div>}
            </div>
          ))}

          <div className="flex items-center justify-end gap-2 pt-6 border-t border-rule">
            <Button onClick={() => { setParsed(null); setMappings([]); }}>Cancel</Button>
            <Button variant="primary" onClick={doImport} disabled={importing}>
              {importing ? 'Importing…' : DEMO_MODE ? 'Import (demo)' : `Import ${totals.fillups} fill-ups`}
            </Button>
          </div>
        </>
      )}

      {importResult && (
        <div className="border border-up/40 bg-up/5 rounded-lg p-6 text-center">
          <div className="text-md font-semibold text-ink mb-2">Import complete{DEMO_MODE ? ' (demo mode)' : ''}</div>
          <div className="text-sm text-ink2 mb-4">
            {importResult.vehicles > 0 && <span>Created {importResult.vehicles} vehicle{importResult.vehicles === 1 ? '' : 's'}. </span>}
            {DEMO_MODE
              ? <>Would have written <span className="font-mono tabular">{importResult.fillups}</span> fill-ups to Firestore in production.</>
              : <>Wrote <span className="font-mono tabular">{importResult.fillups}</span> fill-ups.</>}
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={() => { setImportResult(null); setParsed(null); setCsvText(''); }}>Import another</Button>
            <Button variant="primary" onClick={() => navigate('/fillups')}>See fill-ups <IconArrowRight width={12} height={12} /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SmallStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-bg p-4">
      <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3">{label}</div>
      <div className="text-xl font-semibold text-ink tabular tracking-[-0.02em] mt-1">{value}</div>
      <div className="text-2xs text-ink3 mt-1 tabular truncate">{sub}</div>
    </div>
  );
}
