import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVehicle } from '../contexts/VehicleContext';
import { db } from '../config/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Fillup, Vehicle } from '../types';
import { DEMO_MODE } from '../config/demo';
import { DEMO_FILLUPS } from '../config/demoData';
import { Input, cx } from '../components/ui';

type Source = 'latest' | 'average' | 'custom';

interface VehicleStats {
  vehicle: Vehicle;
  latestMileage: number | null;
  averageMileage: number | null;
  latestPrice: number | null;
  averagePrice: number | null;
  fillCount: number;
}

/**
 * Compute per-fill-up mileage from the previous full-tank entry
 * (handles partial fills correctly).
 */
function computeMileages(fillups: Fillup[]): { mileages: number[]; prices: number[] } {
  const asc = [...fillups].sort((a, b) => a.date.getTime() - b.date.getTime());
  const mileages: number[] = [];
  const prices: number[] = asc.map(f => f.pricePerLitre);
  let lastFullOdo: number | null = null;
  let interimVolume = 0;
  for (const f of asc) {
    if (lastFullOdo == null) { if (f.isFull) lastFullOdo = f.odometer; continue; }
    if (!f.isFull) { interimVolume += f.volume; continue; }
    const distance = f.odometer - lastFullOdo;
    const volume = f.volume + interimVolume;
    if (distance > 0 && volume > 0) mileages.push(distance / volume);
    lastFullOdo = f.odometer;
    interimVolume = 0;
  }
  return { mileages, prices };
}

