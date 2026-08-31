import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { IconMoon, IconSun, IconLogout, IconPlus, IconMenu, IconClose, cx } from './ui';

const NAV = [
  { to: '/',        label: 'Overview' },
  { to: '/fillups', label: 'Fill-ups' },
  { to: '/service', label: 'Service' },
  { to: '/insights',label: 'Insights' },
  { to: '/vehicle', label: 'Vehicle' },
  { to: '/settings',label: 'Settings' },
] as const;

const LS_THEME = 'fuel.theme';

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const s = localStorage.getItem(LS_THEME);
    if (s === 'light' || s === 'dark') return s;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(LS_THEME, theme);
  }, [theme]);

  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  // Global n → add fill-up
  useEffect(() => {
    const isEditable = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditable(e.target)) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); navigate('/add'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const isActive = (path: string) => (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path));

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      {/* Top nav */}
      <header className="border-b border-rule sticky top-0 z-30 bg-bg/90 backdrop-blur">
        <div className="max-w-page mx-auto flex items-center gap-2 px-4 md:px-6 h-14">
          {/* Brand */}
          <Link to="/" className="inline-flex items-center gap-2 pr-4 mr-1 border-r border-rule h-6">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-ink text-bg text-2xs font-bold">F</span>
            <span className="text-sm font-semibold text-ink tracking-[-0.005em]">Fuel</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5">
            {NAV.map(({ to, label }) => {
              const active = isActive(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={cx(
                    'inline-flex items-center h-8 px-3 rounded-md text-sm transition-colors',
                    active ? 'bg-card2 text-ink font-medium' : 'text-ink3 hover:text-ink hover:bg-card2',
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <Link
              to="/add"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-ink text-bg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <IconPlus width={13} height={13} />
              <span className="hidden sm:inline">Fill-up</span>
              <kbd className="hidden md:inline ml-1 text-2xs opacity-70 font-mono">N</kbd>
            </Link>
            <button
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-ink3 hover:text-ink hover:bg-card2 transition-colors"
              aria-label="Toggle theme"
              title="Toggle theme"
            >
              {theme === 'dark' ? <IconSun /> : <IconMoon />}
            </button>
            {user && (
              <button
                onClick={() => signOut()}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-ink3 hover:text-down hover:bg-card2 transition-colors"
                aria-label="Sign out"
                title={user.email || ''}
              >
                <IconLogout />
              </button>
            )}
            <button
              onClick={() => setMobileNavOpen(v => !v)}
              className="md:hidden inline-flex items-center justify-center w-8 h-8 rounded-md text-ink3 hover:text-ink hover:bg-card2 transition-colors"
              aria-label="Menu"
            >
              {mobileNavOpen ? <IconClose /> : <IconMenu />}
            </button>
          </div>
        </div>

        {/* Mobile drop nav */}
        {mobileNavOpen && (
          <div className="md:hidden border-t border-rule bg-bg">
            <div className="max-w-page mx-auto px-4 py-3 grid gap-1">
              {NAV.map(({ to, label }) => {
                const active = isActive(to);
                return (
                  <Link
                    key={to}
                    to={to}
                    className={cx(
                      'inline-flex items-center h-10 px-3 rounded-md text-sm',
                      active ? 'bg-card2 text-ink font-medium' : 'text-ink2',
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        {children}
      </main>

      {/* Minimal footer */}
      <footer className="border-t border-rule mt-8 hidden md:block">
        <div className="max-w-page mx-auto px-4 md:px-6 h-12 flex items-center justify-between text-2xs text-ink3">
          <span className="font-mono">fuel.akil.codes</span>
          <span className="font-mono">MMXXVI</span>
        </div>
      </footer>

      {/* Mobile FAB - always available for on-the-go fill-up logging */}
      {!isActive('/add') && (
        <Link
          to="/add"
          className="md:hidden fixed z-40 inline-flex items-center gap-2 h-12 pl-4 pr-5 rounded-full bg-ink text-bg shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25),0_4px_12px_rgba(0,0,0,0.15)] transition-transform active:scale-95"
          style={{
            bottom: 'calc(20px + env(safe-area-inset-bottom))',
            right: '16px',
          }}
          aria-label="Add fill-up"
        >
          <IconPlus width={14} height={14} />
          <span className="text-sm font-semibold">Fill-up</span>
        </Link>
      )}
    </div>
  );
}
