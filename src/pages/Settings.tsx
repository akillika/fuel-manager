import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../config/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { FuelGoals } from '../types';
import { DEMO_MODE } from '../config/demo';
import { DEMO_GOALS } from '../config/demoData';
import { Card, Field, Input, Button, IconArrowRight } from '../components/ui';

export default function Settings() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<FuelGoals | null>(null);
  const [budget, setBudget] = useState<string>('');
  const [yearlyBudget, setYearlyBudget] = useState<string>('');
  const [mileageTarget, setMileageTarget] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (user) load(); /* eslint-disable-line */ }, [user]);
  const load = async () => {
    if (!user) return;
    if (DEMO_MODE) {
      const g = DEMO_GOALS[0];
      setGoals(g);
      setBudget(String(g.monthlyBudget || ''));
      setYearlyBudget(String(g.yearlyBudget || ''));
      setMileageTarget(String(g.mileageTarget || ''));
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const snap = await getDocs(query(collection(db, 'fuelGoals'), where('userId', '==', user.uid)));
      snap.forEach(d => {
        const data = d.data();
        const g: FuelGoals = { id: d.id, ...data, createdAt: data.createdAt.toDate(), updatedAt: data.updatedAt.toDate() } as FuelGoals;
        setGoals(g);
        setBudget(String(g.monthlyBudget || ''));
        setYearlyBudget(String(g.yearlyBudget || ''));
        setMileageTarget(String(g.mileageTarget || ''));
      });
    } finally { setLoading(false); }
  };

  const save = async () => {
    if (!user) return;
    if (DEMO_MODE) { alert('Demo mode: writes disabled.'); return; }
    try {
      setSaving(true);
      const data: any = {
        userId: user.uid,
        monthlyBudget: Number(budget) || 0,
        yearlyBudget: Number(yearlyBudget) || 0,
        mileageTarget: Number(mileageTarget) || 0,
        updatedAt: Timestamp.fromDate(new Date()),
      };
      if (goals?.id) {
        await updateDoc(doc(db, 'fuelGoals', goals.id), { ...data, createdAt: Timestamp.fromDate(goals.createdAt) });
      } else {
        data.createdAt = Timestamp.fromDate(new Date());
        await addDoc(collection(db, 'fuelGoals'), data);
      }
      alert('Saved.');
      await load();
    } finally { setSaving(false); }
  };

  if (loading) return <div className="max-w-page mx-auto px-4 md:px-6 py-16 text-sm text-ink3 text-center">Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto w-full px-4 md:px-6 py-6 md:py-8 rise">
      <div className="mb-8">
        <div className="text-2xs uppercase tracking-[0.1em] font-semibold text-ink3">Targets</div>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.02em]">Settings</h1>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Monthly budget (₹)" hint="Nudges the Overview card colour when you cross it.">
            <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="6000" />
          </Field>
          <Field label="Yearly budget (₹)" hint="Colors the Year-to-date projection tile.">
            <Input type="number" value={yearlyBudget} onChange={(e) => setYearlyBudget(e.target.value)} placeholder="70000" />
          </Field>
          <Field label="Mileage target (km/L)" hint="Shows as a dashed reference line on the trend chart.">
            <Input type="number" step="0.1" value={mileageTarget} onChange={(e) => setMileageTarget(e.target.value)} placeholder="19" />
          </Field>
        </div>
        <div className="flex justify-end mt-6">
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </Card>

      {/* Data section */}
      <div className="mt-8">
        <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3 mb-3">Data</div>
        <div className="grid grid-cols-1 gap-3">
          <Link to="/import" className="border border-rule rounded-lg bg-card p-5 hover:border-rule2 transition-colors group flex items-center justify-between gap-4">
            <div>
              <div className="text-md font-semibold text-ink">Import from Fuelio</div>
              <div className="text-xs text-ink3 mt-0.5">Paste or upload your Fuelio CSV export. Vehicles and fill-ups are previewed before anything is written.</div>
            </div>
            <IconArrowRight className="text-ink3 group-hover:text-ink transition-colors shrink-0" />
          </Link>
          <Link to="/fillups" className="border border-rule rounded-lg bg-card p-5 hover:border-rule2 transition-colors group flex items-center justify-between gap-4">
            <div>
              <div className="text-md font-semibold text-ink">Export</div>
              <div className="text-xs text-ink3 mt-0.5">CSV of every fill-up, or a work-tagged expense report. Both buttons live in the Fill-ups toolbar.</div>
            </div>
            <IconArrowRight className="text-ink3 group-hover:text-ink transition-colors shrink-0" />
          </Link>
        </div>
      </div>

      <p className="text-2xs text-ink3 mt-6">
        Data stored under your Google account in Firestore. Nothing shared.
      </p>
    </div>
  );
}
