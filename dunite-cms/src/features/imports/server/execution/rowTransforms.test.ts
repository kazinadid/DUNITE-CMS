import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inferMediaKindFromUrl,
  mergeContentWithHashtags,
  normalizeHashtags,
  normalizeMediaUrls,
  normalizePlatformTokens,
} from './rowTransforms';

test('normalizePlatformTokens resolves aliases and deduplicates', () => {
  const out = normalizePlatformTokens(['Twitter/X', 'x', 'IG', 'linkedin', 'unknown']);
  assert.deepEqual(out.platforms.sort(), ['instagram', 'linkedin', 'twitter']);
  assert.deepEqual(out.unknownTokens, ['unknown']);
});

test('normalizeHashtags merges explicit and inline hashtags safely', () => {
  const tags = normalizeHashtags(['Launch', '#Q2'], 'New roadmap #Launch #Team_Update');
  assert.deepEqual(tags, ['launch', 'q2', 'team_update']);
});

test('mergeContentWithHashtags appends only missing tags', () => {
  const merged = mergeContentWithHashtags('Hello #launch', ['launch', 'q2']);
  assert.equal(merged, 'Hello #launch #q2');
});

test('normalizeMediaUrls rejects malformed and deduplicates', () => {
  const urls = normalizeMediaUrls(['https://a.com/p.png', 'https://a.com/p.png', 'bad-url', '//cdn.site/v.mp4']);
  assert.deepEqual(urls, ['https://a.com/p.png', 'https://cdn.site/v.mp4']);
});

test('inferMediaKindFromUrl detects common extensions', () => {
  assert.equal(inferMediaKindFromUrl('https://a.com/x.jpg'), 'image');
  assert.equal(inferMediaKindFromUrl('https://a.com/x.mp4?x=1'), 'video');
  assert.equal(inferMediaKindFromUrl('https://a.com/x.mp3'), 'audio');
  assert.equal(inferMediaKindFromUrl('https://a.com/x.bin'), 'other');
});
