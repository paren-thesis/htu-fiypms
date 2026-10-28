"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  FileText,
  BookOpen,
  Calendar,
  Award,
  UserCheck,
  Users,
  ArrowRight,
} from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { formatRelativeTime } from "@/lib/notifications/format";
import type { NotificationDocument, NotificationType } from "@/types/firestore";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

export function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case "topic_status":
      return <FileText className="h-4 w-4 text-primary" aria-hidden="true" />;
    case "chapter_review":
      return <BookOpen className="h-4 w-4 text-blue-600" aria-hidden="true" />;
    case "defense_schedule":
      return <Calendar className="h-4 w-4 text-amber-600" aria-hidden="true" />;
    case "grade_published":
      return <Award className="h-4 w-4 text-emerald-600" aria-hidden="true" />;
    case "supervision_assignment":
      return <UserCheck className="h-4 w-4 text-sky-600" aria-hidden="true" />;
    case "team_update":
    case "team_invite":
      return <Users className="h-4 w-4 text-violet-600" aria-hidden="true" />;
    case "system":
    default:
      return <Bell className="h-4 w-4 text-primary" aria-hidden="true" />;
  }
}

export function NotificationBell() {
  const router = useRouter();
  const { items, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = React.useState(false);

  // Take latest 5 notifications for the topbar dropdown
  const latestFive = React.useMemo(() => items.slice(0, 5), [items]);

  const handleItemClick = async (notif: NotificationDocument) => {
    setOpen(false);
    if (!notif.is_read) {
      await markRead(notif.id);
    }
    if (notif.target_url) {
      router.push(notif.target_url);
    } else {
      router.push("/notifications");
    }
  };

  const handleMarkAllRead = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await markAllRead();
  };

  const badgeText = unreadCount > 99 ? "99+" : unreadCount.toString();

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Notifications (${unreadCount} unread)`}
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground tabular shadow-sm"
              aria-hidden="true"
            >
              {badgeText}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 sm:w-96 p-0 shadow-lg border-border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/30">
          <div className="flex items-center gap-2">
            <DropdownMenuLabel className="p-0 font-semibold text-sm text-foreground">
              Notifications
            </DropdownMenuLabel>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors focus:outline-none focus-visible:underline"
            >
              <CheckCheck className="h-3 w-3" aria-hidden="true" />
              Mark all read
            </button>
          )}
        </div>

        {/* List of latest 5 items */}
        <div className="max-h-[380px] overflow-y-auto divide-y divide-border/50">
          {loading ? (
            <div className="space-y-3 p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            </div>
          ) : latestFive.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center justify-center space-y-2">
              <div className="rounded-full bg-muted p-2.5 text-muted-foreground">
                <Bell className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-xs font-medium text-foreground">No notifications yet</p>
              <p className="text-[11px] text-muted-foreground">
                You will be notified of reviews, defenses, and milestones here.
              </p>
            </div>
          ) : (
            latestFive.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => handleItemClick(item)}
                className={`flex items-start gap-3 p-3.5 cursor-pointer transition-colors focus:bg-muted/70 ${
                  !item.is_read ? "bg-primary/[0.04]" : "hover:bg-muted/40"
                }`}
              >
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/80">
                  {getNotificationIcon(item.type)}
                </div>
                <div className="flex-1 space-y-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`text-xs leading-snug truncate ${
                        !item.is_read ? "font-semibold text-foreground" : "font-medium text-foreground/80"
                      }`}
                    >
                      {item.title}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0 tabular">
                      {formatRelativeTime(item.created_at)}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {item.body}
                  </p>
                </div>
                {!item.is_read && (
                  <span
                    className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0"
                    aria-hidden="true"
                  />
                )}
              </DropdownMenuItem>
            ))
          )}
        </div>

        <DropdownMenuSeparator className="m-0" />

        {/* Footer */}
        <div className="p-2 bg-muted/20">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="w-full justify-center text-xs font-medium text-primary hover:text-primary hover:bg-primary/5 h-8"
            onClick={() => setOpen(false)}
          >
            <Link href="/notifications" className="flex items-center gap-1.5">
              <span>View all notifications</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
