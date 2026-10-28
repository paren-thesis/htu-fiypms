"use client";

import * as React from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { newUnread } from "@/lib/notifications/diff";
import type { NotificationDocument } from "@/types/firestore";

// Track toasted notification IDs globally across component renders and remounts
const toastedNotificationIds = new Set<string>();

export interface UseNotificationsReturn {
  items: NotificationDocument[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/**
 * Real-time notification hook with Firestore onSnapshot subscription.
 * Subscribes to user's notifications ordered by created_at desc (limit 50).
 * Emits sonner toasts strictly for newly arriving unread items (skipping initial snapshot).
 * Automatically cleans up on unmount and when the user signs out.
 */
export function useNotifications(): UseNotificationsReturn {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const router = useRouter();

  const [state, setState] = React.useState<{
    uid: string | null;
    items: NotificationDocument[];
  }>({ uid: null, items: [] });

  const isFirstSnapshot = React.useRef<boolean>(true);
  const prevItemsRef = React.useRef<NotificationDocument[]>([]);

  const items = React.useMemo(
    () => (uid && state.uid === uid ? state.items : []),
    [uid, state]
  );

  const loading = Boolean(uid && state.uid !== uid);

  const unreadCount = React.useMemo(() => {
    return items.filter((item) => !item.is_read).length;
  }, [items]);

  const markRead = React.useCallback(async (id: string) => {
    try {
      const notifRef = doc(db, "notifications", id);
      await updateDoc(notifRef, { is_read: true });
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  }, []);

  const markAllRead = React.useCallback(async () => {
    const unread = items.filter((item) => !item.is_read);
    if (unread.length === 0) return;

    const BATCH_SIZE = 400; // Chunked batch, well below Firestore 500 limit
    try {
      for (let i = 0; i < unread.length; i += BATCH_SIZE) {
        const chunk = unread.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        for (const item of chunk) {
          const notifRef = doc(db, "notifications", item.id);
          batch.update(notifRef, { is_read: true });
        }
        await batch.commit();
      }
    } catch (err) {
      console.error("Failed to mark all notifications as read:", err);
    }
  }, [items]);

  const remove = React.useCallback(async (id: string) => {
    try {
      const notifRef = doc(db, "notifications", id);
      await deleteDoc(notifRef);
    } catch (err) {
      console.error("Failed to delete notification:", err);
    }
  }, []);

  React.useEffect(() => {
    isFirstSnapshot.current = true;
    prevItemsRef.current = [];

    if (!uid) {
      return;
    }

    const q = query(
      collection(db, "notifications"),
      where("user_id", "==", uid),
      orderBy("created_at", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextItems: NotificationDocument[] = snapshot.docs.map((docSnap) => ({
          ...(docSnap.data() as Omit<NotificationDocument, "id">),
          id: docSnap.id,
        }));

        if (isFirstSnapshot.current) {
          isFirstSnapshot.current = false;
          // Seed the initial unread IDs so they are not toasted
          for (const item of nextItems) {
            toastedNotificationIds.add(item.id);
          }
        } else {
          // Detect new arrivals after first snapshot
          const fresh = newUnread<NotificationDocument>(prevItemsRef.current, nextItems);
          for (const item of fresh) {
            if (!toastedNotificationIds.has(item.id)) {
              toastedNotificationIds.add(item.id);
              const targetUrl = item.target_url;
              toast(item.title, {
                description: item.body,
                action: targetUrl
                  ? {
                      label: "View",
                      onClick: () => {
                        void markRead(item.id);
                        router.push(targetUrl);
                      },
                    }
                  : undefined,
              });
            }
          }
        }

        prevItemsRef.current = nextItems;
        setState({ uid, items: nextItems });
      },
      (err) => {
        console.error("Error subscribing to notifications:", err);
        setState((prev) => ({
          uid,
          items: prev.uid === uid ? prev.items : [],
        }));
      }
    );

    return () => {
      unsubscribe();
    };
  }, [uid, router, markRead]);

  return {
    items,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    remove,
  };
}
