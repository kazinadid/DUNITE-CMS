import { NextResponse } from 'next/server';

import { getImportJobErrorReportAction } from '@/features/imports/server/importOperationsService';

export const dynamic = 'force-dynamic';

function esc(val: string): string {
  if (/[",\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
  return val;
}

export async function GET(_: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const report = await getImportJobErrorReportAction(jobId);
  if (!report.ok) {
    return NextResponse.json({ error: report.message }, { status: 403 });
  }

  const header = 'row_number,row_id,error_message';
  const lines = report.rows.map((row) => `${row.row_number},${esc(row.row_id)},${esc(row.error_message)}`);
  const csv = [header, ...lines].join('\n');
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="import-errors-${jobId.slice(0, 8)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
