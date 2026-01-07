/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // Terminal/Tactical theme colors
        terminal: {
          bg: '#000000',
          surface: '#0d0d0d',
          'surface-light': '#111111',
          border: '#1a1a1a',
          'border-bright': '#2a2a2a',
          green: '#00ff00',
          'green-dim': '#00aa00',
          'green-bright': '#33ff33',
          amber: '#ffaa00',
          'amber-dim': '#cc8800',
          red: '#ff4444',
          'red-dim': '#cc3333',
          cyan: '#00ffff',
          'cyan-dim': '#00cccc',
        },
        // Keep marine for backwards compatibility during transition
        marine: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        }
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Fira Code', 'SF Mono', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'monospace'],
        'sans': ['ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow-green': '0 0 10px rgba(0, 255, 0, 0.3), 0 0 20px rgba(0, 255, 0, 0.2)',
        'glow-green-sm': '0 0 5px rgba(0, 255, 0, 0.3), 0 0 10px rgba(0, 255, 0, 0.15)',
        'glow-green-lg': '0 0 15px rgba(0, 255, 0, 0.5), 0 0 30px rgba(0, 255, 0, 0.3)',
        'glow-amber': '0 0 10px rgba(255, 170, 0, 0.3), 0 0 20px rgba(255, 170, 0, 0.2)',
        'glow-red': '0 0 10px rgba(255, 68, 68, 0.3), 0 0 20px rgba(255, 68, 68, 0.2)',
        'glow-cyan': '0 0 10px rgba(0, 255, 255, 0.3), 0 0 20px rgba(0, 255, 255, 0.2)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(0, 255, 0, 0.3), 0 0 10px rgba(0, 255, 0, 0.15)' },
          '50%': { boxShadow: '0 0 15px rgba(0, 255, 0, 0.5), 0 0 30px rgba(0, 255, 0, 0.3)' },
        },
      },
    },
  },
  plugins: [],
}