import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f4f7f5',
          100: '#e4ebe6',
          200: '#c5d4c9',
          700: '#2f4638',
          900: '#142019',
        },
        leaf: {
          500: '#1b7a4a',
          600: '#0f5132',
          700: '#0a3d26',
        },
        sand: {
          100: '#f7f1e6',
          400: '#d4a017',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
