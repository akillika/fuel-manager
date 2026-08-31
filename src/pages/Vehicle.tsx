import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../config/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Vehicle as V } from '../types';
import { DEMO_MODE } from '../config/demo';
import { DEMO_VEHICLES } from '../config/demoData';
import { Card, Field, Input, Button } from '../components/ui';

export default function Vehicle() {
  const { user } = useAuth();
  const [vehicle, setVehicle] = useState<V | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) load(); /* eslint-disable-line */ }, [user]);
  const load = async () => {
    if (!user) return;
    if (DEMO_MODE) { setVehicle(DEMO_VEHICLES[0]); setLoading(false); return; }
    try {
      setLoading(true);
      const snap = await getDocs(query(collection(db, 'vehicles'), where('userId', '==', user.uid)));
      snap.forEach(d => { const data = d.data(); setVehicle({ id: d.id, ...data, createdAt: data.createdAt.toDate() } as V); });
    } finally { setLoading(false); }
  };

  if (loading) return <div className="max-w-page mx-auto px-4 md:px-6 py-16 text-sm text-ink3 text-center">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto w-full px-4 md:px-6 py-6 md:py-8 rise">
      <div className="mb-8">
        <div className="text-2xs uppercase tracking-[0.1em] font-semibold text-ink3">Vehicle</div>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.02em]">{vehicle?.name || 'My car'}</h1>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Name"><Input defaultValue={vehicle?.name || ''} placeholder="Baleno" /></Field>
          <Field label="Number plate"><Input defaultValue={vehicle?.plate || ''} placeholder="TN 22 AB 4302" /></Field>
          <Field label="Make"><Input defaultValue={vehicle?.make || ''} placeholder="Maruti Suzuki" /></Field>
          <Field label="Model"><Input defaultValue={vehicle?.model || ''} placeholder="Baleno Delta" /></Field>
          <Field label="Fuel type"><Input defaultValue={vehicle?.fuelType || 'Petrol'} placeholder="Petrol" /></Field>
          <Field label="Tank capacity (L)"><Input defaultValue={vehicle?.tankCapacity ?? ''} type="number" placeholder="37" /></Field>
        </div>
        <div className="flex justify-end mt-6">
          <Button variant="primary" onClick={() => alert(DEMO_MODE ? 'Demo mode: writes disabled.' : 'Saved.')}>Save</Button>
        </div>
      </Card>

      <div className="text-2xs text-ink3">
        Only one vehicle for now. Multi-vehicle support is coming.
      </div>
    </div>
  );
}
