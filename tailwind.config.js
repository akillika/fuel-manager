/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg:        'var(--bg)',
        bg2:       'var(--bg-2)',
        bg3:       'var(--bg-3)',
        card:      'var(--card)',
        card2:     'var(--card-2)',
        ink:       'var(--ink)',
        ink2:      'var(--ink-2)',
        ink3:      'var(--ink-3)',
        ink4:      'var(--ink-4)',
        rule:      'var(--rule)',
        rule2:     'var(--rule-2)',
        accent:    'var(--accent)',
        up:        'var(--up)',
        down:      'var(--down)',
        warn:      'var(--warn)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      fontSize: {
        '2xs': ['10.5px', { lineHeight: '1.35' }],
        xs:    ['11.5px', { lineHeight: '1.4' }],
        sm:    ['13px',   { lineHeight: '1.45' }],
        base:  ['14px',   { lineHeight: '1.45' }],
        md:    ['15px',   { lineHeight: '1.45' }],
        lg:    ['18px',   { lineHeight: '1.3' }],
        xl:    ['22px',   { lineHeight: '1.2', letterSpacing: '-0.015em' }],
        '2xl': ['28px',   { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        '3xl': ['36px',   { lineHeight: '1.05', letterSpacing: '-0.025em' }],
        '4xl': ['48px',   { lineHeight: '1.0',  letterSpacing: '-0.028em' }],
        '5xl': ['64px',   { lineHeight: '0.98', letterSpacing: '-0.032em' }],
        '6xl': ['80px',   { lineHeight: '0.96', letterSpacing: '-0.036em' }],
      },
      borderRadius: {
        DEFAULT: '6px',
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '10px',
      },
      boxShadow: {
        DEFAULT: '0 1px 0 rgba(0,0,0,0.02)',
        popover: '0 12px 40px -12px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.06)',
      },
      maxWidth: {
        page: '1200px',
      },
    },
  },
  plugins: [],
};
