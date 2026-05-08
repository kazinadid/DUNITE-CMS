'use client';

import { Toaster } from 'sonner';

export function AppToast() {
  return (
    <Toaster
      position="top-right"
      richColors={false}
      closeButton
      duration={3000}
      toastOptions={{
        classNames: {
          toast:
            'group !rounded-xl !border !border-gray-200 !bg-white !px-4 !py-3 !text-sm !text-gray-900 !shadow-xl !shadow-black/10',
          title: '!font-semibold !text-gray-900',
          description: '!text-gray-500',
          success: '!border-emerald-200',
          error: '!border-red-200',
        },
      }}
      className="max-sm:[--width:calc(100vw-2rem)] max-sm:!left-1/2 max-sm:!right-auto max-sm:!-translate-x-1/2"
    />
  );
}
