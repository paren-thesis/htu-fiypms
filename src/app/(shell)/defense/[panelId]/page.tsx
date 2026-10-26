import * as React from "react";
import Link from "next/link";
import { ListChecks, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

export default async function DefensePanelPage({
  params,
}: {
  params: Promise<{ panelId: string }>;
}) {
  const { panelId } = await params;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Digital Marksheet — Panel ${panelId}`}
        description="Real-time synchronized scoring interface for defense examiners."
        action={
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link href="/defense">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Defense Overview</span>
            </Link>
          </Button>
        }
      />

      <EmptyState
        icon={<ListChecks className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="Digital Marksheet Loading"
        description={`Panel session ${panelId} is not currently active or rubrics are pending initialization.`}
        action={
          <Button size="sm" disabled>
            Start Scoring Session
          </Button>
        }
      />
    </div>
  );
}
