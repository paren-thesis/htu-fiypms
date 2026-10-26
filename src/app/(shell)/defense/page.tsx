"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Calendar, ListChecks, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

function DefenseContent() {
  const searchParams = useSearchParams();
  const isMarksheet = searchParams.get("tab") === "marksheet";

  if (isMarksheet) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Digital Marksheet"
          description="Live real-time digital marksheet scoring interface for defense examiners."
        />

        <EmptyState
          icon={<ListChecks className="h-6 w-6 text-primary" aria-hidden="true" />}
          title="Select a Defense Panel Session"
          description="Active defense sessions stream real-time rubrics and live examiner marks."
          action={
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/defense/panel-1">
                <span>Open Sample Marksheet</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Panels"
        description="Oral presentation schedules, conflict detection, examiner panels, and defense session overview."
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

export default function DefensePage() {
  return (
    <React.Suspense
      fallback={
        <div className="space-y-6">
          <PageHeader
            title="Defense Panels"
            description="Oral presentation schedules, examiner panels, and digital marksheets."
          />
        </div>
      }
    >
      <DefenseContent />
    </React.Suspense>
  );
}
