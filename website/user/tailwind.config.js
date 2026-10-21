/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' }, screens: { '2xl': '1320px' } },
    extend: {
      colors: {
        primary: { DEFAULT: 'rgb(var(--c-primary) / <alpha-value>)', light: 'rgb(var(--c-primary-light) / <alpha-value>)' },
        accent: { DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)', light: 'rgb(var(--c-accent-light) / <alpha-value>)' },
        cream: 'rgb(var(--c-cream) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        success: 'rgb(var(--c-success) / <alpha-value>)',
        warning: 'rgb(var(--c-warning) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
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
      boxShadow: {
        soft: '0 10px 40px -10px rgba(11,31,58,0.15)',
        lift: '0 24px 60px -18px rgba(11,31,58,0.28)',
        glow: '0 0 0 4px rgba(201,162,74,0.18), 0 10px 30px -8px rgba(201,162,74,0.55)',
      },
      borderColor: { hair: 'rgba(11,31,58,0.06)' },
      backgroundImage: {
        'gold-grad': 'linear-gradient(135deg, #E6C77A 0%, #C9A24A 55%, #A9832F 100%)',
        'gold-fade': 'linear-gradient(90deg, rgba(201,162,74,0.35), rgba(201,162,74,0))',
        'navy-grad': 'linear-gradient(135deg, #0B1F3A 0%, #15325C 100%)',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-14px)' } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        scrolldot: { '0%': { transform: 'translateY(0)', opacity: '1' }, '100%': { transform: 'translateY(14px)', opacity: '0' } },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        marquee: 'marquee 35s linear infinite',
        scrolldot: 'scrolldot 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
};
