/**
 * DST-Safe Conversion Test Utilities
 * 
 * Provides utilities to verify timezone conversions remain correct
 * across Daylight Saving Time transitions.
 */

import { DateTime } from 'luxon';

/**
 * Known DST transition dates for major timezones
 */
export const DST_TRANSITIONS = {
  // US Eastern Time
  'America/New_York': [
    { year: 2025, spring: '2025-03-09', fall: '2025-11-02' },
    { year: 2026, spring: '2026-03-08', fall: '2026-11-01' },
  ],
  // US Pacific Time
  'America/Los_Angeles': [
    { year: 2025, spring: '2025-03-09', fall: '2025-11-02' },
    { year: 2026, spring: '2026-03-08', fall: '2026-11-01' },
  ],
  // Central European Time
  'Europe/Berlin': [
    { year: 2025, spring: '2025-03-30', fall: '2025-10-26' },
    { year: 2026, spring: '2026-03-29', fall: '2026-10-25' },
  ],
  // No DST (for comparison)
  'Asia/Dhaka': [],
  'UTC': [],
};

/**
 * Test if a timestamp survives a round-trip conversion through a DST transition
 * 
 * @param wallTime - Local wall time in ISO format (e.g., '2025-03-09T02:30:00')
 * @param zone - Timezone to test
 * @returns Test result with details
 */
export function testDSTRoundTrip(
  wallTime: string,
  zone: string,
): {
  passed: boolean;
  originalWall: string;
  recoveredWall: string;
  utcTime: string;
  offsetBefore: string;
  offsetAfter: string;
  warning?: string;
} {
  const original = DateTime.fromISO(wallTime, { zone });
  
  if (!original.isValid) {
    return {
      passed: false,
      originalWall: wallTime,
      recoveredWall: 'invalid',
      utcTime: 'invalid',
      offsetBefore: 'invalid',
      offsetAfter: 'invalid',
      warning: 'Original wall time is invalid',
    };
  }

  const utcTime = original.toUTC().toISO();
  const recovered = DateTime.fromISO(utcTime!).setZone(zone);
  
  const offsetBefore = original.offsetNameShort;
  const offsetAfter = recovered.offsetNameShort;
  
  // Check if hour shifted (DST gap)
  const hourShifted = original.hour !== recovered.hour;
  const minuteShifted = original.minute !== recovered.minute;
  
  let warning: string | undefined;
  if (hourShifted) {
    warning = `Time shifted by ${Math.abs(original.hour - recovered.hour)} hour(s) due to DST transition`;
  }

  return {
    passed: !hourShifted && !minuteShifted,
    originalWall: original.toISO()!,
    recoveredWall: recovered.toISO()!,
    utcTime: utcTime!,
    offsetBefore,
    offsetAfter,
    warning,
  };
}

/**
 * Find all DST gaps in a given year for a timezone
 * Times that don't exist due to spring-forward
 */
export function findDSTGaps(year: number, zone: string): Array<{
  missingFrom: string;
  missingTo: string;
  description: string;
}> {
  const gaps: Array<{ missingFrom: string; missingTo: string; description: string }> = [];
  
  // Check every hour in the spring transition period (March-April for US, March-October for EU)
  const startMonth = zone.includes('Europe') ? 3 : 3;
  const endMonth = zone.includes('Europe') ? 10 : 4;
  
  for (let month = startMonth; month <= endMonth; month++) {
    for (let day = 1; day <= 28; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const wallTime = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:30:00`;
        const dt = DateTime.fromISO(wallTime, { zone });
        
        if (dt.isValid && dt.hour !== hour) {
          // Hour was adjusted - this is a DST gap
          const adjustedHour = dt.hour;
          gaps.push({
            missingFrom: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00`,
            missingTo: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(adjustedHour).padStart(2, '0')}:00:00`,
            description: `Time ${hour}:00 doesn't exist in ${zone} - jumps to ${adjustedHour}:00`,
          });
        }
      }
    }
  }
  
  return gaps;
}

/**
 * Test that scheduling works correctly across all major DST transitions
 */
export function runDSTSuite(): {
  timezone: string;
  tests: number;
  passed: number;
  failed: number;
  warnings: string[];
}[] {
  const results: Array<{
    timezone: string;
    tests: number;
    passed: number;
    failed: number;
    warnings: string[];
  }> = [];

  for (const [zone, transitions] of Object.entries(DST_TRANSITIONS)) {
    const testCases: string[] = [];
    
    // Generate test cases around DST transitions
    for (const transition of transitions) {
      // Day before spring forward
      testCases.push(`${transition.spring}T01:30:00`);
      // Day of spring forward (gap time)
      testCases.push(`${transition.spring}T02:30:00`);
      // Day after spring forward
      testCases.push(`${transition.spring}T12:00:00`);
      
      // Day before fall back
      testCases.push(`${transition.fall}T01:30:00`);
      // Day of fall back (ambiguous time)
      testCases.push(`${transition.fall}T01:30:00`);
      // Day after fall back
      testCases.push(`${transition.fall}T12:00:00`);
    }
    
    // Test normal times
    testCases.push(`${transitions[0]?.year || 2025}-06-15T12:00:00`);
    testCases.push(`${transitions[0]?.year || 2025}-01-15T12:00:00`);
    
    let passed = 0;
    let failed = 0;
    const warnings: string[] = [];
    
    for (const wallTime of testCases) {
      const result = testDSTRoundTrip(wallTime, zone);
      
      if (result.passed) {
        passed++;
      } else {
        failed++;
      }
      
      if (result.warning) {
        warnings.push(`${wallTime}: ${result.warning}`);
      }
    }
    
    results.push({
      timezone: zone,
      tests: testCases.length,
      passed,
      failed,
      warnings,
    });
  }
  
  return results;
}

/**
 * Get safe scheduling times that avoid DST gaps
 * 
 * @param zone - Target timezone
 * @param date - Base date
 * @returns Safe time (adjusted if necessary)
 */
export function getSafeSchedulingTime(
  zone: string,
  date: string, // YYYY-MM-DD
  preferredHour: number = 12,
): {
  safeTime: string;
  wasAdjusted: boolean;
  originalHour: number;
  adjustedHour: number;
} {
  const proposedTime = `${date}T${String(preferredHour).padStart(2, '0')}:00:00`;
  const dt = DateTime.fromISO(proposedTime, { zone });
  
  if (dt.isValid && dt.hour === preferredHour) {
    return {
      safeTime: dt.toUTC().toISO()!,
      wasAdjusted: false,
      originalHour: preferredHour,
      adjustedHour: preferredHour,
    };
  }
  
  // Time doesn't exist or was shifted - use noon instead (safest time)
  const safeDt = DateTime.fromISO(`${date}T12:00:00`, { zone });
  
  return {
    safeTime: safeDt.toUTC().toISO()!,
    wasAdjusted: true,
    originalHour: preferredHour,
    adjustedHour: 12,
  };
}
