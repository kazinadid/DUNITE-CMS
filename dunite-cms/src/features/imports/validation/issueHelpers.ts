import type { ImportIssueCode } from './issueCodes';
import type { IssueSeverity, ValidationIssue } from './validationTypes';

export function pushIssue(
  issues: ValidationIssue[],
  code: ImportIssueCode,
  severity: IssueSeverity,
  message: string,
  meta?: ValidationIssue['meta'],
): void {
  issues.push({
    code,
    severity,
    message,
    ...(meta ? { meta } : {}),
  });
}
