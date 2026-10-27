"use client";

import * as React from "react";
import {
  Sparkles,
  UserCheck,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { getSupervisorRecommendations } from "@/app/actions/get-supervisor-recommendations";
import { proposeSupervisor } from "@/app/actions/propose-supervisor";
import type { TeamDocument } from "@/types/firestore";
import type { RankedSupervisor } from "@/lib/matching/rank";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SupervisorOption {
  uid: string;
  name: string;
  email: string;
  current_assigned_count?: number;
  max_capacity?: number;
  is_active?: boolean;
  programmes?: string[];
}

export interface FindMatchSheetProps {
  team: TeamDocument | null;
  isOpen: boolean;
  onClose: () => void;
  allSupervisors?: SupervisorOption[];
  onAssigned?: () => void;
}

export function FindMatchSheet({
  team,
  isOpen,
  onClose,
  allSupervisors = [],
  onAssigned,
}: FindMatchSheetProps) {
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [teamTags, setTeamTags] = React.useState<string[]>([]);
  const [recommendations, setRecommendations] = React.useState<RankedSupervisor[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  // Normal assign dialog state
  const [selectedCandidate, setSelectedCandidate] = React.useState<RankedSupervisor | null>(null);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = React.useState(false);
  const [isSubmittingAssign, setIsSubmittingAssign] = React.useState(false);

  // Override dialog state
  const [isOverrideDialogOpen, setIsOverrideDialogOpen] = React.useState(false);
  const [overrideSupervisorId, setOverrideSupervisorId] = React.useState<string>("");
  const [overrideReason, setOverrideReason] = React.useState<string>("");
  const [isSubmittingOverride, setIsSubmittingOverride] = React.useState(false);

  // Fetch recommendations when sheet opens
  React.useEffect(() => {
    if (!isOpen || !team || !user) {
      return;
    }

    let isMounted = true;

    async function fetchMatches() {
      setLoading(true);
      setError(null);
      try {
        const idToken = await user!.getIdToken();
        const result = await getSupervisorRecommendations({
          idToken,
          teamId: team!.id,
          topN: 3,
        });

        if (!isMounted) return;

        if (result.ok) {
          setRecommendations(result.recommendations || []);
          setTeamTags(result.teamTags || []);
        } else {
          setError(result.error || "Failed to retrieve matching supervisors.");
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Error querying matching engine.";
        setError(msg);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void fetchMatches();

    return () => {
      isMounted = false;
    };
  }, [isOpen, team, user]);

  const handleOpenAssignDialog = (ranked: RankedSupervisor) => {
    setSelectedCandidate(ranked);
    setIsAssignDialogOpen(true);
  };

  const handleConfirmAssign = async () => {
    if (!user || !team || !selectedCandidate) return;

    setIsSubmittingAssign(true);
    try {
      const idToken = await user.getIdToken();
      const res = await proposeSupervisor(idToken, {
        team_id: team.id,
        supervisor_id: selectedCandidate.candidate.id,
      });

      if (res.ok) {
        toast.success(
          `Supervisor proposed for ${team.group_number}. A notification with a 72-hour window has been dispatched.`
        );
        setIsAssignDialogOpen(false);
        setSelectedCandidate(null);
        onClose();
        if (onAssigned) onAssigned();
      } else {
        toast.error(res.error || "Failed to assign supervisor.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to assign supervisor.");
    } finally {
      setIsSubmittingAssign(false);
    }
  };

  const handleConfirmOverride = async () => {
    if (!user || !team) return;

    if (!overrideSupervisorId) {
      toast.error("Please select a supervisor for this override.");
      return;
    }

    if (!overrideReason.trim() || overrideReason.trim().length < 5) {
      toast.error("A written override justification (min 5 characters) is required.");
      return;
    }

    setIsSubmittingOverride(true);
    try {
      const idToken = await user.getIdToken();
      const res = await proposeSupervisor(idToken, {
        team_id: team.id,
        supervisor_id: overrideSupervisorId,
        override_reason: overrideReason.trim(),
      });

      if (res.ok) {
        toast.success(
          `Override assignment recorded for ${team.group_number}. Supervisor has been notified.`
        );
        setIsOverrideDialogOpen(false);
        setOverrideSupervisorId("");
        setOverrideReason("");
        onClose();
        if (onAssigned) onAssigned();
      } else {
        toast.error(res.error || "Failed to submit override assignment.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to submit override assignment.");
    } finally {
      setIsSubmittingOverride(false);
    }
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col h-full bg-background">
          <div className="p-6 border-b border-border bg-card">
            <SheetHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
                <SheetTitle className="text-lg font-semibold text-foreground">
                  Supervisor Matching
                </SheetTitle>
              </div>
              <SheetDescription className="text-xs text-muted-foreground mt-1">
                {team
                  ? `${team.group_number} — ${team.name} (${team.course_id.toUpperCase()})`
                  : "Find ranked supervisors based on topic keyword overlap and active workload."}
              </SheetDescription>
            </SheetHeader>

            {/* Team Topic Keywords */}
            {teamTags.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  Project Topic Tags:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {teamTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="text-[11px] font-mono font-normal px-2 py-0.5"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <ScrollArea className="flex-1 p-6">
            {loading ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>Computing Jaccard keyword overlap and capacity quotas...</span>
                </div>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 rounded-xl border border-border bg-card space-y-3">
                    <div className="flex justify-between items-center">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-5 w-16" />
                    </div>
                    <Skeleton className="h-2 w-full" />
                    <Skeleton className="h-2 w-full" />
                    <Skeleton className="h-8 w-24 ml-auto" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
                <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
                <p className="text-sm font-medium text-destructive">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 text-xs"
                  onClick={() => setIsOverrideDialogOpen(true)}
                >
                  Use Manual Override Instead
                </Button>
              </div>
            ) : recommendations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-3">
                <UserCheck className="h-8 w-8 text-muted-foreground mx-auto" />
                <h4 className="text-sm font-semibold text-foreground">No Eligible Candidates Found</h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  No active supervisors currently list programme &quot;{team?.course_id}&quot; in their whitelist profile.
                  You can use a manual override to allocate a faculty supervisor.
                </p>
                <Button
                  size="sm"
                  variant="default"
                  className="mt-2"
                  onClick={() => setIsOverrideDialogOpen(true)}
                >
                  <ShieldAlert className="h-4 w-4 mr-1.5" />
                  Manual Override Assignment
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Top 3 Recommendations
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
                    onClick={() => setIsOverrideDialogOpen(true)}
                  >
                    <ShieldAlert className="h-3.5 w-3.5 mr-1" />
                    Manual Override
                  </Button>
                </div>

                {recommendations.map((item, idx) => {
                  const candidate = item.candidate;
                  const breakdown = item.breakdown;
                  const candidateName = candidate.full_name || candidate.name || "Faculty Supervisor";
                  const currentCount = candidate.current_assigned_count ?? 0;
                  const maxCap = candidate.max_team_capacity ?? 5;
                  const isAtCapacity = breakdown.atCapacity || currentCount >= maxCap;
                  const overlapPct = Math.round(breakdown.overlap * 100);
                  const capacityPct = Math.round(breakdown.capacity * 100);
                  const totalScorePct = Math.round(breakdown.score * 100);
                  const specializations = candidate.research_interests || candidate.tags || [];

                  return (
                    <div
                      key={candidate.id}
                      className="rounded-xl border border-border bg-card p-4 space-y-3.5 shadow-sm hover:border-primary/40 transition-colors"
                    >
                      {/* Header with Rank and Match Score */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                              {idx + 1}
                            </span>
                            <span className="font-semibold text-sm text-foreground">
                              {candidateName}
                            </span>
                            {isAtCapacity && (
                              <Badge variant="destructive" className="text-[10px] py-0 px-1.5 h-4">
                                At capacity
                              </Badge>
                            )}
                          </div>
                          {candidate.email && (
                            <p className="text-xs text-muted-foreground mt-0.5 ml-7">
                              {candidate.email}
                            </p>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
                            {totalScorePct}% Match
                          </span>
                        </div>
                      </div>

                      {/* Specializations */}
                      {specializations.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {specializations.map((spec) => (
                            <span
                              key={spec}
                              className="text-[11px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
                            >
                              {spec}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Score Bars */}
                      <div className="space-y-2 pt-1 border-t border-border/60">
                        {/* Topic Overlap (70%) */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Topic Overlap (70%)</span>
                            <span className="font-medium tabular-nums text-foreground">{overlapPct}%</span>
                          </div>
                          <Progress value={overlapPct} className="h-1.5" />
                        </div>

                        {/* Capacity Score (30%) */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Capacity Score (30%)</span>
                            <span className="font-medium tabular-nums text-foreground">
                              {currentCount} / {maxCap} groups ({capacityPct}%)
                            </span>
                          </div>
                          <Progress
                            value={capacityPct}
                            className={`h-1.5 ${isAtCapacity ? "[&>div]:bg-destructive" : ""}`}
                          />
                        </div>
                      </div>

                      {/* Action */}
                      <div className="flex justify-end pt-1">
                        <Button
                          size="sm"
                          variant={isAtCapacity ? "outline" : "default"}
                          className="h-8 text-xs px-3"
                          onClick={() => handleOpenAssignDialog(item)}
                        >
                          <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                          Assign Supervisor
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Assign Confirmation Dialog */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserCheck className="h-5 w-5 text-primary" />
              Confirm Supervisor Assignment
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Propose this faculty member to supervise project team {team?.group_number}.
            </DialogDescription>
          </DialogHeader>

          {selectedCandidate && team && (
            <div className="rounded-lg border border-border bg-muted/40 p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Team:</span>
                <span className="font-medium text-foreground">{team.group_number} — {team.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Programme:</span>
                <span className="font-medium uppercase text-foreground">{team.course_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Supervisor:</span>
                <span className="font-semibold text-foreground">
                  {selectedCandidate.candidate.full_name || selectedCandidate.candidate.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Workload:</span>
                <span className="font-medium tabular-nums text-foreground">
                  {selectedCandidate.candidate.current_assigned_count ?? 0} / {selectedCandidate.candidate.max_team_capacity ?? 5} groups
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
                Note: The supervisor has 72 hours to accept or decline before the request expires.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmittingAssign}
              onClick={() => setIsAssignDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSubmittingAssign}
              onClick={handleConfirmAssign}
            >
              {isSubmittingAssign ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Proposing...
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  Confirm & Propose
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Override Assignment Dialog */}
      <Dialog open={isOverrideDialogOpen} onOpenChange={setIsOverrideDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-foreground">
              <ShieldAlert className="h-5 w-5 text-warning" />
              Manual Supervisor Override
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Supervisors assigned outside programme-matching or at capacity require an audit-logged justification.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label htmlFor="override-supervisor-select" className="text-xs font-medium text-foreground">
                Select Supervisor *
              </label>
              <Select
                value={overrideSupervisorId}
                onValueChange={setOverrideSupervisorId}
              >
                <SelectTrigger id="override-supervisor-select" className="w-full text-xs">
                  <SelectValue placeholder="Choose a faculty supervisor..." />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {allSupervisors.map((s) => (
                    <SelectItem key={s.uid} value={s.uid} className="text-xs">
                      {s.name} ({s.email}) — {s.current_assigned_count ?? 0}/{s.max_capacity ?? 5} groups
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="override-reason" className="text-xs font-medium text-foreground">
                Override Justification (Required) *
              </label>
              <Textarea
                id="override-reason"
                placeholder="Explain the reason for this manual allocation (e.g. specialized domain expertise, interdisciplinary collaboration, capacity adjustment)..."
                rows={3}
                className="text-xs resize-none"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                This rationale is permanently recorded in the immutable audit trail.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmittingOverride}
              onClick={() => setIsOverrideDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isSubmittingOverride || !overrideSupervisorId || overrideReason.trim().length < 5}
              onClick={handleConfirmOverride}
            >
              {isSubmittingOverride ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Recording Override...
                </>
              ) : (
                <>
                  <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
                  Confirm Override Assignment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
