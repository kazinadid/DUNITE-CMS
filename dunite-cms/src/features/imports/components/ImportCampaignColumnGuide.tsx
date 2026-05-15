'use client';

import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { IMPORT_EXPECTED_FIELDS_ORDERED, IMPORT_REQUIRED_FIELDS } from '../lib/importFieldSchema';
import {
  IMPORT_TEMPLATE_DOWNLOAD_NAMES,
  buildCampaignImportTemplateXlsxBlob,
  getCampaignImportTemplateCsvBlob,
} from '../lib/importTemplates';

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener noreferrer';
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface ImportCampaignColumnGuideProps {
  className?: string;
}

/**
 * Guidance surface for spreadsheet layout + template downloads (HubSpot/Airtable-style).
 */
export function ImportCampaignColumnGuide({ className }: ImportCampaignColumnGuideProps) {
  return (
    <div className={cn('rounded-xl border border-foreground/10 bg-muted/15 p-3 text-sm shadow-sm', className)}>
      <p className="font-medium text-foreground">Expected columns</p>
      <ul className="mt-2 grid gap-1 text-muted-foreground">
        {IMPORT_EXPECTED_FIELDS_ORDERED.map((col) => (
          <li key={col} className="flex items-center justify-between gap-2 rounded-md bg-background/55 px-2 py-1">
            <span className="font-mono text-xs text-foreground">{col}</span>
            {IMPORT_REQUIRED_FIELDS.includes(col as (typeof IMPORT_REQUIRED_FIELDS)[number]) ? (
              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-destructive uppercase">
                Required
              </span>
            ) : (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Optional
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-muted-foreground">
        Columns may use common synonyms once normalized (matching case, spaces, underscores, or dashes to the names
        above).
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          type="button"
          className="gap-2"
          onClick={() =>
            triggerBrowserDownload(getCampaignImportTemplateCsvBlob(), IMPORT_TEMPLATE_DOWNLOAD_NAMES.csv)
          }
        >
          <Download className="size-4" aria-hidden />
          CSV template
        </Button>
        <Button
          variant="outline"
          size="sm"
          type="button"
          className="gap-2"
          onClick={() =>
            void (async () => {
              try {
                const blob = await buildCampaignImportTemplateXlsxBlob();
                triggerBrowserDownload(blob, IMPORT_TEMPLATE_DOWNLOAD_NAMES.xlsx);
              } catch {
                /* Swallow — browser may block WASM or sheet parsing; surfaced via UX copy */
              }
            })()
          }
        >
          <Download className="size-4" aria-hidden />
          XLSX template
        </Button>
      </div>
    </div>
  );
}
