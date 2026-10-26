import * as React from "react";
import { HeartHandshake } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

export default function PeerEvaluationPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Peer Evaluation"
        description="Confidential 360° individual member contribution evaluations within your project group."
      />

      <EmptyState
        icon={<HeartHandshake className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="Peer Evaluation Window Not Open"
        description="Peer assessments unlock following defense scheduling to calculate individual contribution factors."
        action={
          <Button size="sm" variant="outline" disabled>
            Review Peer Evaluation Criteria
          </Button>
        }
      />
    </div>
  );
}
