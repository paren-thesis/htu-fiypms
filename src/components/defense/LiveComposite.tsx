"use client";

import * as React from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { CheckCircle2, Clock, Award, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import { compositeScore, computeTotal } from "@/lib/defense/scoring";
import { concludeDefenseSlot } from "@/app/actions/conclude-defense-slot";
import type {
  EvaluationDocument,
  RubricDocument,
  DefensePanelDocument,
  DefenseTimeSlot,
  TeamDocument,
} from "@/types/firestore";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface LiveCompositeProps {
  panel: DefensePanelDocument;
  slot: DefenseTimeSlot;
  team: TeamDocument;
  rubric: RubricDocument;
  currentUserId?: string;
  isChair: boolean;
  isCoordinator: boolean;
  userMap?: Record<string, string>; // uid -> display name
  onSlotConcluded?: () => void;
}

export function LiveComposite({
  panel,
  slot,
  team,
  rubric,
  isChair,
  isCoordinator,
  userMap = {},
  onSlotConcluded,
}: LiveCompositeProps) {
  const [evaluations, setEvaluations] = React.useState<EvaluationDocument[]>([]);
  const [concluding, setConcluding] = React.useState<boolean>(false);

  // 1. Listen to all evaluations for this team in real-time
  React.useEffect(() => {
    if (!team?.id) return;

    const q = query(collection(db, "evaluations"), where("team_id", "==", team.id));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<EvaluationDocument, "id">) } as EvaluationDocument)
        );
        setEvaluations(docs);
      },
      (error) => {
        console.error("Failed to stream evaluations:", error);
      }
    );

    // CRITICAL: Always return unsubscribe to prevent memory leaks and orphaned listeners
    return () => unsubscribe();
  }, [team?.id]);

  // 2. Classify evaluations
  const supervisorUid = team.assigned_supervisor_id;
  const panelMemberUids = React.useMemo(() => {
    return new Set([panel.chair_id, ...(panel.examiner_ids || [])]);
  }, [panel.chair_id, panel.examiner_ids]);

  const supervisorEval = React.useMemo(() => {
    if (!supervisorUid) return null;
    return evaluations.find((e) => e.evaluator_id === supervisorUid) || null;
  }, [evaluations, supervisorUid]);

  const panelEvals = React.useMemo(() => {
    return evaluations.filter(
      (e) => panelMemberUids.has(e.evaluator_id) && e.evaluator_id !== supervisorUid
    );
  }, [evaluations, panelMemberUids, supervisorUid]);

  // 3. Compute live composite score
  const scoreResult = React.useMemo(() => {
    return compositeScore(rubric, supervisorEval, panelEvals);
  }, [rubric, supervisorEval, panelEvals]);

  // 4. Conclude slot handler
  const handleConcludeSlot = async () => {
    if (concluding) return;
    try {
      setConcluding(true);
      const res = await concludeDefenseSlot({
        panel_id: panel.id,
        slot_id: slot.slot_id,
      });

      if (res.ok) {
        toast.success("Defense slot concluded and scores finalized successfully!");
        onSlotConcluded?.();
      } else {
        toast.error(res.error || "Failed to conclude defense slot");
      }
    } catch {
      toast.error("An error occurred while concluding defense session");
    } finally {
      setConcluding(false);
    }
  };

  const isSlotCompleted = slot.status === "completed";

  // Build expected evaluators list
  const allExpectedMembers = [
    {
      uid: panel.chair_id,
      role: "Panel Chair",
      eval: panelEvals.find((e) => e.evaluator_id === panel.chair_id),
    },
    ...(panel.examiner_ids || []).map((exId) => ({
      uid: exId,
      role: "Examiner",
      eval: panelEvals.find((e) => e.evaluator_id === exId),
    })),
    ...(supervisorUid
      ? [
          {
            uid: supervisorUid,
            role: "Supervisor (CA)",
            eval: supervisorEval,
          },
        ]
      : []),
  ];

  return (
    <Card className="border-border shadow-sm bg-card overflow-hidden">
      <CardHeader className="bg-muted/30 border-b border-border py-3 px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            <CardTitle className="text-sm font-semibold text-foreground">
              Live Panel Composite Scoring
            </CardTitle>
            <Badge variant="outline" className="text-[11px] font-mono border-primary/30 text-primary">
              Sup: {rubric.supervisor_weight_pct}% · Panel: {rubric.panel_weight_pct}%
            </Badge>
          </div>

          {(isChair || isCoordinator) && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={isSlotCompleted ? "outline" : "default"}
                onClick={handleConcludeSlot}
                disabled={concluding || isSlotCompleted}
                className="h-8 text-xs font-medium gap-1.5"
              >
                {concluding ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Concluding Session…</span>
                  </>
                ) : isSlotCompleted ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                    <span>Session Concluded</span>
                  </>
                ) : (
                  <>
                    <Award className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Conclude & Aggregate</span>
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Examiner Subtotals Grid */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Examiner Subtotals (Real-time Stream)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {allExpectedMembers.map((member) => {
              const name = userMap[member.uid] || member.role;
              const hasSubmitted = Boolean(member.eval);
              const total = hasSubmitted
                ? computeTotal(rubric, member.eval!.scores)
                : null;

              return (
                <div
                  key={member.uid}
                  className="rounded-lg border border-border bg-background p-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {member.role}
                    </p>
                  </div>

                  <div>
                    {hasSubmitted ? (
                      <span className="font-mono text-xs font-bold text-foreground tabular-nums">
                        {total} / {rubric.max_score}
                      </span>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="text-[10px] text-muted-foreground font-normal gap-1 px-1.5 py-0"
                      >
                        <Clock className="h-2.5 w-2.5" />
                        <span>Grading…</span>
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Composite Summary Row */}
        <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            {/* Supervisor CA */}
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground font-medium">
                Supervisor CA ({rubric.supervisor_weight_pct}%)
              </span>
              <p className="text-xl font-bold font-mono tabular-nums text-foreground">
                {scoreResult.supervisor_score !== null
                  ? `${scoreResult.supervisor_score.toFixed(2)}%`
                  : "—"}
              </p>
            </div>

            {/* Panel Average */}
            <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-border pt-3 sm:pt-0">
              <span className="text-xs text-muted-foreground font-medium">
                Panel Average ({rubric.panel_weight_pct}%)
              </span>
              <p className="text-xl font-bold font-mono tabular-nums text-foreground">
                {scoreResult.panel_average_score !== null
                  ? `${scoreResult.panel_average_score.toFixed(2)}%`
                  : "—"}
              </p>
            </div>

            {/* Composite Final */}
            <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-border pt-3 sm:pt-0">
              <span className="text-xs text-muted-foreground font-medium">
                Live Composite
              </span>
              <div className="flex items-center justify-center gap-1.5">
                {scoreResult.composite_final_score !== null ? (
                  <p className="text-2xl font-black font-mono tabular-nums text-primary">
                    {scoreResult.composite_final_score.toFixed(2)}%
                  </p>
                ) : (
                  <Badge variant="outline" className="text-xs text-warning border-warning/30 bg-warning/5">
                    Awaiting Evaluators
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
