import { NextResponse } from 'next/server';

import {
  getCampaignImportTemplateCsvSerialized,
  IMPORT_TEMPLATE_DOWNLOAD_NAMES,
} from '@/features/imports/lib/importTemplates';

/**
 * Reference download for campaign import layout — mirrors client-side template bytes.
 */
export async function GET() {
  const body = getCampaignImportTemplateCsvSerialized();
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${IMPORT_TEMPLATE_DOWNLOAD_NAMES.csv}"`,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
