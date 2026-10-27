"use client";

import * as React from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Users,
  BookOpen,
  FileText,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/client";
import { respondSupervisorAssignment } from "@/app/actions/respond-supervisor-assignment";
import type { TeamDocument, TopicDocument } from "@/types/firestore";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function useCountdown(targetTimestampSeconds?: number) {
  const now = React.useSyncExternalStore(
    (callback) => {
      if (!targetTimestampSeconds) return () => {};
      const interval = setInterval(callback, 1000);
      return () => clearInterval(interval);
    },
    () => Math.floor(Date.now() / 1000),
    () => 0
  );

  if (!targetTimestampSeconds || now === 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: false };
  }

  const diff = targetTimestampSeconds - now;
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
  }

  return {
    days: Math.floor(diff / 86400),
    hours: Math.floor((diff % 86400) / 3600),
    minutes: Math.floor((diff % 3600) / 60),
    seconds: diff % 60,
    isExpired: false,
  };
}

function ProposalCountdownBadge({ targetTimestampSeconds }: { targetTimestampSeconds?: number }) {
  const { days, hours, minutes, seconds, isExpired } = useCountdown(targetTimestampSeconds);

  if (isExpired) {
    return (
      <Badge variant="destructive" className="text-xs font-mono font-medium">
        Window Expired
      </Badge>
    );
  }

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return (
    <Badge
      variant="outline"
      className="text-xs font-mono font-medium border-warning/40 text-warning bg-warning/5 gap-1.5"
    >
      <Clock className="h-3 w-3" />
      {parts.join(" ")} remaining
    </Badge>
  );
}

