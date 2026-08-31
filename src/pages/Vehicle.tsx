import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVehicle } from '../contexts/VehicleContext';
import { db } from '../config/firebase';
import { collection, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { Vehicle as V } from '../types';
import { DEMO_MODE } from '../config/demo';
import { Card, Field, Input, Select, Button, IconPlus, IconEdit, IconClose, cx } from '../components/ui';

export default function Vehicle() {
  const { user } = useAuth();
  const { vehicles, activeVehicleId, setActiveVehicleId, refreshVehicles, loading } = useVehicle();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [plate, setPlate] = useState('');
  const [fuelType, setFuelType] = useState<V['fuelType']>('Petrol');
  const [tankCapacity, setTankCapacity] = useState('');

  const reset = () => {
    setName(''); setMake(''); setModel(''); setPlate('');
    setFuelType('Petrol'); setTankCapacity(''); setEditingId(null);
  };

  useEffect(() => { if (editingId) return; reset(); }, [editingId]);

  const openCreate = () => { reset(); setShowForm(true); };
  const openEdit = (v: V) => {
    setEditingId(v.id);
    setName(v.name);
    setMake(v.make || '');
    setModel(v.model || '');
    setPlate(v.plate || '');
    setFuelType(v.fuelType);
    setTankCapacity(v.tankCapacity ? String(v.tankCapacity) : '');
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); reset(); };

  const save = async () => {
    if (!user) return;
    if (!name.trim()) return alert('Name is required.');
    if (DEMO_MODE) { alert('Demo mode: writes disabled.'); closeForm(); return; }
    try {
      setSaving(true);
      const data: any = {
        userId: user.uid,
        name: name.trim(),
        fuelType,
      };
      if (make.trim()) data.make = make.trim();
      if (model.trim()) data.model = model.trim();
      if (plate.trim()) data.plate = plate.trim();
      if (tankCapacity) data.tankCapacity = Number(tankCapacity);
      if (editingId) {
        await updateDoc(doc(db, 'vehicles', editingId), data);
      } else {
        data.createdAt = Timestamp.fromDate(new Date());
        await addDoc(collection(db, 'vehicles'), data);
      }
      await refreshVehicles();
      closeForm();
    } catch (e: any) {
      alert(`Save failed: ${e?.message || 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="max-w-page mx-auto px-4 md:px-6 py-16 text-sm text-ink3 text-center">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto w-full px-4 md:px-6 py-6 md:py-8 rise">
      <div className="flex items-baseline justify-between mb-8 flex-wrap gap-3">
        <div>
          <div className="text-2xs uppercase tracking-[0.1em] font-semibold text-ink3">Fleet</div>
          <h1 className="text-2xl font-semibold text-ink tracking-[-0.02em]">Vehicles</h1>
        </div>
        <Button variant="primary" onClick={openCreate}><IconPlus /> Add vehicle</Button>
      </div>

      {vehicles.length === 0 ? (
        <div className="border border-dashed border-rule2 rounded-lg py-16 px-6 text-center">
          <div className="text-md font-semibold text-ink mb-1">No vehicles yet</div>
          <div className="text-sm text-ink3 max-w-sm mx-auto mb-4">Add a car or bike to start logging fill-ups against it.</div>
          <Button variant="primary" onClick={openCreate}><IconPlus /> Add first vehicle</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          {vehicles.map(v => (
            <div
              key={v.id}
              className={cx(
                'border rounded-lg p-4 bg-card transition-colors relative',
                activeVehicleId === v.id ? 'border-rule2' : 'border-rule',
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-md font-semibold text-ink">{v.name}</div>
                  <div className="text-2xs text-ink3 font-mono tabular">{v.plate || '—'}</div>
                </div>
                <button
                  onClick={() => openEdit(v)}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md text-ink3 hover:text-ink hover:bg-card2 transition-colors"
                  title="Edit"
                >
                  <IconEdit />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-2xs text-ink3 font-mono tabular mt-3 pt-3 border-t border-rule">
                <div>
                  <div className="uppercase tracking-[0.06em] mb-0.5">Make</div>
                  <div className="text-ink">{v.make || '—'}</div>
                </div>
                <div>
                  <div className="uppercase tracking-[0.06em] mb-0.5">Model</div>
                  <div className="text-ink">{v.model || '—'}</div>
                </div>
                <div>
                  <div className="uppercase tracking-[0.06em] mb-0.5">Fuel</div>
                  <div className="text-ink">{v.fuelType}</div>
                </div>
                <div>
                  <div className="uppercase tracking-[0.06em] mb-0.5">Tank</div>
                  <div className="text-ink">{v.tankCapacity ? `${v.tankCapacity} L` : '—'}</div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-rule flex items-center justify-between">
                {activeVehicleId === v.id ? (
                  <span className="text-2xs uppercase tracking-[0.08em] font-semibold text-up">Active</span>
                ) : (
                  <button
                    onClick={() => setActiveVehicleId(v.id)}
                    className="text-2xs uppercase tracking-[0.08em] font-semibold text-ink3 hover:text-ink transition-colors"
                  >
                    Set active
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative bg-card border-t md:border border-rule rounded-t-lg md:rounded-lg shadow-popover w-full md:max-w-lg md:w-full max-h-[92vh] overflow-hidden flex flex-col rise" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="md:hidden mx-auto mt-2 mb-1 w-10 h-1 rounded-full bg-rule2" />
            <div className="flex items-center justify-between p-4 border-b border-rule">
              <h3 className="text-md font-semibold text-ink">{editingId ? 'Edit vehicle' : 'Add vehicle'}</h3>
              <button onClick={closeForm} className="inline-flex items-center justify-center w-8 h-8 rounded-md text-ink3 hover:text-ink hover:bg-card2 transition-colors"><IconClose /></button>
            </div>
            <Card className="!bg-transparent !border-0 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Baleno" /></Field>
                <Field label="Plate"><Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="TN 22 AB 4302" /></Field>
                <Field label="Make"><Input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Maruti Suzuki" /></Field>
                <Field label="Model"><Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Baleno Delta" /></Field>
                <Field label="Fuel type">
                  <Select value={fuelType} onChange={(e) => setFuelType(e.target.value as V['fuelType'])}>
                    <option>Petrol</option>
                    <option>Diesel</option>
                    <option>CNG</option>
                    <option>EV</option>
                  </Select>
                </Field>
                <Field label="Tank capacity (L)"><Input type="number" value={tankCapacity} onChange={(e) => setTankCapacity(e.target.value)} placeholder="37" /></Field>
              </div>
            </Card>
            <div className="flex items-center justify-end gap-2 p-4 border-t border-rule">
              <Button onClick={closeForm}>Cancel</Button>
              <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add vehicle'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
