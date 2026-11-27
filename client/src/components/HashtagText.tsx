import * as React from 'react';
import type { PostMentionItem } from '@/lib/api';
import { splitContentByHashtags } from '@/lib/hashtags';
import { splitContentByMentions } from '@/lib/mentions';
import { splitTextByUrls } from '@/lib/urlParser';

interface HashtagTextProps {
  content: string;
  mentions?: PostMentionItem[];
  onSelectTag?: (tag: string, e: React.MouseEvent) => void;
  onSelectMention?: (mention: PostMentionItem, e: React.MouseEvent) => void;
}

export function HashtagText({
  content,
  mentions,
  onSelectTag,
  onSelectMention,
}: HashtagTextProps) {
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
            {segments.map((seg, idx) => {
              if (seg.type === 'tag') {
                return (
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
                );
              }

              const mentionSegments = splitContentByMentions(seg.value, mentions);
              return (
                <React.Fragment key={`m-${idx}`}>
                  {mentionSegments.map((mSeg, mIdx) =>
                    mSeg.type === 'mention' ? (
                      <button
                        key={`mention-${mSeg.mention.userId}-${mIdx}`}
                        type="button"
                        data-testid={
                          mSeg.mention.isOfficial ? 'mention-tag-official' : 'mention-tag'
                        }
                        data-mention-user-id={mSeg.mention.userId}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectMention?.(mSeg.mention, e);
                        }}
                        className={
                          mSeg.mention.isOfficial
                            ? 'inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 transition hover:bg-blue-100 focus:outline-none align-baseline'
                            : 'inline rounded bg-blue-50/70 px-1 py-0.5 font-semibold text-blue-600 transition hover:bg-blue-100 hover:text-blue-700 focus:outline-none'
                        }
                      >
                        <span>{mSeg.raw}</span>
                        {mSeg.mention.isOfficial && (
                          <span className="rounded bg-blue-600 px-1 py-px text-[10px] font-bold leading-none text-white">
                            {mSeg.mention.officialBadge || '官方'}
                          </span>
                        )}
                      </button>
                    ) : (
                      <React.Fragment key={`plain-${mIdx}`}>{mSeg.value}</React.Fragment>
                    )
                  )}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        );
      })}
    </>
  );
}
