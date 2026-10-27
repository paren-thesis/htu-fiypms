"use client";

import * as React from "react";
import {
  Lock,
  ExternalLink,
  History,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  UploadCloud,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ChapterSubmitDialog } from "./ChapterSubmitDialog";
import { ChapterHistoryModal } from "./ChapterHistoryModal";
import { ChapterFeedbackThread } from "./ChapterFeedbackThread";
import type { ChapterDocument } from "@/types/firestore";

interface ChapterTimelineCardProps {
  chapterNumber: 1 | 2 | 3 | 4 | 5;
  chapterTitle: string;
  chapter?: ChapterDocument | null;
  teamId: string;
  isLocked: boolean;
  lockReason?: string;
  isLast?: boolean;
}

export function ChapterTimelineCard({
  chapterNumber,
  chapterTitle,
  chapter,
  teamId,
  isLocked,
  lockReason,
  isLast = false,
}: ChapterTimelineCardProps) {
  const [submitDialogOpen, setSubmitDialogOpen] = React.useState(false);
  const [historyModalOpen, setHistoryModalOpen] = React.useState(false);

  const status = chapter?.status;
  const isApproved = status === "approved";
  const isRevisionNeeded = status === "revision_needed";
  const isPending = status === "pending";
  const isSubmitted = Boolean(chapter);

  const formatTimestamp = (ts?: { seconds: number; nanoseconds: number }) => {
    if (!ts || typeof ts.seconds !== "number") return null;
    return new Date(ts.seconds * 1000).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const getTimelineNode = () => {
    if (isLocked) {
      return (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground shadow-xs">
          <Lock className="h-4 w-4" aria-hidden="true" />
        </div>
      );
    }
    if (isApproved) {
      return (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-success/30 bg-success-soft text-success shadow-xs">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        </div>
      );
    }
    if (isRevisionNeeded) {
      return (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-warning/30 bg-warning-soft text-warning shadow-xs">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        </div>
      );
    }
    if (isPending) {
      return (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-info/30 bg-info-soft text-info shadow-xs">
          <Clock className="h-4 w-4" aria-hidden="true" />
        </div>
      );
    }
    // Unlocked and ready for first submission
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background text-primary font-semibold shadow-xs">
        {chapterNumber}
      </div>
    );
  };

  return (
    <div className="relative flex items-start gap-4 pb-8 last:pb-0">
      {/* Vertical connection line */}
      {!isLast && (
        <span
          className={`absolute left-5 top-10 -ml-px h-[calc(100%-2.5rem)] w-0.5 ${
            isApproved ? "bg-success/50" : "bg-border"
          }`}
          aria-hidden="true"
        />
      )}

      {/* Node circle */}
      {getTimelineNode()}

      {/* Card Content */}
      <Card
        className={`flex-1 transition-all shadow-xs ${
          isLocked
            ? "border-dashed border-border/80 bg-muted/20 opacity-80"
            : isApproved
            ? "border-success/30 bg-card"
            : isRevisionNeeded
            ? "border-warning/30 bg-card"
            : "border-border bg-card"
        }`}
      >
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-xs tracking-wider uppercase text-muted-foreground">
                  Chapter {chapterNumber}
                </span>
                {chapter && (
                  <Badge variant="outline" className="font-mono text-xs">
                    v{chapter.version}
                  </Badge>
                )}
                {isLocked ? (
                  <Badge variant="secondary" className="gap-1 text-xs font-normal">
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    Locked
                  </Badge>
                ) : status ? (
                  <StatusBadge domain="chapter" value={status} />
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground border-dashed">
                    Ready to submit
                  </Badge>
                )}
              </div>
              <h3 className="text-base font-semibold text-foreground mt-0.5">{chapterTitle}</h3>
            </div>

            {/* Top action button */}
            <div>
              {isLocked ? (
                <Button size="sm" variant="outline" disabled className="gap-1.5 opacity-60">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  Locked
                </Button>
              ) : !isSubmitted ? (
                <Button
                  size="sm"
                  onClick={() => setSubmitDialogOpen(true)}
                  className="gap-1.5"
                >
                  <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
                  Submit Draft
                </Button>
              ) : isRevisionNeeded ? (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => setSubmitDialogOpen(true)}
                  className="gap-1.5 bg-warning text-warning-foreground hover:bg-warning/90"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Resubmit Revision (v{(chapter?.version || 1) + 1})
                </Button>
              ) : isPending ? (
                <Button size="sm" variant="outline" disabled className="gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  Under Review
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled className="gap-1.5 text-success border-success/30">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Approved
                </Button>
              )}
            </div>
          </div>

          {/* Locked state description */}
          {isLocked && (
            <div className="pt-3 text-xs text-muted-foreground leading-relaxed flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" aria-hidden="true" />
              <span>
                {lockReason ||
                  `Unlocks automatically once Chapter ${chapterNumber - 1} is approved by your project supervisor.`}
              </span>
            </div>
          )}

          {/* Active submission metadata */}
          {!isLocked && isSubmitted && chapter && (
            <div className="pt-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center gap-3">
                  {chapter.submitted_at && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Submitted: {formatTimestamp(chapter.submitted_at)}
                    </span>
                  )}
                  {chapter.reviewed_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Reviewed: {formatTimestamp(chapter.reviewed_at)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {chapter.history && chapter.history.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setHistoryModalOpen(true)}
                      className="h-7 text-xs gap-1 px-2 text-muted-foreground hover:text-foreground"
                    >
                      <History className="h-3.5 w-3.5" aria-hidden="true" />
                      History ({chapter.history.length})
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 px-2.5"
                    asChild
                  >
                    <a
                      href={chapter.document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open shared manuscript document"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      Open Document
                    </a>
                  </Button>
                </div>
              </div>

              {/* Feedback thread from supervisor */}
              <ChapterFeedbackThread
                feedback={chapter.feedback || []}
              />
            </div>
          )}

          {/* Unlocked but not yet submitted state */}
          {!isLocked && !isSubmitted && (
            <div className="pt-3 text-xs text-muted-foreground">
              Provide a shared external link to your manuscript draft on Google Drive or OneDrive to begin supervisor review.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit / Resubmit modal */}
      {!isLocked && (
        <ChapterSubmitDialog
          open={submitDialogOpen}
          onOpenChange={setSubmitDialogOpen}
          teamId={teamId}
          chapterNumber={chapterNumber}
          chapterTitle={chapterTitle}
          isResubmission={isRevisionNeeded}
          currentVersion={chapter?.version || 1}
          isLocked={isLocked}
        />
      )}

      {/* Version history modal */}
      {chapter && chapter.history && chapter.history.length > 0 && (
        <ChapterHistoryModal
          open={historyModalOpen}
          onOpenChange={setHistoryModalOpen}
          chapterNumber={chapterNumber}
          chapterTitle={chapterTitle}
          history={chapter.history}
        />
      )}
    </div>
  );
}
