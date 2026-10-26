import * as React from "react";
import { ListChecks, Plus } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

export default function RubricsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Rubric Builder"
        description="Configure evaluation criteria, scoring domains, and percentage weightings for defenses."
        action={
          <Button size="sm" className="gap-1.5" disabled>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Create Rubric</span>
          </Button>
        }
      />

      <EmptyState
        icon={<ListChecks className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="No Defense Rubrics Found"
        description="Define standardized scoring rubrics for project defenses, proposal presentations, and final viva."
        action={
          <Button size="sm" disabled>
            Add New Criteria
          </Button>
        }
      />
    </div>
  );
}
