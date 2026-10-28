"use client";

import * as React from "react";
import { collection, query, where, onSnapshot, doc } from "firebase/firestore";
import {
  CheckCircle2,
  Lock,
  ExternalLink,
  GitBranch,
  Cloud,
  FileCode,
  AlertCircle,
  Loader2,
  Clock,
  Eye,
  Edit3,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { submitDeliverable } from "@/app/actions/submit-deliverable";
import { validateDeliverable } from "@/lib/deliverables/validate";
import { MarkdownViewer } from "./MarkdownViewer";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import type { TeamDocument, SoftwareDeliverableDocument } from "@/types/firestore";

export function StudentDeliverablesView() {
  const { user } = useAuth();
  const [team, setTeam] = React.useState<TeamDocument | null>(null);
  const [teamLoading, setTeamLoading] = React.useState<boolean>(true);
  const [deliverable, setDeliverable] = React.useState<SoftwareDeliverableDocument | null>(null);
  const [deliverableLoaded, setDeliverableLoaded] = React.useState<boolean>(false);
  const deliverableLoading = teamLoading || (Boolean(team?.id) && !deliverableLoaded);

  // Form State
  const [repoUrl, setRepoUrl] = React.useState<string>("");
  const [demoUrl, setDemoUrl] = React.useState<string>("");
  const [cloudUrl, setCloudUrl] = React.useState<string>("");
  const [setupNotes, setSetupNotes] = React.useState<string>("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [activeTab, setActiveTab] = React.useState<string>("edit");

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

  // 2. Listen for deliverables of the team
  React.useEffect(() => {
    if (!team?.id) {
      return;
    }

    const docRef = doc(db, "software_deliverables", team.id);
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = { team_id: snap.id, ...(snap.data() as Omit<SoftwareDeliverableDocument, "team_id">) };
          setDeliverable(data);
          setRepoUrl(data.github_repository_url || "");
          setDemoUrl(data.live_demo_url || "");
          setCloudUrl(data.google_drive_url || "");
          setSetupNotes(data.environment_setup_notes || "");
        } else {
          setDeliverable(null);
        }
        setDeliverableLoaded(true);
      },
      (error) => {
        console.error("Failed to stream deliverables:", error);
        setDeliverableLoaded(true);
      }
    );

    return () => unsubscribe();
  }, [team?.id]);

  const isSignedOff = Boolean(deliverable?.approved_by_supervisor_at);
  const isLocked = isSignedOff;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !team || isLocked) return;

    const validation = validateDeliverable({
      github_repository_url: repoUrl,
      live_demo_url: demoUrl,
      google_drive_url: cloudUrl,
      environment_setup_notes: setupNotes,
    });

    if (!validation.isValid) {
      setErrors(validation.errors);
      toast.error("Please resolve validation errors before submitting");
      return;
    }

    setErrors({});

    try {
      setSubmitting(true);
      const idToken = await user.getIdToken();

      const res = await submitDeliverable(idToken, {
        team_id: team.id,
        github_repository_url: repoUrl,
        live_demo_url: demoUrl || undefined,
        google_drive_url: cloudUrl || undefined,
        environment_setup_notes: setupNotes,
      });

      if (res.ok) {
        toast.success(
          deliverable
            ? "Software deliverables updated successfully!"
            : "Software deliverables submitted for supervisor review!"
        );
      } else {
        toast.error(res.error || "Failed to submit deliverables");
      }
    } catch {
      toast.error("An error occurred while submitting deliverables");
    } finally {
      setSubmitting(false);
    }
  };

  if (teamLoading || deliverableLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
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
            You must be an assigned member of an active project group to submit software deliverables.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isOpen = team.status === "defense_ready" || team.status === "completed";

  if (!isOpen) {
    return (
      <Alert className="border-border bg-card">
        <Clock className="h-4 w-4 text-primary" />
        <AlertTitle className="font-semibold text-foreground">Deliverables Window Not Open</AlertTitle>
        <AlertDescription className="text-muted-foreground text-sm mt-1">
          Final software deliverables unlock once your project group advances to{" "}
          <strong className="text-foreground">defense_ready</strong> or{" "}
          <strong className="text-foreground">completed</strong> status so examiners and supervisors can inspect code
          repositories prior to presentation. Current status:{" "}
          <Badge variant="outline" className="ml-1 capitalize">{team.status.replace("_", " ")}</Badge>.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sign-off Status Banner */}
      {isSignedOff ? (
        <Alert className="border-emerald-200 bg-emerald-50">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <AlertTitle className="font-bold text-emerald-900">
            Supervisor Sign-off Completed
          </AlertTitle>
          <AlertDescription className="text-emerald-800 text-sm mt-1">
            Your project supervisor has formally inspected and signed off on your software repository and deployment notes.
            All links and notes are now permanently locked.
            {deliverable?.supervisor_signoff_notes && (
              <div className="mt-2 p-2.5 bg-white/60 border border-emerald-200 rounded text-xs text-emerald-900">
                <strong>Supervisor Notes:</strong> {deliverable.supervisor_signoff_notes}
              </div>
            )}
          </AlertDescription>
        </Alert>
      ) : deliverable ? (
        <Alert className="border-amber-200 bg-amber-50">
          <FileCode className="h-5 w-5 text-amber-600" />
          <AlertTitle className="font-bold text-amber-900">
            Submitted — Awaiting Supervisor Sign-off
          </AlertTitle>
          <AlertDescription className="text-amber-800 text-sm mt-1">
            Deliverables have been submitted. Your supervisor will verify repository accessibility, inspect code structure,
            and complete formal sign-off. You may edit these details until sign-off is recorded.
          </AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit}>
        <Card className="border-border shadow-sm bg-card">
          <CardHeader className="border-b border-border py-4 px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Final Software Repository & Deployment Deliverables
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Provide verified repository links, live demos, and Markdown instructions for examiners and your supervisor.
                </CardDescription>
              </div>

              {isSignedOff ? (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 gap-1">
                  <Lock className="h-3 w-3" />
                  Locked & Verified
                </Badge>
              ) : deliverable ? (
                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300">
                  Ready for Review
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Draft
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            {/* 1. GitHub/GitLab Repository URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <GitBranch className="h-4 w-4 text-primary" />
                Source Code Repository URL (GitHub or GitLab) *
              </label>
              <Input
                type="url"
                placeholder="https://github.com/organization/project-repository"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                disabled={isLocked || submitting}
                className={`bg-background min-h-[44px] ${errors.github_repository_url ? "border-destructive" : ""}`}
              />
              {errors.github_repository_url ? (
                <p className="text-xs text-destructive font-medium">{errors.github_repository_url}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Must be an accessible repository URL hosted on github.com or gitlab.com.
                </p>
              )}
            </div>

            {/* 2. Optional Live Demo URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ExternalLink className="h-4 w-4 text-primary" />
                Live Application Demo URL (Optional)
              </label>
              <Input
                type="url"
                placeholder="https://my-app.vercel.app"
                value={demoUrl}
                onChange={(e) => setDemoUrl(e.target.value)}
                disabled={isLocked || submitting}
                className={`bg-background min-h-[44px] ${errors.live_demo_url ? "border-destructive" : ""}`}
              />
              {errors.live_demo_url ? (
                <p className="text-xs text-destructive font-medium">{errors.live_demo_url}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Optional HTTPS URL to a deployed preview or cloud production instance.
                </p>
              )}
            </div>

            {/* 3. Optional Cloud Storage Manuscript Link */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Cloud className="h-4 w-4 text-primary" />
                Cloud Manuscript Link (Google Drive / OneDrive) (Optional)
              </label>
              <Input
                type="url"
                placeholder="https://drive.google.com/file/d/..."
                value={cloudUrl}
                onChange={(e) => setCloudUrl(e.target.value)}
                disabled={isLocked || submitting}
                className={`bg-background min-h-[44px] ${errors.google_drive_url ? "border-destructive" : ""}`}
              />
              {errors.google_drive_url ? (
                <p className="text-xs text-destructive font-medium">{errors.google_drive_url}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Optional shared link to external assets, design files, or complete dissertation bundle.
                </p>
              )}
            </div>

            {/* 4. Environment Setup Notes with Safe Markdown Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <FileCode className="h-4 w-4 text-primary" />
                  Environment Setup & Execution Notes (Markdown) *
                </label>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {setupNotes.length} / 20,000 characters
                </span>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-48 grid-cols-2 mb-2">
                  <TabsTrigger value="edit" className="text-xs gap-1">
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="text-xs gap-1">
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="edit" className="m-0">
                  <Textarea
                    placeholder={`# Local Setup Instructions\n\n### Prerequisites\n- Node.js v20+\n- PostgreSQL\n\n### Installation\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\n### Environment Variables & Test Credentials\n\`\`\`\nDATABASE_URL=...\nTEST_USER=user@htu.edu.gh\n\`\`\``}
                    value={setupNotes}
                    onChange={(e) => setSetupNotes(e.target.value)}
                    disabled={isLocked || submitting}
                    rows={12}
                    className={`font-mono text-xs leading-relaxed bg-background resize-y ${
                      errors.environment_setup_notes ? "border-destructive" : ""
                    }`}
                  />
                  {errors.environment_setup_notes && (
                    <p className="text-xs text-destructive font-medium mt-1">
                      {errors.environment_setup_notes}
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="preview" className="m-0">
                  <div className="border border-border rounded-md p-4 min-h-[240px] max-h-[480px] overflow-y-auto bg-muted/10">
                    <MarkdownViewer content={setupNotes} />
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </CardContent>

          {!isLocked && (
            <CardFooter className="bg-muted/20 border-t border-border py-4 px-6 flex justify-end">
              <Button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] px-6 font-semibold"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : deliverable ? (
                  "Update Software Deliverables"
                ) : (
                  "Submit Software Deliverables"
                )}
              </Button>
            </CardFooter>
          )}
        </Card>
      </form>
    </div>
  );
}
