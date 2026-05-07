import Link from 'next/link';

export function BrandMark({ href = '/dashboard' }: { href?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-2 py-1 text-sm font-semibold tracking-tight"
    >
      <span className="flex size-7 items-center justify-center rounded-md bg-red-600 text-xs font-bold text-white shadow-sm">
        D
      </span>
      <span>Dunite CMS</span>
    </Link>
  );
}
