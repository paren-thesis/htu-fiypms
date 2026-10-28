"use client";

import * as React from "react";
import {
  ArrowLeftRight,
  Ban,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import type {
  SerializedAdminTeam,
  SerializedAdminUser,
} from "@/app/actions/admin-users";
import {
  changeMaxMembers,
  transferMember,
  disbandTeam,
} from "@/app/actions/admin-team-override";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

interface AdminTeamOverridesTabProps {
  teams: SerializedAdminTeam[];
  users: SerializedAdminUser[];
  getToken: () => Promise<string | null>;
  onMutated: () => void;
}

export function AdminTeamOverridesTab({
  teams,
  users,
  getToken,
  onMutated,
}: AdminTeamOverridesTabProps) {
  // Max Members Dialog State
  const [maxTeam, setMaxTeam] = React.useState<SerializedAdminTeam | null>(null);
  const [newMax, setNewMax] = React.useState<number>(5);
  const [maxReason, setMaxReason] = React.useState<string>("");
  const [savingMax, setSavingMax] = React.useState(false);

  // Transfer Member Dialog State
  const [transferSourceTeam, setTransferSourceTeam] =
    React.useState<SerializedAdminTeam | null>(null);
  const [selectedStudentUid, setSelectedStudentUid] = React.useState<string>("");
  const [targetTeamId, setTargetTeamId] = React.useState<string>("");
  const [transferReason, setTransferReason] = React.useState<string>("");
  const [savingTransfer, setSavingTransfer] = React.useState(false);

  // Disband Team Dialog State
  const [disbandTarget, setDisbandTarget] =
    React.useState<SerializedAdminTeam | null>(null);
  const [disbandReason, setDisbandReason] = React.useState<string>("");
  const [savingDisband, setSavingDisband] = React.useState(false);

  const userByUid = React.useMemo(() => {
    const map = new Map<string, SerializedAdminUser>();
    for (const u of users) map.set(u.uid, u);
    return map;
  }, [users]);

  const sameCourseTargetTeams = React.useMemo(() => {
    if (!transferSourceTeam) return [];
    return teams.filter(
      (t) =>
        t.id !== transferSourceTeam.id &&
        t.status !== "disbanded" &&
        t.course_id.toLowerCase() === transferSourceTeam.course_id.toLowerCase()
    );
  }, [teams, transferSourceTeam]);

  const openMaxDialog = (team: SerializedAdminTeam) => {
    setMaxTeam(team);
    setNewMax(team.max_members);
    setMaxReason("");
  };

  const handleSaveMax = async () => {
    if (!maxTeam) return;
    setSavingMax(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error("Authentication required.");
        return;
      }

      const res = await changeMaxMembers(token, {
        team_id: maxTeam.id,
        max_members: Number(newMax),
        reason: maxReason.trim() || undefined,
      });

      if (!res.ok) {
        toast.error(res.error || "Failed to update max_members.");
        return;
      }

      toast.success(
        `Updated max members for ${maxTeam.group_number} to ${newMax}.`
      );
      setMaxTeam(null);
      onMutated();
    } finally {
      setSavingMax(false);
    }
  };

  const openTransferDialog = (team: SerializedAdminTeam) => {
    setTransferSourceTeam(team);
    setSelectedStudentUid(team.member_ids[0] || "");
    const candidates = teams.filter(
      (t) =>
        t.id !== team.id &&
        t.status !== "disbanded" &&
        t.course_id.toLowerCase() === team.course_id.toLowerCase()
    );
    setTargetTeamId(candidates[0]?.id || "");
    setTransferReason("");
  };

  const handleSaveTransfer = async () => {
    if (!transferSourceTeam || !selectedStudentUid || !targetTeamId) {
      toast.error("Select both a member and a destination team.");
      return;
    }

    setSavingTransfer(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error("Authentication required.");
        return;
      }

      const res = await transferMember(token, {
        student_uid: selectedStudentUid,
        from_team_id: transferSourceTeam.id,
        to_team_id: targetTeamId,
        reason: transferReason.trim() || undefined,
      });

      if (!res.ok) {
        toast.error(res.error || "Failed to transfer team member.");
        return;
      }

      toast.success("Transferred student between teams.");
      setTransferSourceTeam(null);
      onMutated();
    } finally {
      setSavingTransfer(false);
    }
  };

  const handleConfirmDisband = async () => {
    if (!disbandTarget) return;
    setSavingDisband(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error("Authentication required.");
        return;
      }

      const res = await disbandTeam(token, {
        team_id: disbandTarget.id,
        reason: disbandReason.trim() || undefined,
      });

      if (!res.ok) {
        toast.error(res.error || "Failed to disband team.");
        return;
      }

      toast.success(
        `Disbanded ${disbandTarget.group_number} and notified ${res.freed_members?.length ?? 0} member(s).`
      );
      setDisbandTarget(null);
      setDisbandReason("");
      onMutated();
    } finally {
      setSavingDisband(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Group</TableHead>
                <TableHead>Team Name</TableHead>
                <TableHead>Track / Year</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead className="text-right">Team Overrides</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-28 text-center text-sm text-muted-foreground"
                  >
                    No project teams found.
                  </TableCell>
                </TableRow>
              ) : (
                teams.map((team) => {
                  const isDisbanded = team.status === "disbanded";
                  return (
                    <TableRow key={team.id}>
                      <TableCell className="font-mono font-semibold text-foreground tabular-nums">
                        {team.group_number}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {team.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {team.member_ids
                            .map((uid) => userByUid.get(uid)?.name || uid)
                            .join(", ") || "No active members"}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="uppercase">
                          {team.course_id}
                        </Badge>
                        <div className="text-muted-foreground font-mono tabular-nums mt-0.5">
                          {team.academic_year_id}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge domain="team" value={team.status} />
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        <span className="font-semibold text-foreground">
                          {team.member_count}
                        </span>{" "}
                        / {team.max_members}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isDisbanded}
                            onClick={() => openMaxDialog(team)}
                            className="gap-1.5 text-xs min-h-[44px] sm:min-h-[36px]"
                          >
                            <Settings2
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            <span>Max Size</span>
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isDisbanded || team.member_ids.length === 0}
                            onClick={() => openTransferDialog(team)}
                            className="gap-1.5 text-xs min-h-[44px] sm:min-h-[36px]"
                          >
                            <ArrowLeftRight
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            <span>Transfer</span>
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isDisbanded}
                            onClick={() => {
                              setDisbandTarget(team);
                              setDisbandReason("");
                            }}
                            className="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 min-h-[44px] sm:min-h-[36px]"
                          >
                            <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Disband</span>
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

      {/* Change Max Members Dialog */}
      <Dialog
        open={Boolean(maxTeam)}
        onOpenChange={(open) => !open && setMaxTeam(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Override Team Max Members</DialogTitle>
            <DialogDescription>
              Adjust the maximum member limit for{" "}
              <strong>{maxTeam?.group_number}</strong> ({maxTeam?.name}). Current
              member count: {maxTeam?.member_count}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="override-max-input">Maximum Members</Label>
              <Input
                id="override-max-input"
                type="number"
                min={Math.max(1, maxTeam?.member_count ?? 1)}
                max={15}
                value={newMax}
                onChange={(e) => setNewMax(Number(e.target.value))}
                className="min-h-[44px] tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="override-max-reason">Reason (optional)</Label>
              <Input
                id="override-max-reason"
                value={maxReason}
                onChange={(e) => setMaxReason(e.target.value)}
                placeholder="e.g. Approved 6-member capstone accommodation"
                className="min-h-[44px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMaxTeam(null)}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveMax}
              disabled={savingMax}
              className="min-h-[44px]"
            >
              {savingMax ? "Saving..." : "Apply Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Member Dialog */}
      <Dialog
        open={Boolean(transferSourceTeam)}
        onOpenChange={(open) => !open && setTransferSourceTeam(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer Member Between Teams</DialogTitle>
            <DialogDescription>
              Transfers a member from{" "}
              <strong>{transferSourceTeam?.group_number}</strong> to another
              active team in the same course track (
              <span className="uppercase">{transferSourceTeam?.course_id}</span>
              ).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="transfer-member-select">Member to Transfer</Label>
              <select
                id="transfer-member-select"
                value={selectedStudentUid}
                onChange={(e) => setSelectedStudentUid(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                {transferSourceTeam?.member_ids.map((uid) => {
                  const u = userByUid.get(uid);
                  return (
                    <option key={uid} value={uid}>
                      {u ? `${u.name} (${u.index_number || u.email})` : uid}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="transfer-target-team">
                Destination Team (Same Course Track)
              </Label>
              <select
                id="transfer-target-team"
                value={targetTeamId}
                onChange={(e) => setTargetTeamId(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                {sameCourseTargetTeams.length === 0 ? (
                  <option value="">
                    No other active teams in {transferSourceTeam?.course_id}
                  </option>
                ) : (
                  sameCourseTargetTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.group_number} — {t.name} ({t.member_count}/
                      {t.max_members})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="transfer-reason">Reason (optional)</Label>
              <Input
                id="transfer-reason"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="e.g. Balancing team sizes within programme"
                className="min-h-[44px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTransferSourceTeam(null)}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveTransfer}
              disabled={savingTransfer || !targetTeamId || !selectedStudentUid}
              className="min-h-[44px]"
            >
              {savingTransfer ? "Transferring..." : "Transfer Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disband Team Dialog */}
      <Dialog
        open={Boolean(disbandTarget)}
        onOpenChange={(open) => !open && setDisbandTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Disband Project Team</DialogTitle>
            <DialogDescription>
              Marks <strong>{disbandTarget?.group_number}</strong> (
              {disbandTarget?.name}) as disbanded, revokes supervisor contact
              grants, frees all {disbandTarget?.member_count} member(s), and
              sends a notification to every member.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="disband-reason">Reason (optional)</Label>
            <Input
              id="disband-reason"
              value={disbandReason}
              onChange={(e) => setDisbandReason(e.target.value)}
              placeholder="e.g. Administrative restructuring of unassigned group"
              className="min-h-[44px]"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDisbandTarget(null)}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDisband}
              disabled={savingDisband}
              className="min-h-[44px]"
            >
              {savingDisband ? "Disbanding..." : "Confirm Disband Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
