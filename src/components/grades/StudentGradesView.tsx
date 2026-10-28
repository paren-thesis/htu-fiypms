"use client";

import * as React from "react";
import { collection, query, where, onSnapshot, doc } from "firebase/firestore";
import {
  Award,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import type { TeamDocument, EvaluationDocument, AcademicYearDocument, GradeAppealDocument } from "@/types/firestore";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LockedCard } from "@/components/common/LockedCard";
import { SubmitAppealDialog } from "./SubmitAppealDialog";

export function StudentGradesView() {
  const { user } = useAuth();

  const [team, setTeam] = React.useState<TeamDocument | null>(null);
  const [teamLoading, setTeamLoading] = React.useState<boolean>(true);

  const [academicYear, setAcademicYear] = React.useState<AcademicYearDocument | null>(null);
  const [evaluations, setEvaluations] = React.useState<EvaluationDocument[]>([]);
  const [evaluationsLoading, setEvaluationsLoading] = React.useState<boolean>(false);

  const [appeal, setAppeal] = React.useState<GradeAppealDocument | null>(null);
  const [appealDialogOpen, setAppealDialogOpen] = React.useState<boolean>(false);

  // 1. Stream student's team
  React.useEffect(() => {
    if (!user?.uid) {
      const timer = setTimeout(() => setTeamLoading(false), 0);
      return () => clearTimeout(timer);
    }

    const q = query(
      collection(db, "teams"),
      where("member_ids", "array-contains", user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const firstDoc = snapshot.docs[0];
        if (firstDoc) {
          setTeam({ id: firstDoc.id, ...(firstDoc.data() as Omit<TeamDocument, "id">) });
        } else {
          setTeam(null);
        }
        setTeamLoading(false);
      },
      (error) => {
        console.error("Failed to load student team:", error);
        setTeamLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  // 2. Stream Academic Year to check publication state & appeal deadline
  React.useEffect(() => {
    if (!team?.academic_year_id) return;

    const yearRef = doc(db, "academic_years", team.academic_year_id);
    const unsubscribe = onSnapshot(
      yearRef,
      (snap) => {
        if (snap.exists()) {
          setAcademicYear({ id: snap.id, ...(snap.data() as Omit<AcademicYearDocument, "id">) });
        }
      },
      (error) => {
        console.error("Failed to load academic year:", error);
      }
    );

    return () => unsubscribe();
  }, [team?.academic_year_id]);

  // 3. Stream readable evaluations (allowed by rules after publication)
  React.useEffect(() => {
    const isPublished = Boolean(academicYear?.grades_published);
    if (!team?.id || !isPublished) {
      return;
    }

    const q = query(collection(db, "evaluations"), where("team_id", "==", team.id));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const evals = snapshot.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<EvaluationDocument, "id">) } as EvaluationDocument)
        );
        setEvaluations(evals);
        setEvaluationsLoading(false);
      },
      (error) => {
        console.error("Failed to stream published evaluations:", error);
        setEvaluationsLoading(false);
      }
    );

    return () => {
      unsubscribe();
      setEvaluations([]);
    };
  }, [team?.id, academicYear?.grades_published]);

  // 4. Stream student's appeal (if any)
  React.useEffect(() => {
    if (!team?.id || !user?.uid) return;

    const appealDocId = `${team.id}__${user.uid}`;
    const appealRef = doc(db, "grade_appeals", appealDocId);

    const unsubscribe = onSnapshot(
      appealRef,
      (snap) => {
        if (snap.exists()) {
          setAppeal({ id: snap.id, ...(snap.data() as Omit<GradeAppealDocument, "id">) });
        } else {
          setAppeal(null);
        }
      },
      (error) => {
        console.error("Failed to stream grade appeal:", error);
      }
    );

    return () => unsubscribe();
  }, [team?.id, user?.uid]);

  if (teamLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-44 w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <LockedCard
        title="No Project Team Found"
        message="You are not currently enrolled as a member of any project team."
      />
    );
  }

  const isPublished = Boolean(academicYear?.grades_published);

  if (!isPublished) {
    return (
      <div className="space-y-6">
        <LockedCard
          title="Final Grades Pending Official Publication"
          message="Official final marks, supervisor scores, and oral defense evaluations will be displayed here once approved and published by the Departmental Coordinator."
        >
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-2">
            <Clock className="h-4 w-4" />
            <span>Academic Session: {team.academic_year_id}</span>
          </div>
        </LockedCard>
      </div>
    );
  }

  // Final published marks data
  const summary = team.scores_summary;
  const compositeScore = summary?.composite_final_score ?? 0;
  const supervisorScore = summary?.supervisor_score ?? 0;
  const panelScore = summary?.panel_average_score ?? 0;

  // Appeal countdown
  const appealDeadlineTimestamp = academicYear?.deadlines?.grade_appeal_deadline;
  const appealDeadlineDate = appealDeadlineTimestamp ? appealDeadlineTimestamp.toDate() : null;
  const now = new Date();
  const msRemaining = appealDeadlineDate ? appealDeadlineDate.getTime() - now.getTime() : 0;
  const isAppealWindowOpen = msRemaining > 0;
  const daysRemaining = Math.max(0, Math.floor(msRemaining / (1000 * 60 * 60 * 24)));
  const hoursRemaining = Math.max(0, Math.floor((msRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));

  return (
    <div className="space-y-6">
      {/* 1. Hero Composite Score Card */}
      <Card className="border shadow-sm overflow-hidden bg-gradient-to-br from-primary/5 via-card to-card">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 gap-1 text-xs font-semibold py-0.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Official Grade Published
                </Badge>
                <Badge variant="outline" className="text-xs font-mono uppercase">
                  {team.group_number}
                </Badge>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                {team.name}
              </h2>
              <p className="text-xs text-muted-foreground max-w-lg">
                Final cumulative capstone score awarded by the Departmental Defense Panel and Project Supervisor.
              </p>
            </div>

            {/* Score Pill */}
            <div className="flex flex-col items-center sm:items-end justify-center rounded-2xl bg-primary text-primary-foreground p-5 min-w-[160px] shadow-sm">
              <span className="text-xs font-medium text-primary-foreground/80 uppercase tracking-wider">
                Composite Score
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-4xl sm:text-5xl font-black font-mono">
                  {compositeScore.toFixed(2)}
                </span>
                <span className="text-sm font-semibold text-primary-foreground/70">
                  / 100
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Weight Components & Appeal Window Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Supervisor Score */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Supervisor Evaluation
              </CardTitle>
              <Badge variant="outline" className="text-[11px] font-semibold text-primary">
                40% Weight
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground">
                {supervisorScore.toFixed(2)}
              </span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Weighted contribution:{" "}
              <span className="font-semibold text-foreground">
                {(supervisorScore * 0.4).toFixed(2)} pts
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Panel Score */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Defense Panel Average
              </CardTitle>
              <Badge variant="outline" className="text-[11px] font-semibold text-primary">
                60% Weight
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground">
                {panelScore.toFixed(2)}
              </span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Weighted contribution:{" "}
              <span className="font-semibold text-foreground">
                {(panelScore * 0.6).toFixed(2)} pts
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Appeal Window Countdown */}
        <Card className={`border shadow-xs ${isAppealWindowOpen ? "bg-amber-50/40 border-amber-200" : "bg-muted/20"}`}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-600" />
                Appeal Window
              </CardTitle>
              {appeal ? (
                <Badge
                  variant="outline"
                  className={`text-[11px] font-semibold ${
                    appeal.status === "resolved"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                      : appeal.status === "rejected"
                      ? "bg-destructive/10 text-destructive border-destructive/30"
                      : appeal.status === "under_review"
                      ? "bg-blue-50 text-blue-800 border-blue-300"
                      : "bg-amber-100 text-amber-900 border-amber-300"
                  }`}
                >
                  {appeal.status === "submitted"
                    ? "Appeal Submitted"
                    : appeal.status === "under_review"
                    ? "Under Review"
                    : appeal.status === "resolved"
                    ? "Appeal Resolved"
                    : "Appeal Dismissed"}
                </Badge>
              ) : isAppealWindowOpen ? (
                <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 text-[11px] font-semibold">
                  Active Window
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[11px] text-muted-foreground">
                  Window Closed
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {appeal ? (
              <div className="space-y-2 text-xs">
                <div className="p-2.5 bg-background rounded border space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Your Grounds:
                  </span>
                  <p className="text-foreground text-[11px] whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
                    {appeal.reason}
                  </p>
                </div>
                {appeal.resolution_notes ? (
                  <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded text-blue-950 text-[11px] space-y-1">
                    <span className="text-[10px] uppercase font-bold text-blue-700 block">
                      Board Resolution:
                    </span>
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {appeal.resolution_notes}
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic">
                    Your appeal has been received and is under official review.
                  </p>
                )}
              </div>
            ) : isAppealWindowOpen ? (
              <div className="space-y-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-extrabold font-mono text-amber-900">
                    {daysRemaining}d {hoursRemaining}h
                  </span>
                  <span className="text-xs text-amber-700 font-medium">remaining</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Deadline: {appealDeadlineDate?.toLocaleDateString()} at {appealDeadlineDate?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAppealDialogOpen(true)}
                  className="w-full text-xs min-h-[44px] font-semibold text-amber-900 border-amber-300 bg-amber-100 hover:bg-amber-200"
                >
                  Submit Grade Appeal
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground pt-1">
                The 7-calendar-day grade appeal period has concluded. Final records are locked.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 3. Detailed Criteria Breakdown From Published Evaluations */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            Evaluation Marksheet & Criteria Breakdown
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Per-examiner scores, criteria points, and feedback comments recorded during oral defense and supervision.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          {evaluationsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : evaluations.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No individual marksheets found for this team.
            </div>
          ) : (
            <div className="space-y-4">
              {evaluations.map((ev, index) => {
                const roleLabel =
                  ev.evaluator_role === "supervisor"
                    ? "Project Supervisor"
                    : ev.evaluator_role === "panel_chair"
                    ? "Defense Panel Chair"
                    : "Defense Panel Member";

                const scoresEntries = Object.entries(ev.scores || {});

                return (
                  <div
                    key={ev.id || index}
                    className="p-4 rounded-xl border bg-card space-y-3 shadow-xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-semibold">
                          {roleLabel}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Evaluator ID: {ev.evaluator_id.slice(0, 8)}...
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xs text-muted-foreground">Awarded:</span>
                        <span className="text-sm font-bold font-mono text-primary">
                          {ev.total_score.toFixed(2)} pts
                        </span>
                      </div>
                    </div>

                    {/* Criteria points list */}
                    {scoresEntries.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                        {scoresEntries.map(([critKey, val]) => (
                          <div
                            key={critKey}
                            className="p-2 rounded-md bg-muted/30 border text-xs flex justify-between items-center"
                          >
                            <span className="text-muted-foreground truncate uppercase text-[11px] font-mono">
                              {critKey}
                            </span>
                            <span className="font-bold font-mono text-foreground">
                              {Number(val).toFixed(1)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Comments */}
                    {ev.comments ? (
                      <div className="text-xs bg-muted/20 p-2.5 rounded-lg border text-muted-foreground">
                        <span className="font-semibold text-foreground block mb-0.5">
                          Examiner Remarks:
                        </span>
                        {ev.comments}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appeal Submission Dialog */}
      <SubmitAppealDialog
        open={appealDialogOpen}
        onOpenChange={setAppealDialogOpen}
        team={team}
      />
    </div>
  );
}