export function SupervisorSupervisionView() {
  const { user } = useAuth();
  const [teams, setTeams] = React.useState<TeamDocument[]>([]);
  const [topics, setTopics] = React.useState<TopicDocument[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [listenerError, setListenerError] = React.useState<string | null>(null);

  // Accept Dialog
  const [acceptTeam, setAcceptTeam] = React.useState<TeamDocument | null>(null);
  const [isSubmittingAccept, setIsSubmittingAccept] = React.useState(false);

  // Decline Dialog
  const [declineTeam, setDeclineTeam] = React.useState<TeamDocument | null>(null);
  const [declineReason, setDeclineReason] = React.useState("");
  const [isSubmittingDecline, setIsSubmittingDecline] = React.useState(false);

  // 1. Listen to teams proposed/assigned to this supervisor
  React.useEffect(() => {
    if (!user) return;

    const teamsQuery = query(
      collection(db, "teams"),
      where("assigned_supervisor_id", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      teamsQuery,
      (snapshot) => {
        const docs = snapshot.docs
          .map((d) => d.data() as TeamDocument)
          .filter((t) => t.status !== "disbanded");
        setTeams(docs);
        setLoading(false);
      },
      (error) => {
        console.error("Firestore onSnapshot error on supervisor teams:", error);
        setListenerError("Failed to synchronize your assigned teams.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // 2. Listen to active topics for these teams to display proposal details
  React.useEffect(() => {
    const topicsQuery = query(
      collection(db, "topics"),
      where("is_current", "==", true)
    );

    const unsubscribe = onSnapshot(
      topicsQuery,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => d.data() as TopicDocument);
        setTopics(docs);
      },
      (error) => {
        console.error("Firestore onSnapshot error on topics:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  const topicsByTeamId = React.useMemo(() => {
    const map: Record<string, TopicDocument> = {};
    for (const top of topics) {
      map[top.team_id] = top;
    }
    return map;
  }, [topics]);

  // Split teams into pending requests vs accepted teams
  const pendingRequests = React.useMemo(() => {
    return teams.filter(
      (t) => t.supervisor_assignment?.status === "proposed"
    );
  }, [teams]);

  const acceptedTeams = React.useMemo(() => {
    return teams.filter(
      (t) => t.supervisor_assignment?.status === "accepted"
    );
  }, [teams]);

  // Handle Accept
  const handleConfirmAccept = async () => {
    if (!user || !acceptTeam) return;

    setIsSubmittingAccept(true);
    try {
      const idToken = await user.getIdToken();
      const res = await respondSupervisorAssignment(idToken, {
        team_id: acceptTeam.id,
        decision: "accept",
      });

      if (res.ok) {
        toast.success(`You have accepted supervision of ${acceptTeam.group_number}.`);
        setAcceptTeam(null);
      } else {
        toast.error(res.error || "Failed to accept assignment.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to accept assignment.");
    } finally {
      setIsSubmittingAccept(false);
    }
  };

  // Handle Decline
  const handleConfirmDecline = async () => {
    if (!user || !declineTeam) return;

    setIsSubmittingDecline(true);
    try {
      const idToken = await user.getIdToken();
      const res = await respondSupervisorAssignment(idToken, {
        team_id: declineTeam.id,
        decision: "decline",
        decline_reason: declineReason.trim() || undefined,
      });

      if (res.ok) {
        toast.success(`Supervision proposal for ${declineTeam.group_number} declined.`);
        setDeclineTeam(null);
        setDeclineReason("");
      } else {
        toast.error(res.error || "Failed to decline assignment.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to decline assignment.");
    } finally {
      setIsSubmittingDecline(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      </div>
    );
  }

  if (listenerError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Synchronization Error</AlertTitle>
        <AlertDescription>{listenerError}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      {/* 1. Pending Assignment Requests with Countdown */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Pending Supervision Requests
          </h2>
          <Badge variant="secondary" className="tabular-nums font-mono">
            {pendingRequests.length}
          </Badge>
        </div>

        {pendingRequests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
            <CheckCircle2 className="h-6 w-6 text-success mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              No pending supervision assignment requests. When a coordinator proposes your profile, requests will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingRequests.map((team) => {
              const topic = topicsByTeamId[team.id];
              const assignment = team.supervisor_assignment;
              const expiresAtSec = assignment?.window_expires_at?.seconds;

              return (
                <Card key={team.id} className="border-border shadow-sm flex flex-col justify-between">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-primary">
                            {team.group_number}
                          </span>
                          <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
                            {team.course_id}
                          </Badge>
                        </div>
                        <CardTitle className="text-sm font-semibold text-foreground mt-1">
                          {team.name}
                        </CardTitle>
                      </div>

                      <ProposalCountdownBadge targetTimestampSeconds={expiresAtSec} />
                    </div>

                    <CardDescription className="text-xs text-muted-foreground mt-1">
                      {team.member_count} of {team.max_members} students
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-4 pt-1 space-y-3">
                    {/* Topic details */}
                    {topic ? (
                      <div className="rounded-lg bg-muted/30 p-2.5 border border-border/60 space-y-1">
                        <p className="text-[11px] font-semibold text-foreground line-clamp-1">
                          {topic.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {topic.abstract}
                        </p>
                        {topic.tech_stack && topic.tech_stack.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {topic.tech_stack.slice(0, 4).map((tech) => (
                              <span
                                key={tech}
                                className="text-[10px] rounded bg-background px-1.5 py-0.2 border border-border text-muted-foreground font-mono"
                              >
                                {tech}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        Topic proposal pending submission.
                      </p>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                        onClick={() => setDeclineTeam(team)}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 text-xs"
                        onClick={() => setAcceptTeam(team)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Accept Supervision
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. My Supervised Teams List with Links */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">
            My Supervised Teams
          </h2>
          <Badge variant="secondary" className="tabular-nums font-mono">
            {acceptedTeams.length}
          </Badge>
        </div>

        {acceptedTeams.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6 text-primary" aria-hidden="true" />}
            title="No Assigned Teams Yet"
            description="You have not accepted any project team supervision assignments yet. Accepted teams will be tracked here."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {acceptedTeams.map((team) => {
              const topic = topicsByTeamId[team.id];

              return (
                <Card key={team.id} className="border-border shadow-sm flex flex-col justify-between">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-primary">
                            {team.group_number}
                          </span>
                          <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
                            {team.course_id}
                          </Badge>
                        </div>
                        <CardTitle className="text-sm font-semibold text-foreground mt-1">
                          {team.name}
                        </CardTitle>
                      </div>

                      <StatusBadge domain="team" value={team.status} />
                    </div>

                    <CardDescription className="text-xs text-muted-foreground mt-1">
                      {team.member_count} of {team.max_members} students
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-4 pt-1 space-y-3">
                    {/* Approved / Active Topic */}
                    {topic ? (
                      <div className="rounded-lg bg-muted/20 p-2.5 border border-border/60">
                        <p className="text-xs font-medium text-foreground line-clamp-1">
                          {topic.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                          {topic.abstract}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        Topic approval pending
                      </p>
                    )}

                    {/* Links to /chapters and /proposals */}
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <span className="text-[11px] text-muted-foreground">
                        Actions:
                      </span>
                      <div className="flex items-center gap-2">
                        <Link href="/proposals">
                          <Button size="sm" variant="outline" className="h-8 text-xs px-2.5">
                            <BookOpen className="h-3.5 w-3.5 mr-1" />
                            Proposals
                          </Button>
                        </Link>
                        <Link href="/chapters">
                          <Button size="sm" variant="default" className="h-8 text-xs px-2.5">
                            <FileText className="h-3.5 w-3.5 mr-1" />
                            Chapters
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Accept Confirmation Dialog */}
      <Dialog open={!!acceptTeam} onOpenChange={(open) => !open && setAcceptTeam(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Accept Supervision Assignment
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Confirm your acceptance of project supervision for this team.
            </DialogDescription>
          </DialogHeader>

          {acceptTeam && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Team:</span>
                <span className="font-semibold text-foreground">
                  {acceptTeam.group_number} — {acceptTeam.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Programme:</span>
                <span className="font-medium uppercase text-foreground">{acceptTeam.course_id}</span>
              </div>
              <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
                By accepting, your consultation hours and contact details will be securely unlocked for team members once their topic is approved.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmittingAccept}
              onClick={() => setAcceptTeam(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSubmittingAccept}
              onClick={handleConfirmAccept}
            >
              {isSubmittingAccept ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Accepting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  Confirm Acceptance
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline Confirmation Dialog */}
      <Dialog open={!!declineTeam} onOpenChange={(open) => !open && setDeclineTeam(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-destructive">
              <XCircle className="h-5 w-5" />
              Decline Supervision Request
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Provide an optional explanation for declining supervision of {declineTeam?.group_number}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label htmlFor="decline-reason" className="text-xs font-medium text-foreground">
                Decline Reason (Optional)
              </label>
              <Textarea
                id="decline-reason"
                placeholder="e.g. Workload over-commitment, domain specialization mismatch, or sabbatical schedule..."
                rows={3}
                className="text-xs resize-none"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                The project coordinator will be notified so the team can be promptly reassigned.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmittingDecline}
              onClick={() => setDeclineTeam(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isSubmittingDecline}
              onClick={handleConfirmDecline}
            >
              {isSubmittingDecline ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Declining...
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                  Confirm Decline
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
