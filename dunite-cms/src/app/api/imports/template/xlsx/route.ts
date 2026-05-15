import { NextResponse } from 'next/server';

import {
  buildCampaignImportTemplateXlsxBlob,
  IMPORT_TEMPLATE_DOWNLOAD_NAMES,
} from '@/features/imports/lib/importTemplates';

/**
 * Reference download for campaign import layout — mirrors client-side template bytes.
 */
export async function GET() {
  const blob = await buildCampaignImportTemplateXlsxBlob();
  const buf = await blob.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${IMPORT_TEMPLATE_DOWNLOAD_NAMES.xlsx}"`,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
