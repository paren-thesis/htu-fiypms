"use client";

import * as React from "react";
import { doc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import {
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Lock,
  MessageSquare,
  FileCheck,
} from "lucide-react";
import { db } from "@/lib/firebase/client";
import { evaluationId } from "@/lib/defense/eval-id";
import { clampScores, computeTotal } from "@/lib/defense/scoring";
import { useDebouncedSave } from "@/hooks/useDebouncedSave";
import { ScoreControl } from "./ScoreControl";
import type {
  EvaluationDocument,
  RubricDocument,
  TeamDocument,
  DefensePanelDocument,
} from "@/types/firestore";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export interface DigitalMarksheetProps {
  team: TeamDocument;
  panel: DefensePanelDocument;
  rubric: RubricDocument;
  evaluatorRole: "supervisor" | "panel_chair" | "panel_member";
  userId: string;
}

export function DigitalMarksheet({
  team,
  rubric,
  evaluatorRole,
  userId,
}: DigitalMarksheetProps) {
  const evalId = evaluationId(team.id, userId);

  // Local state initialized with empty scores/comments
  const [scores, setScores] = React.useState<Record<string, number>>({});
  const [comments, setComments] = React.useState<string>("");
  const [isPublished, setIsPublished] = React.useState<boolean>(false);
  const [expandedCriteria, setExpandedCriteria] = React.useState<Record<string, boolean>>({});
  const [initialLoading, setInitialLoading] = React.useState<boolean>(true);

  // 1. Initial snapshot / read of existing evaluation document
  React.useEffect(() => {
    let isMounted = true;

    const docRef = doc(db, "evaluations", evalId);

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (!isMounted) return;
        if (snapshot.exists()) {
          const data = snapshot.data() as EvaluationDocument;
          // Apply clamped scores to preserve valid bounds
          setScores(clampScores(rubric, data.scores || {}));
          setComments(data.comments || "");
          setIsPublished(Boolean(data.is_published));
        } else {
          // Initialize empty criteria scores
          const defaults: Record<string, number> = {};
          for (const crit of rubric.criteria) {
            defaults[crit.id] = 0;
          }
          setScores(defaults);
          setComments("");
          setIsPublished(false);
        }
        setInitialLoading(false);
      },
      (error) => {
        console.error("Error subscribing to evaluation doc:", error);
        if (isMounted) setInitialLoading(false);
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [evalId, rubric]);

  // 2. Computed running total
  const runningTotal = React.useMemo(() => {
    return computeTotal(rubric, scores);
  }, [rubric, scores]);

  // 3. Debounced saving straight to Firestore evaluations collection
  const saveEvaluation = React.useCallback(
    async (payload: { scores: Record<string, number>; comments: string }) => {
      if (isPublished) return;

      const docRef = doc(db, "evaluations", evalId);
      const clamped = clampScores(rubric, payload.scores);
      const total = computeTotal(rubric, clamped);

      // setDoc merge writes allowed by firestore.rules
      await setDoc(
        docRef,
        {
          team_id: team.id,
          evaluator_id: userId,
          evaluator_role: evaluatorRole,
          rubric_id: rubric.id,
          scores: clamped,
          total_score: total,
          comments: payload.comments,
          is_published: false,
          student_id: null,
          updated_at: serverTimestamp(),
        },
        { merge: true }
      );
    },
    [evalId, evaluatorRole, isPublished, rubric, team.id, userId]
  );

  const { status } = useDebouncedSave({
    data: { scores, comments },
    onSave: saveEvaluation,
    delay: 400,
    maxRetries: 3,
    enabled: !isPublished && !initialLoading,
  });

  const handleScoreChange = (criterionId: string, val: number) => {
    if (isPublished) return;
    setScores((prev) => ({
      ...prev,
      [criterionId]: val,
    }));
  };

  const handleCommentsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isPublished) return;
    setComments(e.target.value);
  };

  const toggleCriterionExpand = (critId: string) => {
    setExpandedCriteria((prev) => ({
      ...prev,
      [critId]: !prev[critId],
    }));
  };

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Loading marksheet…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Locked Evaluation Banner */}
      {isPublished && (
        <Alert className="border-info/30 bg-info-soft text-info">
          <Lock className="h-4 w-4" aria-hidden="true" />
          <AlertTitle className="font-semibold text-sm">Marksheet Locked</AlertTitle>
          <AlertDescription className="text-xs mt-0.5">
            This evaluation has been locked following publication of grades. Criteria scores and comments can no longer be edited.
          </AlertDescription>
        </Alert>
      )}

      {/* Evaluator Role Header Badge */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {evaluatorRole === "supervisor"
              ? "Continuous Assessment Marksheet"
              : evaluatorRole === "panel_chair"
              ? "Panel Chair Marksheet"
              : "Examiner Marksheet"}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {team.name} ({team.group_number}) · Rubric: {rubric.title}
          </p>
        </div>

        <Badge variant="secondary" className="text-xs capitalize font-medium">
          {evaluatorRole.replace("_", " ")}
        </Badge>
      </div>

      {/* Rubric Criteria Cards */}
      <div className="space-y-4">
        {rubric.criteria.map((criterion, idx) => {
          const isExpanded = Boolean(expandedCriteria[criterion.id]);
          const currentScore = scores[criterion.id] ?? 0;

          return (
            <Card
              key={criterion.id}
              className="border-border shadow-sm bg-card rounded-xl overflow-hidden transition-all"
            >
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-muted-foreground">
                        #{idx + 1}
                      </span>
                      <CardTitle className="text-sm font-semibold text-foreground leading-tight">
                        {criterion.title}
                      </CardTitle>
                    </div>

                    {criterion.description && (
                      <button
                        type="button"
                        onClick={() => toggleCriterionExpand(criterion.id)}
                        className="flex items-center gap-1 text-xs text-primary hover:underline pt-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
                        aria-expanded={isExpanded}
                      >
                        <span>{isExpanded ? "Hide instructions" : "Show instructions"}</span>
                        {isExpanded ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>

                  <Badge variant="outline" className="text-xs font-mono tabular-nums shrink-0">
                    Max: {criterion.max_points} pts
                  </Badge>
                </div>

                {/* Collapsible Criterion Description */}
                {isExpanded && criterion.description && (
                  <div className="mt-2.5 p-3 rounded-lg bg-muted/30 border border-border/60 text-xs text-muted-foreground leading-relaxed">
                    {criterion.description}
                  </div>
                )}
              </CardHeader>

              <CardContent className="p-4 pt-1">
                <ScoreControl
                  criterionId={criterion.id}
                  criterionTitle={criterion.title}
                  value={currentScore}
                  maxPoints={criterion.max_points}
                  onChange={(val) => handleScoreChange(criterion.id, val)}
                  disabled={isPublished}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Qualitative Feedback Textarea */}
      <Card className="border-border shadow-sm bg-card rounded-xl">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <CardTitle className="text-sm font-semibold text-foreground">
              Examiner Comments & Recommendations
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <Textarea
            value={comments}
            onChange={handleCommentsChange}
            disabled={isPublished}
            placeholder={
              isPublished
                ? "No comments recorded."
                : "Enter constructive feedback, observed strengths, weaknesses, and required post-defense corrections…"
            }
            rows={4}
            className="text-sm border-border focus-visible:ring-primary resize-y"
          />
        </CardContent>
      </Card>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border shadow-lg p-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Running Total */}
          <div className="flex items-center gap-2.5">
            <FileCheck className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            <div>
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                Total Score
              </p>
              <div className="flex items-baseline gap-1" aria-live="polite">
                <span className="font-mono text-xl sm:text-2xl font-black text-foreground tabular-nums">
                  {runningTotal}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  / {rubric.max_score} pts
                </span>
              </div>
            </div>
          </div>

          {/* Sync / Save State Indicator */}
          <div className="flex items-center gap-2" aria-live="polite">
            {isPublished ? (
              <Badge variant="outline" className="text-xs text-muted-foreground gap-1.5 px-2 py-1">
                <Lock className="h-3 w-3" />
                <span>Locked</span>
              </Badge>
            ) : status === "saving" ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
                <span className="hidden sm:inline">Syncing…</span>
              </div>
            ) : status === "saved" ? (
              <div className="flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                <span className="hidden sm:inline">Saved</span>
              </div>
            ) : status === "error" ? (
              <div className="flex items-center gap-1.5 text-xs text-danger">
                <AlertCircle className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
                <span>Sync error</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="hidden sm:inline">Saved</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
