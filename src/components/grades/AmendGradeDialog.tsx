"use client";

import * as React from "react";
import { Loader2, AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { amendGrade } from "@/app/actions/amend-grade";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AmendGradeDialogProps {
  team: TeamDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface AmendGradeFormProps {
  team: TeamDocument;
  onClose: () => void;
  onSuccess?: () => void;
}

function AmendGradeForm({ team, onClose, onSuccess }: AmendGradeFormProps) {
  const { user } = useAuth();
  const summary = team.scores_summary;

  const [supervisorScore, setSupervisorScore] = React.useState<string>(
    summary?.supervisor_score !== undefined ? String(summary.supervisor_score) : ""
  );
  const [panelScore, setPanelScore] = React.useState<string>(
    summary?.panel_average_score !== undefined ? String(summary.panel_average_score) : ""
  );
  const [compositeScore, setCompositeScore] = React.useState<string>(
    summary?.composite_final_score !== undefined ? String(summary.composite_final_score) : ""
  );
  const [justification, setJustification] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Auto-calculate composite when supervisor or panel score changes
  const handleSupervisorChange = (val: string) => {
    setSupervisorScore(val);
    const sup = parseFloat(val);
    const pan = parseFloat(panelScore);
    if (!isNaN(sup) && !isNaN(pan)) {
      const comp = Number((sup * 0.4 + pan * 0.6).toFixed(2));
      setCompositeScore(comp.toString());
    }
  };

  const handlePanelChange = (val: string) => {
    setPanelScore(val);
    const sup = parseFloat(supervisorScore);
    const pan = parseFloat(val);
    if (!isNaN(sup) && !isNaN(pan)) {
      const comp = Number((sup * 0.4 + pan * 0.6).toFixed(2));
      setCompositeScore(comp.toString());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !team) return;

    setErrorMsg(null);

    const sup = parseFloat(supervisorScore);
    const pan = parseFloat(panelScore);
    const comp = parseFloat(compositeScore);

    if (isNaN(sup) || sup < 0 || sup > 100) {
      setErrorMsg("Supervisor score must be a number between 0 and 100.");
      return;
    }

    if (isNaN(pan) || pan < 0 || pan > 100) {
      setErrorMsg("Panel average score must be a number between 0 and 100.");
      return;
    }

    if (isNaN(comp) || comp < 0 || comp > 100) {
      setErrorMsg("Composite final score must be a number between 0 and 100.");
      return;
    }

    if (justification.trim().length < 20) {
      setErrorMsg("Formal justification must be at least 20 characters in length.");
      return;
    }

    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await amendGrade(token, {
        team_id: team.id,
        supervisor_score: sup,
        panel_average_score: pan,
        composite_final_score: comp,
        justification: justification.trim(),
      });

      if (!res.ok) {
        throw new Error(res.error || "Failed to record grade amendment");
      }

      toast.success(`Grades amended successfully for team ${team.group_number || team.name}`);
      onClose();
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Amendment failed";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const charsCount = justification.trim().length;
  const isJustificationValid = charsCount >= 20;

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

      {/* Current Score Pill */}
      <div className="p-3 rounded-lg bg-muted/50 border flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium">Recorded Score:</span>
        <span className="font-bold font-mono text-foreground">
          {team.scores_summary?.composite_final_score !== undefined
            ? `${team.scores_summary.composite_final_score} / 100`
            : "Not recorded"}
        </span>
      </div>

      {/* Score Inputs Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-foreground">
            Supervisor Score (40%) *
          </label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            required
            value={supervisorScore}
            onChange={(e) => handleSupervisorChange(e.target.value)}
            placeholder="0.00"
            className="text-xs font-mono min-h-[44px]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-foreground">
            Panel Average (60%) *
          </label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            required
            value={panelScore}
            onChange={(e) => handlePanelChange(e.target.value)}
            placeholder="0.00"
            className="text-xs font-mono min-h-[44px]"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-foreground flex items-center justify-between">
          <span>Amended Composite Score (100%) *</span>
          <span className="text-[11px] font-normal text-muted-foreground">
            Formula: Sup × 0.4 + Panel × 0.6
          </span>
        </label>
        <Input
          type="number"
          step="0.01"
          min="0"
          max="100"
          required
          value={compositeScore}
          onChange={(e) => setCompositeScore(e.target.value)}
          placeholder="0.00"
          className="text-xs font-mono font-bold min-h-[44px] bg-muted/20"
        />
      </div>

      {/* Formal Justification */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground">
            Written Justification (Audit Log) *
          </label>
          <span
            className={`text-[11px] font-mono ${
              isJustificationValid ? "text-emerald-700" : "text-amber-600"
            }`}
          >
            {charsCount}/20 min
          </span>
        </div>
        <Textarea
          rows={3}
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder="Provide a detailed administrative reason for this grade amendment (e.g. Approved Academic Board recalculation petition)..."
          className="text-xs resize-none"
          required
        />
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
          disabled={submitting || !isJustificationValid}
          className="min-h-[44px] text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
          )}
          Confirm Amendment
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AmendGradeDialog({
  team,
  open,
  onOpenChange,
  onSuccess,
}: AmendGradeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            <DialogTitle className="text-base font-bold">
              Amend Published Grade
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Official post-publication amendment for{" "}
            <span className="font-semibold text-foreground">
              {team?.name} ({team?.group_number})
            </span>
            . All modifications are permanently recorded in the department audit log.
          </DialogDescription>
        </DialogHeader>

        {team && open && (
          <AmendGradeForm
            key={team.id}
            team={team}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
