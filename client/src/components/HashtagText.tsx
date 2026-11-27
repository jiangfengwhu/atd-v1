import * as React from 'react';
import type { PostMentionItem } from '@/lib/api';
import { splitContentByHashtags } from '@/lib/hashtags';
import { splitContentByMentions } from '@/lib/mentions';
import { splitTextByUrls } from '@/lib/urlParser';
import { OfficialBadge } from '@/components/OfficialBadge';
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
              className="inline break-all font-medium text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-700 hover:decoration-blue-500 dark:text-blue-400 dark:decoration-blue-500/50 dark:hover:text-blue-300 dark:hover:decoration-blue-400"
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
                    className="inline font-medium text-blue-600 hover:text-blue-700 hover:underline focus:outline-none dark:text-blue-400 dark:hover:text-blue-300"
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
                              ? 'inline-flex items-center justify-center gap-1 align-middle font-semibold text-indigo-600 transition-colors hover:text-indigo-700 hover:underline focus:outline-none dark:text-indigo-400 dark:hover:text-indigo-300'
                              : 'inline-flex items-center justify-center align-middle font-semibold text-blue-600 transition-colors hover:text-blue-700 hover:underline focus:outline-none dark:text-sky-400 dark:hover:text-sky-300'
                          }
                        >
                          <span>{mSeg.raw}</span>
                          {mSeg.mention.isOfficial && (
                            <OfficialBadge
                              label={mSeg.mention.officialBadge || '官方'}
                              size="sm"
                            />
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
