import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart2,
  Heart,
  ImagePlus,
  Loader2,
  MessageCircle,
  Repeat2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '../api';
import { Comments } from './Comments';
import { ImageLightbox, LightboxImage } from './ImageLightbox';

export interface PostImage {
  id: string;
  url: string;
  mime_type?: string;
}

export interface Post {
  id: string;
  user_id: string;
  author_name?: string;
  content: string;
  images?: PostImage[];
  clicks_count?: number;
  views_count?: number;
  likes_count?: number;
  reposts_count?: number;
  comments_count?: number;
  user_liked?: boolean;
  user_reposted?: boolean;
  created_at: string;
}

interface UploadedMediaPreview {
  id: string;
  url: string;
  name: string;
}

interface FeedProps {
  sort: 'latest' | 'hot';
  searchQuery?: string;
  onSelectUserForDm?: (userId: string) => void;
  currentUserLabel?: string;
  onStatsChange?: () => void;
  onFeedErrorChange?: (hasError: boolean) => void;
}

const MAX_IMAGES = 4;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const Feed: React.FC<FeedProps> = ({
  sort,
  searchQuery = '',
  onSelectUserForDm,
  currentUserLabel = '',
  onStatsChange,
  onFeedErrorChange,
}) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [charCount, setCharCount] = useState(0);
  const [uploadedImages, setUploadedImages] = useState<UploadedMediaPreview[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [publishError, setPublishError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeCommentsPostId, setActiveCommentsPostId] = useState<string | null>(null);
  const [lightboxState, setLightboxState] = useState<{
    open: boolean;
    images: LightboxImage[];
    index: number;
  }>({ open: false, images: [], index: 0 });

  const fetchFeed = async (reset = true) => {
    if (reset) {
      setLoading(true);
      setFeedError(null);
      onFeedErrorChange?.(false);
    } else {
      setLoadingMore(true);
    }

    try {
      const params = new URLSearchParams();
      params.set('limit', '20');
      params.set('sort', sort);
      if (searchQuery.trim()) {
        params.set('q', searchQuery.trim());
      }
      if (!reset && nextCursor) {
        params.set('cursor', nextCursor);
      }

      const data = await apiRequest<{ posts: Post[]; next_cursor: string }>(
        `/api/v1/feed?${params.toString()}`
      );
      if (reset) {
        setPosts(data.posts || []);
      } else {
        setPosts((prev) => [...prev, ...(data.posts || [])]);
      }
      setNextCursor(data.next_cursor || '');
      setFeedError(null);
      onFeedErrorChange?.(false);
    } catch (err: any) {
      console.error('Feed loading error:', err);
      setFeedError('动态加载失败，服务异常 (500_DB_ERROR)');
      onFeedErrorChange?.(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchFeed(true);
  }, [sort, searchQuery]);

  const handleSelectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    e.target.value = '';

    const remainingSlots = MAX_IMAGES - uploadedImages.length;
    if (remainingSlots <= 0) {
      toast.error(`最多支持上传 ${MAX_IMAGES} 张图片`);
      return;
    }

    const toUpload = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      toast.warning(`单条动态最多 ${MAX_IMAGES} 张图片，已选取前 ${remainingSlots} 张`);
    }

    setPublishError('');
    setUploadingCount((c) => c + toUpload.length);

    for (const file of toUpload) {
      if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
        toast.error(`不支持的图片格式: ${file.name}`);
        setUploadingCount((c) => Math.max(0, c - 1));
        continue;
      }

      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await apiRequest<{
          id: string;
          url: string;
          mime_type: string;
          size_bytes: number;
        }>('/api/v1/media/upload', {
          method: 'POST',
          body: formData,
        });

        setUploadedImages((prev) => [
          ...prev,
          { id: res.id, url: res.url, name: file.name },
        ]);
      } catch (err: any) {
        toast.error(err?.message || `上传 ${file.name} 失败`);
      } finally {
        setUploadingCount((c) => Math.max(0, c - 1));
      }
    }
  };

  const handleRemoveImage = (id: string) => {
    setUploadedImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handlePublish = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (submittingRef.current || uploadingCount > 0) return;

    const rawValue = textareaRef.current?.value ?? '';
    const trimmed = rawValue.trim();
    if (!trimmed && uploadedImages.length === 0) {
      setPublishError('内容不能为空，请输入文字或上传图片 (invalid content)');
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setPublishError('');

    try {
      await apiRequest('/api/v1/posts', {
        method: 'POST',
        body: JSON.stringify({
          content: trimmed,
          media_ids: uploadedImages.map((img) => img.id),
        }),
      });
      if (textareaRef.current) {
        textareaRef.current.value = '';
      }
      setCharCount(0);
      setUploadedImages([]);
      setPublishError('');
      toast.success('发布成功');
      await fetchFeed(true);
      onStatsChange?.();
    } catch (err: any) {
      setPublishError(err.message || '发布失败');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const recordClick = async (postId: string) => {
    try {
      const res = await apiRequest<{
        post_id: string;
        clicks_count: number;
        views_count: number;
      }>(`/api/v1/posts/${postId}/click`, {
        method: 'POST',
      });
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                clicks_count: res.clicks_count,
                views_count: res.views_count,
              }
            : p
        )
      );
      onStatsChange?.();
    } catch {
      // ignore non-blocking click tracking errors
    }
  };

  const handleToggleLike = async (postId: string) => {
    try {
      const res = await apiRequest<{
        post_id: string;
        liked: boolean;
        likes_count: number;
      }>(`/api/v1/posts/${postId}/like`, {
        method: 'POST',
      });

      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                user_liked: res.liked,
                likes_count: res.likes_count,
              }
            : p
        )
      );
      onStatsChange?.();
    } catch (err: any) {
      toast.error(err?.message || '点赞操作失败');
    }
  };

  const handleToggleRepost = async (postId: string) => {
    try {
      const res = await apiRequest<{
        post_id: string;
        reposted: boolean;
        reposts_count: number;
      }>(`/api/v1/posts/${postId}/repost`, {
        method: 'POST',
      });

      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                user_reposted: res.reposted,
                reposts_count: res.reposts_count,
              }
            : p
        )
      );
      onStatsChange?.();
    } catch (err: any) {
      toast.error(err?.message || '转发操作失败');
    }
  };

  const handleToggleComments = (postId: string) => {
    const expanding = activeCommentsPostId !== postId;
    setActiveCommentsPostId(expanding ? postId : null);
    if (expanding) {
      recordClick(postId);
    }
  };

  const handleOpenLightbox = (post: Post, index: number) => {
    const imgs = post.images || [];
    if (imgs.length === 0) return;
    recordClick(post.id);
    setLightboxState({
      open: true,
      images: imgs.map((im) => ({ id: im.id, url: im.url })),
      index,
    });
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      if (diffSecs < 60) return `${Math.max(1, diffSecs)}秒前`;
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins}分钟前`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}小时前`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return isoString;
    }
  };

  const avatarSeed = currentUserLabel || 'ME';

  return (
    <div className="feed-container">
      {/* Compose Post Form */}
      <div className="post-create-card x-compose-box">
        <div className="x-compose-avatar">
          <div className="avatar">{avatarSeed.slice(0, 2).toUpperCase()}</div>
        </div>

        <div className="x-compose-main">
          <form onSubmit={handlePublish}>
            <textarea
              ref={textareaRef}
              className="textarea-field x-compose-textarea"
              aria-label="说点什么"
              placeholder="有什么新鲜事？分享图文或想法..."
              rows={3}
              defaultValue=""
              onChange={(e) => {
                setCharCount(e.target.value.length);
                if (publishError) setPublishError('');
              }}
            />

            {/* Uploaded Image Previews */}
            {(uploadedImages.length > 0 || uploadingCount > 0) && (
              <div className="x-compose-preview-grid">
                {uploadedImages.map((img) => (
                  <div key={img.id} className="x-compose-preview-item">
                    <img src={img.url} alt={img.name} />
                    <button
                      type="button"
                      className="x-preview-remove-btn"
                      aria-label={`移除图片 ${img.name}`}
                      onClick={() => handleRemoveImage(img.id)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {uploadingCount > 0 && (
                  <div className="x-compose-preview-loading">
                    <Loader2 size={20} className="x-spin" />
                    <span>上传中...</span>
                  </div>
                )}
              </div>
            )}

            {publishError && (
              <div className="error-banner x-fade-in-up" role="alert">
                {publishError}
              </div>
            )}

            <div className="x-compose-divider" />

            <div className="x-compose-footer">
              <div className="x-compose-tools">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  className="sr-only"
                  aria-label="选择图片"
                  onChange={handleSelectFiles}
                />
                <button
                  type="button"
                  className="x-icon-btn"
                  title="上传图片（最多 4 张）"
                  aria-label="添加图片"
                  disabled={uploadedImages.length >= MAX_IMAGES}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus size={20} />
                </button>
                <span className="x-upload-hint">
                  {uploadedImages.length}/{MAX_IMAGES} 图
                </span>
              </div>

              <div className="x-compose-right">
                <span className="char-count">{charCount} 字</span>
                <span className="x-v-divider" />
                <button
                  type="submit"
                  className="btn btn-primary x-tweet-btn x-btn-active"
                  disabled={isSubmitting || uploadingCount > 0}
                >
                  {isSubmitting
                    ? '发布中...'
                    : uploadingCount > 0
                    ? '传图中...'
                    : '发布'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Feed list / Error State */}
      {feedError ? (
        <div className="error-card x-fade-in-up" role="alert">
          <div className="error-title">{feedError}</div>
          <button
            type="button"
            className="btn btn-secondary x-btn-active"
            onClick={() => fetchFeed(true)}
          >
            刷新
          </button>
        </div>
      ) : (
        <div className="feed-list">
          {loading && posts.length === 0 ? (
            <div className="x-skeletons-wrapper">
              {[1, 2, 3].map((i) => (
                <div key={i} className="x-skeleton-card">
                  <div className="x-shimmer x-skeleton-avatar" />
                  <div className="x-skeleton-body">
                    <div className="x-shimmer x-skeleton-line short" />
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
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="empty-card x-fade-in-up">
              <h3 style={{ marginBottom: 6, fontWeight: 700 }}>暂无动态</h3>
              <p>
                {searchQuery.trim()
                  ? '未找到匹配的社区动态，试试其他关键词吧。'
                  : '快来发布第一条图文动态吧！'}
              </p>
            </div>
          ) : (
            posts.map((post) => {
              const displayName =
                post.author_name ||
                (post.user_id.length > 12
                  ? `User-${post.user_id.slice(0, 6)}`
                  : post.user_id);
              const imgs = post.images || [];
              const clicks = post.clicks_count ?? post.views_count ?? 0;
              const likes = post.likes_count ?? 0;
              const reposts = post.reposts_count ?? 0;
              const commentsCount = post.comments_count ?? 0;

              return (
                <article
                  key={post.id}
                  data-testid="post-card"
                  className="post-card x-tweet-card x-fade-in-up"
                >
                  <div className="x-tweet-avatar-col">
                    <div className="avatar">
                      {displayName.slice(0, 2).toUpperCase()}
                    </div>
                  </div>

                  <div className="x-tweet-content-col">
                    <div className="post-header x-tweet-header">
                      <div className="author-info x-tweet-author-info">
                        <span className="author-name">{displayName}</span>
                        <span className="x-handle">
                          @{post.user_id.slice(0, 10)}
                        </span>
                        <span className="x-dot">·</span>
                        <time
                          className="post-time"
                          dateTime={post.created_at}
                          onClick={() => recordClick(post.id)}
                        >
                          {formatRelativeTime(post.created_at)}
                        </time>
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

                    {/* Text content */}
                    {post.content && (
                      <div
                        className="post-content x-tweet-text"
                        onClick={() => recordClick(post.id)}
                      >
                        {post.content}
                      </div>
                    )}

                    {/* Images Grid (1-4 images) */}
                    {imgs.length > 0 && (
                      <div
                        className={`x-media-grid x-media-grid-${Math.min(
                          imgs.length,
                          4
                        )}`}
                      >
                        {imgs.map((img, idx) => (
                          <button
                            key={img.id}
                            type="button"
                            className="x-media-tile"
                            onClick={() => handleOpenLightbox(post, idx)}
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

                    {/* Real 4-Dimension Stats & Actions Row */}
                    <div className="post-footer x-tweet-actions-bar">
                      <button
                        type="button"
                        className={`x-tweet-action-btn x-reply-btn ${
                          activeCommentsPostId === post.id ? 'active' : ''
                        }`}
                        onClick={() => handleToggleComments(post.id)}
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
                        onClick={() => handleToggleRepost(post.id)}
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
                        onClick={() => handleToggleLike(post.id)}
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
                        className="x-tweet-action-btn x-views-btn"
                        onClick={() => recordClick(post.id)}
                        aria-label="点击数"
                        title="点击 / 浏览量"
                      >
                        <BarChart2 size={18} />
                        <span>{clicks}</span>
                      </button>
                    </div>

                    {/* Expanded Thread Comments */}
                    {activeCommentsPostId === post.id && (
                      <Comments
                        postId={post.id}
                        currentUserLabel={currentUserLabel}
                        onCommentAdded={() => {
                          setPosts((prev) =>
                            prev.map((p) =>
                              p.id === post.id
                                ? { ...p, comments_count: (p.comments_count ?? 0) + 1 }
                                : p
                            )
                          );
                          onStatsChange?.();
                        }}
                      />
                    )}
                  </div>
                </article>
              );
            })
          )}

          {nextCursor && !loading && (
            <div className="load-more-container">
              <button
                type="button"
                className="btn btn-secondary x-btn-active"
                disabled={loadingMore}
                onClick={() => fetchFeed(false)}
              >
                {loadingMore ? '正在加载...' : '加载更多动态'}
              </button>
            </div>
          )}
        </div>
      )}

      <ImageLightbox
        images={lightboxState.images}
        currentIndex={lightboxState.index}
        open={lightboxState.open}
        onOpenChange={(open) => setLightboxState((prev) => ({ ...prev, open }))}
        onIndexChange={(index) => setLightboxState((prev) => ({ ...prev, index }))}
      />
    </div>
  );
};
