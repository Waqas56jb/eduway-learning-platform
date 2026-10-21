/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: v('--c-primary'), light: v('--c-primary-light') },
        accent: { DEFAULT: v('--c-accent'), light: v('--c-accent-light') },
        app: v('--c-app'),
        surface: { DEFAULT: v('--c-surface'), 2: v('--c-surface-2') },
        sidebar: v('--c-sidebar'),
        btn: { DEFAULT: v('--c-btn'), ink: v('--c-btn-ink') },
        ink: v('--c-ink'),
        muted: v('--c-muted'),
        line: v('--c-border'),
        success: v('--c-success'),
        warning: v('--c-warning'),
        danger: v('--c-danger'),
        info: v('--c-info'),
        math: '#2563EB',
        physics: '#7C3AED',
        chemistry: '#059669',
        biology: '#DB2777',
        english: '#EA580C',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-body)'],
      },
      fontSize: { '2xs': ['0.6875rem', '1rem'] },
      boxShadow: {
        card: '0 1px 2px rgba(11,31,58,0.04), 0 4px 16px -6px rgba(11,31,58,0.08)',
        soft: '0 10px 40px -10px rgba(11,31,58,0.15)',
        lift: '0 24px 60px -18px rgba(11,31,58,0.28)',
        glow: '0 0 0 3px rgba(201,162,74,0.22), 0 8px 24px -8px rgba(201,162,74,0.6)',
      },
      backgroundImage: {
        'gold-grad': 'linear-gradient(135deg, #E6C77A 0%, #C9A24A 55%, #A9832F 100%)',
        'navy-grad': 'linear-gradient(135deg, #0B1F3A 0%, #15325C 100%)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'fade-in': 'fade-in 200ms ease-out',
      },
    },
  },
  plugins: [],
};
