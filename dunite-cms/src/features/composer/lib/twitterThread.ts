import { TWITTER_TWEET_MAX } from './platformRules';

export interface TweetThreadSplit {
  segments:        string[];
  hasHardOverflow: boolean;
}

/**
 * Prefer soft breaks (\n\n, \n, sentence ends, spaces) before hard-cutting at maxLen.
 */
export function splitIntoTweetThread(
  raw: string,
  maxLen: number = TWITTER_TWEET_MAX,
): TweetThreadSplit {
  let rest = raw.replace(/\r\n/g, '\n');
  if (!rest.trim()) return { segments: [], hasHardOverflow: false };

  const segments: string[] = [];
  let hard = false;

  function emitChunk(chunk: string) {
    const c = chunk.trimEnd();
    if (!c.length) return;
    if (c.length <= maxLen) {
      segments.push(c);
      return;
    }
    hard = true;
    let t = c;
    while (t.length > maxLen) {
      segments.push(t.slice(0, maxLen));
      t = t.slice(maxLen);
    }
    if (t.length) segments.push(t);
  }

  while (rest.length > maxLen) {
    const head = rest.slice(0, maxLen);
    let cut    = head.lastIndexOf('\n\n');
    if (cut < 56) cut = head.lastIndexOf('\n');
    if (cut < 56)
      cut = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
    if (cut < 56) cut = head.lastIndexOf(' ', maxLen - 8);

    if (cut < 36 || cut === -1) {
      emitChunk(rest.slice(0, maxLen));
      rest = rest.slice(maxLen).trimStart();
      continue;
    }
    emitChunk(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, '').replace(/^\.+\s*/, '');
  }

  emitChunk(rest);

  const hasHardOverflow =
    hard || segments.some((s) => s.length > maxLen);
  return {
    segments: segments.filter((s) => s.length > 0),
    hasHardOverflow,
  };
}

export function twitterThreadTweetCount(raw: string, maxLen = TWITTER_TWEET_MAX): number {
  return splitIntoTweetThread(raw, maxLen).segments.length;
}
