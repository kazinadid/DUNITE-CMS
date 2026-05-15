'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { buildImportValidationSummary } from '../validation/buildValidationSummary';
import { filterImportPreviewRows, type ImportPreviewFilterMode } from '../lib/previewRowQuery';

import type { ImportValidationSummary, NormalizedImportRow } from '../types';

import { useDebouncedValue } from './useDebouncedValue';

const SEARCH_DEBOUNCE_MS = 200;

export interface UseImportPreviewSessionOptions {
  /** Canonical rows from the parser (full file). */
  rows: readonly NormalizedImportRow[];
  /** Change when a new file finishes parsing to reset local preview state. */
  resetKey: string;
}

export function useImportPreviewSession({ rows, resetKey }: UseImportPreviewSessionOptions) {
  const [excludedSourceIndices, setExcludedSourceIndices] = useState<Set<number>>(() => new Set());
  const [filterMode, setFilterMode] = useState<ImportPreviewFilterMode>('all');
  const [searchInput, setSearchInput] = useState('');
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(() => new Set());

  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    queueMicrotask(() => {
      setExcludedSourceIndices(new Set());
      setFilterMode('all');
      setSearchInput('');
      setBulkSelected(new Set());
    });
  }, [resetKey]);

  const displayedRows = useMemo(
    () =>
      filterImportPreviewRows(rows, {
        excludedSourceIndices,
        filterMode,
        searchQuery: debouncedSearch,
      }),
    [rows, excludedSourceIndices, filterMode, debouncedSearch],
  );

  const visibleValidation: ImportValidationSummary | null = useMemo(() => {
    if (displayedRows.length === 0) return null;
    return buildImportValidationSummary(displayedRows);
  }, [displayedRows]);

  const excludeIndices = useCallback((indices: Iterable<number>) => {
    setExcludedSourceIndices((prev) => {
      const next = new Set(prev);
      for (const i of indices) next.add(i);
      return next;
    });
    setBulkSelected(new Set());
  }, []);

  const removeInvalidRows = useCallback(() => {
    const targets = rows.filter((r) => r.validationState === 'invalid').map((r) => r.sourceRowIndex);
    excludeIndices(targets);
  }, [rows, excludeIndices]);

  const removeSkippedRows = useCallback(() => {
    const targets = rows.filter((r) => r.validationState === 'skipped').map((r) => r.sourceRowIndex);
    excludeIndices(targets);
  }, [rows, excludeIndices]);

  const removeSelectedRows = useCallback(() => {
    excludeIndices(bulkSelected);
  }, [bulkSelected, excludeIndices]);

  const clearExclusions = useCallback(() => {
    setExcludedSourceIndices(new Set());
  }, []);

  const toggleBulkSelect = useCallback((sourceRowIndex: number) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sourceRowIndex)) next.delete(sourceRowIndex);
      else next.add(sourceRowIndex);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setBulkSelected(new Set(displayedRows.map((r) => r.sourceRowIndex)));
  }, [displayedRows]);

  const clearBulkSelection = useCallback(() => setBulkSelected(new Set()), []);

  const isFilteredView =
    excludedSourceIndices.size > 0 ||
    filterMode !== 'all' ||
    debouncedSearch.trim().length > 0;

  return {
    filterMode,
    setFilterMode,
    searchInput,
    setSearchInput,
    debouncedSearch,
    displayedRows,
    visibleValidation,
    excludedSourceIndices,
    clearExclusions,
    removeInvalidRows,
    removeSkippedRows,
    removeSelectedRows,
    bulkSelected,
    toggleBulkSelect,
    selectAllVisible,
    clearBulkSelection,
    isFilteredView,
  };
}
