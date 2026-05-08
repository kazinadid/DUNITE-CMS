'use client';

import { Hash, ImagePlus } from 'lucide-react';

import { EmojiPicker } from './EmojiPicker';

interface ComposerToolbarProps {
  onInsert:        (text: string) => void;
  onAttachMedia:   () => void;
  disabled?:       boolean;
  /** Slot for a right-aligned readout (CharacterCounter). */
  trailing?:       React.ReactNode;
}

/**
 * Action strip that lives directly under the editor: emoji picker, hashtag
 * shortcut, media attach, and a slot for the live character counter.
 */
export function ComposerToolbar({
  onInsert,
  onAttachMedia,
  disabled,
  trailing,
}: ComposerToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <EmojiPicker onSelect={onInsert} disabled={disabled} />

        <button
          type="button"
          disabled={disabled}
          onClick={() => onInsert('#')}
          aria-label="Insert hashtag"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Hash size={15} aria-hidden />
          <span className="hidden sm:inline">Hashtag</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={onAttachMedia}
          aria-label="Attach media"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ImagePlus size={15} aria-hidden />
          <span className="hidden sm:inline">Add media</span>
        </button>
      </div>

      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  );
}
