export function AuthBrand({
  subtitle,
}: {
  subtitle: string;
}) {
  return (
    <header className="mb-8 text-center">
      <div className="mb-4 flex justify-center">
        <div className="inline-flex items-center gap-3 rounded-2xl px-1 py-1">
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7A0000] to-[#4A0000] text-lg font-bold tracking-tight text-white shadow-lg shadow-[#7A0000]/30 ring-1 ring-white/20"
            aria-hidden
          >
            D
          </span>
          <div className="flex flex-col items-start text-left">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
              DUNITE CMS
            </p>
            <p className="text-lg font-semibold tracking-tight text-white">{subtitle}</p>
          </div>
        </div>
      </div>
      <p className="mx-auto max-w-sm text-sm leading-relaxed text-white/50">
        Secure workspace access — same identity as your dashboard.
      </p>
    </header>
  );
}
