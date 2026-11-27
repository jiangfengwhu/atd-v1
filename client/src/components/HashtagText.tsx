import * as React from 'react';
import type { PostMentionItem } from '@/lib/api';
import { splitContentByHashtags } from '@/lib/hashtags';
import { splitContentByMentions } from '@/lib/mentions';
import { splitTextByUrls } from '@/lib/urlParser';
import { UserHoverCard } from '@/components/UserHoverCard';

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
                      <UserHoverCard
                        key={`mention-${mSeg.mention.userId}-${mIdx}`}
                        userId={mSeg.mention.userId}
                        initialUser={{
                          nickname: mSeg.mention.nickname,
                          isOfficial: mSeg.mention.isOfficial,
                          officialBadge: mSeg.mention.officialBadge,
                        }}
                        onOpenProfile={(uid) => {
                          if (onSelectMention) {
                            onSelectMention(mSeg.mention, {
                              stopPropagation: () => {},
                            } as React.MouseEvent);
                          } else if (uid) {
                            window.history.pushState(null, '', `/users/${encodeURIComponent(uid)}`);
                          }
                        }}
                      >
                        <button
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
                              ? 'inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-300 transition hover:bg-indigo-100 focus:outline-none align-baseline'
                              : 'inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-700 ring-1 ring-inset ring-sky-200 transition hover:bg-sky-100 hover:text-sky-800 focus:outline-none align-baseline'
                          }
                        >
                          <span>{mSeg.raw}</span>
                          {mSeg.mention.isOfficial && (
                            <span className="rounded-full bg-indigo-600 px-1.5 py-px text-[10px] font-bold leading-none text-white">
                              {mSeg.mention.officialBadge || '官方'}
                            </span>
                          )}
                        </button>
                      </UserHoverCard>
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
