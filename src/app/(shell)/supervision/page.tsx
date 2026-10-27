"use client";

import * as React from "react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/common/PageHeader";
import { CoordinatorSupervisionView } from "@/components/supervision/CoordinatorSupervisionView";
import { SupervisorSupervisionView } from "@/components/supervision/SupervisorSupervisionView";
import { StudentSupervisionView } from "@/components/supervision/StudentSupervisionView";
import { Skeleton } from "@/components/ui/skeleton";

export default function SupervisionPage() {
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

  // 1. Coordinator and Admin View
  if (activeRole === "coordinator" || activeRole === "admin") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Supervision & Allocations"
          description="Supervisor candidate matching, faculty workload quotas, proposal dispatches, and manual overrides."
        />
        <CoordinatorSupervisionView />
      </div>
    );
  }

  // 2. Supervisor View
  if (activeRole === "supervisor") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Supervision Management"
          description="Manage assigned capstone teams, respond to allocation proposals, and track project chapter progression."
        />
        <SupervisorSupervisionView />
      </div>
    );
  }

  // 3. Student View (Default for student role)
  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Supervision"
        description="View your assigned project supervisor, consultation hours, office location, and authorized contact information."
      />
      <StudentSupervisionView />
    </div>
  );
}
