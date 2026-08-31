import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { IconGoogle } from '../components/ui';

/**
 * Balanced split login. Left column: sign-in form on canvas.
 * Right column: rotating feature slides on an ink slab, auto-advancing every
 * five seconds with a fade. Each slide carries a small hairline preview
 * widget that mimics the real product surface.
 */

interface Slide {
  n: string;
  title: string;
  body: string;
  preview: () => JSX.Element;
}

const SLIDES: Slide[] = [
  {
    n: '01',
    title: 'Every fill-up, logged.',
    body:
      'Volume, price, station, tag. Reverse-solve any two fields and Fuel computes the third.',
    preview: () => (
      <div className="w-full max-w-[400px]" style={{ border: '1px solid color-mix(in oklab, currentColor 14%, transparent)', borderRadius: 10 }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid color-mix(in oklab, currentColor 9%, transparent)' }}>
          <span className="text-2xs uppercase tracking-[0.22em] font-mono opacity-60">17 Aug 2026</span>
          <span className="text-2xs uppercase tracking-[0.22em] font-mono opacity-60">HP Adyar</span>
        </div>
        <div className="grid grid-cols-3 divide-x" style={{ borderColor: 'color-mix(in oklab, currentColor 9%, transparent)' }}>
          <div className="px-4 py-4">
            <div className="text-2xs uppercase tracking-[0.22em] opacity-55 font-mono mb-1">Litres</div>
            <div className="text-lg font-semibold tabular">8.20</div>
          </div>
          <div className="px-4 py-4" style={{ borderLeft: '1px solid color-mix(in oklab, currentColor 9%, transparent)' }}>
            <div className="text-2xs uppercase tracking-[0.22em] opacity-55 font-mono mb-1">Total</div>
            <div className="text-lg font-semibold tabular">₹782</div>
          </div>
          <div className="px-4 py-4" style={{ borderLeft: '1px solid color-mix(in oklab, currentColor 9%, transparent)' }}>
            <div className="text-2xs uppercase tracking-[0.22em] opacity-55 font-mono mb-1">km/L</div>
            <div className="text-lg font-semibold tabular">18.4</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    n: '02',
    title: 'Multiple vehicles.',
    body:
      'Track your bike and your car in one ledger. Every stat filters to the vehicle you pick.',
    preview: () => (
      <div className="w-full max-w-[400px] space-y-3">
        <div className="inline-flex rounded-md p-1" style={{ background: 'color-mix(in oklab, currentColor 6%, transparent)', border: '1px solid color-mix(in oklab, currentColor 12%, transparent)' }}>
          <span className="px-3.5 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>Baleno</span>
          <span className="px-3.5 py-1.5 text-xs opacity-70">Classic 350</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[38px] font-semibold tabular leading-none tracking-tight">18.6</span>
          <span className="text-sm opacity-60">km/L</span>
        </div>
        <div className="text-2xs uppercase tracking-[0.22em] font-mono opacity-55">Mileage · August 2026</div>
      </div>
    ),
  },
  {
    n: '03',
    title: 'Service, on schedule.',
    body:
      'PUC, insurance, oil change, tyre rotation. Amber pills warn you before each one is due.',
    preview: () => (
      <div className="w-full max-w-[400px]" style={{ border: '1px solid color-mix(in oklab, currentColor 14%, transparent)', borderRadius: 10 }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid color-mix(in oklab, currentColor 9%, transparent)' }}>
          <span className="text-2xs uppercase tracking-[0.22em] font-mono opacity-60">Upcoming</span>
          <span className="text-2xs uppercase tracking-[0.22em] font-mono opacity-60">4 reminders</span>
        </div>
        <div className="px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">PUC</span>
            <span className="text-2xs uppercase tracking-[0.18em] font-mono px-2 py-1 rounded" style={{ background: 'rgba(245,158,11,0.18)', color: '#f59e0b' }}>14d · due soon</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm opacity-70">Oil change</span>
            <span className="text-2xs uppercase tracking-[0.22em] font-mono opacity-55">94d · 5,446 km</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm opacity-70">Insurance</span>
            <span className="text-2xs uppercase tracking-[0.22em] font-mono opacity-55">184d</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    n: '04',
    title: 'Import in one paste.',
    body:
      'Bring every fill-up over from Fuelio. Auto-mapped by vehicle, previewed before it lands.',
    preview: () => (
      <div className="w-full max-w-[400px]" style={{ border: '1px solid color-mix(in oklab, currentColor 14%, transparent)', borderRadius: 10 }}>
        <div className="grid grid-cols-4 divide-x" style={{ borderColor: 'color-mix(in oklab, currentColor 9%, transparent)' }}>
          <div className="px-4 py-4">
            <div className="text-2xs uppercase tracking-[0.22em] opacity-55 font-mono mb-1">Vehicles</div>
            <div className="text-lg font-semibold tabular">1</div>
          </div>
          <div className="px-4 py-4" style={{ borderLeft: '1px solid color-mix(in oklab, currentColor 9%, transparent)' }}>
            <div className="text-2xs uppercase tracking-[0.22em] opacity-55 font-mono mb-1">Fill-ups</div>
            <div className="text-lg font-semibold tabular">61</div>
          </div>
          <div className="px-4 py-4" style={{ borderLeft: '1px solid color-mix(in oklab, currentColor 9%, transparent)' }}>
            <div className="text-2xs uppercase tracking-[0.22em] opacity-55 font-mono mb-1">Km</div>
            <div className="text-lg font-semibold tabular">8,130</div>
          </div>
          <div className="px-4 py-4" style={{ borderLeft: '1px solid color-mix(in oklab, currentColor 9%, transparent)' }}>
            <div className="text-2xs uppercase tracking-[0.22em] opacity-55 font-mono mb-1">Total</div>
            <div className="text-lg font-semibold tabular">₹44K</div>
          </div>
        </div>
      </div>
    ),
  },
];

export default function Login() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const [fadeKey, setFadeKey] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSlide((s) => (s + 1) % SLIDES.length);
      setFadeKey((k) => k + 1);
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  const goTo = (i: number) => {
    setSlide(i);
    setFadeKey((k) => k + 1);
  };

  const onSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Failed to sign in.');
      setLoading(false);
    }
  };

  const s = SLIDES[slide];

  return (
    <div className="grid min-h-screen w-full md:grid-cols-2" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      {/* LEFT — form */}
      <div className="relative flex flex-col justify-between px-8 py-10 sm:px-14 sm:py-14">
        {/* wordmark */}
        <div style={{ animation: 'login-fade 500ms ease-out both' }}>
          <span
            className="font-semibold"
            style={{
              fontSize: 20,
              letterSpacing: '-0.028em',
              color: 'var(--ink)',
            }}
          >
            FuelManager
          </span>
        </div>

        {/* form */}
        <div
          className="w-full max-w-[380px] self-center"
          style={{ animation: 'login-lift 640ms cubic-bezier(0.22,0.61,0.36,1) 140ms both' }}
        >
          <div className="text-2xs uppercase tracking-[0.24em] font-mono mb-5" style={{ color: 'var(--ink-3)' }}>
            Sign in
          </div>
          <h1
            className="font-semibold mb-3"
            style={{ fontSize: 40, lineHeight: 1.02, letterSpacing: '-0.028em' }}
          >
            Welcome back
          </h1>
          <p
            className="mb-10"
            style={{ color: 'var(--ink-3)', fontSize: 15, lineHeight: 1.55, maxWidth: 340 }}
          >
            No passwords, no forms. Sign in with your Google account and pick up where you left off.
          </p>

          <button
            type="button"
            onClick={onSignIn}
            disabled={loading}
            className="w-full h-12 rounded-md font-medium text-[15px] inline-flex items-center justify-center gap-2 transition-transform"
            style={{
              background: 'var(--ink)',
              color: 'var(--bg)',
              opacity: loading ? 0.7 : 1,
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.985)')}
            onMouseUp={(e)   => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={(e)=> (e.currentTarget.style.transform = 'scale(1)')}
          >
            {loading ? 'Signing in…' : (<><IconGoogle width={18} height={18} /> Continue with Google</>)}
          </button>

          {error && (
            <div className="mt-3 text-xs px-3 py-2 rounded-md" style={{ border: '1px solid var(--rule-2)', color: 'var(--down)' }}>
              {error}
            </div>
          )}

          <div
            className="mt-8 pt-6 flex items-start gap-3 text-[12.5px]"
            style={{ borderTop: '1px solid var(--rule)', color: 'var(--ink-3)', lineHeight: 1.55 }}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full mt-[7px] shrink-0" style={{ background: 'var(--up)' }} />
            <span>Stored under your Google account. Only you can read it.</span>
          </div>
        </div>

        {/* bottom left copyright */}
        <div className="text-2xs uppercase tracking-[0.24em] font-mono" style={{ color: 'var(--ink-3)' }}>
          © 2026 fuel.akil.codes
        </div>
      </div>

      {/* RIGHT — slideshow slab */}
      <div
        className="relative flex flex-col justify-between overflow-hidden px-8 py-10 sm:px-14 sm:py-14"
        style={{ background: 'var(--ink)', color: 'var(--bg)' }}
      >
        {/* subtle hairline arcs */}
        <svg
          aria-hidden
          className="absolute pointer-events-none"
          style={{ top: '-10%', right: '-30%', width: 1100, height: 1100, opacity: 1 }}
          viewBox="0 0 1100 1100"
          fill="none"
        >
          {[420, 540, 660, 780, 900].map((r, i) => (
            <circle key={i} cx={1100} cy={550} r={r} stroke="var(--bg)" strokeOpacity={0.08 - i * 0.011} strokeWidth={1} />
          ))}
        </svg>

        {/* top row — slide counter */}
        <div className="relative z-10 flex items-center justify-between">
          <span className="text-2xs uppercase tracking-[0.24em] font-mono opacity-60">Features</span>
          <span className="text-2xs uppercase tracking-[0.24em] font-mono tabular opacity-60">
            {String(slide + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
          </span>
        </div>

        {/* slide content */}
        <div key={fadeKey} className="relative z-10 max-w-[440px]" style={{ animation: 'login-lift 520ms cubic-bezier(0.22,0.61,0.36,1) both' }}>
          <h2
            className="font-semibold mb-4"
            style={{ fontSize: 40, lineHeight: 1.05, letterSpacing: '-0.028em' }}
          >
            {s.title}
          </h2>
          <p
            className="mb-8"
            style={{ color: 'var(--bg)', opacity: 0.7, fontSize: 15.5, lineHeight: 1.55 }}
          >
            {s.body}
          </p>
          {s.preview()}
        </div>

        {/* pagination */}
        <div className="relative z-10 flex items-center gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show slide ${i + 1}`}
              className="rounded-full transition-all"
              style={{
                height: 3,
                width: i === slide ? 26 : 10,
                background: i === slide ? 'var(--bg)' : 'color-mix(in oklab, currentColor 28%, transparent)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
