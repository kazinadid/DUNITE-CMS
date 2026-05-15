import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveTerminalStatus, isAllowedLifecycleTransition, isTerminalStatus } from './lifecycle';

test('deriveTerminalStatus returns completed for zero failures', () => {
  assert.equal(deriveTerminalStatus({ importedCount: 120, failedCount: 0 }), 'completed');
});

test('deriveTerminalStatus returns partial_success for mixed outcomes', () => {
  assert.equal(deriveTerminalStatus({ importedCount: 45, failedCount: 3 }), 'partial_success');
});

test('deriveTerminalStatus returns failed when nothing imported', () => {
  assert.equal(deriveTerminalStatus({ importedCount: 0, failedCount: 2 }), 'failed');
});

test('transition guards reject invalid direct jump', () => {
  assert.equal(isAllowedLifecycleTransition('staged', 'completed'), false);
});

test('terminal status helper matches expected statuses', () => {
  assert.equal(isTerminalStatus('completed'), true);
  assert.equal(isTerminalStatus('processing'), false);
});
