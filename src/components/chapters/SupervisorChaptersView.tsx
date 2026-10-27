"use client";

import * as React from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import {
  FileCheck2,
  Clock,
  ExternalLink,
  Users,
  CheckCircle2,
  BookOpen,
  Filter,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/client";
import { DEFAULT_CHAPTER_TITLES } from "@/lib/models/chapter/schema";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ChapterReviewDialog } from "./ChapterReviewDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TeamDocument, ChapterDocument } from "@/types/firestore";

export function SupervisorChaptersView() {
  const { user } = useAuth();
  const [teams, setTeams] = React.useState<TeamDocument[]>([]);
  const [teamsLoading, setTeamsLoading] = React.useState(true);
  const [chapters, setChapters] = React.useState<ChapterDocument[]>([]);
  const [chaptersLoading, setChaptersLoading] = React.useState(true);
  const [selectedTeamId, setSelectedTeamId] = React.useState<string>("all");
  const [listenerError, setListenerError] = React.useState<string | null>(null);

  // Review Dialog State
  const [reviewTarget, setReviewTarget] = React.useState<{
    chapter: ChapterDocument;
    team: TeamDocument;
  } | null>(null);

  // 1. Subscribe to supervisor's accepted teams
  React.useEffect(() => {
    if (!user) {
      return;
    }

    const teamsQuery = query(
      collection(db, "teams"),
      where("assigned_supervisor_id", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      teamsQuery,
      (snapshot) => {
        const docs = snapshot.docs
          .map((d) => d.data() as TeamDocument)
          .filter(
            (t) =>
              t.status !== "disbanded" &&
              t.supervisor_assignment?.status === "accepted"
          );
        setTeams(docs);
        setTeamsLoading(false);
      },
      (error) => {
        console.error("Firestore error on supervisor teams:", error);
        setListenerError("Failed to synchronize assigned teams.");
        setTeamsLoading(false);
      }
    );

    return () => {
      unsubscribe();
      setTeams([]);
    };
  }, [user]);

  // 2. Subscribe to chapters for supervisor's teams
  React.useEffect(() => {
    if (teams.length === 0) {
      return;
    }

    const teamIds = teams.map((t) => t.id);

    // If more than 30 teams, query chunks (typically supervisor has <= 5 teams)
    const teamsChunk = teamIds.slice(0, 30);
    const chaptersQuery = query(
      collection(db, "chapters"),
      where("team_id", "in", teamsChunk)
    );

    const unsubscribe = onSnapshot(
      chaptersQuery,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => d.data() as ChapterDocument);
        setChapters(docs);
        setChaptersLoading(false);
      },
      (error) => {
        console.error("Firestore error on supervisor chapters:", error);
        setListenerError("Failed to synchronize chapter documents.");
        setChaptersLoading(false);
      }
    );

    return () => {
      unsubscribe();
      setChapters([]);
    };
  }, [teams]);

  const teamsMap = React.useMemo(() => {
    const map = new Map<string, TeamDocument>();
    for (const t of teams) {
      map.set(t.id, t);
    }
    return map;
  }, [teams]);

  // Pending chapters requiring supervisor review
  const pendingChapters = React.useMemo(() => {
    return chapters
      .filter((ch) => ch.status === "pending")
      .filter((ch) => selectedTeamId === "all" || ch.team_id === selectedTeamId)
      .sort((a, b) => (b.submitted_at?.seconds || 0) - (a.submitted_at?.seconds || 0));
  }, [chapters, selectedTeamId]);

  // Filtered chapters for the team progress view
  const displayTeams = React.useMemo(() => {
    if (selectedTeamId === "all") return teams;
    return teams.filter((t) => t.id === selectedTeamId);
  }, [teams, selectedTeamId]);

  const formatTimestamp = (ts?: { seconds: number; nanoseconds: number }) => {
    if (!ts || typeof ts.seconds !== "number") return "—";
    return new Date(ts.seconds * 1000).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (teamsLoading || chaptersLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
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

  if (teams.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="No Assigned Teams Yet"
        description="You have no accepted capstone teams assigned for supervision in the current academic year."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Toolbar: Filter & Team Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">Filter by Team:</span>
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger className="w-56 h-9 text-xs">
              <SelectValue placeholder="All Assigned Teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assigned Teams ({teams.length})</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.group_number} — {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="flex h-2 w-2 rounded-full bg-warning" />
            {pendingChapters.length} Pending Review
          </span>
          <span>·</span>
          <span>{teams.length} Active Teams</span>
        </div>
      </div>

      {/* Tabs: Review Queue vs Teams Progress Matrix */}
      <Tabs defaultValue="queue" className="space-y-6">
        <TabsList className="bg-muted/60 p-1">
          <TabsTrigger value="queue" className="gap-2 text-xs">
            <FileCheck2 className="h-4 w-4" aria-hidden="true" />
            Review Queue
            {pendingChapters.length > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-bold">
                {pendingChapters.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="teams" className="gap-2 text-xs">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            All Teams &amp; Milestones
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Review Queue */}
        <TabsContent value="queue" className="space-y-4">
          {pendingChapters.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success mb-3">
                <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Review Queue Clear</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                All submitted chapter manuscripts for your supervised teams have been evaluated.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {pendingChapters.map((ch) => {
                const team = teamsMap.get(ch.team_id);
                if (!team) return null;

                return (
                  <Card key={ch.id} className="border-border bg-card shadow-xs transition-colors hover:border-primary/40">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground">
                              {team.group_number}
                            </span>
                            <span className="text-xs text-muted-foreground truncate max-w-xs font-medium">
                              {team.name}
                            </span>
                            <Badge variant="outline" className="text-xs font-mono">
                              v{ch.version}
                            </Badge>
                            <StatusBadge domain="chapter" value="pending" />
                          </div>

                          <h4 className="text-base font-semibold text-foreground">
                            {ch.title || DEFAULT_CHAPTER_TITLES[ch.chapter_number]}
                          </h4>

                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                              Submitted: {formatTimestamp(ch.submitted_at)}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs h-9"
                            asChild
                          >
                            <a
                              href={ch.document_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open student document in a new tab"
                            >
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              Open Link
                            </a>
                          </Button>

                          <Button
                            size="sm"
                            className="gap-1.5 text-xs h-9 bg-primary text-primary-foreground"
                            onClick={() => setReviewTarget({ chapter: ch, team })}
                          >
                            <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Review Manuscript
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Teams & Milestones Matrix */}
        <TabsContent value="teams" className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {displayTeams.map((team) => {
              const teamChapters = chapters.filter((c) => c.team_id === team.id);
              const chMap = new Map<number, ChapterDocument>();
              for (const c of teamChapters) {
                chMap.set(c.chapter_number, c);
              }

              const approvedCount = teamChapters.filter((c) => c.status === "approved").length;

              return (
                <Card key={team.id} className="border-border bg-card shadow-xs">
                  <CardContent className="p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground">
                            {team.group_number}
                          </span>
                          <StatusBadge domain="team" value={team.status} />
                          <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                            {team.course_id}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-foreground">{team.name}</h4>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Progression:</span>
                        <span className="font-mono text-xs font-bold text-foreground">
                          {approvedCount}/5 Chapters
                        </span>
                      </div>
                    </div>

                    {/* Chapters 1 to 5 row */}
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                      {([1, 2, 3, 4, 5] as const).map((chNum) => {
                        const ch = chMap.get(chNum);
                        const isAppr = ch?.status === "approved";
                        const isRev = ch?.status === "revision_needed";
                        const isPend = ch?.status === "pending";

                        return (
                          <div
                            key={chNum}
                            className={`rounded-lg border p-3 flex flex-col justify-between gap-2 text-xs transition-colors ${
                              isAppr
                                ? "border-success/30 bg-success-soft/30"
                                : isRev
                                ? "border-warning/30 bg-warning-soft/30"
                                : isPend
                                ? "border-info/30 bg-info-soft/30"
                                : "border-border/60 bg-muted/20 opacity-70"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-foreground">
                                Ch {chNum}
                              </span>
                              {ch && (
                                <Badge variant="outline" className="font-mono text-[10px] h-4 px-1">
                                  v{ch.version}
                                </Badge>
                              )}
                            </div>

                            <div className="truncate text-muted-foreground text-[11px]">
                              {DEFAULT_CHAPTER_TITLES[chNum]?.split(":")[1]?.trim() || `Chapter ${chNum}`}
                            </div>

                            <div className="pt-1 flex items-center justify-between gap-1 border-t border-border/40">
                              {ch?.status ? (
                                <StatusBadge domain="chapter" value={ch.status} />
                              ) : (
                                <span className="text-[11px] text-muted-foreground italic">
                                  Not submitted
                                </span>
                              )}

                              {ch && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                    asChild
                                  >
                                    <a
                                      href={ch.document_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Open manuscript link"
                                    >
                                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                    </a>
                                  </Button>
                                  {ch.status === "pending" && (
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="h-6 text-[10px] px-2 py-0"
                                      onClick={() => setReviewTarget({ chapter: ch, team })}
                                    >
                                      Review
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      {reviewTarget && (
        <ChapterReviewDialog
          open={Boolean(reviewTarget)}
          onOpenChange={(open) => {
            if (!open) setReviewTarget(null);
          }}
          chapter={reviewTarget.chapter}
          team={reviewTarget.team}
        />
      )}
    </div>
  );
}
