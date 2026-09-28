/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        mint: {
          50: '#f0fdf9',
          100: '#d9fbed',
          200: '#b3f5d8',
          300: '#6fe9b6',
          400: '#34d699',
          500: '#10b981',
          600: '#059667',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        cream: {
          50: '#fbfdfc',
          100: '#f4f9f7',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      animation: {
        'fade-out': 'fadeOut 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.4s ease-out',
        'pop': 'pop 0.3s ease-out',
        'pulse-ring': 'pulseRing 2s ease-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'splash-pulse': 'splashPulse 2.7s ease-in-out infinite',
      },
      keyframes: {
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pop: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.8)', opacity: '0.8' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        splashPulse: {
          '0%, 100%': { opacity: '0.42' },
          '50%': { opacity: '1' },
        },
      },
      boxShadow: {
        'mint': '0 8px 30px -8px rgba(16, 185, 129, 0.35)',
        'mint-lg': '0 20px 50px -12px rgba(16, 185, 129, 0.45)',
        'soft': '0 4px 24px -6px rgba(0, 0, 0, 0.08)',
        'vip': '0 8px 28px -8px rgba(212, 163, 58, 0.55)',
      },
      spacing: {
        safe: 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
};
