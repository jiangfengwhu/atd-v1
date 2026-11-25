import * as React from 'react';
import { splitContentByHashtags } from '@/lib/hashtags';
import { splitTextByUrls } from '@/lib/urlParser';

interface HashtagTextProps {
  content: string;
  onSelectTag?: (tag: string, e: React.MouseEvent) => void;
}

export function HashtagText({ content, onSelectTag }: HashtagTextProps) {
  const parts = React.useMemo(() => splitTextByUrls(content), [content]);

  return (
    <>
      {parts.map((part, partIdx) => {
        if (part.type === 'url') {
          return (
            <a
              key={`url-${partIdx}-${part.value}`}
              href={part.value}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline break-all font-medium text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-700 hover:decoration-blue-500"
            >
              {part.value}
            </a>
          );
        }

        const segments = splitContentByHashtags(part.value);
        return (
          <React.Fragment key={`text-${partIdx}`}>
            {segments.map((seg, idx) =>
              seg.type === 'tag' ? (
                <button
                  key={`${seg.value}-${idx}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTag?.(seg.value, e);
                  }}
                  className="inline font-medium text-blue-600 hover:text-blue-700 hover:underline focus:outline-none"
                >
                  {seg.raw}
                </button>
              ) : (
                <React.Fragment key={idx}>{seg.value}</React.Fragment>
              )
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}
