import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useVehicle } from '../contexts/VehicleContext';
import { db } from '../config/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { FuelGoals } from '../types';
import { DEMO_MODE } from '../config/demo';
import { DEMO_GOALS } from '../config/demoData';
import { Card, Field, Input, Button, IconArrowRight, cx } from '../components/ui';

const TG_BOT_HANDLE = import.meta.env.VITE_TELEGRAM_BOT_HANDLE || '';

interface LinkedTgUser {
  telegramId: string;
  username?: string | null;
  firstName?: string | null;
  defaultVehicleId?: string | null;
}

export default function Settings() {
  const { user } = useAuth();
  const { activeVehicleId, vehicles } = useVehicle();
  const [goals, setGoals] = useState<FuelGoals | null>(null);
  const [budget, setBudget] = useState<string>('');
  const [yearlyBudget, setYearlyBudget] = useState<string>('');
  const [mileageTarget, setMileageTarget] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Telegram link state
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkExpires, setLinkExpires] = useState<number | null>(null);
  const [linkedUsers, setLinkedUsers] = useState<LinkedTgUser[]>([]);
  const [tick, setTick] = useState(0);

  // countdown ticker for the code expiry
  useEffect(() => {
    if (!linkCode) return;
    const id = window.setInterval(() => setTick(t => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [linkCode]);

  useEffect(() => {
    if (linkExpires && Date.now() >= linkExpires) { setLinkCode(null); setLinkExpires(null); }
  }, [tick, linkExpires]);

  useEffect(() => { if (user) load(); /* eslint-disable-line */ }, [user]);
  useEffect(() => { if (user) loadLinkedTelegramUsers(); /* eslint-disable-line */ }, [user]);

  const loadLinkedTelegramUsers = async () => {
    if (!user || DEMO_MODE) return;
    try {
      const snap = await getDocs(query(collection(db, 'telegramUsers'), where('userId', '==', user.uid)));
      const list: LinkedTgUser[] = snap.docs.map(d => ({ telegramId: d.id, ...(d.data() as any) }));
      setLinkedUsers(list);
    } catch (e) { console.error(e); }
  };

  const generateLinkCode = async () => {
    if (!user) return;
    if (DEMO_MODE) { alert('Demo mode: writes disabled.'); return; }
    // Random 6-char [A-Z2-9] code, avoiding ambiguous 0/1/O/I.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min
    await setDoc(doc(db, 'telegramLinks', code), {
      userId: user.uid,
      defaultVehicleId: activeVehicleId || null,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(expiresAt),
    });
    setLinkCode(code);
    setLinkExpires(expiresAt.getTime());
  };

  const unlinkTelegram = async (telegramId: string) => {
    if (DEMO_MODE) return;
    if (!confirm('Disconnect this Telegram account?')) return;
    try {
      await deleteDoc(doc(db, 'telegramUsers', telegramId));
      await loadLinkedTelegramUsers();
    } catch (e: any) {
      alert(`Failed to unlink: ${e?.message || e}`);
    }
  };

  const secsLeft = linkExpires ? Math.max(0, Math.floor((linkExpires - Date.now()) / 1000)) : 0;
  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss = String(secsLeft % 60).padStart(2, '0');
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

      {/* Telegram bot */}
      <div className="mt-8">
        <div className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3 mb-3">Telegram bot</div>
        <Card>
          <p className="text-sm text-ink2 mb-4">
            Log fill-ups from Telegram. Generate a short code, send it to the bot as <code className="font-mono text-ink">/link CODE</code>, and your Telegram account is paired with this Fuel account.
          </p>

          {linkedUsers.length > 0 && (
            <div className="mb-5">
              <div className="text-2xs uppercase tracking-[0.06em] font-semibold text-ink3 mb-2">Linked accounts</div>
              <div className="space-y-2">
                {linkedUsers.map(u => (
                  <div key={u.telegramId} className="flex items-center justify-between px-3 py-2 rounded-md border border-rule bg-bg">
                    <div>
                      <div className="text-sm text-ink font-medium">
                        {u.username ? `@${u.username}` : (u.firstName || `Telegram ${u.telegramId}`)}
                      </div>
                      <div className="text-2xs text-ink3 font-mono tabular">
                        default vehicle: {vehicles.find(v => v.id === u.defaultVehicleId)?.name || '—'}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => unlinkTelegram(u.telegramId)}>Disconnect</Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!linkCode ? (
            <div className="flex items-center gap-3">
              <Button variant="primary" onClick={generateLinkCode}>Generate link code</Button>
              {TG_BOT_HANDLE && (
                <a
                  href={`https://t.me/${TG_BOT_HANDLE.replace(/^@/, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-ink3 hover:text-ink underline underline-offset-2"
                >
                  Open @{TG_BOT_HANDLE.replace(/^@/, '')}
                </a>
              )}
            </div>
          ) : (
            <div className="border border-rule2 rounded-md bg-bg p-4">
              <div className="text-2xs uppercase tracking-[0.06em] font-semibold text-ink3 mb-1">Your code</div>
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <div className="font-mono tabular text-2xl font-bold text-ink tracking-[0.14em]">{linkCode}</div>
                <div className={cx('text-2xs font-mono tabular', secsLeft < 30 ? 'text-down' : 'text-ink3')}>
                  expires in {mm}:{ss}
                </div>
              </div>
              <div className="text-xs text-ink2 leading-relaxed">
                {TG_BOT_HANDLE ? (
                  <>Open <a className="underline underline-offset-2 text-ink" href={`https://t.me/${TG_BOT_HANDLE.replace(/^@/, '')}?start=1`} target="_blank" rel="noreferrer">@{TG_BOT_HANDLE.replace(/^@/, '')}</a> and send <code className="font-mono text-ink">/link {linkCode}</code></>
                ) : (
                  <>Send <code className="font-mono text-ink">/link {linkCode}</code> to the Fuel bot.</>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => navigator.clipboard.writeText(`/link ${linkCode}`)}>Copy command</Button>
                <Button size="sm" variant="ghost" onClick={() => { setLinkCode(null); setLinkExpires(null); }}>Cancel</Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <p className="text-2xs text-ink3 mt-6">
        Data stored under your Google account in Firestore. Nothing shared.
      </p>
    </div>
  );
}