export default function Calculator() {
  const { user } = useAuth();
  const { vehicles } = useVehicle();
  const [allFillups, setAllFillups] = useState<Fillup[]>([]);
  const [loading, setLoading] = useState(true);

  // Inputs
  const [distance, setDistance] = useState<string>('300');
  const [mileageSource, setMileageSource] = useState<Source>('latest');
  const [priceSource, setPriceSource]     = useState<Source>('latest');
  const [customValues, setCustomValues] = useState<Record<string, { mileage: string; price: string }>>({});

  useEffect(() => { if (user) load(); /* eslint-disable-line */ }, [user]);

  const load = async () => {
    if (!user) return;
    if (DEMO_MODE) { setAllFillups([...DEMO_FILLUPS]); setLoading(false); return; }
    try {
      setLoading(true);
      const snap = await getDocs(query(collection(db, 'fillups'), where('userId', '==', user.uid)));
      const list: Fillup[] = [];
      snap.forEach(d => { const data = d.data(); list.push({ id: d.id, ...data, date: data.date.toDate() } as Fillup); });
      list.sort((a, b) => b.date.getTime() - a.date.getTime());
      setAllFillups(list);
    } finally { setLoading(false); }
  };

  // Compute per-vehicle stats
  const vehicleStats: VehicleStats[] = useMemo(() => {
    return vehicles.map(v => {
      const vFills = allFillups.filter(f => f.vehicleId === v.id).sort((a, b) => b.date.getTime() - a.date.getTime());
      const { mileages, prices } = computeMileages(vFills);
      return {
        vehicle: v,
        latestMileage: mileages.length ? mileages[mileages.length - 1] : null,
        averageMileage: mileages.length ? mileages.reduce((a, b) => a + b, 0) / mileages.length : null,
        latestPrice: vFills[0]?.pricePerLitre ?? null,
        averagePrice: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
        fillCount: vFills.length,
      };
    });
  }, [vehicles, allFillups]);

  // Initialize custom values from Latest when vehicles change
  useEffect(() => {
    setCustomValues(prev => {
      const next = { ...prev };
      for (const vs of vehicleStats) {
        if (!next[vs.vehicle.id]) {
          next[vs.vehicle.id] = {
            mileage: vs.latestMileage ? vs.latestMileage.toFixed(1) : '',
            price:   vs.latestPrice   ? vs.latestPrice.toFixed(2)   : '',
          };
        }
      }
      return next;
    });
  }, [vehicleStats]);

  const dist = Number(distance) || 0;

  const results = vehicleStats.map(vs => {
    const cv = customValues[vs.vehicle.id];
    let mileage: number | null = null;
    let mileageSrc: Source = mileageSource;
    if (mileageSource === 'latest')  mileage = vs.latestMileage;
    else if (mileageSource === 'average') mileage = vs.averageMileage;
    else                                   mileage = cv?.mileage ? Number(cv.mileage) : null;
    if (mileage == null) { mileage = vs.latestMileage ?? vs.averageMileage; mileageSrc = 'latest'; }

    let price: number | null = null;
    let priceSrc: Source = priceSource;
    if (priceSource === 'latest')  price = vs.latestPrice;
    else if (priceSource === 'average') price = vs.averagePrice;
    else                                 price = cv?.price ? Number(cv.price) : null;
    if (price == null) { price = vs.latestPrice ?? vs.averagePrice; priceSrc = 'latest'; }

    const volume = mileage && mileage > 0 ? dist / mileage : 0;
    const cost = volume * (price || 0);
    const costPerKm = dist > 0 ? cost / dist : 0;
    return { vs, mileage, price, volume, cost, costPerKm, mileageSrc, priceSrc };
  });

  // Only compare vehicles that actually have fill-up history AND a computable cost
  const comparable = results.filter(r => r.vs.fillCount > 0 && r.cost > 0);
  const sorted = [...comparable].sort((a, b) => a.cost - b.cost);
  const cheapest = sorted[0];
  const priciest = sorted[sorted.length - 1];
  const spread = cheapest && priciest && cheapest !== priciest ? priciest.cost - cheapest.cost : 0;

  const labelFor = (s: Source) => s === 'latest' ? 'latest' : s === 'average' ? 'average' : 'custom';
  const sourceLabel = mileageSource === priceSource
    ? `${labelFor(mileageSource)} values`
    : `${labelFor(mileageSource)} mileage & ${labelFor(priceSource)} price`;

  if (loading) return <div className="max-w-page mx-auto px-4 md:px-6 py-16 text-sm text-ink3 text-center">Loading…</div>;

  return (
    <div className="max-w-page mx-auto w-full px-4 md:px-6 py-6 md:py-8 rise">
      <div className="mb-8">
        <div className="text-2xs uppercase tracking-[0.1em] font-semibold text-ink3">Cost estimator</div>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.02em]">Calculator</h1>
        <p className="text-sm text-ink3 mt-1 max-w-xl">
          Enter a distance and see the estimated fuel cost for every vehicle. Uses your fill-up history for mileage and price, or override with custom values.
        </p>
      </div>

      {/* Inputs */}
      <div className="border border-rule rounded-lg bg-card mb-6">
        <div className="flex flex-col md:flex-row md:items-stretch md:divide-x md:divide-rule">
          <div className="flex-1 px-4 py-4 md:px-5">
            <div className="text-2xs uppercase tracking-[0.1em] font-semibold text-ink3 mb-1.5">Distance</div>
            <div className="flex items-baseline gap-2">
              <Input
                type="number"
                inputMode="numeric"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                placeholder="300"
                className="!h-11 !text-xl !font-semibold !tabular tracking-[-0.015em] !pl-3"
              />
              <span className="text-sm text-ink3 font-mono tabular">km</span>
            </div>
          </div>
          <SourceToggle label="Mileage from" value={mileageSource} onChange={setMileageSource} />
          <SourceToggle label="Price from"   value={priceSource}   onChange={setPriceSource} />
        </div>
      </div>

      {/* Per-vehicle results */}
      {vehicles.length === 0 ? (
        <div className="border border-dashed border-rule2 rounded-lg py-16 px-6 text-center">
          <div className="text-md font-semibold text-ink mb-1">No vehicles yet</div>
          <div className="text-sm text-ink3">Add a vehicle to start estimating trip costs.</div>
        </div>
      ) : (
        <div
          className={cx(
            'grid gap-3 mb-6',
            vehicles.length === 1
              ? 'grid-cols-1 max-w-[520px]'
              : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
          )}
        >
          {results.map((r, i) => (
            <VehicleCostCard
              key={r.vs.vehicle.id}
              vs={r.vs}
              mileage={r.mileage || 0}
              price={r.price || 0}
              volume={r.volume}
              cost={r.cost}
              costPerKm={r.costPerKm}
              mileageSource={mileageSource}
              priceSource={priceSource}
              mileageSrc={r.mileageSrc}
              priceSrc={r.priceSrc}
              customValues={customValues[r.vs.vehicle.id] || { mileage: '', price: '' }}
              setCustomValues={(v) => setCustomValues(cv => ({ ...cv, [r.vs.vehicle.id]: v }))}
              isCheapest={r === cheapest && vehicles.length > 1}
              rank={i}
            />
          ))}
        </div>
      )}

      {/* Callout comparison */}
      {cheapest && priciest && spread > 0.5 && (
        <div className="border border-rule rounded-lg bg-card2 p-4 text-sm">
          For <span className="font-mono tabular text-ink font-semibold">{dist.toLocaleString('en-IN')} km</span> using {sourceLabel},{' '}
          <span className="text-ink font-semibold">{cheapest.vs.vehicle.name}</span>{' '}
          <span className="text-ink3">costs</span>{' '}
          <span className="text-ink font-mono tabular font-semibold">₹{cheapest.cost.toFixed(0)}</span>
          <span className="text-ink3"> — </span>
          <span className="text-up font-mono tabular font-semibold">₹{spread.toFixed(0)} less</span>{' '}
          <span className="text-ink3">than</span>{' '}
          <span className="text-ink font-semibold">{priciest.vs.vehicle.name}</span>
          <span className="text-ink3"> (₹{priciest.cost.toFixed(0)}).</span>
        </div>
      )}
    </div>
  );
}

