/**
 * MsMediaCard & MsFileCard - Renders image, video, and file document attachments in chat.
 */

import React, { useState } from 'react';
import { Play, FileText, Download, Eye, ExternalLink } from 'lucide-react';

interface MsMediaCardProps {
  mediaUrl: string;
  mediaType?: 'image' | 'video' | 'document' | null;
  caption?: string;
  fileName?: string;
  fileSize?: number;
}

export const MsMediaCard: React.FC<MsMediaCardProps> = ({
  mediaUrl,
  mediaType = 'image',
  caption,
  fileName,
  fileSize,
}) => {
  const [showLightbox, setShowLightbox] = useState(false);

  if (mediaType === 'video') {
    return (
      <div className="relative rounded-xl overflow-hidden max-w-sm bg-black group my-1">
        <video
          src={mediaUrl}
          controls
          className="max-h-64 w-full object-cover rounded-xl"
        />
        {caption && <p className="p-2 text-xs text-stone-200 bg-stone-900/80">{caption}</p>}
      </div>
    );
  }

  return (
    <>
      <div className="relative group cursor-pointer my-1 rounded-xl overflow-hidden max-w-xs shadow-sm border border-stone-200/50 dark:border-stone-800">
        <img
          src={mediaUrl}
          alt={caption || 'Attachment'}
          onClick={() => setShowLightbox(true)}
          className="w-full max-h-64 object-cover rounded-xl hover:scale-102 transition-transform duration-200"
          referrerPolicy="no-referrer"
        />
        {caption && <p className="p-2 text-xs font-medium text-stone-700 dark:text-stone-300">{caption}</p>}
      </div>

      {showLightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setShowLightbox(false)}
        >
          <div className="relative max-w-4xl max-h-full">
            <img
              src={mediaUrl}
              alt="Full view"
              className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
              referrerPolicy="no-referrer"
            />
            <a
              href={mediaUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="absolute top-2 right-2 bg-stone-900/80 text-white p-2 rounded-full hover:bg-stone-800"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
          </div>
        </div>
      )}
    </>
  );
};

export const MsFileCard: React.FC<MsMediaCardProps> = ({
  mediaUrl,
  fileName = 'Document',
  fileSize,
}) => {
  const formatSize = (bytes?: number) => {
    if (!bytes) return 'File';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="flex items-center gap-3 p-3 my-1 rounded-xl bg-stone-100 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 min-w-[220px]">
      <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
        <FileText className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">{fileName}</p>
        <p className="text-[11px] text-stone-500">{formatSize(fileSize)}</p>
      </div>
      <a
        href={mediaUrl}
        target="_blank"
        rel="noreferrer"
        download={fileName}
        className="p-2 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 shrink-0"
      >
        <Download className="w-4 h-4" />
      </a>
    </div>
  );
};
