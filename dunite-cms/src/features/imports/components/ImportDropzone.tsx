'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ImportDropzoneProps {
  disabled?: boolean;
  busy?: boolean;
  accept?: string;
  onFile: (file: File) => void;
  className?: string;
}

export function ImportDropzone({
  disabled,
  busy,
  accept = '.csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  onFile,
  className,
}: ImportDropzoneProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list?.length || disabled || busy) return;
      onFile(list[0]);
    },
    [busy, disabled, onFile],
  );

  return (
    <div
      className={cn(
        'relative rounded-2xl border border-dashed border-foreground/20 bg-muted/20 p-6 transition-colors',
        drag && 'border-primary bg-primary/5',
        (disabled || busy) && 'pointer-events-none opacity-60',
        className,
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDrag(false);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDrag(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="flex flex-col items-center justify-center gap-3 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-background ring-1 ring-foreground/10">
          <FileUp className="size-6 text-muted-foreground" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            Drag & drop a CSV or Excel file
          </p>
          <p className="text-xs text-muted-foreground">
            UTF-8 CSV · XLSX first sheet · column headers in row 1
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          Browse files
        </Button>
      </div>
    </div>
  );
}
