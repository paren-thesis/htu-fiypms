"use client";

import * as React from "react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/common/PageHeader";
import { StudentChaptersView } from "@/components/chapters/StudentChaptersView";
import { SupervisorChaptersView } from "@/components/chapters/SupervisorChaptersView";
import { CoordinatorChaptersView } from "@/components/chapters/CoordinatorChaptersView";
import { Skeleton } from "@/components/ui/skeleton";

export default function ChaptersPage() {
  const { activeRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  // 1. Coordinator and Admin View (Department-wide progress matrix)
  if (activeRole === "coordinator" || activeRole === "admin") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Chapter Progress Matrix"
          description="Department-wide manuscript progression across Chapters 1 through 5, approval milestones, and oral defense clearance."
        />
        <CoordinatorChaptersView />
      </div>
    );
  }

  // 2. Supervisor View (Review queue and assigned team milestones)
  if (activeRole === "supervisor") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Chapter Manuscript Reviews"
          description="Review team draft submissions, open shared cloud documents, and record line-item feedback."
        />
        <SupervisorChaptersView />
      </div>
    );
  }

  // 3. Student View (Sequential timeline, submissions, and feedback)
  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Chapters"
        description="Sequential Chapter 1 through 5 manuscript submissions, version history, and supervisor review feedback."
      />
      <StudentChaptersView />
    </div>
  );
}
