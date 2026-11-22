import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Heart,
  MessageCircle,
  Moon,
  Repeat2,
  Share2,
  Sun,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '../api';
import { Comments } from './Comments';
import { Post } from './Feed';
import { ImageLightbox, LightboxImage } from './ImageLightbox';

interface PostDetailProps {
  postId: string;
  initialPost?: Post | null;
  focusComment?: boolean;
  currentUserLabel?: string;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onBack: () => void;
  onSelectUserForDm?: (userId: string) => void;
  onStatsChange?: () => void;
}

export const PostDetail: React.FC<PostDetailProps> = ({
  postId,
  initialPost = null,
  focusComment = false,
  currentUserLabel = '',
  theme,
  onToggleTheme,
  onBack,
  onSelectUserForDm,
  onStatsChange,
}) => {
  const validInitial = initialPost && initialPost.id === postId ? initialPost : null;

  const [post, setPost] = useState<Post | null>(validInitial);
  const [loading, setLoading] = useState<boolean>(!validInitial);
  const [errorState, setErrorState] = useState<'not_found' | 'error' | null>(null);
  const [refreshWarning, setRefreshWarning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [lightboxState, setLightboxState] = useState<{
    open: boolean;
    images: LightboxImage[];
    index: number;
  }>({ open: false, images: [], index: 0 });

  const clickedPostIdRef = useRef<string | null>(null);
  const postStateRef = useRef<Post | null>(validInitial);
  postStateRef.current = post;

  const recordDetailClick = async (targetPostId: string) => {
    if (clickedPostIdRef.current === targetPostId) return;
    clickedPostIdRef.current = targetPostId;

    try {
      const res = await apiRequest<{
        post_id: string;
        clicks_count: number;
        views_count: number;
      }>(`/api/v1/posts/${encodeURIComponent(targetPostId)}/click`, {
        method: 'POST',
      });

      setPost((prev) =>
        prev && prev.id === targetPostId
          ? {
              ...prev,
              clicks_count: res.clicks_count,
              views_count: res.views_count,
            }
          : prev
      );
      onStatsChange?.();
    } catch {
      // ignore non-blocking click tracking failure
    }
  };

  const fetchPostDetail = async (showSkeleton = false) => {
    if (showSkeleton || !postStateRef.current) {
      setLoading(true);
    }
    setErrorState(null);
    setRefreshWarning(false);

    try {
      const data = await apiRequest<Post>(
        `/api/v1/posts/${encodeURIComponent(postId)}`
      );
      setPost(data);
      setErrorState(null);
      setRefreshWarning(false);
      recordDetailClick(data.id);
    } catch (err: any) {
      if (err?.status === 404) {
        setPost(null);
        setErrorState('not_found');
      } else if (!postStateRef.current) {
        setErrorState('error');
      } else {
        setRefreshWarning(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const matchedInitial =
      initialPost && initialPost.id === postId ? initialPost : null;
    setPost(matchedInitial);
    postStateRef.current = matchedInitial;
    setLoading(!matchedInitial);
    setErrorState(null);
    setRefreshWarning(false);
    fetchPostDetail(!matchedInitial);
  }, [postId]);

  const handleToggleLike = async () => {
    if (!post) return;
    try {
      const res = await apiRequest<{
        post_id: string;
        liked: boolean;
        likes_count: number;
      }>(`/api/v1/posts/${encodeURIComponent(post.id)}/like`, {
        method: 'POST',
      });

      setPost((prev) =>
        prev
          ? {
              ...prev,
              user_liked: res.liked,
              likes_count: res.likes_count,
            }
          : prev
      );
      onStatsChange?.();
    } catch (err: any) {
      toast.error(err?.message || '点赞操作失败');
    }
  };

  const handleToggleRepost = async () => {
    if (!post) return;
    try {
      const res = await apiRequest<{
        post_id: string;
        reposted: boolean;
        reposts_count: number;
      }>(`/api/v1/posts/${encodeURIComponent(post.id)}/repost`, {
        method: 'POST',
      });

      setPost((prev) =>
        prev
          ? {
              ...prev,
              user_reposted: res.reposted,
              reposts_count: res.reposts_count,
            }
          : prev
      );
      onStatsChange?.();
    } catch (err: any) {
      toast.error(err?.message || '转发操作失败');
    }
  };

  const handleShareLink = async () => {
    const shareUrl =
      typeof window !== 'undefined' ? window.location.href : `/posts/${postId}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      setCopied(true);
      toast.success('已复制动态链接');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.success('动态链接已就绪');
    }
  };

  const handleOpenLightbox = (index: number) => {
    if (!post?.images || post.images.length === 0) return;
    setLightboxState({
      open: true,
      images: post.images.map((im) => ({ id: im.id, url: im.url })),
      index,
    });
  };

  const formatFullTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const displayName = post
    ? post.author_name ||
      (post.user_id.length > 12
        ? `User-${post.user_id.slice(0, 6)}`
        : post.user_id)
    : '';
  const imgs = post?.images || [];
  const clicks = post?.clicks_count ?? post?.views_count ?? 0;
  const likes = post?.likes_count ?? 0;
  const reposts = post?.reposts_count ?? 0;
  const commentsCount = post?.comments_count ?? 0;

  return (
    <div className="x-detail-page">
      <header className="x-header x-detail-header">
        <div className="x-detail-header-inner">
          <div className="x-detail-header-left">
            <button
              type="button"
              className="x-detail-back-btn"
              onClick={onBack}
              aria-label="返回"
            >
              <ArrowLeft size={18} />
              <span>返回</span>
            </button>
            <h1 className="x-detail-title">动态详情</h1>
          </div>

          <button
            type="button"
            className="x-theme-toggle-btn"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? '切换为亮色模式' : '切换为暗色模式'}
            title={theme === 'dark' ? '切换为亮色模式' : '切换为暗色模式'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      {refreshWarning && (
        <div className="error-banner x-detail-error-banner" role="alert">
          <span>动态最新数据同步失败</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fetchPostDetail(false)}
          >
            重试
          </button>
        </div>
      )}

      {loading && !post ? (
        <div className="x-detail-skeleton" data-testid="post-detail-skeleton">
          <div className="x-skeleton-card">
            <div className="x-shimmer x-skeleton-avatar" />
            <div className="x-skeleton-body">
              <div className="x-shimmer x-skeleton-line short" />
              <div className="x-shimmer x-skeleton-line" />
              <div className="x-shimmer x-skeleton-line" />
              <div className="x-shimmer x-skeleton-line medium" />
              <div className="x-skeleton-actions">
                <div className="x-shimmer x-skeleton-circle" />
                <div className="x-shimmer x-skeleton-circle" />
                <div className="x-shimmer x-skeleton-circle" />
                <div className="x-shimmer x-skeleton-circle" />
              </div>
            </div>
          </div>
        </div>
      ) : errorState === 'not_found' ? (
        <div className="empty-card x-detail-not-found x-fade-in-up" data-testid="post-detail-not-found">
          <h2>该动态不存在或已被删除</h2>
          <p>你访问的动态可能已被移除，或链接地址有误。</p>
          <button
            type="button"
            className="btn btn-primary x-btn-active"
            onClick={onBack}
          >
            返回首页
          </button>
        </div>
      ) : errorState === 'error' ? (
        <div className="error-card x-fade-in-up" role="alert" data-testid="post-detail-error">
          <div className="error-title">动态详情加载失败，请稍后重试</div>
          <div className="x-detail-error-actions">
            <button
              type="button"
              className="btn btn-primary x-btn-active"
              onClick={() => fetchPostDetail(true)}
            >
              重试
            </button>
            <button
              type="button"
              className="btn btn-secondary x-btn-active"
              onClick={onBack}
            >
              返回首页
            </button>
          </div>
        </div>
      ) : post ? (
        <article
          className="post-card x-post-detail-card x-fade-in-up"
          data-testid="post-detail"
        >
          {/* Author Header */}
          <div className="x-detail-author-row">
            <div className="x-detail-author-left">
              <div className="avatar">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="x-detail-author-meta">
                <span className="author-name">{displayName}</span>
                <span className="x-handle">@{post.user_id.slice(0, 10)}</span>
              </div>
            </div>

            {onSelectUserForDm && (
              <button
                type="button"
                className="btn-link x-dm-quick-btn"
                onClick={() => onSelectUserForDm(post.user_id)}
                title="联系作者"
              >
                联系作者
              </button>
            )}
          </div>

          {/* Full Content */}
          {post.content && (
            <div className="post-content x-detail-content">{post.content}</div>
          )}

          {/* Multi-Image Grid */}
          {imgs.length > 0 && (
            <div
              className={`x-media-grid x-media-grid-${Math.min(imgs.length, 4)}`}
            >
              {imgs.map((img, idx) => (
                <button
                  key={img.id}
                  type="button"
                  className="x-media-tile"
                  onClick={() => handleOpenLightbox(idx)}
                  aria-label={`查看大图 ${idx + 1}`}
                >
                  <img
                    src={img.url}
                    alt={`动态图片 ${idx + 1}`}
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Absolute Timestamp */}
          <div className="x-detail-timestamp">
            <time dateTime={post.created_at}>
              {formatFullTimestamp(post.created_at)}
            </time>
          </div>

          {/* 4-Dimension Stats Strip */}
          <div className="x-detail-stats-strip" data-testid="detail-stats-strip">
            <div className="x-detail-stat-item">
              <strong>{clicks}</strong>
              <span>点击</span>
            </div>
            <div className="x-detail-stat-item">
              <strong>{reposts}</strong>
              <span>转发</span>
            </div>
            <div className="x-detail-stat-item">
              <strong>{likes}</strong>
              <span>点赞</span>
            </div>
            <div className="x-detail-stat-item">
              <strong>{commentsCount}</strong>
              <span>评论</span>
            </div>
          </div>

          {/* Interactive Actions Bar */}
          <div className="post-footer x-tweet-actions-bar x-detail-actions-bar">
            <button
              type="button"
              className="x-tweet-action-btn x-reply-btn"
              onClick={() => setFocusTrigger((n) => n + 1)}
              aria-label="评论"
            >
              <MessageCircle size={18} />
              <span>{commentsCount}</span>
            </button>

            <button
              type="button"
              className={`x-tweet-action-btn x-repost-btn ${
                post.user_reposted ? 'reposted' : ''
              }`}
              onClick={handleToggleRepost}
              aria-label="转发"
            >
              <Repeat2 size={18} />
              <span>{reposts}</span>
            </button>

            <button
              type="button"
              className={`x-tweet-action-btn x-like-btn ${
                post.user_liked ? 'liked' : ''
              }`}
              onClick={handleToggleLike}
              aria-label="点赞"
            >
              <Heart
                size={18}
                fill={post.user_liked ? 'currentColor' : 'none'}
              />
              <span>{likes}</span>
            </button>

            <button
              type="button"
              className={`x-tweet-action-btn x-share-btn ${copied ? 'copied' : ''}`}
              onClick={handleShareLink}
              aria-label="分享链接"
              title="复制动态链接"
            >
              {copied ? <Check size={18} /> : <Share2 size={18} />}
              <span>{copied ? '已复制' : '分享'}</span>
            </button>
          </div>

          {/* Embedded Comments Thread */}
          <Comments
            postId={post.id}
            autoFocus={focusComment}
            focusTrigger={focusTrigger}
            currentUserLabel={currentUserLabel}
            onCommentAdded={(total) => {
              setPost((prev) =>
                prev
                  ? {
                      ...prev,
                      comments_count:
                        typeof total === 'number'
                          ? total
                          : (prev.comments_count ?? 0) + 1,
                    }
                  : prev
              );
              onStatsChange?.();
            }}
          />
        </article>
      ) : null}

      <ImageLightbox
        images={lightboxState.images}
        currentIndex={lightboxState.index}
        open={lightboxState.open}
        onOpenChange={(open) => setLightboxState((prev) => ({ ...prev, open }))}
        onIndexChange={(index) =>
          setLightboxState((prev) => ({ ...prev, index }))
        }
      />
    </div>
  );
};
