"use client";

import * as React from "react";
import { Loader2, AlertCircle, Send, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { submitGradeAppeal } from "@/app/actions/submit-grade-appeal";
import type { TeamDocument } from "@/types/firestore";
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

interface SubmitAppealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: TeamDocument;
  onSuccess?: () => void;
}

export function SubmitAppealDialog({
  open,
  onOpenChange,
  team,
  onSuccess,
}: SubmitAppealDialogProps) {
  const { user } = useAuth();
  const [reason, setReason] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const trimmed = reason.trim();
  const isValidLength = trimmed.length >= 20 && trimmed.length <= 2000;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !team) return;

    if (!isValidLength) {
      setErrorMsg("Appeal reason must be between 20 and 2,000 characters in length.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const token = await user.getIdToken();
      const res = await submitGradeAppeal(token, {
        team_id: team.id,
        reason: trimmed,
      });

      if (!res.ok) {
        throw new Error(res.error || "Failed to submit grade appeal");
      }

      toast.success("Grade appeal submitted successfully. Coordinators have been notified.");
      onOpenChange(false);
      setReason("");
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Submission failed";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <HelpCircle className="h-5 w-5 text-blue-700" />
            <DialogTitle className="text-base font-bold text-foreground">
              Submit Academic Grade Appeal
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Formal grade inquiry for project team{" "}
            <span className="font-semibold text-foreground">
              {team.name} ({team.group_number})
            </span>
            . Appeals are formally investigated by the Departmental Board.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {errorMsg && (
            <Alert variant="destructive" className="py-2.5">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs font-medium">
                {errorMsg}
              </AlertDescription>
            </Alert>
          )}

          <div className="p-3 bg-muted/40 rounded-lg border text-xs space-y-1">
            <p className="font-semibold text-foreground">Appeal Policy & Guidelines:</p>
            <ul className="list-disc pl-4 text-muted-foreground space-y-0.5 text-[11px]">
              <li>You may only submit one appeal per final project capstone.</li>
              <li>Detail specific errors in arithmetic, rubric application, or missing supervisor notes.</li>
              <li>Any accepted modification is applied to the official broadsheet and permanent audit log.</li>
            </ul>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="appeal-reason" className="font-semibold text-foreground">
                Detailed Grounds for Appeal *
              </label>
              <span
                className={`text-[11px] font-mono ${
                  isValidLength
                    ? "text-emerald-700 font-semibold"
                    : trimmed.length > 2000
                    ? "text-destructive font-semibold"
                    : "text-amber-700"
                }`}
              >
                {trimmed.length}/20 min (max 2000)
              </span>
            </div>
            <Textarea
              id="appeal-reason"
              rows={5}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Detail clearly the specific mathematical discrepancy, rubric mismatch, or documented supervisor assessment issue..."
              className="text-xs resize-none"
              required
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="min-h-[44px] text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !isValidLength}
              className="min-h-[44px] text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Send className="h-4 w-4 mr-1.5" />
              )}
              Submit Formal Appeal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
