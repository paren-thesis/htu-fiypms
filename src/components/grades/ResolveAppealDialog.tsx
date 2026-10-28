"use client";

import * as React from "react";
import { Loader2, AlertCircle, CheckCircle2, ShieldCheck, Edit3 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { resolveGradeAppeal } from "@/app/actions/resolve-grade-appeal";
import type { GradeAppealDocument, TeamDocument } from "@/types/firestore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ResolveAppealDialogProps {
  appeal: GradeAppealDocument | null;
  team: TeamDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  onOpenAmend?: (team: TeamDocument) => void;
}

interface ResolveAppealFormProps {
  appeal: GradeAppealDocument;
  team: TeamDocument | null;
  onClose: () => void;
  onSuccess?: () => void;
  onOpenAmend?: (team: TeamDocument) => void;
}

function ResolveAppealForm({
  appeal,
  team,
  onClose,
  onSuccess,
  onOpenAmend,
}: ResolveAppealFormProps) {
  const { user } = useAuth();
  const [status, setStatus] = React.useState<"under_review" | "resolved" | "rejected">(
    appeal.status === "submitted" ? "under_review" : (appeal.status as "under_review" | "resolved" | "rejected")
  );
  const [resolutionNotes, setResolutionNotes] = React.useState<string>(
    appeal.resolution_notes || ""
  );
  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!resolutionNotes.trim()) {
      setErrorMsg("Administrative resolution notes are required.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const token = await user.getIdToken();
      const res = await resolveGradeAppeal(token, {
        appeal_id: appeal.id,
        status,
        resolution_notes: resolutionNotes.trim(),
      });

      if (!res.ok) {
        throw new Error(res.error || "Failed to update grade appeal");
      }

      toast.success(`Appeal status updated to "${status}". Student has been notified.`);
      onClose();
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Resolution failed";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      {errorMsg && (
        <Alert variant="destructive" className="py-2.5">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs font-medium">
            {errorMsg}
          </AlertDescription>
        </Alert>
      )}

      {/* Appeal Details Card */}
      <div className="p-3 bg-muted/40 rounded-lg border text-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground font-medium">Student UID:</span>
          <span className="font-mono font-semibold text-foreground">{appeal.student_id}</span>
        </div>
        {team && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground font-medium">Current Final Mark:</span>
            <span className="font-mono font-bold text-primary">
              {team.scores_summary?.composite_final_score !== undefined
                ? `${team.scores_summary.composite_final_score} / 100`
                : "N/A"}
            </span>
          </div>
        )}
        <div className="space-y-1 pt-1 border-t">
          <span className="text-muted-foreground font-medium block">Grounds Submitted:</span>
          <p className="bg-background p-2.5 rounded border text-foreground text-xs whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
            {appeal.reason}
          </p>
        </div>
      </div>

      {/* Target Status */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground">
          Updated Status *
        </label>
        <Select
          value={status}
          onValueChange={(val) => setStatus(val as "under_review" | "resolved" | "rejected")}
        >
          <SelectTrigger className="w-full text-xs min-h-[44px]">
            <SelectValue placeholder="Select outcome status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="under_review" className="text-xs">
              Under Review (Investigation in progress)
            </SelectItem>
            <SelectItem value="resolved" className="text-xs">
              Resolved (Appeal accepted or clarified)
            </SelectItem>
            <SelectItem value="rejected" className="text-xs">
              Rejected (Appeal dismissed after board review)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Resolution Notes */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground">
            Administrative Resolution Notes *
          </label>
          <span className="text-[11px] text-muted-foreground">
            Sent to student & logged in audit
          </span>
        </div>
        <Textarea
          rows={4}
          value={resolutionNotes}
          onChange={(e) => setResolutionNotes(e.target.value)}
          placeholder="Document the Board findings, rubric review outcome, or explanation provided to the student..."
          className="text-xs resize-none"
          required
        />
      </div>

      {/* Notice regarding actual score modification */}
      <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-start gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
        <div className="flex-1">
          <span>
            Resolving an appeal does not alter team scores automatically. Any official score modification must be processed via the Amend Grade dialog.
          </span>
          {team && onOpenAmend && (
            <div className="mt-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenAmend(team);
                }}
                className="h-7 text-[11px] font-semibold text-amber-900 border-amber-300 hover:bg-amber-100"
              >
                <Edit3 className="h-3 w-3 mr-1" />
                Amend Team Grade Now
              </Button>
            </div>
          )}
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-0 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={submitting}
          className="min-h-[44px] text-xs"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={submitting || !resolutionNotes.trim()}
          className="min-h-[44px] text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
          )}
          Save Resolution
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ResolveAppealDialog({
  appeal,
  team,
  open,
  onOpenChange,
  onSuccess,
  onOpenAmend,
}: ResolveAppealDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <DialogTitle className="text-base font-bold text-foreground">
              Review Grade Appeal
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Formal board resolution for team{" "}
            <span className="font-semibold text-foreground">
              {team?.name || "Team"} ({team?.group_number || "Group"})
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        {appeal && open && (
          <ResolveAppealForm
            key={appeal.id}
            appeal={appeal}
            team={team}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
            onOpenAmend={onOpenAmend}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
