import type { D1Database } from '@cloudflare/workers-types';

export type FeedbackTicketStatus = 'pending' | 'confirmed' | 'in_progress' | 'launched' | 'closed';

export interface FeedbackTicketSummary {
  id: string;
  postId: string;
  feedbackQueueId: string;
  status: FeedbackTicketStatus;
  statusLabel: string;
  statusNote: string;
  updatedByAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommentTicketEvent {
  ticketId: string;
  fromStatus: FeedbackTicketStatus;
  toStatus: FeedbackTicketStatus;
  fromStatusLabel: string;
  toStatusLabel: string;
}

export const FEEDBACK_TICKET_STATUS_LABELS: Record<FeedbackTicketStatus, string> = {
  pending: '待处理',
  confirmed: '已确认',
  in_progress: '处理中',
  launched: '已上线',
  closed: '已关闭',
};

const VALID_STATUSES = new Set<string>(Object.keys(FEEDBACK_TICKET_STATUS_LABELS));

export function isValidFeedbackTicketStatus(value: unknown): value is FeedbackTicketStatus {
  return typeof value === 'string' && VALID_STATUSES.has(value);
}

export function getFeedbackTicketStatusLabel(status: string): string {
  if (isValidFeedbackTicketStatus(status)) {
    return FEEDBACK_TICKET_STATUS_LABELS[status];
  }
  return '待处理';
}

interface FeedbackTicketRow {
  id: string;
  post_id: string;
  feedback_queue_id: string;
  status: string;
  status_note: string;
  updated_by_admin: number;
  created_at: string;
  updated_at: string;
}

export function serializeFeedbackTicket(row: FeedbackTicketRow): FeedbackTicketSummary {
  const status: FeedbackTicketStatus = isValidFeedbackTicketStatus(row.status)
    ? row.status
    : 'pending';
  return {
    id: row.id,
    postId: row.post_id,
    feedbackQueueId: row.feedback_queue_id,
    status,
    statusLabel: getFeedbackTicketStatusLabel(status),
    statusNote: row.status_note ?? '',
    updatedByAdmin: Boolean(row.updated_by_admin),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Batch-load feedback tickets keyed by post_id.
 */
export async function fetchFeedbackTicketsForPostIds(
  db: D1Database,
  postIds: string[]
): Promise<Map<string, FeedbackTicketSummary>> {
  const map = new Map<string, FeedbackTicketSummary>();
  if (postIds.length === 0) return map;

  const uniqueIds = Array.from(new Set(postIds));
  const placeholders = uniqueIds.map(() => '?').join(', ');

  const rows = await db
    .prepare(
      `SELECT id, post_id, feedback_queue_id, status, status_note, updated_by_admin, created_at, updated_at
       FROM feedback_tickets
       WHERE post_id IN (${placeholders})`
    )
    .bind(...uniqueIds)
    .all<FeedbackTicketRow>();

  for (const row of rows.results ?? []) {
    map.set(row.post_id, serializeFeedbackTicket(row));
  }
  return map;
}

/**
 * Batch-load comment ticket status transition events keyed by comment_id.
 */
export async function fetchTicketEventsForCommentIds(
  db: D1Database,
  commentIds: string[]
): Promise<Map<string, CommentTicketEvent>> {
  const map = new Map<string, CommentTicketEvent>();
  if (commentIds.length === 0) return map;

  const uniqueIds = Array.from(new Set(commentIds));
  const placeholders = uniqueIds.map(() => '?').join(', ');

  const rows = await db
    .prepare(
      `SELECT comment_id, ticket_id, from_status, to_status
       FROM comment_ticket_events
       WHERE comment_id IN (${placeholders})`
    )
    .bind(...uniqueIds)
    .all<{
      comment_id: string;
      ticket_id: string;
      from_status: string;
      to_status: string;
    }>();

  for (const row of rows.results ?? []) {
    const fromStatus: FeedbackTicketStatus = isValidFeedbackTicketStatus(row.from_status)
      ? row.from_status
      : 'pending';
    const toStatus: FeedbackTicketStatus = isValidFeedbackTicketStatus(row.to_status)
      ? row.to_status
      : 'pending';
    map.set(row.comment_id, {
      ticketId: row.ticket_id,
      fromStatus,
      toStatus,
      fromStatusLabel: getFeedbackTicketStatusLabel(fromStatus),
      toStatusLabel: getFeedbackTicketStatusLabel(toStatus),
    });
  }
  return map;
}
