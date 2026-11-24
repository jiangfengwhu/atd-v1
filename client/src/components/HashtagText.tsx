import * as React from 'react';
import { splitContentByHashtags } from '@/lib/hashtags';

interface HashtagTextProps {
  content: string;
  onSelectTag?: (tag: string, e: React.MouseEvent) => void;
}

export function HashtagText({ content, onSelectTag }: HashtagTextProps) {
  const segments = React.useMemo(() => splitContentByHashtags(content), [content]);

  return (
    <>
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
    </>
  );
}
