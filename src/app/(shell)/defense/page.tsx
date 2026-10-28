"use client";

import * as React from "react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/common/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CoordinatorDefenseView,
  StaffDefenseView,
  StudentDefenseView,
} from "@/components/defense";

function DefenseContent() {
  const { activeRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  // 1. Coordinator and Admin View
  if (activeRole === "coordinator" || activeRole === "admin") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Defense Scheduling & Panels"
          description="Schedule oral presentation events, assign examining panels, detect double-booking conflicts, and publish official schedules."
        />
        <CoordinatorDefenseView />
      </div>
    );
  }

  // 2. Staff: Panel Member and Project Supervisor View
  if (activeRole === "panel_member" || activeRole === "supervisor") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="My Defense Panels"
          description="Oral presentation sessions, examining panel duties, candidate deliverables, and real-time digital marksheet scoring."
        />
        <StaffDefenseView />
      </div>
    );
  }

  // 3. Student View
  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Defense Session"
        description="Official schedule, presentation time slot, examining panel details, and examination venue."
      />
      <StudentDefenseView />
    </div>
  );
}

export default function DefensePage() {
  return (
    <React.Suspense
      fallback={
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      }
    >
      <DefenseContent />
    </React.Suspense>
  );
}
