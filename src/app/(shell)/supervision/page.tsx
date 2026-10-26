import * as React from "react";
import { UserCheck } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

export default function SupervisionPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Supervision"
        description="Supervisor matching, student allocations, and consultation schedules."
      />

      <EmptyState
        icon={<UserCheck className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="Supervision Matching Pending"
        description="Supervisor allocations unlock after your project topic is formally approved by the department."
        action={
          <Button size="sm" variant="outline" disabled>
            View Available Supervisors
          </Button>
        }
      />
    </div>
  );
}
