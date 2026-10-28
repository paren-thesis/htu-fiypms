"use client";

import * as React from "react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/common/PageHeader";
import { StudentPeerEvaluationView } from "@/components/peer/StudentPeerEvaluationView";
import { StaffPeerSummaryView } from "@/components/peer/StaffPeerSummaryView";
import { Skeleton } from "@/components/ui/skeleton";

export default function PeerEvaluationPage() {
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Peer Evaluation"
        description={
          isStudent
            ? "Confidential 360° individual member contribution evaluations within your project group."
            : "Aggregated member contribution reviews and diagnostic free-rider identification for continuous assessment."
        }
      />

      {isStudent ? <StudentPeerEvaluationView /> : <StaffPeerSummaryView />}
    </div>
  );
}
