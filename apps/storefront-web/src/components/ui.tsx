'use client';

import React from 'react';

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost' }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-theme px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
  const variants: Record<string, string> = {
    primary: 'text-white shadow-sm hover:opacity-90',
    outline: 'border border-brand-border hover:bg-brand-muted',
    ghost: 'hover:bg-brand-muted',
  };
  const style = variant === 'primary' ? { background: 'var(--color-primary)' } : undefined;
  return (
    <button className={`${base} ${variants[variant]} ${className}`} style={style} {...props}>
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-brand-fg/60">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-border border-t-brand-primary" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-theme border border-dashed border-brand-border py-16 text-center">
      <p className="font-heading text-lg font-semibold">{title}</p>
      {hint && <p className="mt-1 text-sm text-brand-fg/60">{hint}</p>}
    </div>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-brand-danger">{error}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-theme border border-brand-border bg-brand-bg px-3 py-2.5 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20';
