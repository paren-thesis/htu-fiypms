"use client";

import * as React from "react";
import { collection, query, where, onSnapshot, doc } from "firebase/firestore";
import {
  Lock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Edit,
  ShieldCheck,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import {
  publishGrades,
  type PreflightFailure,
} from "@/app/actions/publish-grades";
import type { TeamDocument, AcademicYearDocument } from "@/types/firestore";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AmendGradeDialog } from "./AmendGradeDialog";

const ACADEMIC_YEARS = [
  { value: "2025-2026", label: "2025/2026 Academic Year" },
  { value: "2026-2027", label: "2026/2027 Academic Year" },
];

export function CoordinatorGradesView() {
  const { user } = useAuth();

  const [selectedYear, setSelectedYear] = React.useState<string>("2025-2026");
  const [academicYear, setAcademicYear] = React.useState<AcademicYearDocument | null>(null);
  const [teams, setTeams] = React.useState<TeamDocument[]>([]);
  const [loadingTeams, setLoadingTeams] = React.useState<boolean>(true);

  // Preflight state
  const [checkingPreflight, setCheckingPreflight] = React.useState<boolean>(false);
  const [preflightFailures, setPreflightFailures] = React.useState<PreflightFailure[]>([]);
  const [preflightRan, setPreflightRan] = React.useState<boolean>(false);

  // Override justification state
  const [overrideJustification, setOverrideJustification] = React.useState<string>("");

  // Publish Dialog & type-to-confirm state
  const [publishDialogOpen, setPublishDialogOpen] = React.useState<boolean>(false);
  const [confirmInput, setConfirmInput] = React.useState<string>("");
  const [publishing, setPublishing] = React.useState<boolean>(false);

  // Amend Dialog state
  const [amendTeam, setAmendTeam] = React.useState<TeamDocument | null>(null);
  const [amendDialogOpen, setAmendDialogOpen] = React.useState<boolean>(false);

  // 1. Stream Academic Year
  React.useEffect(() => {
    const yearRef = doc(db, "academic_years", selectedYear);
    const unsubscribe = onSnapshot(yearRef, (snap) => {
      if (snap.exists()) {
        setAcademicYear({ id: snap.id, ...(snap.data() as Omit<AcademicYearDocument, "id">) });
      } else {
        setAcademicYear(null);
      }
    });

    return () => unsubscribe();
  }, [selectedYear]);

  // 2. Stream Teams for selected academic year
  React.useEffect(() => {
    let active = true;
    const q = query(
      collection(db, "teams"),
      where("academic_year_id", "==", selectedYear)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!active) return;
        const docs = snapshot.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<TeamDocument, "id">) }))
          .filter((t) => t.status !== "disbanded");
        setTeams(docs);
        setLoadingTeams(false);
      },
      (error) => {
        if (!active) return;
        console.error("Failed to stream teams for grades view:", error);
        setLoadingTeams(false);
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [selectedYear]);

  // Run Pre-flight Check
  const runPreflight = async () => {
    if (!user) return;
    setCheckingPreflight(true);
    try {
      const token = await user.getIdToken();
      const res = await publishGrades(token, {
        academic_year_id: selectedYear,
        preflight_only: true,
      });

      if (!res.ok) {
        toast.error(res.error || "Preflight check failed");
      } else if (res.preflight) {
        setPreflightFailures(res.preflight.failures);
        setPreflightRan(true);
        if (res.preflight.failures.length === 0) {
          toast.success("Pre-flight check passed! All teams are ready for publication.");
        } else {
          toast.warning(`Pre-flight found ${res.preflight.failures.length} issues.`);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Preflight check error";
      toast.error(msg);
    } finally {
      setCheckingPreflight(false);
    }
  };

  // Handle Publish Execution
  const handlePublish = async () => {
    if (!user || confirmInput !== "PUBLISH") return;

    setPublishing(true);
    try {
      const token = await user.getIdToken();
      const res = await publishGrades(token, {
        academic_year_id: selectedYear,
        override: overrideJustification.trim().length >= 10
          ? { justification: overrideJustification.trim() }
          : undefined,
      });

      if (!res.ok) {
        throw new Error(res.error || "Grade publication failed");
      }

      toast.success("Final grades officially published and locked for session!");
      setPublishDialogOpen(false);
      setConfirmInput("");
      setOverrideJustification("");
      setPreflightRan(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Publication failed";
      toast.error(msg);
    } finally {
      setPublishing(false);
    }
  };

  const isPublished = Boolean(academicYear?.grades_published);
  const hasMissingScores = preflightFailures.some((f) => f.reason === "missing_scores");
  const hasMissingSignoffs = preflightFailures.some((f) => f.reason === "missing_signoff");
  const canPublish =
    preflightRan &&
    !hasMissingScores &&
    (!hasMissingSignoffs || overrideJustification.trim().length >= 10);

  return (
    <div className="space-y-6">
      {/* Year Filter & Publication Controls */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Final Grade Publication Control Panel
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Execute pre-flight checks, override missing deliverables sign-offs, and publish official final scores.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={selectedYear}
                onValueChange={(val) => {
                  setLoadingTeams(true);
                  setSelectedYear(val);
                }}
              >
                <SelectTrigger className="w-48 text-xs min-h-[44px]">
                  <SelectValue placeholder="Academic Year" />
                </SelectTrigger>
                <SelectContent>
                  {ACADEMIC_YEARS.map((y) => (
                    <SelectItem key={y.value} value={y.value} className="text-xs">
                      {y.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          {isPublished ? (
            <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-full bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-900">
                    Official Grades Published & Locked
                  </h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Evaluations are sealed against client modification. The 7-day student grade appeal window is currently active.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1 text-xs font-semibold py-1">
                  <Lock className="h-3.5 w-3.5" />
                  Locked Session
                </Badge>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border bg-muted/20">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    Pre-Flight Checklist Status
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Verifies that every active project team has computed scores and supervisor deliverables sign-offs.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={runPreflight}
                    disabled={checkingPreflight}
                    className="min-h-[44px] text-xs font-semibold"
                  >
                    {checkingPreflight ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 mr-1.5 text-primary" />
                    )}
                    Run Pre-Flight Check
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => setPublishDialogOpen(true)}
                    disabled={!canPublish}
                    className="min-h-[44px] text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    <Send className="h-4 w-4 mr-1.5" />
                    Publish & Lock Grades
                  </Button>
                </div>
              </div>

              {/* Preflight Checklist Warnings */}
              {preflightRan && preflightFailures.length > 0 && (
                <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/50 space-y-3">
                  <div className="flex items-center gap-2 text-amber-900 text-xs font-bold">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Pre-flight Issues ({preflightFailures.length} Team Checkpoints Failed):
                  </div>

                  <ul className="text-xs text-amber-800 space-y-1 list-disc pl-5">
                    {preflightFailures.map((f, i) => (
                      <li key={i}>
                        <span className="font-semibold font-mono uppercase">{f.group_number}:</span>{" "}
                        {f.message}
                      </li>
                    ))}
                  </ul>

                  {/* Missing Deliverables Override Section */}
                  {!hasMissingScores && hasMissingSignoffs && (
                    <div className="pt-2 border-t border-amber-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-amber-900">
                          Administrative Override for Missing Deliverables:
                        </label>
                        <span className="text-[11px] font-mono text-amber-700">
                          {overrideJustification.trim().length}/10 min
                        </span>
                      </div>
                      <Textarea
                        rows={2}
                        value={overrideJustification}
                        onChange={(e) => setOverrideJustification(e.target.value)}
                        placeholder="State why final grades are being published prior to supervisor deliverables sign-off (e.g. Approved by Head of Department)..."
                        className="text-xs bg-white resize-none"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Teams Grades Table */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Teams Final Grades ({teams.length})
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Cumulative project marks, supervisor components, and post-publication amendment options.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loadingTeams ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : teams.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No project teams recorded for {selectedYear}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-12 text-center text-xs font-semibold">#</TableHead>
                    <TableHead className="text-xs font-semibold">Group</TableHead>
                    <TableHead className="text-xs font-semibold">Project Name</TableHead>
                    <TableHead className="text-xs font-semibold">Track</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Supv (40%)</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Panel (60%)</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Composite</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Status</TableHead>
                    <TableHead className="w-24 text-right text-xs font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teams.map((t, idx) => {
                    const summary = t.scores_summary;
                    const hasScores =
                      summary != null &&
                      typeof summary.composite_final_score === "number";

                    return (
                      <TableRow key={t.id} className="hover:bg-muted/20">
                        <TableCell className="text-center text-xs text-muted-foreground py-3">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-medium py-3">
                          {t.group_number || "—"}
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-foreground py-3 max-w-xs truncate">
                          {t.name}
                        </TableCell>
                        <TableCell className="text-xs uppercase text-muted-foreground py-3">
                          {t.course_id}
                        </TableCell>
                        <TableCell className="text-right text-xs py-3">
                          {hasScores && summary?.supervisor_score !== undefined
                            ? summary.supervisor_score.toFixed(2)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs py-3">
                          {hasScores && summary?.panel_average_score !== undefined
                            ? summary.panel_average_score.toFixed(2)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold text-foreground py-3">
                          {hasScores && summary?.composite_final_score !== undefined
                            ? summary.composite_final_score.toFixed(2)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-center py-3">
                          {summary?.is_locked ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[11px] py-0.5">
                              Locked
                            </Badge>
                          ) : hasScores ? (
                            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[11px] py-0.5">
                              Ready
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-rose-50 text-rose-800 border-rose-300 text-[11px] py-0.5">
                              Incomplete
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setAmendTeam(t);
                              setAmendDialogOpen(true);
                            }}
                            className="min-h-[36px] text-xs font-medium gap-1 text-primary hover:text-primary"
                          >
                            <Edit className="h-3.5 w-3.5" />
                            Amend
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Type-to-Confirm Publication Dialog */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary">
              <Send className="h-5 w-5" />
              <DialogTitle className="text-base font-bold">
                Publish & Lock Final Grades
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              This action seals all evaluation marksheets, marks active teams as completed, and starts the 7-day student appeal window.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <p className="font-semibold">Irreversible Administrative Action:</p>
              <p>
                Once published, clients can no longer create or edit evaluation records. Future score changes will require formal audit-logged amendments.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Type <span className="font-mono text-primary font-bold">PUBLISH</span> to confirm:
              </label>
              <Input
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="PUBLISH"
                className="font-mono text-xs uppercase min-h-[44px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPublishDialogOpen(false)}
              disabled={publishing}
              className="min-h-[44px] text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handlePublish}
              disabled={confirmInput !== "PUBLISH" || publishing}
              className="min-h-[44px] text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {publishing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
              )}
              Confirm Publication
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Amend Grade Dialog */}
      <AmendGradeDialog
        team={amendTeam}
        open={amendDialogOpen}
        onOpenChange={setAmendDialogOpen}
        onSuccess={() => {
          // Team updates stream automatically via onSnapshot
        }}
      />
    </div>
  );
}
