"use client";

import * as React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
  MessageSquare,
  FileCheck2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { reviewChapter } from "@/app/actions/review-chapter";
import { useAuth } from "@/context/AuthContext";
import type { ChapterDocument, TeamDocument } from "@/types/firestore";

interface ChapterReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapter: ChapterDocument;
  team: TeamDocument;
  onSuccess?: () => void;
}

interface FeedbackItemDraft {
  id: string;
  content: string;
}

export function ChapterReviewDialog({
  open,
  onOpenChange,
  chapter,
  team,
  onSuccess,
}: ChapterReviewDialogProps) {
  const { user } = useAuth();
  const [decision, setDecision] = React.useState<"approved" | "revision_needed">("approved");
  const [reviewNotes, setReviewNotes] = React.useState("");
  const [feedbackItems, setFeedbackItems] = React.useState<FeedbackItemDraft[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setDecision("approved");
      setReviewNotes("");
      setFeedbackItems([]);
      setSubmitting(false);
    }
    onOpenChange(newOpen);
  };

  const handleAddFeedbackItem = () => {
    setFeedbackItems((prev) => [
      ...prev,
      { id: `draft-${Date.now()}-${prev.length}`, content: "" },
    ]);
  };

  const handleFeedbackChange = (id: string, value: string) => {
    setFeedbackItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, content: value } : item))
    );
  };

  const handleRemoveFeedbackItem = (id: string) => {
    setFeedbackItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("You must be signed in to submit a review.");
      return;
    }

    // Clean feedback items
    const validFeedback = feedbackItems
      .map((item) => ({ content: item.content.trim() }))
      .filter((item) => item.content.length > 0);

    // If revision needed, ensure supervisor provides feedback or notes
    if (decision === "revision_needed" && validFeedback.length === 0 && !reviewNotes.trim()) {
      toast.error("Please provide at least one feedback point or review note explaining the requested revisions.");
      return;
    }

    setSubmitting(true);

    try {
      const idToken = await user.getIdToken();
      const res = await reviewChapter(idToken, {
        team_id: team.id,
        chapter_number: chapter.chapter_number,
        decision,
        feedback: validFeedback,
        review_notes: reviewNotes.trim() || undefined,
      });

      if (!res.ok) {
        toast.error(res.error || "Failed to record chapter review decision.");
        return;
      }

      toast.success(
        decision === "approved"
          ? `Chapter ${chapter.chapter_number} approved successfully!`
          : `Revision request sent for Chapter ${chapter.chapter_number}.`
      );

      if (res.teamStatus === "defense_ready") {
        toast.info("Chapter 5 approved: Team status automatically updated to Defense Ready!");
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unexpected error during review.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileCheck2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  Review Chapter {chapter.chapter_number} Manuscript
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {chapter.title} · {team.group_number} ({team.name})
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Submission Info Banner */}
          <div className="rounded-lg border border-border bg-muted/30 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="font-mono text-xs">
                v{chapter.version}
              </Badge>
              <span className="text-muted-foreground font-mono truncate max-w-xs sm:max-w-md">
                {chapter.document_url}
              </span>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs shrink-0 self-start sm:self-auto"
              asChild
            >
              <a
                href={chapter.document_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Open manuscript link in a new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Open Document Link
              </a>
            </Button>
          </div>

          {/* Decision Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
              Evaluation Decision <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDecision("approved")}
                className={`flex items-center gap-3 rounded-lg border p-3.5 text-left transition-all ${
                  decision === "approved"
                    ? "border-success bg-success-soft/60 text-success font-medium ring-2 ring-success/20"
                    : "border-border bg-card hover:bg-muted/30 text-foreground"
                }`}
              >
                <CheckCircle2
                  className={`h-5 w-5 shrink-0 ${
                    decision === "approved" ? "text-success" : "text-muted-foreground"
                  }`}
                  aria-hidden="true"
                />
                <div>
                  <div className="text-sm font-semibold text-foreground">Approve Chapter</div>
                  <div className="text-xs text-muted-foreground">
                    {chapter.chapter_number === 5
                      ? "Unlocks oral defense milestone (defense ready)"
                      : `Unlocks Chapter ${chapter.chapter_number + 1} for team submission`}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDecision("revision_needed")}
                className={`flex items-center gap-3 rounded-lg border p-3.5 text-left transition-all ${
                  decision === "revision_needed"
                    ? "border-warning bg-warning-soft/60 text-warning font-medium ring-2 ring-warning/20"
                    : "border-border bg-card hover:bg-muted/30 text-foreground"
                }`}
              >
                <AlertTriangle
                  className={`h-5 w-5 shrink-0 ${
                    decision === "revision_needed" ? "text-warning" : "text-muted-foreground"
                  }`}
                  aria-hidden="true"
                />
                <div>
                  <div className="text-sm font-semibold text-foreground">Request Revision</div>
                  <div className="text-xs text-muted-foreground">
                    Requires team to revise manuscript and resubmit a new version
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* General Notes */}
          <div className="space-y-2">
            <Label htmlFor="review-notes" className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
              General Review Summary / Notes
            </Label>
            <Textarea
              id="review-notes"
              placeholder={
                decision === "approved"
                  ? "Optional: praise, next-step recommendations, or defense pointers..."
                  : "Detail what needs to be revised before approval..."
              }
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={3}
              className="text-sm resize-none"
              disabled={submitting}
            />
          </div>

          {/* Line-Item Feedback Composer */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Line-Item Feedback Points ({feedbackItems.length})
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddFeedbackItem}
                className="h-7 text-xs gap-1"
                disabled={submitting}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add Item
              </Button>
            </div>

            {feedbackItems.length === 0 ? (
              <p className="text-xs text-muted-foreground italic bg-muted/20 border border-dashed border-border rounded-lg p-3 text-center">
                No specific line items added. Click &quot;Add Item&quot; to specify section-by-section action items.
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {feedbackItems.map((item, idx) => (
                  <div key={item.id} className="flex items-start gap-2">
                    <span className="text-xs font-mono text-muted-foreground mt-2 shrink-0">
                      #{idx + 1}
                    </span>
                    <Input
                      placeholder={`e.g. Expand section ${chapter.chapter_number}.${idx + 1} with references...`}
                      value={item.content}
                      onChange={(e) => handleFeedbackChange(item.id, e.target.value)}
                      className="text-sm"
                      disabled={submitting}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveFeedbackItem(item.id)}
                      className="h-9 w-9 text-muted-foreground hover:text-destructive shrink-0"
                      disabled={submitting}
                      title="Remove feedback point"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className={`gap-1.5 ${
                decision === "approved"
                  ? "bg-primary text-primary-foreground"
                  : "bg-warning text-warning-foreground hover:bg-warning/90"
              }`}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {decision === "approved"
                ? `Confirm Approval (Chapter ${chapter.chapter_number})`
                : `Submit Revision Request (Chapter ${chapter.chapter_number})`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
