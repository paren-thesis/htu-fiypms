import * as React from "react";
import { UserCog, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & Access Control"
        description="System user directory, role assignments, session revocations, and administrative overrides (Admin only)."
        action={
          <Button size="sm" variant="outline" className="gap-1.5" disabled>
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            <span>Emergency Overrides</span>
          </Button>
        }
      />

      <EmptyState
        icon={<UserCog className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="User Administration"
        description="Manage registered Firebase Auth users, view token claims, and update system role mappings."
        action={
          <Button size="sm" disabled>
            Query Users
          </Button>
        }
      />
    </div>
  );
}
