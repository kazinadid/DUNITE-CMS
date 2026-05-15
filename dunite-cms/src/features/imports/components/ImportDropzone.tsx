'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
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
  const inputId = useId();
  const instructionsId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [dragActive, setDragActive] = useState(false);

  const blocked = Boolean(disabled || busy);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list?.length || blocked) return;
      onFile(list[0]);
    },
    [blocked, onFile],
  );

  const openFilePicker = useCallback(() => {
    if (blocked) return;
    inputRef.current?.click();
  }, [blocked]);

  const bumpDragDepth = useCallback((delta: number) => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current + delta);
    setDragActive(dragDepthRef.current > 0);
  }, []);

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (blocked) return;
      bumpDragDepth(1);
    },
    [blocked, bumpDragDepth],
  );

  const onDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (blocked) return;
      bumpDragDepth(-1);
    },
    [blocked, bumpDragDepth],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setDragActive(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (blocked) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openFilePicker();
      }
    },
    [blocked, openFilePicker],
  );

  return (
    <div className={cn('relative', className)}>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={accept}
        tabIndex={-1}
        className="sr-only"
        disabled={blocked}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <div
        role="button"
        tabIndex={blocked ? -1 : 0}
        aria-disabled={blocked}
        aria-busy={busy || undefined}
        aria-controls={inputId}
        aria-labelledby={instructionsId}
        aria-describedby={hintId}
        onClick={openFilePicker}
        onKeyDown={onKeyDown}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          'group/dz relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-foreground/20 bg-muted/15 px-6 py-8 text-center outline-none transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out',
          'hover:border-primary/45 hover:bg-muted/35 hover:shadow-sm',
          'focus-visible:border-primary focus-visible:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          dragActive && 'scale-[1.01] border-primary border-solid bg-primary/[0.07] shadow-md ring-1 ring-primary/25',
          blocked && 'pointer-events-none cursor-not-allowed opacity-60',
        )}
      >
        <div
          className={cn(
            'flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-foreground/10 transition-[transform,box-shadow,color,background-color] duration-200',
            'group-hover/dz:scale-105 group-hover/dz:bg-primary/[0.06] group-hover/dz:ring-primary/25',
            'group-focus-visible/dz:ring-2 group-focus-visible/dz:ring-ring/60',
            dragActive && 'scale-105 bg-primary/10 ring-primary/35',
          )}
          aria-hidden
        >
          <FileUp
            className={cn(
              'size-7 text-muted-foreground transition-colors duration-200',
              'group-hover/dz:text-primary',
              dragActive && 'text-primary',
            )}
            aria-hidden
          />
        </div>

        <div className="max-w-md space-y-2">
          <p id={instructionsId} className="text-base font-semibold tracking-tight text-foreground">
            Drop your spreadsheet here
          </p>
          <p id={hintId} className="text-sm leading-relaxed text-muted-foreground">
            CSV or Excel · UTF-8 · headers in row 1 · or press{' '}
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground">
              Enter
            </kbd>{' '}
            /{' '}
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground">
              Space
            </kbd>{' '}
            to browse
          </p>
        </div>

        <span
          className={cn(
            buttonVariants({ variant: 'default', size: 'lg' }),
            'pointer-events-none min-w-[9.5rem] px-5 py-2.5 text-sm font-semibold shadow-sm',
            'group-hover/dz:bg-primary/92',
            'group-active/dz:translate-y-px',
          )}
        >
          Browse files
        </span>
      </div>
    </div>
  );
}
