import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Vehicle } from '../types';
import { db } from '../config/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { DEMO_MODE } from '../config/demo';
import { DEMO_VEHICLES } from '../config/demoData';
import { useAuth } from './AuthContext';

const LS_ACTIVE = 'fuel.activeVehicleId';

interface VehicleCtx {
  vehicles: Vehicle[];
  activeVehicleId: string;
  activeVehicle: Vehicle | undefined;
  setActiveVehicleId: (id: string) => void;
  refreshVehicles: () => Promise<void>;
  loading: boolean;
}

const VehicleContext = createContext<VehicleCtx | undefined>(undefined);

export const useVehicle = () => {
  const c = useContext(VehicleContext);
  if (!c) throw new Error('useVehicle must be used inside VehicleProvider');
  return c;
};

export function VehicleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeVehicleId, setActiveVehicleId] = useState<string>(() => localStorage.getItem(LS_ACTIVE) || '');
  const [loading, setLoading] = useState(true);

  const refreshVehicles = async () => {
    if (!user) return;
    if (DEMO_MODE) {
      setVehicles(DEMO_VEHICLES);
      setActiveVehicleId(current => (DEMO_VEHICLES.some(v => v.id === current) ? current : (DEMO_VEHICLES[0]?.id || '')));
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const snap = await getDocs(query(collection(db, 'vehicles'), where('userId', '==', user.uid)));
      const list: Vehicle[] = [];
      snap.forEach(d => { const data = d.data(); list.push({ id: d.id, ...data, createdAt: data.createdAt.toDate() } as Vehicle); });
      setVehicles(list);
      // Reset active vehicle if it points to a vehicle that no longer exists (e.g. after import).
      setActiveVehicleId(current => (list.some(v => v.id === current) ? current : (list[0]?.id || '')));
    } finally { setLoading(false); }
  };

  useEffect(() => { if (user) refreshVehicles(); /* eslint-disable-line */ }, [user]);
  useEffect(() => { if (activeVehicleId) localStorage.setItem(LS_ACTIVE, activeVehicleId); }, [activeVehicleId]);

  const activeVehicle = vehicles.find(v => v.id === activeVehicleId);

  return (
    <VehicleContext.Provider value={{ vehicles, activeVehicleId, activeVehicle, setActiveVehicleId, refreshVehicles, loading }}>
      {children}
    </VehicleContext.Provider>
  );
}
