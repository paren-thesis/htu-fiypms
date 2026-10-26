"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { type UserRole } from "@/config/nav";
import { switchRole } from "@/app/actions/switch-role";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const ROLE_LABELS: Record<UserRole, { label: string; description: string }> = {
  student: { label: "Student", description: "Team member view" },
  supervisor: { label: "Supervisor", description: "Project supervisor view" },
  coordinator: { label: "Coordinator", description: "Department coordinator view" },
  panel_member: { label: "Panel Member", description: "Defense examiner view" },
  admin: { label: "Administrator", description: "System administrator view" },
};

export function RoleSwitcherDropdown() {
  const router = useRouter();
  const { user, activeRole, setActiveRole, availableRoles, refreshToken } = useAuth();
  const [isSwitching, setIsSwitching] = React.useState(false);

  // Spec FR-01.3: Hide the dropdown when the user has one role or is unauthenticated
  if (!user || availableRoles.length <= 1) {
    return null;
  }

  const currentRoleInfo = ROLE_LABELS[activeRole] ?? {
    label: activeRole,
    description: "",
  };

  const handleRoleSelect = async (newRole: UserRole) => {
    if (newRole === activeRole || isSwitching) return;
    if (!user) return;

    setIsSwitching(true);
    try {
      const idToken = await user.getIdToken();
      await switchRole({ idToken, role: newRole });

      // Obtain fresh token with updated activeRole custom claim
      const freshToken = await user.getIdToken(true);

      // Re-sync Edge session cookie
      await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: freshToken }),
      });

      // Update AuthContext state
      await refreshToken();
      setActiveRole(newRole);

      toast.success(`Switched role to ${ROLE_LABELS[newRole]?.label || newRole}`);

      // Refresh server components and navigate to dashboard
      router.refresh();
      router.push("/");
    } catch (err) {
      console.error("Failed to switch role:", err);
      toast.error("Failed to switch role. Please try again.");
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isSwitching}
          className="h-8 gap-1.5 border-border bg-card px-2.5 text-xs font-medium shadow-none hover:bg-muted"
          aria-label="Switch active role"
        >
          {isSwitching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
          ) : (
            <Shield className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          )}
          <span className="hidden sm:inline text-muted-foreground">Role:</span>
          <Badge
            variant="secondary"
            className="rounded px-1.5 py-0 text-[11px] font-semibold tracking-wide bg-accent text-accent-foreground border-none"
          >
            {currentRoleInfo.label}
          </Badge>
          <ChevronDown className="h-3 w-3 text-muted-foreground opacity-70" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-1">
        <DropdownMenuLabel className="px-2 py-1.5 text-xs text-muted-foreground">
          Switch Active Role
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableRoles.map((role) => {
          const isSelected = role === activeRole;
          const info = ROLE_LABELS[role] ?? { label: role, description: "" };
          return (
            <DropdownMenuItem
              key={role}
              disabled={isSwitching}
              onClick={() => handleRoleSelect(role)}
              className="flex items-center justify-between py-2 text-xs cursor-pointer"
            >
              <div className="flex flex-col">
                <span className={isSelected ? "font-semibold text-primary" : "font-medium"}>
                  {info.label}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {info.description}
                </span>
              </div>
              {isSelected && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
