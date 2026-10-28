"use client";

import * as React from "react";
import Link from "next/link";
import {
  collection,
  onSnapshot,
  query,
} from "firebase/firestore";
import {
  Calendar,
  Clock,
  MapPin,
  Video,
  ExternalLink,
  FolderGit2,
  FileCheck2,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/client";
import type {
  DefensePanelDocument,
  TeamDocument,
  StaffWhitelistDocument,
  UserDocument,
} from "@/types/firestore";
import {
  detectConflicts,
  toEpochMs,
  type DefenseConflict,
} from "@/lib/defense/conflicts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { DefensePanelCard, formatTime, formatDate } from "./DefensePanelCard";

function subscribeToClock(callback: () => void) {
  const timer = setInterval(callback, 30000);
  return () => clearInterval(timer);
}

function getNowSnapshot() {
  return Date.now();
}

function getServerSnapshot() {
  return 0;
}

export function StaffDefenseView() {
  const { user, activeRole } = useAuth();
  const now = React.useSyncExternalStore(subscribeToClock, getNowSnapshot, getServerSnapshot);

  const [panels, setPanels] = React.useState<DefensePanelDocument[]>([]);
  const [teams, setTeams] = React.useState<TeamDocument[]>([]);
  const [whitelist, setWhitelist] = React.useState<StaffWhitelistDocument[]>([]);
  const [users, setUsers] = React.useState<UserDocument[]>([]);
  const [loading, setLoading] = React.useState(true);

  // 1. Listen to defense_panels
  React.useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "defense_panels"),
      (snap) => {
        const docs = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as DefensePanelDocument)
        );
        setPanels(docs);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to listen to defense_panels:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // 2. Listen to teams
  React.useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "teams"),
      (snap) => {
        const docs = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as TeamDocument)
        );
        setTeams(docs);
      },
      (err) => {
        console.error("Failed to listen to teams:", err);
      }
    );
    return () => unsub();
  }, []);

  // 3. Listen to staff whitelist & users for names
  React.useEffect(() => {
    const unsubWhitelist = onSnapshot(collection(db, "staff_whitelist"), (snap) => {
      const docs = snap.docs.map(
        (d) => ({ email: d.id, ...d.data() } as StaffWhitelistDocument)
      );
      setWhitelist(docs);
    });

    const unsubUsers = onSnapshot(query(collection(db, "users")), (snap) => {
      const docs = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserDocument));
      setUsers(docs);
    });

    return () => {
      unsubWhitelist();
      unsubUsers();
    };
  }, []);

  const facultyMap = React.useMemo(() => {
    const map: Record<string, { name: string; email: string }> = {};
    for (const u of users) {
      if (u.uid) map[u.uid] = { name: u.name || u.email, email: u.email };
    }
    for (const s of whitelist) {
      if (s.user_uid && !map[s.user_uid]) {
        map[s.user_uid] = { name: s.full_name, email: s.email };
      }
    }
    return map;
  }, [users, whitelist]);

  const teamsMap = React.useMemo(() => {
    const map: Record<string, TeamDocument> = {};
    for (const t of teams) {
      map[t.id] = t;
    }
    return map;
  }, [teams]);

  // Compute conflicts
  const conflicts: DefenseConflict[] = React.useMemo(() => {
    return detectConflicts(panels);
  }, [panels]);

  // Filter to panels relevant to this staff member:
  // - Current user is Chair or Examiner
  // - OR current user is assigned supervisor of a slotted team
  const myPanels = React.useMemo(() => {
    if (!user) return [];

    return panels.filter((p) => {
      const isChair = p.chair_id === user.uid;
      const isExaminer = (p.examiner_ids || []).includes(user.uid);
      if (isChair || isExaminer) return true;

      // Check if user is supervisor of any slotted team
      const hasSupervisedTeam = (p.time_slots || []).some((s) => {
        if (!s.team_id) return false;
        const team = teamsMap[s.team_id];
        return team && team.assigned_supervisor_id === user.uid;
      });

      return hasSupervisedTeam;
    });
  }, [panels, user, teamsMap]);

  // Find next upcoming slot across myPanels
  const nextSlotData = React.useMemo(() => {
    let bestSlot: {
      slot: DefensePanelDocument["time_slots"][number];
      panel: DefensePanelDocument;
      team: TeamDocument | null;
      startMs: number;
    } | null = null;

    for (const panel of myPanels) {
      for (const slot of panel.time_slots || []) {
        if (slot.status === "cancelled") continue;
        const startMs = toEpochMs(slot.start_time);
        if (!startMs) continue;

        // Candidate slot
        if (!bestSlot) {
          bestSlot = {
            slot,
            panel,
            team: slot.team_id ? teamsMap[slot.team_id] || null : null,
            startMs,
          };
        } else {
          // Prefer slot in the future closest to now, or earliest upcoming
          const isCurrentUpcoming = startMs >= now;
          const isBestUpcoming = bestSlot.startMs >= now;

          if (isCurrentUpcoming && !isBestUpcoming) {
            bestSlot = {
              slot,
              panel,
              team: slot.team_id ? teamsMap[slot.team_id] || null : null,
              startMs,
            };
          } else if (
            (isCurrentUpcoming && isBestUpcoming && startMs < bestSlot.startMs) ||
            (!isCurrentUpcoming && !isBestUpcoming && startMs > bestSlot.startMs)
          ) {
            bestSlot = {
              slot,
              panel,
              team: slot.team_id ? teamsMap[slot.team_id] || null : null,
              startMs,
            };
          }
        }
      }
    }

    return bestSlot;
  }, [myPanels, teamsMap, now]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Next Upcoming Defense Slot Highlight */}
      {nextSlotData ? (
        <Card className="rounded-xl border border-primary/30 bg-primary/5 shadow-sm overflow-hidden">
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary text-primary-foreground font-semibold text-xs gap-1">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    <span>Next Defense Presentation</span>
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">
                    {nextSlotData.panel.panel_name}
                  </span>
                </div>

                <h3 className="text-base font-bold text-foreground">
                  {nextSlotData.team ? (
                    <>
                      {nextSlotData.team.name}
                      {nextSlotData.team.group_number && (
                        <span className="text-muted-foreground font-normal ml-1">
                          ({nextSlotData.team.group_number})
                        </span>
                      )}
                    </>
                  ) : (
                    "Open Defense Slot"
                  )}
                </h3>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-0.5">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    <span>{formatDate(nextSlotData.slot.start_time)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono">
                    <Clock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    <span>
                      {formatTime(nextSlotData.slot.start_time)} –{" "}
                      {formatTime(nextSlotData.slot.end_time)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {nextSlotData.panel.is_virtual ? (
                      <>
                        <Video className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                        {nextSlotData.panel.virtual_meeting_url ? (
                          <a
                            href={nextSlotData.panel.virtual_meeting_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
                          >
                            Join Video Call
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        ) : (
                          <span>Virtual Meeting</span>
                        )}
                      </>
                    ) : (
                      <>
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        <span>Venue: {nextSlotData.panel.venue}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                {nextSlotData.team && (
                  <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                    <Link href={`/deliverables?teamId=${nextSlotData.team.id}`}>
                      <FolderGit2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                      <span>Review Deliverables</span>
                    </Link>
                  </Button>
                )}

                <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
                  <Link href={`/defense/${nextSlotData.panel.id}`}>
                    <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Digital Marksheet</span>
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* 2. My Panels List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base text-foreground">
              My Defense Panels ({myPanels.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              Panels where you serve as Chair, Examiner, or Supervising Lecturer.
            </p>
          </div>
        </div>

        {myPanels.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-6 w-6 text-primary" aria-hidden="true" />}
            title="No Assigned Defense Panels"
            description="You are not currently assigned to any oral examination panels for this academic session."
            action={
              <Button size="sm" variant="outline" asChild>
                <Link href="/supervision">View Supervised Teams</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {myPanels.map((panel) => (
              <DefensePanelCard
                key={panel.id}
                panel={panel}
                teamsMap={teamsMap}
                facultyMap={facultyMap}
                conflicts={conflicts}
                userRole={activeRole}
                currentUserId={user?.uid}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
