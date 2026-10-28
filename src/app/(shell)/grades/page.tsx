"use client";

import * as React from "react";
import { useAuth } from "@/context/AuthContext";
import { StudentGradesView, CoordinatorGradesView } from "@/components/grades";
import { PageHeader } from "@/components/common/PageHeader";

export default function GradesPage() {
  const { activeRole, availableRoles } = useAuth();

  const isCoordinatorOrAdmin =
    activeRole === "coordinator" ||
    activeRole === "admin" ||
    (availableRoles || []).includes("coordinator") ||
    (availableRoles || []).includes("admin");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Official Capstone Grades & Marksheets"
        description="Review officially approved and published final project grades, defense component scores, and 7-day academic appeal windows."
      />

      {isCoordinatorOrAdmin && activeRole !== "student" ? (
        <CoordinatorGradesView />
      ) : (
        <StudentGradesView />
      )}
    </div>
  );
}
