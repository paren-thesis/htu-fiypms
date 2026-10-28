"use client";

import * as React from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import {
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Cloud,
  FileCode,
  Loader2,
  Users,
  ShieldCheck,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { signoffDeliverable } from "@/app/actions/signoff-deliverable";
import { MarkdownViewer } from "./MarkdownViewer";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TeamDocument, SoftwareDeliverableDocument } from "@/types/firestore";

export function SupervisorDeliverablesView() {
  const { user } = useAuth();
  const [teams, setTeams] = React.useState<TeamDocument[]>([]);
  const [loadingTeams, setLoadingTeams] = React.useState<boolean>(true);
  const [deliverablesMap, setDeliverablesMap] = React.useState<
    Record<string, SoftwareDeliverableDocument>
  >({});

  // Dialog states
  const [selectedNotesDeliverable, setSelectedNotesDeliverable] =
    React.useState<SoftwareDeliverableDocument | null>(null);
  const [signoffTeam, setSignoffTeam] = React.useState<TeamDocument | null>(null);
  const [signoffNotes, setSignoffNotes] = React.useState<string>("");
  const [signingOff, setSigningOff] = React.useState<boolean>(false);

  // 1. Listen for teams assigned to this supervisor
  React.useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, "teams"),
      where("assigned_supervisor_id", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<TeamDocument, "id">) } as TeamDocument)
        );
        setTeams(docs);
        setLoadingTeams(false);
      },
      (error) => {
        console.error("Failed to stream supervisor teams:", error);
        setLoadingTeams(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  // 2. Listen to deliverables for all assigned teams
  React.useEffect(() => {
    if (teams.length === 0) return;

    const teamIds = teams.map((t) => t.id);
    // Firestore where in can take up to 30 items
    const q = query(
      collection(db, "software_deliverables"),
      where("__name__", "in", teamIds.slice(0, 30))
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const map: Record<string, SoftwareDeliverableDocument> = {};
        snapshot.docs.forEach((docSnap) => {
          map[docSnap.id] = {
            team_id: docSnap.id,
            ...(docSnap.data() as Omit<SoftwareDeliverableDocument, "team_id">),
          };
        });
        setDeliverablesMap(map);
      },
      (error) => {
        console.error("Failed to stream deliverables:", error);
      }
    );

    return () => unsubscribe();
  }, [teams]);

  const handleSignoff = async () => {
    if (!user || !signoffTeam) return;

    try {
      setSigningOff(true);
      const idToken = await user.getIdToken();

      const res = await signoffDeliverable(idToken, {
        team_id: signoffTeam.id,
        supervisor_signoff_notes: signoffNotes,
      });

      if (res.ok) {
        toast.success(`Deliverables for ${signoffTeam.name} signed off successfully!`);
        setSignoffTeam(null);
        setSignoffNotes("");
      } else {
        toast.error(res.error || "Failed to sign off deliverable");
      }
    } catch {
      toast.error("An unexpected error occurred during sign-off");
    } finally {
      setSigningOff(false);
    }
  };

  if (loadingTeams) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="py-12 text-center space-y-2">
          <Users className="h-10 w-10 text-muted-foreground mx-auto" />
          <h3 className="text-base font-semibold text-foreground">No Assigned Supervision Teams</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            You do not currently have any project groups assigned for supervision.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-base font-bold text-foreground">Assigned Supervision Teams</h3>
        <p className="text-xs text-muted-foreground">
          Inspect code repositories, review Markdown setup instructions, and record formal supervisor sign-off.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {teams.map((team) => {
          const deliverable = deliverablesMap[team.id];
          const hasDeliverable = Boolean(deliverable);
          const isSignedOff = Boolean(deliverable?.approved_by_supervisor_at);

          return (
            <Card key={team.id} className="border-border shadow-sm bg-card overflow-hidden">
              <CardHeader className="bg-muted/15 border-b border-border py-4 px-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-bold text-foreground">
                        {team.name}
                      </CardTitle>
                      <Badge variant="outline" className="font-mono text-xs">
                        {team.group_number || team.course_id.toUpperCase()}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      {team.member_ids?.length || 0} Members · Status:{" "}
                      <span className="capitalize font-medium text-foreground">
                        {team.status.replace("_", " ")}
                      </span>
                    </CardDescription>
                  </div>

                  <div>
                    {isSignedOff ? (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 gap-1.5 py-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Signed Off
                      </Badge>
                    ) : hasDeliverable ? (
                      <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 py-1">
                        Awaiting Your Sign-off
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground py-1">
                        Not Submitted Yet
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-5 space-y-4">
                {hasDeliverable && deliverable ? (
                  <div className="space-y-4">
                    {/* Deliverable Link Buttons */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      {deliverable.github_repository_url && (
                        <a
                          href={deliverable.github_repository_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors min-h-[44px]"
                        >
                          <GitBranch className="h-4 w-4" />
                          Open Repository
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      )}

                      {deliverable.live_demo_url && (
                        <a
                          href={deliverable.live_demo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors min-h-[44px]"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open Live Demo
                        </a>
                      )}

                      {deliverable.google_drive_url && (
                        <a
                          href={deliverable.google_drive_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors min-h-[44px]"
                        >
                          <Cloud className="h-4 w-4" />
                          Open Manuscript Bundle
                        </a>
                      )}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedNotesDeliverable(deliverable)}
                        className="text-xs gap-1.5 min-h-[44px]"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View Setup Notes
                      </Button>
                    </div>

                    {/* Sign-off notes display if already recorded */}
                    {isSignedOff && deliverable.supervisor_signoff_notes && (
                      <div className="p-3 bg-muted/20 border border-border rounded-lg text-xs space-y-1">
                        <span className="font-semibold text-foreground flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          Sign-off Notes:
                        </span>
                        <p className="text-muted-foreground italic">
                          {deliverable.supervisor_signoff_notes}
                        </p>
                      </div>
                    )}

                    {/* Action Bar */}
                    {!isSignedOff && (
                      <div className="flex justify-end pt-2 border-t border-border">
                        <Button
                          onClick={() => {
                            setSignoffTeam(team);
                            setSignoffNotes("");
                          }}
                          className="min-h-[44px] px-5 font-semibold gap-1.5"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          Review & Sign-Off
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-4 text-center">
                    <p className="text-xs text-muted-foreground">
                      This team has not yet submitted their source code repository or environment setup documentation.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Setup Notes Inspection Dialog */}
      <Dialog
        open={Boolean(selectedNotesDeliverable)}
        onOpenChange={(open) => {
          if (!open) setSelectedNotesDeliverable(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <FileCode className="h-5 w-5 text-primary" />
              Environment Setup Instructions & Notes
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Technical dependencies, runtime instructions, test credentials, and environment configuration.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 border border-border rounded-md bg-muted/10 my-2">
            <MarkdownViewer
              content={selectedNotesDeliverable?.environment_setup_notes || ""}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedNotesDeliverable(null)}
              className="min-h-[44px]"
            >
              Close Preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sign-off Confirmation Dialog */}
      <Dialog
        open={Boolean(signoffTeam)}
        onOpenChange={(open) => {
          if (!open) setSignoffTeam(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Sign-Off on Deliverables
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1.5 leading-relaxed">
              Confirm that you have reviewed the code repository and verified setup instructions for{" "}
              <strong className="text-foreground">{signoffTeam?.name}</strong>. Once signed off, deliverables are
              permanently locked.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="text-xs font-semibold text-foreground">
              Supervisor Sign-off Notes / Feedback (Optional)
            </label>
            <Textarea
              placeholder="e.g. Repository code inspected, compiles successfully, dependencies tested."
              value={signoffNotes}
              onChange={(e) => setSignoffNotes(e.target.value)}
              className="text-xs resize-none h-24"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setSignoffTeam(null)}
              disabled={signingOff}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSignoff}
              disabled={signingOff}
              className="min-h-[44px] font-semibold"
            >
              {signingOff ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Recording Sign-off...
                </>
              ) : (
                "Confirm & Sign-Off"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
