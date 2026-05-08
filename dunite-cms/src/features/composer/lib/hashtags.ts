// ============================================================================
//  Hashtag utilities
// ----------------------------------------------------------------------------
//  Extract and render hashtags consistently across the editor strip,
//  validation messages and platform previews.
// ============================================================================

// Match Unicode word characters so non-ASCII hashtags work too. Excludes
// punctuation so e.g. "#hello," cleanly captures "hello".
const HASHTAG_RE = /(^|[^\w/])#([\p{L}\p{N}_]+)/gu;

export function extractHashtags(content: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of content.matchAll(HASHTAG_RE)) {
    const tag = match[2]!.toLowerCase();
    if (!seen.has(tag)) {
      seen.add(tag);
      out.push(`#${match[2]}`);
    }
  }
  return out;
}

export type HashtagToken = { kind: 'text' | 'tag'; value: string };

/**
 * Tokenize content into runs of plain text and hashtag tokens. Used by
 * platform previews to render hashtags with brand-blue styling without
 * resorting to dangerouslySetInnerHTML.
 */
export function tokenize(content: string): HashtagToken[] {
  const out: HashtagToken[] = [];
  let lastIndex = 0;
  // Reset regex state between calls — required because of the `g` flag.
  const re = new RegExp(HASHTAG_RE.source, HASHTAG_RE.flags);
  let m: RegExpExecArray | null;

  while ((m = re.exec(content)) !== null) {
    const matchStart = m.index + m[1]!.length; // skip the leading boundary char
    if (matchStart > lastIndex) {
      out.push({ kind: 'text', value: content.slice(lastIndex, matchStart) });
    }
    out.push({ kind: 'tag', value: `#${m[2]}` });
    lastIndex = matchStart + 1 + m[2]!.length;
  }
  if (lastIndex < content.length) {
    out.push({ kind: 'text', value: content.slice(lastIndex) });
  }
  return out;
}
