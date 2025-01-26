/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        spin: {
          '0%, 50%': { transform: 'rotate(180deg)' },
        }
      }
    },
  },
  plugins: [],
}
