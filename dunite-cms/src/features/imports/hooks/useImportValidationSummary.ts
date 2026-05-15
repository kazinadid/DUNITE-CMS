'use client';

import { useMemo } from 'react';

import { buildImportValidationSummary } from '../validation/buildValidationSummary';

import type { NormalizedImportRow } from '../types';

/**
 * Memoized rollup for consumers that hold `rows` outside the batch workflow hook
 * (e.g. future re-validation after manual edits).
 */
export function useImportValidationSummary(rows: readonly NormalizedImportRow[]) {
  return useMemo(() => buildImportValidationSummary(rows), [rows]);
}
