"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  ExternalLink,
  Inbox,
} from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import {
  getDateGroup,
  formatRelativeTime,
  toJsDate,
  type DateGroupKey,
} from "@/lib/notifications/format";
import { getNotificationIcon } from "@/components/navbar/NotificationBell";
import type { NotificationDocument } from "@/types/firestore";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const GROUP_ORDER: DateGroupKey[] = ["Today", "Yesterday", "This Week", "Older"];

export default function NotificationsPage() {
  const router = useRouter();
  const { items, unreadCount, loading, markRead, markAllRead, remove } = useNotifications();

  const [filter, setFilter] = React.useState<"all" | "unread">("all");
  const [isMarkingAll, setIsMarkingAll] = React.useState(false);
  const [processingIds, setProcessingIds] = React.useState<Set<string>>(new Set());

  // Filter items
  const filteredItems = React.useMemo(() => {
    if (filter === "unread") {
      return items.filter((item) => !item.is_read);
    }
    return items;
  }, [items, filter]);

  // Group filtered items by date
  const groupedItems = React.useMemo(() => {
    const groups: Record<DateGroupKey, NotificationDocument[]> = {
      Today: [],
      Yesterday: [],
      "This Week": [],
      Older: [],
    };

    for (const item of filteredItems) {
      const date = toJsDate(item.created_at);
      const groupKey = getDateGroup(date);
      groups[groupKey].push(item);
    }

    return groups;
  }, [filteredItems]);

  const handleMarkAll = async () => {
    if (unreadCount === 0 || isMarkingAll) return;
    setIsMarkingAll(true);
    try {
      await markAllRead();
    } finally {
      setIsMarkingAll(false);
    }
  };

  const handleItemClick = async (notif: NotificationDocument) => {
    if (!notif.is_read) {
      void markRead(notif.id);
    }
    if (notif.target_url) {
      router.push(notif.target_url);
    }
  };

  const handleSingleMarkRead = async (
    e: React.MouseEvent,
    id: string
  ) => {
    e.stopPropagation();
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      await markRead(id);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDelete = async (
    e: React.MouseEvent,
    id: string
  ) => {
    e.stopPropagation();
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      await remove(id);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Top Header */}
        <PageHeader
          title="Notifications"
          description="Real-time alerts, chapter review feedback, supervisor requests, and defense call-ups."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAll}
              disabled={unreadCount === 0 || isMarkingAll}
              className="gap-2 text-xs font-medium min-h-[44px] px-3 sm:min-h-[36px]"
            >
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              <span>{isMarkingAll ? "Marking..." : "Mark All as Read"}</span>
            </Button>
          }
        />

        {/* Filter Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-3">
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all min-h-[40px] sm:min-h-[32px] ${
                filter === "all"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>All</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] tabular ${
                  filter === "all"
                    ? "bg-primary/10 text-primary font-bold"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {items.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all min-h-[40px] sm:min-h-[32px] ${
                filter === "unread"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>Unread</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground tabular">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          <div className="text-xs text-muted-foreground">
            {unreadCount === 0 ? (
              <span className="text-emerald-600 font-medium">All caught up</span>
            ) : (
              <span>
                <strong className="text-foreground">{unreadCount}</strong> unread notification
                {unreadCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>

        {/* Notification Stream / Content */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 shadow-xs"
              >
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-6 w-6 text-primary" aria-hidden="true" />}
            title="No Notifications"
            description="You have no notifications yet. Project activities, chapter review feedback, and schedule call-ups will appear here in real time."
          />
        ) : filteredItems.length === 0 && filter === "unread" ? (
          <EmptyState
            icon={<Inbox className="h-6 w-6 text-emerald-600" aria-hidden="true" />}
            title="No Unread Notifications"
            description="You have reviewed all your notifications. Switch to 'All' to browse your earlier history."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilter("all")}
                className="min-h-[44px] px-4"
              >
                View All Notifications
              </Button>
            }
          />
        ) : (
          <div className="space-y-8">
            {GROUP_ORDER.map((groupKey) => {
              const groupList = groupedItems[groupKey];
              if (groupList.length === 0) return null;

              return (
                <section key={groupKey} aria-labelledby={`group-${groupKey}`} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h2
                      id={`group-${groupKey}`}
                      className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      {groupKey}
                    </h2>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground tabular">
                      {groupList.length}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {groupList.map((item) => {
                      const isProcessing = processingIds.has(item.id);
                      const isClickable = Boolean(item.target_url) || !item.is_read;

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleItemClick(item)}
                          className={`group relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 rounded-xl border p-4 transition-all ${
                            isClickable ? "cursor-pointer" : "cursor-default"
                          } ${
                            !item.is_read
                              ? "border-primary/40 bg-primary/[0.03] shadow-xs hover:border-primary/60 hover:bg-primary/[0.05]"
                              : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
                          }`}
                        >
                          {/* Unread Accent Bar */}
                          {!item.is_read && (
                            <span
                              className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-primary"
                              aria-hidden="true"
                            />
                          )}

                          {/* Left: Icon & Details */}
                          <div className="flex items-start gap-3.5 flex-1 min-w-0">
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/80 border border-border/50">
                              {getNotificationIcon(item.type)}
                            </div>

                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3
                                  className={`text-sm leading-snug ${
                                    !item.is_read
                                      ? "font-semibold text-foreground"
                                      : "font-medium text-foreground/90"
                                  }`}
                                >
                                  {item.title}
                                </h3>
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground capitalize">
                                  {item.type.replace(/_/g, " ")}
                                </span>
                              </div>

                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {item.body}
                              </p>

                              {item.target_url && (
                                <div className="pt-1">
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                                    <span>View details</span>
                                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Right: Timestamp and Action Buttons */}
                          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                            <span className="text-[11px] text-muted-foreground tabular mr-1">
                              {formatRelativeTime(item.created_at)}
                            </span>

                            {/* Mark as Read Action */}
                            {!item.is_read && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={isProcessing}
                                    onClick={(e) => handleSingleMarkRead(e, item.id)}
                                    aria-label="Mark notification as read"
                                    className="h-9 w-9 min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] text-muted-foreground hover:text-primary hover:bg-primary/10"
                                  >
                                    <Check className="h-4 w-4" aria-hidden="true" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Mark as read</TooltipContent>
                              </Tooltip>
                            )}

                            {/* Delete Action */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={isProcessing}
                                  onClick={(e) => handleDelete(e, item.id)}
                                  aria-label="Delete notification"
                                  className="h-9 w-9 min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
