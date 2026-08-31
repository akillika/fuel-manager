import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button, IconGoogle } from '../components/ui';

export default function Login() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSignIn = async () => {
    try { setLoading(true); setError(null); await signInWithGoogle(); }
    catch (err: any) { setError(err.message || 'Failed to sign in.'); setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-10">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-ink text-bg text-sm font-bold">F</span>
          <span className="text-md font-semibold text-ink">Fuel</span>
        </div>
        <div className="bg-card border border-rule rounded-lg p-7">
          <h1 className="text-xl font-semibold text-ink mb-1">Sign in</h1>
          <p className="text-sm text-ink3 mb-6">
            A private log of every fill-up. Mileage, spend, distance — computed for you.
          </p>
          <Button variant="secondary" onClick={onSignIn} disabled={loading} className="w-full !h-11 !text-md">
            {loading ? 'Signing in…' : (<><IconGoogle width={16} height={16} /> Continue with Google</>)}
          </Button>
          {error && <div className="mt-3 text-xs text-down px-3 py-2 rounded-md border border-rule2">{error}</div>}
          <p className="text-2xs text-ink3 mt-6 leading-relaxed">
            Your data is stored under your Google account. Only you can read it.
          </p>
        </div>
        <p className="text-2xs text-ink3 text-center mt-6 font-mono">fuel.akil.codes</p>
      </div>
    </div>
  );
}
