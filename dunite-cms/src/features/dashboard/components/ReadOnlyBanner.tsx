import { Lock } from 'lucide-react';

export function ReadOnlyBanner() {
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      <Lock className="size-4 shrink-0" aria-hidden />
      <p>
        <span className="font-semibold">Read-only mode.</span> Your account has
        view permissions only — actions that modify data are hidden.
      </p>
    </div>
  );
}
