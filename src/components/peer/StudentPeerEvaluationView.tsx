"use client";

import * as React from "react";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import {
  CheckCircle2,
  Lock,
  MessageSquare,
  ShieldCheck,
  UserCheck,
  Clock,
  Code2,
  Users2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { submitPeerEvaluation } from "@/app/actions/submit-peer-evaluation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { TeamDocument, PeerEvaluationDocument, UserDocument } from "@/types/firestore";

interface TeammateFormState {
  punctuality: number;
  technical: number;
  teamwork: number;
  comments: string;
}

export function StudentPeerEvaluationView() {
  const { user } = useAuth();
  const [team, setTeam] = React.useState<TeamDocument | null>(null);
  const [teamLoading, setTeamLoading] = React.useState<boolean>(true);
  const [submittedMap, setSubmittedMap] = React.useState<Record<string, PeerEvaluationDocument>>({});
  const [teammateProfiles, setTeammateProfiles] = React.useState<Record<string, UserDocument>>({});
  const [formStates, setFormStates] = React.useState<Record<string, TeammateFormState>>({});
  const [submittingEvaluatee, setSubmittingEvaluatee] = React.useState<string | null>(null);
  const [confirmDialogEvaluatee, setConfirmDialogEvaluatee] = React.useState<string | null>(null);

  // 1. Listen for user's team
  React.useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, "teams"),
      where("member_ids", "array-contains", user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty && snapshot.docs[0]) {
          const docData = snapshot.docs[0];
          setTeam({ id: docData.id, ...(docData.data() as Omit<TeamDocument, "id">) });
        } else {
          setTeam(null);
        }
        setTeamLoading(false);
      },
      (error) => {
        console.error("Failed to stream student team:", error);
        setTeamLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  // 2. Fetch profiles for teammates
  React.useEffect(() => {
    if (!team?.member_ids || !user?.uid) return;

    const teammates = team.member_ids.filter((id) => id !== user.uid);
    let isCancelled = false;

    async function loadProfiles() {
      const profiles: Record<string, UserDocument> = {};
      for (const tId of teammates) {
        try {
          const userSnap = await getDoc(doc(db, "users", tId));
          if (userSnap.exists()) {
            profiles[tId] = { id: userSnap.id, ...(userSnap.data() as Omit<UserDocument, "id">) } as UserDocument;
          }
        } catch (err) {
          console.error("Failed to load teammate profile:", err);
        }
      }
      if (!isCancelled) {
        setTeammateProfiles(profiles);
      }
    }

    loadProfiles();
    return () => {
      isCancelled = true;
    };
  }, [team?.member_ids, user?.uid]);

  // 3. Listen for caller's submitted peer evaluations for this team
  React.useEffect(() => {
    if (!team?.id || !user?.uid) return;

    const q = query(
      collection(db, "peer_evaluations"),
      where("team_id", "==", team.id),
      where("evaluator_id", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const map: Record<string, PeerEvaluationDocument> = {};
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() as Omit<PeerEvaluationDocument, "id">;
          map[data.evaluatee_id] = { id: docSnap.id, ...data };
        });
        setSubmittedMap(map);
      },
      (error) => {
        console.error("Failed to stream peer evaluations:", error);
      }
    );

    return () => unsubscribe();
  }, [team?.id, user?.uid]);

  // 4. Form state helpers
  const getFormState = (evaluateeId: string): TeammateFormState => {
    return (
      formStates[evaluateeId] || {
        punctuality: 8,
        technical: 8,
        teamwork: 8,
        comments: "",
      }
    );
  };

  const updateFormState = (
    evaluateeId: string,
    updates: Partial<TeammateFormState>
  ) => {
    setFormStates((prev) => ({
      ...prev,
      [evaluateeId]: {
        ...getFormState(evaluateeId),
        ...updates,
      },
    }));
  };

  const handleSubmit = async (evaluateeId: string) => {
    if (!user || !team) return;
    const form = getFormState(evaluateeId);

    try {
      setSubmittingEvaluatee(evaluateeId);
      const idToken = await user.getIdToken();

      const res = await submitPeerEvaluation(idToken, {
        team_id: team.id,
        evaluatee_id: evaluateeId,
        punctuality_score: form.punctuality,
        technical_contribution_score: form.technical,
        teamwork_score: form.teamwork,
        comments: form.comments,
      });

      if (res.ok) {
        toast.success("Peer evaluation submitted and locked successfully!");
        setConfirmDialogEvaluatee(null);
      } else {
        toast.error(res.error || "Failed to submit peer evaluation");
      }
    } catch {
      toast.error("An unexpected error occurred while submitting evaluation");
    } finally {
      setSubmittingEvaluatee(null);
    }
  };

  if (teamLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <Card className="border-border">
        <CardContent className="py-12 text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
          <h3 className="text-base font-semibold text-foreground">No Project Team Found</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            You must be an assigned member of an active project group to complete peer evaluations.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isOpen = team.status === "defense_ready" || team.status === "completed";
  const teammates = (team.member_ids || []).filter((id) => id !== user?.uid);

  if (!isOpen) {
    return (
      <div className="space-y-4">
        <Alert className="border-border bg-card">
          <Clock className="h-4 w-4 text-primary" />
          <AlertTitle className="font-semibold text-foreground">Peer Evaluation Window Not Open</AlertTitle>
          <AlertDescription className="text-muted-foreground text-sm mt-1">
            Peer evaluations unlock once your group status advances to{" "}
            <span className="font-semibold text-foreground">defense_ready</span> or{" "}
            <span className="font-semibold text-foreground">completed</span>. Your current team status is{" "}
            <Badge variant="outline" className="ml-1 capitalize">{team.status.replace("_", " ")}</Badge>.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (teammates.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="py-12 text-center space-y-3">
          <UserCheck className="h-10 w-10 text-muted-foreground mx-auto" />
          <h3 className="text-base font-semibold text-foreground">Single Member Team</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Your project team does not have any additional teammates to evaluate.
          </p>
        </CardContent>
      </Card>
    );
  }

  const activeDialogProfile = confirmDialogEvaluatee
    ? teammateProfiles[confirmDialogEvaluatee]
    : null;
  const activeDialogName = activeDialogProfile?.name || "this teammate";

  return (
    <div className="space-y-6">
      {/* Header Info Banner */}
      <Alert className="border-primary/20 bg-primary/5">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <AlertTitle className="font-semibold text-primary">Confidential 360° Teammate Assessment</AlertTitle>
        <AlertDescription className="text-muted-foreground text-sm mt-1">
          Evaluate each of your group members objectively across punctuality, technical output, and teamwork.
          Ratings are <strong className="text-foreground">strictly confidential</strong> and will never be shown to your teammates.
          Submissions are <strong className="text-foreground">permanently locked</strong> once confirmed.
        </AlertDescription>
      </Alert>

      {/* Grid of Teammates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {teammates.map((teammateId) => {
          const profile = teammateProfiles[teammateId];
          const name = profile?.name || "Teammate";
          const indexNum = profile?.profile?.index_number || "";
          const submittedEval = submittedMap[teammateId];
          const isSubmitted = Boolean(submittedEval);
          const form = getFormState(teammateId);
          const liveAverage = (
            (form.punctuality + form.technical + form.teamwork) /
            3
          ).toFixed(1);

          return (
            <Card
              key={teammateId}
              className={`border-border shadow-sm flex flex-col transition-all ${
                isSubmitted ? "bg-muted/10 border-emerald-200" : "bg-card"
              }`}
            >
              <CardHeader className="border-b border-border py-4 px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-bold text-foreground">
                      {name}
                    </CardTitle>
                    {indexNum && (
                      <CardDescription className="text-xs font-mono text-muted-foreground">
                        Index: {indexNum}
                      </CardDescription>
                    )}
                  </div>
                  {isSubmitted ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 gap-1 py-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      Submitted & Locked
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Pending Rating
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-5 flex-1 space-y-6">
                {isSubmitted && submittedEval ? (
                  /* Read-Only Submitted State */
                  <div className="space-y-5">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-muted/30 border border-border rounded-lg p-3">
                        <div className="text-xs text-muted-foreground font-medium flex items-center justify-center gap-1">
                          <Clock className="h-3 w-3" /> Punctuality
                        </div>
                        <div className="text-xl font-bold text-foreground mt-1">
                          {submittedEval.punctuality_score}
                          <span className="text-xs font-normal text-muted-foreground">/10</span>
                        </div>
                      </div>

                      <div className="bg-muted/30 border border-border rounded-lg p-3">
                        <div className="text-xs text-muted-foreground font-medium flex items-center justify-center gap-1">
                          <Code2 className="h-3 w-3" /> Technical
                        </div>
                        <div className="text-xl font-bold text-foreground mt-1">
                          {submittedEval.technical_contribution_score}
                          <span className="text-xs font-normal text-muted-foreground">/10</span>
                        </div>
                      </div>

                      <div className="bg-muted/30 border border-border rounded-lg p-3">
                        <div className="text-xs text-muted-foreground font-medium flex items-center justify-center gap-1">
                          <Users2 className="h-3 w-3" /> Teamwork
                        </div>
                        <div className="text-xl font-bold text-foreground mt-1">
                          {submittedEval.teamwork_score}
                          <span className="text-xs font-normal text-muted-foreground">/10</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-primary">Composite Average:</span>
                      <span className="text-xl font-extrabold text-primary font-mono">
                        {submittedEval.average_score.toFixed(1)} / 10.0
                      </span>
                    </div>

                    {submittedEval.comments && (
                      <div className="space-y-1 text-sm bg-muted/20 border border-border rounded-lg p-3">
                        <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" /> Submitted Comments:
                        </div>
                        <p className="text-foreground text-sm italic">{submittedEval.comments}</p>
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-2">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>This peer rating is confidential and permanently immutable.</span>
                    </div>
                  </div>
                ) : (
                  /* Rating Input Controls */
                  <div className="space-y-5">
                    {/* 1. Punctuality */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                          <Clock className="h-4 w-4 text-primary" /> Punctuality & Attendance
                        </span>
                        <span className="font-mono font-bold text-primary text-base">
                          {form.punctuality} / 10
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Meeting attendance, milestone timeliness, and adherence to team schedules.
                      </p>
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => updateFormState(teammateId, { punctuality: Math.max(1, form.punctuality - 1) })}
                          className="h-11 w-11 shrink-0 rounded-md border border-border bg-background hover:bg-muted font-bold text-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                          aria-label="Decrease punctuality score"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="1"
                          value={form.punctuality}
                          onChange={(e) => updateFormState(teammateId, { punctuality: Number(e.target.value) })}
                          className="h-2 w-full cursor-pointer accent-primary rounded-lg bg-muted appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() => updateFormState(teammateId, { punctuality: Math.min(10, form.punctuality + 1) })}
                          className="h-11 w-11 shrink-0 rounded-md border border-border bg-background hover:bg-muted font-bold text-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                          aria-label="Increase punctuality score"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* 2. Technical Contribution */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                          <Code2 className="h-4 w-4 text-primary" /> Technical Contribution
                        </span>
                        <span className="font-mono font-bold text-primary text-base">
                          {form.technical} / 10
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Code implementation, technical architecture, deliverable output, and problem solving.
                      </p>
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => updateFormState(teammateId, { technical: Math.max(1, form.technical - 1) })}
                          className="h-11 w-11 shrink-0 rounded-md border border-border bg-background hover:bg-muted font-bold text-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                          aria-label="Decrease technical score"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="1"
                          value={form.technical}
                          onChange={(e) => updateFormState(teammateId, { technical: Number(e.target.value) })}
                          className="h-2 w-full cursor-pointer accent-primary rounded-lg bg-muted appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() => updateFormState(teammateId, { technical: Math.min(10, form.technical + 1) })}
                          className="h-11 w-11 shrink-0 rounded-md border border-border bg-background hover:bg-muted font-bold text-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                          aria-label="Increase technical score"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* 3. Teamwork */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                          <Users2 className="h-4 w-4 text-primary" /> Teamwork & Collaboration
                        </span>
                        <span className="font-mono font-bold text-primary text-base">
                          {form.teamwork} / 10
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Communication, receptiveness to feedback, active participation, and support for teammates.
                      </p>
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => updateFormState(teammateId, { teamwork: Math.max(1, form.teamwork - 1) })}
                          className="h-11 w-11 shrink-0 rounded-md border border-border bg-background hover:bg-muted font-bold text-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                          aria-label="Decrease teamwork score"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="1"
                          value={form.teamwork}
                          onChange={(e) => updateFormState(teammateId, { teamwork: Number(e.target.value) })}
                          className="h-2 w-full cursor-pointer accent-primary rounded-lg bg-muted appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() => updateFormState(teammateId, { teamwork: Math.min(10, form.teamwork + 1) })}
                          className="h-11 w-11 shrink-0 rounded-md border border-border bg-background hover:bg-muted font-bold text-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                          aria-label="Increase teamwork score"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Live Average Callout */}
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">Calculated Average:</span>
                      <span className="text-lg font-bold text-primary font-mono">{liveAverage} / 10.0</span>
                    </div>

                    {/* Comments */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                        Confidential Notes (Optional)
                      </label>
                      <Textarea
                        placeholder="Add constructive confidential feedback regarding this member's contribution..."
                        value={form.comments}
                        onChange={(e) => updateFormState(teammateId, { comments: e.target.value })}
                        className="resize-none text-sm h-20"
                      />
                    </div>
                  </div>
                )}
              </CardContent>

              {!isSubmitted && (
                <CardFooter className="bg-muted/20 border-t border-border py-3 px-5 flex justify-end">
                  <Button
                    onClick={() => setConfirmDialogEvaluatee(teammateId)}
                    className="min-h-[44px] px-5 font-semibold"
                  >
                    Confirm & Submit Rating
                  </Button>
                </CardFooter>
              )}
            </Card>
          );
        })}
      </div>

      {/* Confirmation Dialog */}
      <Dialog
        open={Boolean(confirmDialogEvaluatee)}
        onOpenChange={(open) => {
          if (!open) setConfirmDialogEvaluatee(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Lock className="h-5 w-5 text-primary" />
              Confirm Peer Evaluation
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2 text-sm leading-relaxed">
              You are about to submit your confidential rating for{" "}
              <strong className="text-foreground">{activeDialogName}</strong>.
              <br /><br />
              <span className="text-destructive font-semibold">Important:</span> Peer evaluations are{" "}
              <strong className="text-foreground">permanently locked</strong> upon submission and cannot be amended,
              deleted, or rescinded later.
            </DialogDescription>
          </DialogHeader>

          {confirmDialogEvaluatee && (
            <div className="bg-muted/40 border border-border rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Punctuality:</span>
                <span className="font-bold">{getFormState(confirmDialogEvaluatee).punctuality} / 10</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Technical Contribution:</span>
                <span className="font-bold">{getFormState(confirmDialogEvaluatee).technical} / 10</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Teamwork:</span>
                <span className="font-bold">{getFormState(confirmDialogEvaluatee).teamwork} / 10</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold text-primary">
                <span>Calculated Average:</span>
                <span>
                  {(
                    (getFormState(confirmDialogEvaluatee).punctuality +
                      getFormState(confirmDialogEvaluatee).technical +
                      getFormState(confirmDialogEvaluatee).teamwork) /
                    3
                  ).toFixed(1)}{" "}
                  / 10.0
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmDialogEvaluatee(null)}
              disabled={Boolean(submittingEvaluatee)}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              onClick={() => confirmDialogEvaluatee && handleSubmit(confirmDialogEvaluatee)}
              disabled={Boolean(submittingEvaluatee)}
              className="min-h-[44px] font-semibold"
            >
              {submittingEvaluatee ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Finalize & Lock"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
