export interface NotificationLike {
  id: string;
  is_read: boolean;
}

/**
 * Returns notifications in `next` that are unread and were not present in `prev`.
 * Used to detect newly arrived unread notifications across Firestore snapshot updates
 * so sonner toasts fire strictly for new arrivals.
 *
 * @param prev Previous list of notifications
 * @param next Next list of notifications from Firestore snapshot
 * @returns Array of items in `next` that are unread and whose id was not in `prev`
 */
export function newUnread<T extends NotificationLike>(
  prev: readonly T[] | T[] | undefined | null,
  next: readonly T[] | T[] | undefined | null
): T[] {
  if (!next || next.length === 0) {
    return [];
  }

  const prevIds = new Set((prev || []).map((item) => item.id));

  return next.filter((item) => !item.is_read && !prevIds.has(item.id));
}
