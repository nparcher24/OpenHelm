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
        oh: {
          bg: 'var(--bg)',
          'bg-elev': 'var(--bg-elev)',
          'bg-elev-2': 'var(--bg-elev-2)',
          'bg-elev-3': 'var(--bg-elev-3)',
          fg1: 'var(--fg1)',
          fg2: 'var(--fg2)',
          fg3: 'var(--fg3)',
          fg4: 'var(--fg4)',
          signal: 'var(--signal)',
          'signal-hi': 'var(--signal-hi)',
          'signal-lo': 'var(--signal-lo)',
          beacon: 'var(--beacon)',
          'beacon-hi': 'var(--beacon-hi)',
          'beacon-lo': 'var(--beacon-lo)',
        },
      },
      fontFamily: {
        ui: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Instrument Serif', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
