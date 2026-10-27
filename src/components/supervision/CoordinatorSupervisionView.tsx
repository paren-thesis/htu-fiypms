"use client";

import * as React from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import {
  Search,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { db } from "@/lib/firebase/client";
import type { TeamDocument, SupervisionDocument, UserDocument, StaffWhitelistDocument } from "@/types/firestore";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FindMatchSheet, type SupervisorOption } from "./FindMatchSheet";
import { SupervisorWorkloadTable, type SupervisorWorkloadItem } from "./SupervisorWorkloadTable";

export function CoordinatorSupervisionView() {
  const [teams, setTeams] = React.useState<TeamDocument[]>([]);
  const [supervisions, setSupervisions] = React.useState<SupervisionDocument[]>([]);
  const [users, setUsers] = React.useState<UserDocument[]>([]);
  const [whitelist, setWhitelist] = React.useState<StaffWhitelistDocument[]>([]);

  const [loading, setLoading] = React.useState(true);
  const [listenerError, setListenerError] = React.useState<string | null>(null);

  // Match sheet state
  const [selectedTeam, setSelectedTeam] = React.useState<TeamDocument | null>(null);
  const [isMatchSheetOpen, setIsMatchSheetOpen] = React.useState(false);

  // Search filter for unassigned teams
  const [searchQuery, setSearchQuery] = React.useState("");

  const nowSeconds = React.useSyncExternalStore(
    (callback) => {
      const timer = setInterval(callback, 15000);
      return () => clearInterval(timer);
    },
    () => Math.floor(Date.now() / 1000),
    () => 0
  );

  // 1. Listen to active teams
  React.useEffect(() => {
    const teamsQuery = query(
      collection(db, "teams"),
      where("status", "!=", "disbanded")
    );

    const unsubscribe = onSnapshot(
      teamsQuery,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => d.data() as TeamDocument);
        setTeams(docs);
        setLoading(false);
      },
      (error) => {
        console.error("Firestore onSnapshot error on teams:", error);
        setListenerError("Failed to synchronize project teams.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // 2. Listen to supervisions
  React.useEffect(() => {
    const supervisionsCol = collection(db, "supervisions");

    const unsubscribe = onSnapshot(
      supervisionsCol,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => d.data() as SupervisionDocument);
        setSupervisions(docs);
      },
      (error) => {
        console.error("Firestore onSnapshot error on supervisions:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  // 3. Listen to supervisor users
  React.useEffect(() => {
    const usersQuery = query(
      collection(db, "users"),
      where("roles", "array-contains", "supervisor")
    );

    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => d.data() as UserDocument);
        setUsers(docs);
      },
      (error) => {
        console.error("Firestore onSnapshot error on users:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  // 4. Listen to staff whitelist
  React.useEffect(() => {
    const whitelistCol = collection(db, "staff_whitelist");

    const unsubscribe = onSnapshot(
      whitelistCol,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => d.data() as StaffWhitelistDocument);
        setWhitelist(docs);
      },
      (error) => {
        console.error("Firestore onSnapshot error on staff_whitelist:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Fast maps
  const teamsMap = React.useMemo(() => {
    const map: Record<string, TeamDocument> = {};
    for (const t of teams) {
      map[t.id] = t;
    }
    return map;
  }, [teams]);

  const usersMap = React.useMemo(() => {
    const map: Record<string, UserDocument> = {};
    for (const u of users) {
      map[u.uid] = u;
    }
    return map;
  }, [users]);

  // Combine supervisor data for workload & match sheet
  const workloadItems: SupervisorWorkloadItem[] = React.useMemo(() => {
    // Map whitelist by email or id
    const whitelistByEmail = new Map<string, StaffWhitelistDocument>();
    for (const w of whitelist) {
      whitelistByEmail.set(w.email.toLowerCase(), w);
    }

    const supervisionsByUid = new Map<string, SupervisionDocument>();
    for (const s of supervisions) {
      supervisionsByUid.set(s.supervisor_id, s);
    }

    // Merge active supervisors
    const items: SupervisorWorkloadItem[] = [];
    const seenUids = new Set<string>();

    for (const u of users) {
      seenUids.add(u.uid);
      const sup = supervisionsByUid.get(u.uid);
      const wl = whitelistByEmail.get(u.email.toLowerCase());

      const maxCap = sup?.max_capacity ?? u.profile?.max_team_capacity ?? 5;
      const curr = sup?.current_assigned_count ?? sup?.assigned_team_ids?.length ?? 0;
      const assignedIds = sup?.assigned_team_ids || [];

      items.push({
        uid: u.uid,
        name: u.name || u.email,
        email: u.email,
        current_assigned_count: curr,
        max_capacity: maxCap,
        assigned_team_ids: assignedIds,
        status: curr >= maxCap ? "at_capacity" : "available",
        programmes: wl?.programmes || [],
      });
    }

    return items;
  }, [users, supervisions, whitelist]);

  const allSupervisorsList: SupervisorOption[] = React.useMemo(() => {
    return workloadItems.map((w) => ({
      uid: w.uid,
      name: w.name,
      email: w.email,
      current_assigned_count: w.current_assigned_count,
      max_capacity: w.max_capacity,
      programmes: w.programmes,
    }));
  }, [workloadItems]);

  // Filter unassigned teams (teams without an accepted supervisor)
  const unassignedTeams = React.useMemo(() => {
    return teams.filter((t) => {
      if (!t.assigned_supervisor_id) return true;
      if (!t.supervisor_assignment) return true;
      return t.supervisor_assignment.status !== "accepted";
    });
  }, [teams]);

  // Filtered by search
  const filteredUnassignedTeams = React.useMemo(() => {
    if (!searchQuery.trim()) return unassignedTeams;
    const q = searchQuery.toLowerCase();
    return unassignedTeams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.group_number.toLowerCase().includes(q) ||
        t.course_id.toLowerCase().includes(q)
    );
  }, [unassignedTeams, searchQuery]);

  const handleOpenFindMatch = (team: TeamDocument) => {
    setSelectedTeam(team);
    setIsMatchSheetOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (listenerError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Synchronization Error</AlertTitle>
        <AlertDescription>{listenerError}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      {/* 1. Teams Without an Accepted Supervisor */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">
                Teams Pending Supervision
              </h2>
              <Badge variant="secondary" className="tabular-nums font-mono">
                {unassignedTeams.length}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Project teams requiring faculty supervisor matching and proposal dispatch.
            </p>
          </div>

          {unassignedTeams.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter by group or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-8 pr-3 text-xs rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
        </div>

        {unassignedTeams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-foreground">
              All Project Teams Supervised
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Every active student team currently has an accepted faculty supervisor.
            </p>
          </div>
        ) : filteredUnassignedTeams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
            <p className="text-xs text-muted-foreground">
              No unassigned teams matching &quot;{searchQuery}&quot;.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Group / Team</TableHead>
                  <TableHead className="w-[120px]">Programme</TableHead>
                  <TableHead className="w-[130px]">Team Status</TableHead>
                  <TableHead className="w-[220px]">Supervision Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUnassignedTeams.map((team) => {
                  const assignment = team.supervisor_assignment;
                  const assignedSup = team.assigned_supervisor_id
                    ? usersMap[team.assigned_supervisor_id]
                    : null;
                  const supName = assignedSup
                    ? assignedSup.name || assignedSup.email
                    : "Supervisor";

                  const isExpired =
                    assignment?.status === "proposed" &&
                    nowSeconds > 0 &&
                    assignment.window_expires_at?.seconds < nowSeconds;

                  return (
                    <TableRow key={team.id}>
                      {/* Group / Team */}
                      <TableCell>
                        <div>
                          <p className="font-semibold text-xs font-mono text-primary">
                            {team.group_number}
                          </p>
                          <p className="text-xs font-medium text-foreground">{team.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {team.member_count} / {team.max_members} members
                          </p>
                        </div>
                      </TableCell>

                      {/* Programme */}
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase font-mono px-2 py-0.5"
                        >
                          {team.course_id}
                        </Badge>
                      </TableCell>

                      {/* Team Lifecycle Status */}
                      <TableCell>
                        <StatusBadge domain="team" value={team.status} />
                      </TableCell>

                      {/* Supervision Assignment Status */}
                      <TableCell>
                        {!team.assigned_supervisor_id || !assignment ? (
                          <Badge
                            variant="outline"
                            className="text-xs text-muted-foreground border-dashed"
                          >
                            Not Assigned
                          </Badge>
                        ) : assignment.status === "proposed" && isExpired ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                              <Clock className="h-3.5 w-3.5" />
                              Proposal Expired
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {supName}
                            </span>
                          </div>
                        ) : assignment.status === "proposed" ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-info">
                              <Clock className="h-3.5 w-3.5" />
                              Proposed
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {supName}
                            </span>
                          </div>
                        ) : assignment.status === "declined" ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                              <XCircle className="h-3.5 w-3.5" />
                              Declined
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {supName}
                            </span>
                            {assignment.decline_reason && (
                              <span className="text-[10px] text-muted-foreground italic">
                                &quot;{assignment.decline_reason}&quot;
                              </span>
                            )}
                          </div>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            {assignment.status}
                          </Badge>
                        )}
                      </TableCell>

                      {/* Action */}
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-8 text-xs px-3"
                          onClick={() => handleOpenFindMatch(team)}
                        >
                          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                          Find Match
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* 2. Faculty Supervision Capacity Workload Table */}
      <SupervisorWorkloadTable
        supervisors={workloadItems}
        teamsMap={teamsMap}
      />

      {/* 3. Find Match Sheet */}
      <FindMatchSheet
        team={selectedTeam}
        isOpen={isMatchSheetOpen}
        onClose={() => {
          setIsMatchSheetOpen(false);
          setSelectedTeam(null);
        }}
        allSupervisors={allSupervisorsList}
      />
    </div>
  );
}
