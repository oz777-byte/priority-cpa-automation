import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Heebo', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Neutral surface palette (slate-tinted, RTL-friendly)
        ink: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          400: '#94a3b8',
          600: '#475569',
          800: '#1e293b',
          900: '#0f172a',
        },
        // O.S Tech Ventures brand — electric blue on near-black
        brand: {
          950: '#04060f',
          900: '#0a0e24',
          800: '#0f1838',
          700: '#142655',
          500: '#3aa6ff',
          400: '#5cb8ff',
          300: '#7fcaff',
          glow: '#00d4ff',
        },
        accent: {
          500: '#3aa6ff',
          600: '#1c8be8',
        },
      },
      backgroundImage: {
        'brand-radial': 'radial-gradient(ellipse at top, #142655 0%, #0a0e24 50%, #04060f 100%)',
      },
      boxShadow: {
        glow: '0 0 24px rgba(58, 166, 255, 0.45)',
      },
    },
  },
  plugins: [],
};
export default config;
