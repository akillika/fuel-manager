import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut as fbSignOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { DEMO_MODE, DEMO_USER } from '../config/demo';

interface AuthCtx { user: User | null; loading: boolean; signInWithGoogle: () => Promise<void>; signOut: () => Promise<void>; }
const AuthContext = createContext<AuthCtx | undefined>(undefined);

export const useAuth = () => {
  const c = useContext(AuthContext);
  if (!c) throw new Error('useAuth must be used within AuthProvider');
  return c;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(DEMO_MODE ? DEMO_USER : null);
  const [loading, setLoading] = useState(!DEMO_MODE);

  useEffect(() => {
    if (DEMO_MODE) return;
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); });
    return () => unsub();
  }, []);

  const signInWithGoogle = async () => {
    if (DEMO_MODE) { setUser(DEMO_USER); return; }
    await signInWithPopup(auth, new GoogleAuthProvider());
  };
  const signOut = async () => {
    if (DEMO_MODE) { setUser(null); return; }
    await fbSignOut(auth);
  };

  return <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>{children}</AuthContext.Provider>;
}
