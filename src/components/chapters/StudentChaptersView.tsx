"use client";

import * as React from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import {
  BookOpen,
  Users,
  CheckCircle2,
  ArrowRight,
  ShieldAlert,
  GraduationCap,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/client";
import { DEFAULT_CHAPTER_TITLES } from "@/lib/models/chapter/schema";
import { ChapterTimelineCard } from "./ChapterTimelineCard";
import { EmptyState } from "@/components/common/EmptyState";
import { LockedCard } from "@/components/common/LockedCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TeamDocument, ChapterDocument } from "@/types/firestore";

export function StudentChaptersView() {
  const { user } = useAuth();
  const [team, setTeam] = React.useState<TeamDocument | null>(null);
  const [teamLoading, setTeamLoading] = React.useState(true);
  const [chapters, setChapters] = React.useState<ChapterDocument[]>([]);
  const [listenerError, setListenerError] = React.useState<string | null>(null);

  // 1. Subscribe to active team
  React.useEffect(() => {
    if (!user) {
      return;
    }

    const teamsQuery = query(
      collection(db, "teams"),
      where("member_ids", "array-contains", user.uid)
    );

    const unsubscribe = onSnapshot(
      teamsQuery,
      (snapshot) => {
        const active = snapshot.docs
          .map((d) => d.data() as TeamDocument)
          .filter((t) => t.status !== "disbanded");

        setTeam(active.length > 0 && active[0] ? active[0] : null);
        setTeamLoading(false);
      },
      (error) => {
        console.error("Firestore error subscribing to student team:", error);
        setListenerError("Failed to synchronize your team information.");
        setTeamLoading(false);
      }
    );

    return () => {
      unsubscribe();
      setTeam(null);
    };
  }, [user]);

  // 2. Subscribe to team chapters
  React.useEffect(() => {
    if (!team) {
      return;
    }

    const chaptersQuery = query(
      collection(db, "chapters"),
      where("team_id", "==", team.id)
    );

    const unsubscribe = onSnapshot(
      chaptersQuery,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => d.data() as ChapterDocument);
        setChapters(docs);
      },
      (error) => {
        console.error("Firestore error subscribing to team chapters:", error);
        setListenerError("Failed to synchronize chapter documents.");
      }
    );

    return () => {
      unsubscribe();
      setChapters([]);
    };
  }, [team]);

  // Loading Skeleton
  if (teamLoading) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
          <Skeleton className="h-5 w-40 mb-2" />
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-2.5 w-full rounded-full" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <Skeleton className="h-32 flex-1 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error State
  if (listenerError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
        <ShieldAlert className="h-8 w-8 mx-auto mb-2 text-destructive" aria-hidden="true" />
        <p className="font-semibold">{listenerError}</p>
        <p className="text-xs text-muted-foreground mt-1">
          Please check your network connection or reload the page.
        </p>
      </div>
    );
  }

  // 1. No Team
  if (!team) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="No Project Team Found"
        description="You must be part of an active capstone team before submitting project chapters."
        action={
          <Button size="sm" asChild>
            <Link href="/my-team" className="gap-1.5">
              Go to My Team
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        }
      />
    );
  }

  // 2. Check Prerequisites: Topic Approved & Supervisor Accepted
  const hasSupervisorAccepted =
    Boolean(team.assigned_supervisor_id) &&
    team.supervisor_assignment?.status === "accepted";
  const hasApprovedTopic = Boolean(team.approved_topic_id);

  if (!hasApprovedTopic || !hasSupervisorAccepted) {
    let reason = "Chapter submissions unlock sequentially once your project supervisor is assigned and accepted, and your topic proposal is approved.";
    if (!hasApprovedTopic && !hasSupervisorAccepted) {
      reason = "Your team requires both an approved topic proposal and an assigned project supervisor before manuscript submissions can begin.";
    } else if (!hasApprovedTopic) {
      reason = "Your team's topic proposal is currently pending departmental review. Chapters unlock once a topic is formally approved.";
    } else {
      reason = "Your project supervisor assignment is currently pending response or allocation. Chapters unlock once supervisor status is accepted.";
    }

    return (
      <div className="space-y-6">
        <LockedCard
          title="Milestone Chapters Locked"
          message={reason}
        >
          <div className="flex flex-wrap gap-2 justify-center">
            {!hasApprovedTopic && (
              <Button size="sm" variant="outline" asChild>
                <Link href="/proposals" className="gap-1.5">
                  View Proposals
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Button>
            )}
            {!hasSupervisorAccepted && (
              <Button size="sm" variant="outline" asChild>
                <Link href="/supervision" className="gap-1.5">
                  View Supervision
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Button>
            )}
          </div>
        </LockedCard>
      </div>
    );
  }

  // 3. Compute Chapter Progression
  const chaptersByNumber = new Map<number, ChapterDocument>();
  for (const ch of chapters) {
    chaptersByNumber.set(ch.chapter_number, ch);
  }

  const approvedCount = chapters.filter((c) => c.status === "approved").length;
  const progressPct = Math.round((approvedCount / 5) * 100);
  const isAllApproved = approvedCount === 5;

  return (
    <div className="space-y-6">
      {/* Progress Overview Header */}
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-medium text-muted-foreground uppercase">
                {team.group_number}
              </span>
              <StatusBadge domain="team" value={team.status} />
              {isAllApproved && (
                <Badge className="bg-success text-success-foreground gap-1 text-xs">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  All Chapters Approved
                </Badge>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-foreground">{team.name}</h2>
          </div>

          <div className="flex items-center gap-3 bg-muted/40 rounded-lg p-3 sm:px-4 sm:py-2.5 border border-border/50">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Milestone Progress</p>
              <p className="text-lg font-bold text-foreground tabular-nums">
                {approvedCount} <span className="text-xs text-muted-foreground font-normal">/ 5 approved</span>
              </p>
            </div>
            <div className="h-8 w-px bg-border/80" />
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
              {progressPct}%
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Sequential Chapter Completion</span>
            <span className="font-mono">{approvedCount} of 5</span>
          </div>
          <Progress value={progressPct} className="h-2" />
        </div>

        {isAllApproved && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-success/30 bg-success-soft p-3 text-xs text-success">
            <GraduationCap className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Congratulations! All 5 manuscript chapters have been approved. Your capstone project is now{" "}
              <strong>Defense Ready</strong>.
            </span>
          </div>
        )}
      </div>

      {/* Chapters 1 to 5 Vertical Timeline */}
      <div className="space-y-2">
        <div className="flex items-center justify-between pb-2">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
            Milestone Timeline
          </h3>
          <span className="text-xs text-muted-foreground">
            Chapters unlock sequentially
          </span>
        </div>

        <div className="pt-2">
          {([1, 2, 3, 4, 5] as const).map((chNum, idx) => {
            const chDoc = chaptersByNumber.get(chNum);
            const title =
              chDoc?.title ||
              DEFAULT_CHAPTER_TITLES[chNum] ||
              `Chapter ${chNum}`;

            // Sequential unlock rule:
            // Chapter 1 is always unlocked once prerequisites are satisfied.
            // Chapter n requires chapter n-1 to be approved.
            let isLocked = false;
            let lockReason = "";

            if (chNum > 1) {
              const prevChapter = chaptersByNumber.get(chNum - 1);
              if (!prevChapter || prevChapter.status !== "approved") {
                isLocked = true;
                lockReason = `Locked until Chapter ${chNum - 1} is approved by your project supervisor.`;
              }
            }

            return (
              <ChapterTimelineCard
                key={chNum}
                chapterNumber={chNum}
                chapterTitle={title}
                chapter={chDoc}
                teamId={team.id}
                isLocked={isLocked}
                lockReason={lockReason}
                isLast={idx === 4}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
