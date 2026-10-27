"use client";

import * as React from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { ListChecks, Plus, Sparkles, Scale } from "lucide-react";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { LockedCard } from "@/components/common/LockedCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RubricBuilderSheet } from "@/components/rubrics/RubricBuilderSheet";
import { RubricCard } from "@/components/rubrics/RubricCard";
import type { RubricDocument } from "@/types/firestore";

export default function RubricsPage() {
  const { activeRole } = useAuth();

  // Role Gate check: Coordinator or Admin only (Spec §2, D-05)
  const isAuthorized = activeRole === "coordinator" || activeRole === "admin";

  const [rubrics, setRubrics] = React.useState<RubricDocument[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Sheet state
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [editingRubric, setEditingRubric] = React.useState<RubricDocument | null>(null);

  // Real-time Firestore subscription to rubrics collection
  React.useEffect(() => {
    if (!isAuthorized) return;

    const q = query(collection(db, "rubrics"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as RubricDocument)
        );

        // Filter out archived and sort: active first, then created_at desc
        const visible = docs.filter((r) => !r.is_archived);
        visible.sort((a, b) => {
          if (a.is_active && !b.is_active) return -1;
          if (!a.is_active && b.is_active) return 1;
          const aTime = a.created_at?.toMillis ? a.created_at.toMillis() : 0;
          const bTime = b.created_at?.toMillis ? b.created_at.toMillis() : 0;
          return bTime - aTime;
        });

        setRubrics(visible);
        setLoading(false);
      },
      (error) => {
        console.error("Rubrics listener error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isAuthorized]);

  const handleOpenCreate = () => {
    setEditingRubric(null);
    setIsSheetOpen(true);
  };

  const handleOpenEdit = (rubric: RubricDocument) => {
    setEditingRubric(rubric);
    setIsSheetOpen(true);
  };

  if (!isAuthorized) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Rubric Builder"
          description="Configure evaluation criteria, scoring domains, and percentage weightings for defenses."
        />
        <LockedCard
          title="Coordinator & Admin Restricted Access"
          message="Rubric management and defense weighting configurations are reserved for Departmental Coordinators and System Administrators."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 pb-6 md:flex-row md:items-center md:justify-between border-b border-border">
          <div className="space-y-2">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const activeRubric = rubrics.find((r) => r.is_active);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rubric Builder"
        description="Configure evaluation criteria, scoring domains, and percentage weightings for defenses."
        action={
          <Button size="sm" className="gap-1.5" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Create Rubric</span>
          </Button>
        }
      />

      {/* Active Rubric Status Summary Card */}
      {activeRubric && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <Scale className="h-5 w-5 text-emerald-700" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                  Active Defense Rubric
                </span>
                <span className="text-xs text-emerald-600 font-mono">({activeRubric.id})</span>
              </div>
              <p className="text-sm font-bold text-emerald-950 mt-0.5">
                {activeRubric.title} — {activeRubric.max_score} pts total (Supervisor:{" "}
                {activeRubric.supervisor_weight_pct}%, Panel: {activeRubric.panel_weight_pct}%)
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleOpenEdit(activeRubric)}
            className="border-emerald-300 text-emerald-800 hover:bg-emerald-100 self-end sm:self-center"
          >
            Edit Active Rubric
          </Button>
        </div>
      )}

      {rubrics.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-6 w-6 text-primary" aria-hidden="true" />}
          title="No Defense Rubrics Found"
          description="Define standardized scoring rubrics for project defenses, proposal presentations, and final viva."
          action={
            <Button size="sm" onClick={handleOpenCreate} className="gap-1.5">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>Create First Rubric</span>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Configured Rubrics ({rubrics.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {rubrics.map((rubric) => (
              <RubricCard
                key={rubric.id}
                rubric={rubric}
                onEdit={handleOpenEdit}
              />
            ))}
          </div>
        </div>
      )}

      {/* Rubric Builder Sheet */}
      <RubricBuilderSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        editingRubric={editingRubric}
      />
    </div>
  );
}
