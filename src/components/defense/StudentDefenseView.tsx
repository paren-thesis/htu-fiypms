"use client";

import * as React from "react";
import Link from "next/link";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import {
  Calendar,
  Clock,
  MapPin,
  Video,
  ExternalLink,
  ShieldCheck,
  Users,
  FolderGit2,
  CheckCircle2,
  Info,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/client";
import type {
  DefensePanelDocument,
  TeamDocument,
  StaffWhitelistDocument,
  UserDocument,
} from "@/types/firestore";
import { toEpochMs } from "@/lib/defense/conflicts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { formatTime, formatDate } from "./DefensePanelCard";

export function StudentDefenseView() {
  const { user, loading: authLoading } = useAuth();

  const [myTeam, setMyTeam] = React.useState<TeamDocument | null>(null);
  const [panels, setPanels] = React.useState<DefensePanelDocument[]>([]);
  const [whitelist, setWhitelist] = React.useState<StaffWhitelistDocument[]>([]);
  const [users, setUsers] = React.useState<UserDocument[]>([]);
  const [teamLoading, setTeamLoading] = React.useState(true);

  // 1. Listen to student's team
  React.useEffect(() => {
    if (!user) {
      return;
    }

    const q = query(
      collection(db, "teams"),
      where("member_ids", "array-contains", user.uid)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty && snap.docs[0]) {
          setMyTeam({ id: snap.docs[0].id, ...snap.docs[0].data() } as TeamDocument);
        } else {
          setMyTeam(null);
        }
        setTeamLoading(false);
      },
      (err) => {
        console.error("Failed to fetch student team:", err);
        setTeamLoading(false);
      }
    );

    return () => unsub();
  }, [user]);

  // 2. Listen to defense_panels
  React.useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "defense_panels"),
      (snap) => {
        const docs = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as DefensePanelDocument)
        );
        setPanels(docs);
      },
      (err) => {
        console.error("Failed to listen to defense_panels:", err);
      }
    );
    return () => unsub();
  }, []);

  // 3. Listen to faculty members for names
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

  const loading = authLoading || (Boolean(user) && teamLoading);

  // Find slot assigned to student's team
  let studentSlotMatch: {
    panel: DefensePanelDocument;
    slot: DefensePanelDocument["time_slots"][number];
    isPublished: boolean;
  } | null = null;

  if (myTeam) {
    for (const panel of panels) {
      for (const slot of panel.time_slots || []) {
        if (slot.team_id === myTeam.id && slot.status !== "cancelled") {
          studentSlotMatch = {
            panel,
            slot,
            isPublished: Boolean(panel.is_published),
          };
          break;
        }
      }
      if (studentSlotMatch) break;
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!myTeam) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="No Project Team Joined"
        description="You must be a member of a registered project team to view oral presentation schedules."
        action={
          <Button size="sm" asChild>
            <Link href="/my-team">Create or Join Team</Link>
          </Button>
        }
      />
    );
  }

  // Case 1: Slot found and PUBLISHED
  if (studentSlotMatch && studentSlotMatch.isPublished) {
    const { panel, slot } = studentSlotMatch;
    const chair = facultyMap[panel.chair_id] || { name: "Panel Chair", email: "" };
    const examiners = (panel.examiner_ids || []).map(
      (id) => facultyMap[id]?.name || "Examiner"
    );

    const startMs = toEpochMs(slot.start_time);
    const endMs = toEpochMs(slot.end_time);

    return (
      <div className="space-y-6 max-w-4xl">
        <Card className="rounded-xl border border-primary/40 bg-card shadow-md overflow-hidden">
          <CardHeader className="p-6 bg-primary/5 border-b">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge className="bg-success text-success-foreground text-xs gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Official Schedule Published</span>
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground uppercase">
                    {panel.course_id}
                  </span>
                </div>
                <CardTitle className="text-xl font-bold text-foreground">
                  Oral Defense Presentation Session
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Assigned presentation slot for{" "}
                  <strong className="text-foreground">{myTeam.name}</strong>{" "}
                  {myTeam.group_number ? `(${myTeam.group_number})` : ""}
                </p>
              </div>

              <Button asChild size="sm" className="gap-1.5 self-start sm:self-center">
                <Link href="/deliverables">
                  <FolderGit2 className="h-4 w-4" aria-hidden="true" />
                  <span>Verify Deliverables</span>
                </Link>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            {/* Session Key Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border bg-muted/20 space-y-1">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Defense Date
                </span>
                <p className="text-sm font-semibold text-foreground">
                  {formatDate(startMs)}
                </p>
              </div>

              <div className="p-4 rounded-xl border bg-muted/20 space-y-1">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Time Window
                </span>
                <p className="text-sm font-semibold text-foreground font-mono">
                  {formatTime(startMs)} – {formatTime(endMs)}
                </p>
              </div>

              <div className="p-4 rounded-xl border bg-muted/20 space-y-1">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  {panel.is_virtual ? (
                    <Video className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  ) : (
                    <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  )}
                  {panel.is_virtual ? "Meeting Link" : "Examination Venue"}
                </span>
                {panel.is_virtual ? (
                  panel.virtual_meeting_url ? (
                    <a
                      href={panel.virtual_meeting_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <span>Join Virtual Defense</span>
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="text-sm font-medium text-muted-foreground">
                      Virtual meeting link pending
                    </span>
                  )
                ) : (
                  <p className="text-sm font-semibold text-foreground">
                    {panel.venue || "To Be Announced"}
                  </p>
                )}
              </div>
            </div>

            {/* Panel Details & Officers */}
            <div className="p-4 rounded-xl border bg-card space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Examining Panel — {panel.panel_name}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                  <div>
                    <span className="text-muted-foreground">Panel Chair:</span>
                    <p className="font-semibold text-foreground">{chair.name}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  <div>
                    <span className="text-muted-foreground">Panel Examiners:</span>
                    <p className="font-medium text-foreground">
                      {examiners.join(", ") || "Departmental Faculty"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Candidate Checklist */}
            <div className="p-4 rounded-xl border border-info/30 bg-info-soft/20 text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold text-info">
                <Info className="h-4 w-4" aria-hidden="true" />
                <span>Candidate Presentation Guidelines</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-1">
                <li>Arrive at the examination venue or join the meeting at least 15 minutes prior to your time window.</li>
                <li>Ensure all project source code, demo URLs, and final manuscripts are submitted under Deliverables.</li>
                <li>All team members must be present during the oral defense and Q&A presentation.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Case 2: Schedule not yet published
  return (
    <div className="space-y-6 max-w-3xl">
      <EmptyState
        icon={<Calendar className="h-8 w-8 text-primary" aria-hidden="true" />}
        title="Defense Schedule Pending Publication"
        description="The Departmental Coordinator is currently organizing presentation panels and verifying examiner allocations. Your team's official defense time slot and examination venue will appear here as soon as the coordinator publishes the defense schedule."
        action={
          <Button size="sm" variant="outline" asChild>
            <Link href="/deliverables">Prepare Software Deliverables</Link>
          </Button>
        }
      />
    </div>
  );
}
