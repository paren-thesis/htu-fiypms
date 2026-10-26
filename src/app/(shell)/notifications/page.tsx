import * as React from "react";
import { Bell } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Real-time alerts, chapter review feedback, supervisor requests, and defense call-ups."
      />

      <EmptyState
        icon={<Bell className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="No Unread Notifications"
        description="You're all caught up. Any project activity, review transitions, or schedule updates will appear here."
        action={
          <Button size="sm" variant="outline" disabled>
            Mark All as Read
          </Button>
        }
      />
    </div>
  );
}
