import * as React from "react";
import { FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

export default function ProposalsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Topic Proposals"
        description="Draft, submit, and manage your project topic proposals and versioned revisions."
        action={
          <Button size="sm" className="gap-1.5" disabled>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>New Proposal</span>
          </Button>
        }
      />

      <EmptyState
        icon={<FileText className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="No Topic Proposals Submitted"
        description="Your team has not submitted a project topic proposal yet. Draft a title, problem statement, and keywords to begin."
        action={
          <Button size="sm" disabled>
            Draft Proposal
          </Button>
        }
      />
    </div>
  );
}
