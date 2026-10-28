"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { doc, collection, query, where, onSnapshot } from "firebase/firestore";
import {
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  MapPin,
  Video,
  ShieldCheck,
  AlertCircle,
  ListChecks,
} from "lucide-react";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DigitalMarksheet } from "@/components/defense/DigitalMarksheet";
import { LiveComposite } from "@/components/defense/LiveComposite";
import type {
  DefensePanelDocument,
  TeamDocument,
  RubricDocument,
  UserDocument,
} from "@/types/firestore";

function formatSlotTime(ts?: { toMillis?: () => number; seconds?: number }): string {
  if (!ts) return "—";
  const ms = typeof ts.toMillis === "function" ? ts.toMillis() : (ts.seconds || 0) * 1000;
  if (!ms) return "—";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatSlotDate(ts?: { toMillis?: () => number; seconds?: number }): string {
  if (!ts) return "—";
  const ms = typeof ts.toMillis === "function" ? ts.toMillis() : (ts.seconds || 0) * 1000;
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default function DefensePanelSessionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, availableRoles, activeRole, loading: authLoading } = useAuth();

  const panelId = typeof params?.panelId === "string" ? params.panelId : "";
  const initialTeamQuery = searchParams.get("team") || "";

  const [panel, setPanel] = React.useState<DefensePanelDocument | null>(null);
  const [panelLoading, setPanelLoading] = React.useState(true);
  const [teams, setTeams] = React.useState<Record<string, TeamDocument>>({});
  const [rubric, setRubric] = React.useState<RubricDocument | null>(null);
  const [userMap, setUserMap] = React.useState<Record<string, string>>({});
  const [selectedTeamId, setSelectedTeamId] = React.useState<string>(initialTeamQuery);

  // 1. Stream panel document
  React.useEffect(() => {
    if (!panelId) return;

    const panelRef = doc(db, "defense_panels", panelId);

    const unsubscribe = onSnapshot(
      panelRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setPanel({ id: snapshot.id, ...(snapshot.data() as Omit<DefensePanelDocument, "id">) });
        } else {
          setPanel(null);
        }
        setPanelLoading(false);
      },
      (error) => {
        console.error("Failed to stream panel:", error);
        setPanelLoading(false);
      }
    );

    return () => unsubscribe();
  }, [panelId]);

  // 2. Stream active rubric
  React.useEffect(() => {
    const q = query(collection(db, "rubrics"), where("is_active", "==", true));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty && snapshot.docs[0]) {
          const d = snapshot.docs[0];
          setRubric({ id: d.id, ...(d.data() as Omit<RubricDocument, "id">) });
        } else {
          setRubric(null);
        }
      },
      (error) => {
        console.error("Failed to load active rubric:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  // 3. Stream faculty user display names
  React.useEffect(() => {
    const q = collection(db, "users");
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const mapping: Record<string, string> = {};
        for (const d of snapshot.docs) {
          const u = d.data() as UserDocument;
          mapping[d.id] = u.name || u.email || d.id;
        }
        setUserMap(mapping);
      },
      (error) => {
        console.error("Failed to stream users:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  // 4. Stream teams scheduled in this panel
  React.useEffect(() => {
    if (!panel?.time_slots || panel.time_slots.length === 0) return;

    const teamIds = Array.from(
      new Set(panel.time_slots.map((s) => s.team_id).filter((id): id is string => Boolean(id)))
    );

    if (teamIds.length === 0) return;

    const q = query(collection(db, "teams"), where("__name__", "in", teamIds.slice(0, 30)));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const teamMap: Record<string, TeamDocument> = {};
        for (const d of snapshot.docs) {
          teamMap[d.id] = { id: d.id, ...(d.data() as Omit<TeamDocument, "id">) };
        }
        setTeams(teamMap);

        // Preselect initial team or first available slotted team
        if (!selectedTeamId && teamIds[0]) {
          setSelectedTeamId(teamIds[0]);
        }
      },
      (error) => {
        console.error("Failed to stream teams:", error);
      }
    );

    return () => unsubscribe();
  }, [panel?.time_slots, selectedTeamId]);

  const effectiveTeamId = selectedTeamId || initialTeamQuery;

  const handleSelectTeam = (tId: string) => {
    setSelectedTeamId(tId);
    router.replace(`/defense/${panelId}?team=${tId}`);
  };

  if (authLoading || panelLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (!panel) {
    return (
      <div className="space-y-6">
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <Link href="/defense">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back to Defense Overview</span>
          </Link>
        </Button>

        <EmptyState
          icon={<AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />}
          title="Panel Not Found"
          description={`Defense panel "${panelId}" does not exist or has been archived.`}
        />
      </div>
    );
  }

  const slottedTeams = (panel.time_slots || []).filter((s) => Boolean(s.team_id));
  const currentSlot = panel.time_slots?.find((s) => s.team_id === effectiveTeamId) || slottedTeams[0];
  const selectedTeam = effectiveTeamId ? teams[effectiveTeamId] : currentSlot ? teams[currentSlot.team_id] : null;

  // Evaluator role derivation
  const isChair = user ? panel.chair_id === user.uid : false;
  const isCoordinator =
    availableRoles?.includes("coordinator") ||
    availableRoles?.includes("admin") ||
    activeRole === "coordinator" ||
    activeRole === "admin";
  const isAssignedSupervisor =
    user && selectedTeam ? selectedTeam.assigned_supervisor_id === user.uid : false;

  let evaluatorRole: "supervisor" | "panel_chair" | "panel_member" = "panel_member";
  if (isAssignedSupervisor) {
    evaluatorRole = "supervisor";
  } else if (isChair) {
    evaluatorRole = "panel_chair";
  } else {
    evaluatorRole = "panel_member";
  }

  return (
    <div className="space-y-6">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <Link href="/defense">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Defense Schedule</span>
          </Link>
        </Button>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs uppercase font-mono px-2 py-0.5">
            {panel.course_id}
          </Badge>
          <Badge variant="secondary" className="text-xs font-mono">
            {panel.academic_year_id}
          </Badge>
        </div>
      </div>

      {/* Panel Header Summary Card */}
      <Card className="border-border shadow-sm bg-card rounded-xl">
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-foreground">
                {panel.panel_name}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
                {/* Venue or Virtual Meeting */}
                {panel.is_virtual ? (
                  <div className="flex items-center gap-1.5 text-primary font-medium">
                    <Video className="h-4 w-4" aria-hidden="true" />
                    <span>Virtual Meeting</span>
                    {panel.virtual_meeting_url && (
                      <a
                        href={panel.virtual_meeting_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 underline hover:text-primary/80 ml-1"
                      >
                        <span>Join</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-foreground font-medium">
                    <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span>{panel.venue}</span>
                  </div>
                )}

                {/* Chair */}
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                  <span>Chair: <strong className="text-foreground">{userMap[panel.chair_id] || "Panel Chair"}</strong></span>
                </div>

                {/* Date */}
                {panel.time_slots?.[0] && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span>{formatSlotDate(panel.time_slots[0].start_time)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Total slotted count */}
            <div className="flex items-center gap-2 self-start md:self-auto">
              <span className="text-xs font-semibold text-muted-foreground">
                {slottedTeams.length} {slottedTeams.length === 1 ? "Team Scheduled" : "Teams Scheduled"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Slotted Teams Selector Bar */}
      {slottedTeams.length > 0 ? (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
            Select Team Session
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {panel.time_slots?.map((slot, index) => {
              if (!slot.team_id) return null;
              const teamDoc = teams[slot.team_id];
              const isSelected = slot.team_id === selectedTeamId;

              return (
                <button
                  key={slot.slot_id}
                  type="button"
                  onClick={() => handleSelectTeam(slot.team_id)}
                  className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                      : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
                  }`}
                  aria-pressed={isSelected}
                >
                  <div className="flex items-start justify-between gap-2 w-full">
                    <div>
                      <span className="font-mono font-bold text-xs text-primary block">
                        {teamDoc?.group_number || `Slot #${index + 1}`}
                      </span>
                      <p className="text-xs font-semibold text-foreground line-clamp-1 mt-0.5">
                        {teamDoc?.name || `Team ${slot.team_id}`}
                      </p>
                    </div>
                    <StatusBadge domain="defense" value={slot.status} />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/60">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="h-3 w-3" />
                      {formatSlotTime(slot.start_time)} – {formatSlotTime(slot.end_time)}
                    </span>
                    {isSelected && (
                      <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">
                        Active
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<ListChecks className="h-6 w-6 text-muted-foreground" aria-hidden="true" />}
          title="No Teams Scheduled"
          description="There are currently no presentation slots assigned to project teams on this panel."
        />
      )}

      {/* Selected Team Details & Marksheet Area */}
      {selectedTeam && currentSlot && (
        <div className="space-y-6 pt-2">
          {/* Chair & Coordinator Live Panel Composite */}
          {(isChair || isCoordinator) && rubric && (
            <LiveComposite
              panel={panel}
              slot={currentSlot}
              team={selectedTeam}
              rubric={rubric}
              currentUserId={user?.uid || ""}
              isChair={isChair}
              isCoordinator={isCoordinator}
              userMap={userMap}
            />
          )}

          {/* Evaluator's Marksheet */}
          {rubric ? (
            <DigitalMarksheet
              team={selectedTeam}
              panel={panel}
              rubric={rubric}
              evaluatorRole={evaluatorRole}
              userId={user?.uid || ""}
            />
          ) : (
            <Alert className="border-warning/30 bg-warning/5 text-warning">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle className="font-semibold text-sm">No Active Rubric Configured</AlertTitle>
              <AlertDescription className="text-xs mt-0.5">
                The department coordinator has not configured an active defense scoring rubric yet. Marksheets cannot be initialized until an official rubric is activated.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}
