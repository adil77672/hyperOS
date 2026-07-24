import type { Bootstrap } from './types';

/** Resolves theme colors from the bootstrap, with safe fallbacks. */
export function palette(boot: Bootstrap | null) {
  const c = boot?.theme.colors ?? {};
  return {
    primary: c.primary ?? '#0F5132',
    accent: c.accent ?? '#B23A48',
    background: c.background ?? '#FFFFFF',
    foreground: c.foreground ?? '#101828',
    muted: c.muted ?? '#F2F4F7',
    border: c.border ?? '#EAECF0',
    danger: c.danger ?? '#B42318',
    success: c.success ?? '#027A48',
  };
}

export type Palette = ReturnType<typeof palette>;
