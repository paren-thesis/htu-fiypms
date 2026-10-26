import * as React from "react";
import { PackageCheck } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

export default function DeliverablesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Deliverables & Sign-off"
        description="Software code repositories, installation guides, deployment URLs, and supervisor final sign-off."
      />

      <EmptyState
        icon={<PackageCheck className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="No Deliverables Submitted"
        description="Upload your Git repository URL, live application demo link, and README documentation before seeking supervisor defense sign-off."
        action={
          <Button size="sm" disabled>
            Add Deliverable Links
          </Button>
        }
      />
    </div>
  );
}
