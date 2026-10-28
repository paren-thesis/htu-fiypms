"use client";

import * as React from "react";
import {
  UserCog,
  Users,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  listAdminDirectory,
  type SerializedAdminUser,
  type SerializedAdminTeam,
} from "@/app/actions/admin-users";
import { AdminUsersTable, AdminTeamOverridesTab } from "@/components/admin";
import { PageHeader } from "@/components/common/PageHeader";
import { LockedCard } from "@/components/common/LockedCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DEFAULT_COURSES = [
  { id: "btech-cs", code: "BTECH-CS", name: "BTech Computer Science" },
  { id: "btech-ict", code: "BTECH-ICT", name: "BTech ICT" },
  { id: "hnd-cs", code: "HND-CS", name: "HND Computer Science" },
  { id: "hnd-ict", code: "HND-ICT", name: "HND ICT" },
];

export default function AdminUsersPage() {
  const { user, activeRole, availableRoles, loading: authLoading } = useAuth();

  const [users, setUsers] = React.useState<SerializedAdminUser[]>([]);
  const [teams, setTeams] = React.useState<SerializedAdminTeam[]>([]);
  const [courses, setCourses] =
    React.useState<Array<{ id: string; code: string; name: string }>>(
      DEFAULT_COURSES
    );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = React.useState(0);

  const isAdmin =
    activeRole === "admin" || (availableRoles || []).includes("admin");

  React.useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    async function load() {
      try {
        if (!user || !isAdmin) {
          if (!cancelled) {
            setLoading(false);
          }
          return;
        }

        const token = await user.getIdToken();
        if (cancelled) return;

        const res = await listAdminDirectory(token);
        if (cancelled) return;

        if (!res.ok) {
          setError(res.error || "Unable to load admin directory.");
          setLoading(false);
          return;
        }

        setError(null);
        setUsers(res.users ?? []);
        setTeams(res.teams ?? []);
        if (res.courses && res.courses.length > 0) {
          setCourses(res.courses);
        }
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unexpected error loading admin directory."
          );
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, isAdmin, reloadNonce]);

  const triggerReload = () => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  };

  const getToken = React.useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  if (!authLoading && !isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Users & Access Control"
          description="System user directory, role assignments, session revocations, and administrative team overrides (Admin only)."
        />
        <LockedCard
          title="System Administrator Access Only"
          message="Only users with an active System Administrator role can manage user role claims, student course tracks, and team overrides."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & Access Control"
        description="System user directory, role assignments, session revocations, and administrative team overrides (Admin only)."
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={triggerReload}
            disabled={loading}
            className="gap-1.5 min-h-[44px] px-3.5"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>Refresh Directory</span>
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Directory Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-11 w-64 rounded-lg" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      ) : (
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="min-h-[44px]">
            <TabsTrigger value="users" className="gap-2 min-h-[38px] px-4">
              <UserCog className="h-4 w-4" aria-hidden="true" />
              <span>Users & Roles ({users.length})</span>
            </TabsTrigger>
            <TabsTrigger value="teams" className="gap-2 min-h-[38px] px-4">
              <Users className="h-4 w-4" aria-hidden="true" />
              <span>Teams ({teams.length})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <AdminUsersTable
              users={users}
              courses={courses}
              getToken={getToken}
              onMutated={triggerReload}
            />
          </TabsContent>

          <TabsContent value="teams">
            <AdminTeamOverridesTab
              teams={teams}
              users={users}
              getToken={getToken}
              onMutated={triggerReload}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
