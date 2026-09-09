/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'sans-serif'],
        display: ['"Space Grotesk"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        ink: '#011130',
        'ink-soft': '#073875',
        mint: '#4ce5e8',
        cyan: '#1994ff',
        violet: '#8e78ff',
        amber: '#fdbb5e',
      },
    },
  },
  plugins: [],
}