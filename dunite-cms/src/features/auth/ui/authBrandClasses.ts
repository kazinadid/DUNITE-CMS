import { cn } from '@/lib/utils';

/** Enterprise dark-red palette aligned with dashboard chrome (#7A0000 / #4A0000) */
export const AUTH_BRAND = {
  primary:     '#7A0000',
  primaryDark: '#5c0000',
  primaryDeep: '#4A0000',
} as const;

export function authShellClass() {
  return cn(
    'relative flex min-h-screen flex-col items-center justify-center overflow-x-hidden p-4 sm:p-8',
    'bg-gradient-to-b from-[#0f0404] via-[#1c0808] to-[#0a0303]',
  );
}

export function authBackdropClass() {
  return cn(
    'pointer-events-none absolute inset-0 overflow-hidden',
    '[background:radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(122,0,0,0.45)_0%,transparent_55%)]',
  );
}

export function authGridClass() {
  return cn(
    'pointer-events-none absolute inset-0 opacity-[0.07]',
    '[background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:28px_28px]',
  );
}

export function authCardClass() {
  return cn(
    'w-full max-w-[420px] border border-white/10 bg-white/[0.97] shadow-[0_24px_64px_-12px_rgba(0,0,0,0.45)]',
    'backdrop-blur-sm ring-1 ring-black/[0.06]',
  );
}

export function authPrimaryButtonClass() {
  return cn(
    'h-11 w-full gap-2 rounded-xl font-semibold shadow-lg transition-all',
    'bg-[#7A0000] text-white shadow-[#7A0000]/25',
    'hover:bg-[#5c0000] hover:shadow-xl hover:shadow-[#7A0000]/20',
    'focus-visible:ring-2 focus-visible:ring-[#7A0000]/50 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-45',
  );
}

export function authLinkClass() {
  return cn(
    'font-semibold text-[#7A0000] underline-offset-4 transition-colors hover:text-[#5c0000] hover:underline',
  );
}

export function authMutedLinkClass() {
  return cn('text-sm text-gray-600 transition hover:text-gray-900');
}