function VehicleCostCard({
  vs, mileage, price, volume, cost, costPerKm, mileageSource, priceSource, mileageSrc, priceSrc,
  customValues, setCustomValues, isCheapest,
}: {
  vs: VehicleStats;
  mileage: number;
  price: number;
  volume: number;
  cost: number;
  costPerKm: number;
  mileageSource: Source;
  priceSource: Source;
  mileageSrc: Source;
  priceSrc: Source;
  customValues: { mileage: string; price: string };
  setCustomValues: (v: { mileage: string; price: string }) => void;
  isCheapest: boolean;
  rank: number;
}) {
  const noHistory = vs.fillCount === 0;
  const anyCustom = mileageSource === 'custom' || priceSource === 'custom';
  const srcLabel = (src: Source) => src === 'custom' ? 'Custom' : src === 'latest' ? 'Latest' : 'Avg';
  return (
    <div className={cx('border rounded-lg p-5 bg-card relative', isCheapest ? 'border-up/60 shadow-[0_0_0_1px_var(--up)_inset]' : 'border-rule')}>
      {isCheapest && (
        <div className="absolute top-3 right-3 text-2xs uppercase tracking-[0.08em] font-semibold text-up">Cheapest</div>
      )}
      <div className="mb-4">
        <div className="text-md font-semibold text-ink">{vs.vehicle.name}</div>
        <div className="text-2xs text-ink3 font-mono tabular">{vs.vehicle.plate || vs.vehicle.model || ''}</div>
      </div>

      {noHistory ? (
        <div className="text-sm text-ink3">No fill-ups yet. Log one to get an estimate.</div>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-4xl font-bold text-ink tabular tracking-[-0.03em]">
              ₹{cost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
            <span className="text-sm text-ink3 font-mono tabular">estimated</span>
          </div>

          <div className="grid grid-cols-3 gap-px bg-rule border border-rule rounded-md overflow-hidden mb-3">
            <MiniStat label="Mileage" value={mileage.toFixed(1)} unit="km/L" src={srcLabel(mileageSrc)} />
            <MiniStat label="₹/L"     value={price.toFixed(2)}    unit="₹"    src={srcLabel(priceSrc)} />
            <MiniStat label="Volume"  value={volume.toFixed(2)}   unit="L"    src="" />
          </div>

          <div className="text-2xs text-ink3 font-mono tabular">
            Cost per km <span className="text-ink font-semibold">₹{costPerKm.toFixed(2)}</span>
          </div>

          {anyCustom && (
            <div className={cx(
              'mt-4 pt-4 border-t border-rule grid gap-3',
              mileageSource === 'custom' && priceSource === 'custom' ? 'grid-cols-2' : 'grid-cols-1',
            )}>
              {mileageSource === 'custom' && (
                <div>
                  <div className="text-2xs uppercase tracking-[0.06em] font-semibold text-ink3 mb-1">Mileage (km/L)</div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={customValues.mileage}
                    onChange={(e) => setCustomValues({ ...customValues, mileage: e.target.value })}
                  />
                </div>
              )}
              {priceSource === 'custom' && (
                <div>
                  <div className="text-2xs uppercase tracking-[0.06em] font-semibold text-ink3 mb-1">Price (₹/L)</div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={customValues.price}
                    onChange={(e) => setCustomValues({ ...customValues, price: e.target.value })}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SourceToggle({ label, value, onChange }: { label: string; value: Source; onChange: (s: Source) => void }) {
  return (
    <div className="px-4 py-4 md:px-5 md:flex md:flex-col md:justify-between">
      <div className="text-2xs uppercase tracking-[0.1em] font-semibold text-ink3 mb-1.5">{label}</div>
      <div className="inline-flex self-start bg-card2 border border-rule rounded-md p-0.5 h-11">
        {(['latest', 'average', 'custom'] as const).map(s => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={cx(
              'h-full px-3.5 rounded text-sm font-medium capitalize transition-colors',
              value === s ? 'bg-card text-ink shadow-sm' : 'text-ink3 hover:text-ink',
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value, unit, src }: { label: string; value: string; unit: string; src: string }) {
  return (
    <div className="bg-card p-3">
      <div className="text-2xs uppercase tracking-[0.06em] font-semibold text-ink3 flex items-baseline justify-between">
        <span>{label}</span>
        {src && <span className="text-ink4 normal-case tracking-normal text-[9px]">{src}</span>}
      </div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-md font-semibold text-ink tabular">{value}</span>
        <span className="text-2xs text-ink3 font-mono">{unit}</span>
      </div>
    </div>
  );
}
