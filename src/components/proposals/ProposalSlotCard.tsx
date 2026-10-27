"use client";

import * as React from "react";
import {
  Plus,
  History,
  Send,
  Edit2,
  FileText,
  CheckCircle2,
  Lock,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { submitTopic } from "@/app/actions/submit-topic";
import type { TopicDocument, TeamDocument } from "@/types/firestore";
import type { SimilarTopicWarning } from "@/lib/topics/similar";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ProposalSlotCardProps {
  rank: 1 | 2 | 3;
  topic?: TopicDocument | null;
  team: TeamDocument;
  isLeader: boolean;
  onOpenCreate: (rank: 1 | 2 | 3) => void;
  onOpenEdit: (topic: TopicDocument) => void;
  onOpenResubmit: (topic: TopicDocument) => void;
  onOpenHistory: (topic: TopicDocument) => void;
  onSubmissionSuccess?: (topicId: string, warnings?: SimilarTopicWarning[]) => void;
}

const RANK_LABELS: Record<1 | 2 | 3, string> = {
  1: "Primary Proposal (Rank 1)",
  2: "Secondary Proposal (Rank 2)",
  3: "Tertiary Proposal (Rank 3)",
};

export function ProposalSlotCard({
  rank,
  topic,
  team,
  isLeader,
  onOpenCreate,
  onOpenEdit,
  onOpenResubmit,
  onOpenHistory,
  onSubmissionSuccess,
}: ProposalSlotCardProps) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = React.useState(false);

  const hasMinMembers = team.member_count >= 4;

  const handleSubmit = async () => {
    if (!topic || !user) return;
    if (!hasMinMembers) {
      toast.error("Teams must have at least 4 members to submit project proposals.");
      return;
    }

    setSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      const res = await submitTopic(idToken, { topicId: topic.id });

      if (!res.ok) {
        toast.error(res.error || "Failed to submit proposal");
        return;
      }

      toast.success(`Proposal "${topic.title}" submitted to faculty!`);
      if (onSubmissionSuccess) {
        onSubmissionSuccess(topic.id, res.warnings);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  // 1. Empty Rank Slot
  if (!topic) {
    return (
      <Card className="rounded-xl border border-dashed border-border bg-card/60 shadow-xs flex flex-col justify-between hover:border-primary/40 transition-colors">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs font-mono">
              Rank {rank}
            </Badge>
            <span className="text-[11px] text-muted-foreground">Unassigned Slot</span>
          </div>
          <CardTitle className="text-base font-semibold text-muted-foreground/80 mt-2">
            {RANK_LABELS[rank]}
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            No proposal drafted for this preference tier yet.
          </CardDescription>
        </CardHeader>

        <CardContent className="py-6 text-center">
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-xs text-muted-foreground max-w-xs">
              Every group must submit up to three ranked proposals for departmental review.
            </p>
          </div>
        </CardContent>

        <CardFooter className="pt-2 border-t border-border/50">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenCreate(rank)}
            className="w-full gap-2 text-xs font-medium hover:bg-primary/5 hover:text-primary hover:border-primary/30"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Draft Proposal (Rank {rank})</span>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // 2. Populated Rank Slot
  const isDraft = topic.status === "draft";
  const isRevisionRequested = topic.status === "revision_requested";
  const isRejected = topic.status === "rejected";
  const isApproved = topic.status === "approved";
  const isSubmittedOrReview = topic.status === "submitted" || topic.status === "under_review";

  return (
    <Card className="rounded-xl border bg-card shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
      <CardHeader className="pb-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                rank === 1
                  ? "border-primary/40 bg-primary/10 text-primary font-bold text-xs"
                  : "text-xs font-medium"
              }
            >
              Rank {rank} {rank === 1 ? "(Primary)" : rank === 2 ? "(Secondary)" : "(Tertiary)"}
            </Badge>
            <Badge variant="secondary" className="text-[11px] font-mono">
              v{topic.version}
            </Badge>
          </div>
          <StatusBadge domain="topic" value={topic.status} />
        </div>

        <CardTitle className="text-base font-bold text-foreground line-clamp-2 pt-1">
          {topic.title}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Abstract excerpt */}
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
          {topic.abstract}
        </p>

        {/* Reviewer feedback banner if revision requested or rejected */}
        {topic.review_notes && (
          <div
            className={`rounded-lg p-3 text-xs border space-y-1 ${
              isRevisionRequested
                ? "bg-warning-soft border-warning/30 text-warning"
                : isRejected
                ? "bg-danger-soft border-danger/30 text-danger"
                : "bg-muted border-border text-muted-foreground"
            }`}
          >
            <div className="flex items-center gap-1.5 font-semibold text-[11px]">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reviewer Feedback</span>
            </div>
            <p className="text-[11px] leading-normal">{topic.review_notes}</p>
          </div>
        )}

        {/* Tech stack chips */}
        <div className="flex flex-wrap gap-1 pt-1">
          {topic.tech_stack?.slice(0, 5).map((tech) => (
            <Badge
              key={tech}
              variant="outline"
              className="text-[10px] py-0 px-1.5 font-mono text-muted-foreground bg-muted/40"
            >
              {tech}
            </Badge>
          ))}
          {topic.tech_stack && topic.tech_stack.length > 5 && (
            <span className="text-[10px] text-muted-foreground self-center">
              +{topic.tech_stack.length - 5} more
            </span>
          )}
        </div>
      </CardContent>

      <CardFooter className="pt-3 border-t border-border flex flex-col gap-2">
        {/* Row 1: History view button + edit button */}
        <div className="flex w-full items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenHistory(topic)}
            className="text-xs h-8 text-muted-foreground hover:text-foreground gap-1.5 px-2"
          >
            <History className="h-3.5 w-3.5" />
            <span>History (v{topic.version})</span>
          </Button>

          {isDraft && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenEdit(topic)}
              className="text-xs h-8 gap-1.5"
            >
              <Edit2 className="h-3.5 w-3.5" />
              <span>Edit Draft</span>
            </Button>
          )}
        </div>

        {/* Row 2: Action button based on state & leadership */}
        {isDraft && (
          <div className="w-full">
            {isLeader ? (
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={submitting || !hasMinMembers}
                className="w-full h-8 text-xs font-medium gap-1.5"
                title={!hasMinMembers ? "Team needs at least 4 members to submit proposals" : undefined}
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : !hasMinMembers ? (
                  <Lock className="h-3.5 w-3.5" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                <span>Submit to Faculty</span>
              </Button>
            ) : (
              <div className="w-full rounded bg-muted/60 p-1.5 text-center text-[11px] text-muted-foreground">
                Drafting Mode · Only Team Leader can submit to faculty
              </div>
            )}
          </div>
        )}

        {(isRevisionRequested || isRejected) && (
          <div className="w-full">
            {isLeader ? (
              <Button
                size="sm"
                onClick={() => onOpenResubmit(topic)}
                className="w-full h-8 text-xs font-medium gap-1.5 bg-warning text-warning-foreground hover:bg-warning/90"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Resubmit Revision</span>
              </Button>
            ) : (
              <div className="w-full rounded bg-warning-soft p-1.5 text-center text-[11px] text-warning">
                Revision Required · Awaiting Team Leader resubmission
              </div>
            )}
          </div>
        )}

        {isSubmittedOrReview && (
          <div className="w-full rounded bg-info-soft p-1.5 text-center text-[11px] text-info font-medium">
            Proposal Submitted · Under Faculty Review
          </div>
        )}

        {isApproved && (
          <div className="w-full rounded bg-success-soft p-1.5 text-center text-[11px] text-success font-semibold flex items-center justify-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Approved Capstone Project</span>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
