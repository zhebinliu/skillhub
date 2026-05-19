/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#08070d',
          900: '#0d0c14',
          800: '#13121b',
          700: '#1c1a26',
          600: '#2a2737',
          500: '#3a3650',
        },
        ember: {
          200: '#ffd0b8',
          300: '#ffa07a',
          400: '#ff7a3d',
          500: '#ff5a1f',
          600: '#e84a14',
        },
        magenta: {
          200: '#ffc6db',
          300: '#ff8bb6',
          400: '#ff4d8d',
          500: '#ec3473',
        },
        iris: {
          200: '#cebfff',
          300: '#b29bff',
          400: '#9d7bff',
          500: '#7c5cff',
          600: '#6346ee',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 60px -20px rgba(124, 92, 255, 0.55)',
        'glow-ember': '0 0 80px -25px rgba(255, 90, 31, 0.45)',
      },
      backgroundImage: {
        'gradient-warm': 'linear-gradient(135deg, #ff7a3d 0%, #ec3473 45%, #7c5cff 100%)',
        'gradient-cool': 'linear-gradient(135deg, #7c5cff 0%, #4dd1ff 100%)',
        grain: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
};
