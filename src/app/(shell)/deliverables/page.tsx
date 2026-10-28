"use client";

import * as React from "react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/common/PageHeader";
import { StudentDeliverablesView } from "@/components/deliverables/StudentDeliverablesView";
import { SupervisorDeliverablesView } from "@/components/deliverables/SupervisorDeliverablesView";
import { StaffDeliverablesOverview } from "@/components/deliverables/StaffDeliverablesOverview";
import { Skeleton } from "@/components/ui/skeleton";

export default function DeliverablesPage() {
  const { activeRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const isStudent = activeRole === "student";
  const isSupervisor = activeRole === "supervisor";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deliverables & Sign-off"
        description={
          isStudent
            ? "Submit and manage your final software source code repository, live application demo, and environment setup notes."
            : isSupervisor
            ? "Inspect source code repositories, verify deployment notes, and complete formal sign-off for your assigned project groups."
            : "Departmental overview of software repositories, live demonstration links, and formal supervisor approvals."
        }
      />

      {isStudent ? (
        <StudentDeliverablesView />
      ) : isSupervisor ? (
        <SupervisorDeliverablesView />
      ) : (
        <StaffDeliverablesOverview />
      )}
    </div>
  );
}
