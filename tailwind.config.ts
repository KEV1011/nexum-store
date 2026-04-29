import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          DEFAULT: '#0D0D0D',
          50:  '#1A1A1A',
          100: '#141414',
          200: '#0D0D0D',
        },
        ghost: {
          DEFAULT: '#F8F9FA',
          muted: '#A0A4A8',
          subtle: '#6B7280',
        },
        gold: {
          DEFAULT: '#D4AF37',
          light: '#E8C84A',
          dark:  '#B8961E',
          glow:  'rgba(212,175,55,0.15)',
        },
      },
      fontFamily: {
        sans:    ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        heading: ['var(--font-montserrat)', 'Montserrat', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['4.5rem',  { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        'display-lg': ['3.5rem',  { lineHeight: '1.08', letterSpacing: '-0.025em' }],
        'display-md': ['2.5rem',  { lineHeight: '1.1',  letterSpacing: '-0.02em' }],
        'display-sm': ['1.875rem',{ lineHeight: '1.15', letterSpacing: '-0.015em' }],
      },
      borderRadius: {
        'nexum': '10px',
        'nexum-lg': '14px',
        'nexum-xl': '18px',
      },
      boxShadow: {
        'nexum':       '0 4px 24px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
        'nexum-gold':  '0 0 30px rgba(212,175,55,0.2), 0 4px 24px rgba(0,0,0,0.4)',
        'nexum-hover': '0 8px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.4)',
        'card':        '0 2px 16px rgba(0,0,0,0.5)',
      },
      backgroundImage: {
        'gradient-gold':   'linear-gradient(135deg, #D4AF37 0%, #B8961E 100%)',
        'gradient-subtle': 'linear-gradient(180deg, #141414 0%, #0D0D0D 100%)',
        'gradient-card':   'linear-gradient(145deg, #1A1A1A 0%, #111111 100%)',
        'gradient-hero':   'radial-gradient(ellipse at top, #1a1a1a 0%, #0D0D0D 70%)',
      },
      animation: {
        'fade-in':     'fadeIn 0.4s ease-out',
        'slide-up':    'slideUp 0.5s ease-out',
        'slide-right': 'slideRight 0.3s ease-out',
        'shimmer':     'shimmer 1.8s infinite',
      },
      keyframes: {
        fadeIn:     { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:    { from: { opacity: '0', transform: 'translateY(20px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideRight: { from: { opacity: '0', transform: 'translateX(-10px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        shimmer:    { '0%,100%': { opacity: '0.5' }, '50%': { opacity: '1' } },
      },
    },
  },
  plugins: [],
}

export default config
