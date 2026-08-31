import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
  'aria-hidden': true,
};

type P = SVGProps<SVGSVGElement>;

export const IconPlus     = (p: P) => <svg {...base} {...p}><path d="M8 3v10M3 8h10"/></svg>;
export const IconClose    = (p: P) => <svg {...base} {...p}><path d="M4 4l8 8M12 4l-8 8"/></svg>;
export const IconCheck    = (p: P) => <svg {...base} {...p}><path d="m3 8.5 3.2 3L13 4.5"/></svg>;
export const IconSearch   = (p: P) => <svg {...base} {...p}><circle cx="7" cy="7" r="4"/><path d="m10.5 10.5 3 3"/></svg>;
export const IconTrash    = (p: P) => <svg {...base} {...p}><path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8"/></svg>;
export const IconEdit     = (p: P) => <svg {...base} {...p}><path d="M11 3.5 12.5 5 5 12.5H3.5V11Z"/><path d="M10 4.5 11.5 6"/></svg>;
export const IconArrowUp  = (p: P) => <svg {...base} {...p}><path d="M8 13V3M4 7l4-4 4 4"/></svg>;
export const IconArrowDown= (p: P) => <svg {...base} {...p}><path d="M8 3v10M4 9l4 4 4-4"/></svg>;
export const IconArrowRight= (p: P) => <svg {...base} {...p}><path d="M3 8h10M9 4l4 4-4 4"/></svg>;
export const IconChevronDown= (p: P) => <svg {...base} {...p}><path d="m4 6 4 4 4-4"/></svg>;
export const IconChevronRight= (p: P) => <svg {...base} {...p}><path d="m6 4 4 4-4 4"/></svg>;
export const IconMoon     = (p: P) => <svg {...base} {...p}><path d="M13 9.5A5 5 0 0 1 6.5 3a.5.5 0 0 0-.7-.55A6 6 0 1 0 13.5 10.2a.5.5 0 0 0-.5-.7Z"/></svg>;
export const IconSun      = (p: P) => <svg {...base} {...p}><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9"/></svg>;
export const IconLogout   = (p: P) => <svg {...base} {...p}><path d="M9 3H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h5"/><path d="m11 5 3 3-3 3M6 8h8"/></svg>;
export const IconMenu     = (p: P) => <svg {...base} {...p}><path d="M3 5h10M3 8h10M3 11h10"/></svg>;
export const IconFilter   = (p: P) => <svg {...base} {...p}><path d="M2 4h12M4 8h8M6 12h4"/></svg>;
export const IconDots     = (p: P) => <svg {...base} {...p}><circle cx="3.5" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12.5" cy="8" r="1"/></svg>;
export const IconGoogle   = (p: P) => (
  <svg {...base} {...p} width={p.width ?? 16} height={p.height ?? 16} viewBox="0 0 18 18" stroke="none" fill="currentColor">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.79 2.72v2.26h2.9c1.7-1.56 2.68-3.87 2.68-6.62Z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.35-1.59-5.06-3.72H.92v2.33A9 9 0 0 0 9 18Z"/>
    <path fill="#FBBC05" d="M3.94 10.7A5.4 5.4 0 0 1 3.65 9c0-.6.1-1.17.29-1.7V4.97H.92A9 9 0 0 0 0 9c0 1.45.35 2.83.92 4.03l3.02-2.33Z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .92 4.97l3.02 2.33C4.65 5.17 6.65 3.58 9 3.58Z"/>
  </svg>
);
