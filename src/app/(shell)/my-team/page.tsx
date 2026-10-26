import * as React from "react";
import { Users, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

export default function MyTeamPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="My Team"
        description="Team formation, group members, invite codes, and project category."
        action={
          <Button size="sm" className="gap-1.5" disabled>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            <span>Create Team</span>
          </Button>
        }
      />

      <EmptyState
        icon={<Users className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="No Team Formed Yet"
        description="Create a project team or join an existing group with your teammate's invite code."
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button size="sm" variant="default" disabled>
              Create New Group
            </Button>
            <Button size="sm" variant="outline" disabled>
              Enter Invite Code
            </Button>
          </div>
        }
      />
    </div>
  );
}
