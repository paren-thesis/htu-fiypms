"use client";

import * as React from "react";
import {
  collection,
  onSnapshot,
  query,
} from "firebase/firestore";
import {
  Calendar,
  Plus,
  Send,
  AlertTriangle,
  Search,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
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
import { publishDefenseSchedule } from "@/app/actions/publish-defense-schedule";
import { ConflictAlertBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DefensePanelCard, formatDate } from "./DefensePanelCard";
import { PanelFormSheet } from "./PanelFormSheet";

export function CoordinatorDefenseView() {
  const { user } = useAuth();

  const [panels, setPanels] = React.useState<DefensePanelDocument[]>([]);
  const [teams, setTeams] = React.useState<TeamDocument[]>([]);
  const [whitelist, setWhitelist] = React.useState<StaffWhitelistDocument[]>([]);
  const [users, setUsers] = React.useState<UserDocument[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [listenerError, setListenerError] = React.useState<string | null>(null);

  // Form Sheet state
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [editingPanel, setEditingPanel] = React.useState<DefensePanelDocument | null>(null);

  // Filters
  const [selectedCourse, setSelectedCourse] = React.useState<string>("all");
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [isPublishing, setIsPublishing] = React.useState(false);

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
        setListenerError(err.message);
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

  // 3. Listen to staff_whitelist
  React.useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "staff_whitelist"),
      (snap) => {
        const docs = snap.docs.map(
          (d) => ({ email: d.id, ...d.data() } as StaffWhitelistDocument)
        );
        setWhitelist(docs);
      },
      (err) => {
        console.error("Failed to listen to staff_whitelist:", err);
      }
    );
    return () => unsub();
  }, []);

  // 4. Listen to users
  React.useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "users")),
      (snap) => {
        const docs = snap.docs.map(
          (d) => ({ uid: d.id, ...d.data() } as UserDocument)
        );
        setUsers(docs);
      },
      (err) => {
        console.error("Failed to listen to users:", err);
      }
    );
    return () => unsub();
  }, []);

  // Map faculty members: id -> { name, email }
  const facultyMap = React.useMemo(() => {
    const map: Record<string, { name: string; email: string }> = {};

    for (const u of users) {
      if (u.uid) {
        map[u.uid] = { name: u.name || u.email, email: u.email };
      }
    }

    for (const s of whitelist) {
      if (s.user_uid && !map[s.user_uid]) {
        map[s.user_uid] = { name: s.full_name, email: s.email };
      }
    }

    return map;
  }, [users, whitelist]);

  // Map teams: id -> TeamDocument
  const teamsMap = React.useMemo(() => {
    const map: Record<string, TeamDocument> = {};
    for (const t of teams) {
      map[t.id] = t;
    }
    return map;
  }, [teams]);

  // Compute conflicts in real-time across all panels
  const conflicts: DefenseConflict[] = React.useMemo(() => {
    return detectConflicts(panels);
  }, [panels]);

  // Handle Publish Schedule
  const handlePublishSchedule = async () => {
    if (!user) {
      toast.error("You must be authenticated as coordinator or admin.");
      return;
    }

    if (conflicts.length > 0) {
      toast.error(
        `Cannot publish defense schedule: ${conflicts.length} conflict(s) detected across panels.`
      );
      return;
    }

    if (panels.length === 0) {
      toast.error("No defense panels to publish.");
      return;
    }

    setIsPublishing(true);
    try {
      const idToken = await user.getIdToken();
      const res = await publishDefenseSchedule(idToken, {
        academic_year_id: "2026-2027",
      });

      if (res.ok) {
        toast.success(
          `Defense schedule published successfully (${res.publishedCount || panels.length} panels). Notifications sent to examiners and candidate teams.`
        );
      } else {
        toast.error(res.error || "Failed to publish defense schedule.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Publish request failed.");
    } finally {
      setIsPublishing(false);
    }
  };

  // Filter panels
  const filteredPanels = React.useMemo(() => {
    return panels.filter((p) => {
      if (selectedCourse !== "all" && p.course_id !== selectedCourse) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (p.panel_name || "").toLowerCase().includes(q);
        const matchesVenue = (p.venue || "").toLowerCase().includes(q);
        const matchesChair = (facultyMap[p.chair_id]?.name || "")
          .toLowerCase()
          .includes(q);
        const matchesTeam = (p.time_slots || []).some((s) => {
          const t = s.team_id ? teamsMap[s.team_id] : null;
          return t && t.name.toLowerCase().includes(q);
        });

        if (!matchesName && !matchesVenue && !matchesChair && !matchesTeam) {
          return false;
        }
      }
      return true;
    });
  }, [panels, selectedCourse, searchQuery, facultyMap, teamsMap]);

  // Group panels by presentation day
  const groupedPanels = React.useMemo(() => {
    const groups: { dayKey: string; label: string; dateSortMs: number; panels: DefensePanelDocument[] }[] = [];
    const groupMap = new Map<string, { label: string; dateSortMs: number; panels: DefensePanelDocument[] }>();

    for (const panel of filteredPanels) {
      // Find earliest non-cancelled slot
      const sortedSlots = [...(panel.time_slots || [])]
        .filter((s) => s.status !== "cancelled")
        .sort((a, b) => toEpochMs(a.start_time) - toEpochMs(b.start_time));

      const earliest = sortedSlots[0];
      let dayKey = "unscheduled";
      let label = "Unscheduled Sessions (Date TBD)";
      let dateSortMs = Infinity;

      if (earliest) {
        const ms = toEpochMs(earliest.start_time);
        if (ms) {
          const d = new Date(ms);
          dayKey = d.toISOString().split("T")[0] || "unscheduled";
          label = formatDate(ms);
          dateSortMs = ms;
        }
      }

      if (!groupMap.has(dayKey)) {
        groupMap.set(dayKey, { label, dateSortMs, panels: [] });
      }
      groupMap.get(dayKey)!.panels.push(panel);
    }

    // Sort groups by date
    const sortedEntries = Array.from(groupMap.entries()).sort(
      (a, b) => a[1].dateSortMs - b[1].dateSortMs
    );

    for (const [dayKey, data] of sortedEntries) {
      groups.push({
        dayKey,
        label: data.label,
        dateSortMs: data.dateSortMs,
        panels: data.panels,
      });
    }

    return groups;
  }, [filteredPanels]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Listener Error Banner */}
      {listenerError && (
        <Alert variant="destructive">
          <AlertTitle>Connection Error</AlertTitle>
          <AlertDescription>{listenerError}</AlertDescription>
        </Alert>
      )}

      {/* Global Conflicts Alert Banner */}
      {conflicts.length > 0 && (
        <Alert className="border-danger/40 bg-danger-soft/20 text-danger">
          <AlertTriangle className="h-5 w-5 text-danger shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <AlertTitle className="font-semibold text-danger flex items-center gap-2">
              <span>Scheduling Conflicts Detected ({conflicts.length})</span>
              <ConflictAlertBadge value="danger" message="Action Required" />
            </AlertTitle>
            <AlertDescription className="text-xs text-foreground/85">
              The schedule contains overlapping presentation times for examiners or physical venues.
              Publishing is strictly disabled until all conflicts are resolved.
            </AlertDescription>
          </div>
        </Alert>
      )}

      {/* Action Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search panels, teams, venues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            <Filter className="h-3.5 w-3.5 text-muted-foreground ml-1" aria-hidden="true" />
            {["all", "btech-cs", "btech-ict", "hnd-cs", "hnd-ict"].map((course) => (
              <button
                key={course}
                onClick={() => setSelectedCourse(course)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium uppercase transition-colors ${
                  selectedCourse === course
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                {course === "all" ? "All" : course}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <Button
            size="sm"
            onClick={() => {
              setEditingPanel(null);
              setIsSheetOpen(true);
            }}
            className="h-9 gap-1.5 text-xs font-medium"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>New Defense Panel</span>
          </Button>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={conflicts.length > 0 || isPublishing || panels.length === 0}
                    onClick={handlePublishSchedule}
                    className="h-9 gap-1.5 text-xs font-medium border-primary/30 text-primary hover:bg-primary/5 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{isPublishing ? "Publishing..." : "Publish Schedule"}</span>
                  </Button>
                </span>
              </TooltipTrigger>
              {conflicts.length > 0 && (
                <TooltipContent side="bottom" className="text-xs text-danger bg-popover text-popover-foreground">
                  Publishing is disabled: resolve all {conflicts.length} scheduling conflicts first.
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Panels Grouped By Day */}
      {groupedPanels.length === 0 ? (
        <div className="p-12 text-center border rounded-xl bg-card shadow-sm space-y-3">
          <Calendar className="h-10 w-10 text-muted-foreground mx-auto" aria-hidden="true" />
          <h3 className="font-semibold text-base text-foreground">
            No Defense Panels Found
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {searchQuery || selectedCourse !== "all"
              ? "No defense panels match the selected filters. Try clearing your search query."
              : "Get started by creating your first oral defense panel session and scheduling student presentation time slots."}
          </p>
          <Button
            size="sm"
            onClick={() => {
              setEditingPanel(null);
              setIsSheetOpen(true);
            }}
            className="gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Create Defense Panel</span>
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedPanels.map((group) => (
            <div key={group.dayKey} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-7 px-3 rounded-full bg-primary/10 text-primary font-semibold text-xs flex items-center gap-1.5 shrink-0">
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{group.label}</span>
                </div>
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">
                  {group.panels.length} panel{group.panels.length > 1 ? "s" : ""}
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {group.panels.map((panel) => (
                  <DefensePanelCard
                    key={panel.id}
                    panel={panel}
                    teamsMap={teamsMap}
                    facultyMap={facultyMap}
                    conflicts={conflicts}
                    onEdit={(p) => {
                      setEditingPanel(p);
                      setIsSheetOpen(true);
                    }}
                    userRole="coordinator"
                    currentUserId={user?.uid}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Slide-over Create/Edit Panel Sheet */}
      <PanelFormSheet
        isOpen={isSheetOpen}
        onClose={() => {
          setIsSheetOpen(false);
          setEditingPanel(null);
        }}
        editingPanel={editingPanel}
        existingPanels={panels}
        teams={teams}
        staffWhitelist={whitelist}
        onSaved={() => {
          // Real-time snapshot automatically updates panels
        }}
      />
    </div>
  );
}
