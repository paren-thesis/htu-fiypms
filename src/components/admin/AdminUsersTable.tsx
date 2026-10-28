"use client";

import * as React from "react";
import {
  Search,
  Shield,
  KeyRound,
  GraduationCap,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import {
  updateRoles,
  forceRevokeSession,
  changeStudentCourse,
  type SerializedAdminUser,
} from "@/app/actions/admin-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ALL_ROLES = [
  { id: "student", label: "Student" },
  { id: "supervisor", label: "Supervisor" },
  { id: "coordinator", label: "Coordinator" },
  { id: "panel_member", label: "Panel Member" },
  { id: "admin", label: "System Admin" },
] as const;

interface AdminUsersTableProps {
  users: SerializedAdminUser[];
  courses: Array<{ id: string; code: string; name: string }>;
  getToken: () => Promise<string | null>;
  onMutated: () => void;
}

export function AdminUsersTable({
  users,
  courses,
  getToken,
  onMutated,
}: AdminUsersTableProps) {
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<string>("all");

  // Edit Roles Dialog State
  const [editingUser, setEditingUser] =
    React.useState<SerializedAdminUser | null>(null);
  const [selectedRoles, setSelectedRoles] = React.useState<string[]>([]);
  const [savingRoles, setSavingRoles] = React.useState(false);

  // Change Course Dialog State
  const [courseUser, setCourseUser] =
    React.useState<SerializedAdminUser | null>(null);
  const [newCourseId, setNewCourseId] = React.useState<string>("");
  const [courseJustification, setCourseJustification] =
    React.useState<string>("");
  const [savingCourse, setSavingCourse] = React.useState(false);

  // Revoke Session Dialog State
  const [revokeUser, setRevokeUser] =
    React.useState<SerializedAdminUser | null>(null);
  const [revokeReason, setRevokeReason] = React.useState<string>("");
  const [revokingSession, setRevokingSession] = React.useState(false);

  const filteredUsers = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    return users.filter((u) => {
      if (roleFilter !== "all" && !u.roles.includes(roleFilter)) {
        return false;
      }
      if (!q) return true;
      const hay =
        `${u.name} ${u.email} ${u.uid} ${u.index_number || ""} ${u.course_id || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, search, roleFilter]);

  const openEditRoles = (u: SerializedAdminUser) => {
    setEditingUser(u);
    setSelectedRoles([...u.roles]);
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoles((prev) =>
      prev.includes(roleId)
        ? prev.filter((r) => r !== roleId)
        : [...prev, roleId]
    );
  };

  const handleSaveRoles = async () => {
    if (!editingUser || selectedRoles.length === 0) {
      toast.error("Select at least one role.");
      return;
    }

    setSavingRoles(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error("Authentication required.");
        return;
      }

      const res = await updateRoles(token, {
        uid: editingUser.uid,
        roles: selectedRoles,
      });

      if (!res.ok) {
        toast.error(res.error || "Failed to update roles.");
        return;
      }

      toast.success(`Updated roles for ${editingUser.name}.`);
      setEditingUser(null);
      onMutated();
    } finally {
      setSavingRoles(false);
    }
  };

  const openCourseModal = (u: SerializedAdminUser) => {
    setCourseUser(u);
    setNewCourseId(u.course_id || courses[0]?.id || "btech-cs");
    setCourseJustification("");
  };

  const handleSaveCourse = async () => {
    if (!courseUser) return;
    if (courseJustification.trim().length < 10) {
      toast.error("Justification must be at least 10 characters.");
      return;
    }

    setSavingCourse(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error("Authentication required.");
        return;
      }

      const res = await changeStudentCourse(token, {
        uid: courseUser.uid,
        new_course_id: newCourseId,
        justification: courseJustification.trim(),
      });

      if (!res.ok) {
        toast.error(res.error || "Failed to change student course.");
        return;
      }

      toast.success(
        `Updated course track for ${courseUser.name} to ${newCourseId.toUpperCase()}.`
      );
      setCourseUser(null);
      onMutated();
    } finally {
      setSavingCourse(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokeUser) return;
    setRevokingSession(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error("Authentication required.");
        return;
      }

      const res = await forceRevokeSession(token, {
        uid: revokeUser.uid,
        reason: revokeReason.trim() || undefined,
      });

      if (!res.ok) {
        toast.error(res.error || "Failed to revoke user session.");
        return;
      }

      toast.success(`Force revoked active sessions for ${revokeUser.email}.`);
      setRevokeUser(null);
      setRevokeReason("");
      onMutated();
    } finally {
      setRevokingSession(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, index number, or UID..."
            aria-label="Filter users"
            className="pl-10 min-h-[44px]"
          />
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="admin-role-filter" className="text-xs text-muted-foreground">
            Role:
          </Label>
          <select
            id="admin-role-filter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="min-h-[44px] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All Roles ({users.length})</option>
            {ALL_ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Identifier / Track</TableHead>
                <TableHead>Assigned Roles</TableHead>
                <TableHead>Active Team</TableHead>
                <TableHead className="text-right">Admin Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-28 text-center text-sm text-muted-foreground"
                  >
                    No users match the current filter.
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((u) => {
                  const isStudent = u.roles.includes("student");
                  return (
                    <TableRow key={u.uid}>
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {u.name}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {u.email}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {u.index_number ? (
                          <span className="font-mono tabular-nums font-medium text-foreground">
                            {u.index_number}
                          </span>
                        ) : u.staff_id ? (
                          <span className="font-mono text-foreground">
                            {u.staff_id}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {u.course_id && (
                          <div className="mt-0.5">
                            <Badge variant="outline" className="text-[10px] uppercase">
                              {u.course_id}
                            </Badge>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <Badge
                              key={r}
                              variant={r === u.active_role ? "default" : "secondary"}
                              className="text-[11px] capitalize"
                            >
                              {r.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono tabular-nums">
                        {u.active_team_group ? (
                          <Badge variant="secondary">{u.active_team_group}</Badge>
                        ) : (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openEditRoles(u)}
                            className="gap-1.5 text-xs min-h-[44px] sm:min-h-[36px]"
                          >
                            <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Roles</span>
                          </Button>

                          {isStudent && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openCourseModal(u)}
                              className="gap-1.5 text-xs min-h-[44px] sm:min-h-[36px]"
                            >
                              <GraduationCap
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              <span>Course</span>
                            </Button>
                          )}

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRevokeUser(u);
                              setRevokeReason("");
                            }}
                            className="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 min-h-[44px] sm:min-h-[36px]"
                          >
                            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Revoke</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Edit Roles Dialog */}
      <Dialog
        open={Boolean(editingUser)}
        onOpenChange={(open) => !open && setEditingUser(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update System Roles</DialogTitle>
            <DialogDescription>
              Synchronizes role permissions across Firestore user profile, staff
              whitelist, and Firebase Auth custom claims for{" "}
              <strong>{editingUser?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            {ALL_ROLES.map((r) => {
              const checked = selectedRoles.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggleRole(r.id)}
                  className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors min-h-[44px] ${
                    checked
                      ? "border-primary bg-primary/5 font-semibold text-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>{r.label}</span>
                  {checked && (
                    <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingUser(null)}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveRoles}
              disabled={savingRoles || selectedRoles.length === 0}
              className="min-h-[44px]"
            >
              {savingRoles ? "Saving..." : "Save Roles"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Student Course Dialog */}
      <Dialog
        open={Boolean(courseUser)}
        onOpenChange={(open) => !open && setCourseUser(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Student Course Track</DialogTitle>
            <DialogDescription>
              Re-allocates <strong>{courseUser?.name}</strong> (
              {courseUser?.index_number}) across both the user profile and cohort
              roster. Student must not belong to an active team.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {courseUser?.active_team_group && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                This student currently belongs to active team{" "}
                <strong>{courseUser.active_team_group}</strong>. Transfer or
                disband their team before changing their course track.
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="admin-new-course">New Programme Track</Label>
              <select
                id="admin-new-course"
                value={newCourseId}
                onChange={(e) => setNewCourseId(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-course-justification">
                Written Justification (min 10 chars)
              </Label>
              <Textarea
                id="admin-course-justification"
                value={courseJustification}
                onChange={(e) => setCourseJustification(e.target.value)}
                placeholder="State official registrar approval or programme transfer reference..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCourseUser(null)}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveCourse}
              disabled={savingCourse || courseJustification.trim().length < 10}
              className="min-h-[44px]"
            >
              {savingCourse ? "Updating..." : "Confirm Course Change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force Revoke Session Dialog */}
      <Dialog
        open={Boolean(revokeUser)}
        onOpenChange={(open) => !open && setRevokeUser(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Force Revoke Active Sessions</DialogTitle>
            <DialogDescription>
              Revokes all Firebase Auth refresh tokens for{" "}
              <strong>{revokeUser?.email}</strong> and records an immutable audit
              event.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="admin-revoke-reason">Reason (optional)</Label>
            <Input
              id="admin-revoke-reason"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="e.g. Security precaution or role re-assignment"
              className="min-h-[44px]"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevokeUser(null)}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmRevoke}
              disabled={revokingSession}
              className="min-h-[44px]"
            >
              {revokingSession ? "Revoking..." : "Revoke Refresh Tokens"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

