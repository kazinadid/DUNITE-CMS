/** Default rows claimed per server action / worker tick (bounded in DB RPC). */
export const DEFAULT_IMPORT_CHUNK_SIZE = 40;
export const MAX_IMPORT_CHUNK_SIZE = 200;

export function resolveImportChunkSize(requested?: number): number {
  const envRaw = process.env.IMPORT_EXEC_CHUNK_SIZE;
  const envN = envRaw ? Number.parseInt(envRaw, 10) : Number.NaN;
  const base = Number.isFinite(envN) && envN > 0 ? envN : DEFAULT_IMPORT_CHUNK_SIZE;
  const cap = Math.min(MAX_IMPORT_CHUNK_SIZE, Math.max(1, base));
  if (requested == null || !Number.isFinite(requested)) return cap;
  return Math.min(MAX_IMPORT_CHUNK_SIZE, Math.max(1, Math.floor(requested)));
}
