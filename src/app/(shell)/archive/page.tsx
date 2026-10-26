import * as React from "react";
import { Archive, Search } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

export default function ArchivePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Archive"
        description="Search past final year project abstracts, GitHub repositories, manuscripts, and domain keywords."
      />

      <EmptyState
        icon={<Archive className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="Project Archive Repository"
        description="Browse past cohort projects to inspect previous problem domains, literature reviews, and prevent topic duplication."
        action={
          <Button size="sm" variant="outline" disabled className="gap-1.5">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Search Past Projects</span>
          </Button>
        }
      />
    </div>
  );
}
