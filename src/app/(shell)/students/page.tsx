import * as React from "react";
import { GraduationCap, Upload } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

export default function StudentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Students & Roster Pool"
        description="Cohort roster management, student index validation, and unassigned student pooling (Coordinator & Admin only)."
        action={
          <Button size="sm" className="gap-1.5" disabled>
            <Upload className="h-4 w-4" aria-hidden="true" />
            <span>Import CSV Roster</span>
          </Button>
        }
      />

      <EmptyState
        icon={<GraduationCap className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="No Student Rosters Uploaded"
        description="Upload a CSV file containing index_number, full_name, and contact to seed the current cohort roster."
        action={
          <Button size="sm" disabled>
            Import Roster CSV
          </Button>
        }
      />
    </div>
  );
}
