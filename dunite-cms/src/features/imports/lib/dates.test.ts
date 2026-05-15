import assert from 'node:assert/strict';
import test from 'node:test';

import { coerceUnknownToUtcDate, parsePublishDateUnknown } from './dates';

test('parses excel serial number into valid UTC date', () => {
  const parsed = parsePublishDateUnknown(46162.5, 'UTC');
  assert.ok(parsed.date instanceof Date);
  assert.ok(Number.isFinite(parsed.date!.getTime()));
  assert.equal(parsed.warning, 'excel_oa_serial');
});

test('parses yyyy-mm-dd hh:mm:ss string in UTC timezone', () => {
  const parsed = parsePublishDateUnknown('2026-05-20 10:00:00', 'UTC');
  assert.equal(parsed.date?.toISOString(), '2026-05-20T10:00:00.000Z');
});

test('applies timezone conversion for wall-clock schedule strings', () => {
  const parsed = parsePublishDateUnknown('2026-05-20 10:00:00', 'Asia/Dhaka');
  assert.equal(parsed.date?.toISOString(), '2026-05-20T04:00:00.000Z');
});

test('returns null + reason for malformed date strings', () => {
  const parsed = parsePublishDateUnknown('not-a-date', 'UTC');
  assert.equal(parsed.date, null);
  assert.equal(parsed.reasonCode, 'unrecognized_date_format');
});

test('returns null + empty reason for blank values', () => {
  const parsed = parsePublishDateUnknown('', 'UTC');
  assert.equal(parsed.date, null);
  assert.equal(parsed.reasonCode, 'empty');
});

test('coerceUnknownToUtcDate handles date objects and nulls safely', () => {
  assert.equal(coerceUnknownToUtcDate(null, 'UTC'), null);
  assert.equal(coerceUnknownToUtcDate(undefined, 'UTC'), null);
  const d = new Date('2026-05-20T10:00:00Z');
  assert.equal(coerceUnknownToUtcDate(d, 'UTC')?.toISOString(), '2026-05-20T10:00:00.000Z');
});
