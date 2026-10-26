import * as React from "react";
import { ScrollText, Filter } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

export default function AuditLogsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Security Audit Logs"
        description="Immutable system audit trail tracking administrative actions, role claims, and score modifications."
        action={
          <Button size="sm" variant="outline" className="gap-1.5" disabled>
            <Filter className="h-4 w-4" aria-hidden="true" />
            <span>Filter Logs</span>
          </Button>
        }
      />

      <EmptyState
        icon={<ScrollText className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="No Audit Records to Display"
        description="System events, roster imports, and grade publication logs will be recorded in the audit collection."
      />
    </div>
  );
}
