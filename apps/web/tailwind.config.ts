import type { Config } from 'tailwindcss';

/**
 * Storefront utilities read tenant theme CSS vars (set per-store at runtime);
 * the admin/marketplace chrome uses a fixed dark palette.
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
        ink: '#0B1524',
        panel: '#0F1D31',
        line: '#1E2D45',
      },
      fontFamily: { heading: 'var(--font-heading)', body: 'var(--font-body)' },
      borderRadius: { theme: 'var(--radius)' },
      maxWidth: { container: 'var(--container-max)' },
    },
  },
  plugins: [],
};

export default config;
