import * as React from "react";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

export default function ChaptersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Chapter Reviews"
        description="Sequential Chapter 1 through 5 manuscript submissions and supervisor feedback."
      />

      <EmptyState
        icon={<BookOpen className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="No Chapters Submitted"
        description="Chapter submissions unlock sequentially once your project supervisor is assigned and topic approved."
        action={
          <Button size="sm" disabled>
            Submit Chapter 1 Draft
          </Button>
        }
      />
    </div>
  );
}
