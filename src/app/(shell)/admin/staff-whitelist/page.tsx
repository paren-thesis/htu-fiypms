import * as React from "react";
import { ShieldCheck, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

export default function StaffWhitelistPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Whitelist"
        description="Faculty onboarding authorization, departmental role assignments, and programme scope (Coordinator & Admin only)."
        action={
          <Button size="sm" className="gap-1.5" disabled>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            <span>Add Staff Member</span>
          </Button>
        }
      />

      <EmptyState
        icon={<ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="No Whitelisted Staff Added"
        description="Authorize faculty members with their @htu.edu.gh email to grant supervisor, coordinator, or panel member access."
        action={
          <Button size="sm" disabled>
            Authorize Faculty
          </Button>
        }
      />
    </div>
  );
}
