"use client";

import * as React from "react";
import { collection, query, onSnapshot } from "firebase/firestore";
import {
  Search,
  BookOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  Users,
  GraduationCap,
  ShieldAlert,
} from "lucide-react";
import { db } from "@/lib/firebase/client";
import { DEFAULT_CHAPTER_TITLES } from "@/lib/models/chapter";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChapterFeedbackThread } from "./ChapterFeedbackThread";
import type { TeamDocument, ChapterDocument } from "@/types/firestore";

export function CoordinatorChaptersView() {
  const [teams, setTeams] = React.useState<TeamDocument[]>([]);
  const [chapters, setChapters] = React.useState<ChapterDocument[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [listenerError, setListenerError] = React.useState<string | null>(null);

  // Filters
  const [courseFilter, setCourseFilter] = React.useState<string>("all");
  const [searchQuery, setSearchQuery] = React.useState<string>("");

  // Inspect detail dialog
  const [inspectTarget, setInspectTarget] = React.useState<{
    chapter: ChapterDocument;
    team: TeamDocument;
  } | null>(null);

  // 1. Subscribe to all teams
  React.useEffect(() => {
    const teamsQuery = query(collection(db, "teams"));
    const unsubscribeTeams = onSnapshot(
      teamsQuery,
      (snapshot) => {
        const docs = snapshot.docs
          .map((d) => d.data() as TeamDocument)
          .filter((t) => t.status !== "disbanded");
        setTeams(docs);
      },
      (error) => {
        console.error("Firestore error on coordinator teams snapshot:", error);
        setListenerError("Failed to synchronize active teams.");
      }
    );

    // 2. Subscribe to all chapters
    const chaptersQuery = query(collection(db, "chapters"));
    const unsubscribeChapters = onSnapshot(
      chaptersQuery,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => d.data() as ChapterDocument);
        setChapters(docs);
        setLoading(false);
      },
      (error) => {
        console.error("Firestore error on coordinator chapters snapshot:", error);
        setListenerError("Failed to synchronize chapter submissions.");
        setLoading(false);
      }
    );

    return () => {
      unsubscribeTeams();
      unsubscribeChapters();
    };
  }, []);

  // Map chapters by `team_id` -> Map<chapter_number, ChapterDocument>
  const teamChaptersMap = React.useMemo(() => {
    const map = new Map<string, Map<number, ChapterDocument>>();
    for (const ch of chapters) {
      if (!map.has(ch.team_id)) {
        map.set(ch.team_id, new Map());
      }
      map.get(ch.team_id)!.set(ch.chapter_number, ch);
    }
    return map;
  }, [chapters]);

  // Filtered teams list
  const filteredTeams = React.useMemo(() => {
    return teams
      .filter((t) => {
        if (courseFilter !== "all" && t.course_id !== courseFilter) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        return (
          t.group_number.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.course_id.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.group_number.localeCompare(b.group_number));
  }, [teams, courseFilter, searchQuery]);

  // Aggregate Metrics
  const metrics = React.useMemo(() => {
    const totalTeams = teams.length;
    const defenseReadyTeams = teams.filter((t) => t.status === "defense_ready" || t.status === "completed").length;
    const pendingReviews = chapters.filter((c) => c.status === "pending").length;
    const approvedChapters = chapters.filter((c) => c.status === "approved").length;
    return {
      totalTeams,
      defenseReadyTeams,
      pendingReviews,
      approvedChapters,
    };
  }, [teams, chapters]);

  const formatTimestamp = (ts?: { seconds: number; nanoseconds: number }) => {
    if (!ts || typeof ts.seconds !== "number") return "—";
    return new Date(ts.seconds * 1000).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (listenerError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
        <ShieldAlert className="h-8 w-8 mx-auto mb-2 text-destructive" aria-hidden="true" />
        <p className="font-semibold">{listenerError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metric Bento Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Users className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>Active Teams</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
            {metrics.totalTeams}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Clock className="h-4 w-4 text-warning" aria-hidden="true" />
            <span>Pending Reviews</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
            {metrics.pendingReviews}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            <span>Approved Chapters</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
            {metrics.approvedChapters}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <GraduationCap className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>Defense Ready</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
            {metrics.defenseReadyTeams}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <Input
            placeholder="Search group number or team name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Programme:</span>
          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="w-44 h-9 text-xs">
              <SelectValue placeholder="All Programmes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Programmes</SelectItem>
              <SelectItem value="btech-cs">BTech CS</SelectItem>
              <SelectItem value="btech-ict">BTech ICT</SelectItem>
              <SelectItem value="hnd-cs">HND CS</SelectItem>
              <SelectItem value="hnd-ict">HND ICT</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Teams x Chapters Progress Matrix */}
      {filteredTeams.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-6 w-6 text-primary" aria-hidden="true" />}
          title="No Matching Teams Found"
          description="Adjust your search criteria or course filter to inspect chapter submissions."
        />
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-28 text-xs font-semibold">Group</TableHead>
                  <TableHead className="min-w-44 text-xs font-semibold">Team Name</TableHead>
                  <TableHead className="w-24 text-xs font-semibold">Course</TableHead>
                  <TableHead className="w-24 text-center text-xs font-semibold">Ch 1</TableHead>
                  <TableHead className="w-24 text-center text-xs font-semibold">Ch 2</TableHead>
                  <TableHead className="w-24 text-center text-xs font-semibold">Ch 3</TableHead>
                  <TableHead className="w-24 text-center text-xs font-semibold">Ch 4</TableHead>
                  <TableHead className="w-24 text-center text-xs font-semibold">Ch 5</TableHead>
                  <TableHead className="w-32 text-right text-xs font-semibold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTeams.map((team) => {
                  const chMap = teamChaptersMap.get(team.id);

                  return (
                    <TableRow key={team.id} className="hover:bg-muted/20">
                      <TableCell className="font-mono text-xs font-semibold text-foreground">
                        {team.group_number}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-foreground truncate max-w-xs">
                        {team.name}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground uppercase font-mono">
                        {team.course_id.replace("btech-", "").replace("hnd-", "")}
                      </TableCell>

                      {/* Chapters 1 to 5 status chips */}
                      {([1, 2, 3, 4, 5] as const).map((chNum) => {
                        const ch = chMap?.get(chNum);

                        if (!ch) {
                          return (
                            <TableCell key={chNum} className="text-center p-2">
                              <span className="text-[11px] text-muted-foreground/60 font-mono">
                                —
                              </span>
                            </TableCell>
                          );
                        }

                        const badgeVariant = "outline";
                        let badgeClass = "text-[10px] h-5 px-1.5 font-medium";

                        if (ch.status === "approved") {
                          badgeClass += " bg-success-soft text-success border-success/30";
                        } else if (ch.status === "revision_needed") {
                          badgeClass += " bg-warning-soft text-warning border-warning/30";
                        } else {
                          badgeClass += " bg-info-soft text-info border-info/30";
                        }

                        return (
                          <TableCell key={chNum} className="text-center p-2">
                            <button
                              type="button"
                              onClick={() => setInspectTarget({ chapter: ch, team })}
                              className="inline-flex cursor-pointer hover:opacity-80 transition-opacity"
                              title={`Click to view Chapter ${chNum} details`}
                            >
                              <Badge variant={badgeVariant} className={badgeClass}>
                                {ch.status === "approved"
                                  ? "Appr"
                                  : ch.status === "revision_needed"
                                  ? "Rev"
                                  : "Pend"}
                              </Badge>
                            </button>
                          </TableCell>
                        );
                      })}

                      <TableCell className="text-right">
                        <StatusBadge domain="team" value={team.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Read-Only Inspect Modal for Coordinator */}
      {inspectTarget && (
        <Dialog
          open={Boolean(inspectTarget)}
          onOpenChange={(open) => {
            if (!open) setInspectTarget(null);
          }}
        >
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <DialogTitle className="text-base font-semibold">
                    {inspectTarget.chapter.title || DEFAULT_CHAPTER_TITLES[inspectTarget.chapter.chapter_number]}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    {inspectTarget.team.group_number} · {inspectTarget.team.name}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-2 text-sm">
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border bg-muted/20">
                <div className="flex items-center gap-2">
                  <StatusBadge domain="chapter" value={inspectTarget.chapter.status} />
                  <Badge variant="outline" className="font-mono text-xs">
                    v{inspectTarget.chapter.version}
                  </Badge>
                </div>

                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
                  <a
                    href={inspectTarget.chapter.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    Open Manuscript
                  </a>
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  <strong>Submitted:</strong> {formatTimestamp(inspectTarget.chapter.submitted_at)}
                </div>
                {inspectTarget.chapter.reviewed_at && (
                  <div>
                    <strong>Reviewed:</strong> {formatTimestamp(inspectTarget.chapter.reviewed_at)}
                  </div>
                )}
              </div>

              <ChapterFeedbackThread
                feedback={inspectTarget.chapter.feedback || []}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
