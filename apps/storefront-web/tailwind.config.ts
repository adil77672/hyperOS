import type { Config } from 'tailwindcss';

/**
 * The tenant theme (colors, fonts, radius) is injected at runtime as CSS custom
 * properties on :root by ThemeProvider. Tailwind utilities reference those
 * variables, so a merchant's palette flows through every component without a
 * rebuild — the white-label promise.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: 'var(--color-primary)',
          secondary: 'var(--color-secondary)',
          accent: 'var(--color-accent)',
          bg: 'var(--color-background)',
          fg: 'var(--color-foreground)',
          muted: 'var(--color-muted)',
          border: 'var(--color-border)',
          danger: 'var(--color-danger)',
          success: 'var(--color-success)',
        },
      },
      fontFamily: {
        heading: 'var(--font-heading)',
        body: 'var(--font-body)',
      },
      borderRadius: {
        theme: 'var(--radius)',
      },
      maxWidth: {
        container: 'var(--container-max)',
      },
    },
  },
  plugins: [],
};

export default config;
