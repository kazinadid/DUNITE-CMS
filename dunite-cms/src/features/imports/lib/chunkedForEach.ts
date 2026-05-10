/**
 * Yield to the browser between chunks so the main thread stays responsive.
 */
export async function forEachYieldChunk<T>(
  items: readonly T[],
  chunkSize: number,
  fn: (chunk: readonly T[], chunkIndex: number) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  const size = Math.max(1, chunkSize);
  for (let i = 0; i < items.length; i += size) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const chunk = items.slice(i, i + size);
    await fn(chunk, i / size);
    await new Promise<void>((r) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => setTimeout(r, 0));
      } else {
        setTimeout(r, 0);
      }
    });
  }
}
