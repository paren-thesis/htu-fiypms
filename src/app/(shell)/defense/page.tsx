import * as React from "react";
import { Calendar } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

export default function DefensePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Defense Panels"
        description="Oral presentation schedules, conflict detection, examiner panels, and digital marksheets."
      />

      <EmptyState
        icon={<Calendar className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="No Defense Sessions Scheduled"
        description="Defense panels and presentation time slots will be published by the coordinator upon manuscript sign-off."
        action={
          <Button size="sm" variant="outline" disabled>
            View Defense Guidelines
          </Button>
        }
      />
    </div>
  );
}
