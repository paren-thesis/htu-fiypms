import * as React from "react";
import { GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

export default function GradesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Grades & Results"
        description="Official published final marks, team composite scores, and academic appeal windows."
      />

      <EmptyState
        icon={<GraduationCap className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="Grades Not Yet Published"
        description="Final evaluation marks and defense composite scores will be published by the coordinator upon broadsheet approval."
        action={
          <Button size="sm" variant="outline" disabled>
            View Grading Policy
          </Button>
        }
      />
    </div>
  );
}
