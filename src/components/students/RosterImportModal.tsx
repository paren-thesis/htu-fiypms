"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Sparkles,
  Download,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  parseRosterCsv,
  detectCourseFromFilename,
  generateRosterTemplateCsv,
  type ParsedRosterRow,
  type RosterParseSummary,
} from "@/lib/roster/csv";
import {
  importRosters,
  type ImportRostersResult,
} from "@/app/actions/import-rosters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";

interface RosterImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  academicYearId?: string;
  onImportSuccess?: () => void;
}

type Step = "upload" | "confirm_course" | "dry_run" | "committing" | "summary";

const COURSE_OPTIONS = [
  { id: "btech-cs", code: "BTECH-CS", label: "BTech Computer Science" },
  { id: "btech-ict", code: "BTECH-ICT", label: "BTech ICT" },
  { id: "hnd-cs", code: "HND-CS", label: "HND Computer Science" },
  { id: "hnd-ict", code: "HND-ICT", label: "HND ICT" },
];

export function RosterImportModal({
  isOpen,
  onClose,
  academicYearId,
  onImportSuccess,
}: RosterImportModalProps) {
  const router = useRouter();
  const { user } = useAuth();

  const [step, setStep] = React.useState<Step>("upload");
  const [filename, setFilename] = React.useState<string>("");
  const [detectedCourse, setDetectedCourse] = React.useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = React.useState<string>("btech-cs");
  const [batchSize, setBatchSize] = React.useState<25 | 50 | 100>(50);

  const [clientParsedRows, setClientParsedRows] = React.useState<ParsedRosterRow[]>([]);
  const [clientSummary, setClientSummary] = React.useState<RosterParseSummary | null>(null);

  const [dryRunReport, setDryRunReport] = React.useState<ImportRostersResult | null>(null);
  const [commitResult, setCommitResult] = React.useState<ImportRostersResult | null>(null);

  const [isLoading, setIsLoading] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStep("upload");
    setFilename("");
    setDetectedCourse(null);
    setSelectedCourse("btech-cs");
    setBatchSize(50);
    setClientParsedRows([]);
    setClientSummary(null);
    setDryRunReport(null);
    setCommitResult(null);
    setIsLoading(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleDownloadTemplate = () => {
    const template = generateRosterTemplateCsv();
    const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "roster_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const processFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a CSV file (.csv)");
      return;
    }

    setFilename(file.name);
    const detected = detectCourseFromFilename(file.name);
    setDetectedCourse(detected);
    if (detected) {
      setSelectedCourse(detected);
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;

      const parsed = parseRosterCsv(text);
      if (!parsed.ok) {
        toast.error(parsed.error || "Failed to parse CSV file");
        return;
      }

      setClientParsedRows(parsed.rows);
      setClientSummary(parsed.summary);
      setStep("confirm_course");
    };

    reader.onerror = () => {
      toast.error("Error reading file");
    };

    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const runDryRun = async () => {
    if (!user) {
      toast.error("You must be signed in to perform this action");
      return;
    }

    setIsLoading(true);
    try {
      const idToken = await user.getIdToken();

      const validRows = clientParsedRows
        .filter((r) => r.status === "valid")
        .map((r) => ({
          index_number: r.index_number,
          full_name: r.full_name,
          contact: r.contact,
        }));

      const res = await importRosters({
        idToken,
        course_id: selectedCourse,
        academic_year_id: academicYearId,
        filename,
        batch_size: batchSize,
        dry_run: true,
        rows: validRows,
      });

      if (!res.ok) {
        toast.error("Dry run validation failed on the server");
        return;
      }

      setDryRunReport(res);
      setStep("dry_run");
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error?.message || "Dry-run failed");
    } finally {
      setIsLoading(false);
    }
  };

  const runCommit = async () => {
    if (!user) return;

    setStep("committing");
    setIsLoading(true);

    try {
      const idToken = await user.getIdToken();

      const validRows = clientParsedRows
        .filter((r) => r.status === "valid")
        .map((r) => ({
          index_number: r.index_number,
          full_name: r.full_name,
          contact: r.contact,
        }));

      const res = await importRosters({
        idToken,
        course_id: selectedCourse,
        academic_year_id: academicYearId,
        filename,
        batch_size: batchSize,
        dry_run: false,
        rows: validRows,
      });

      if (!res.ok) {
        toast.error("Commit failed on the server");
        setStep("dry_run");
        return;
      }

      setCommitResult(res);
      setStep("summary");
      toast.success(`Successfully imported ${res.imported} students`);
      if (onImportSuccess) {
        onImportSuccess();
      }
      router.refresh();
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error?.message || "Commit failed");
      setStep("dry_run");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="text-base font-semibold">
              Import Student Cohort Roster
            </DialogTitle>
            <Badge variant="outline" className="text-[11px] font-normal">
              Step{" "}
              {step === "upload"
                ? "1 of 4"
                : step === "confirm_course"
                ? "2 of 4"
                : step === "dry_run"
                ? "3 of 4"
                : "4 of 4"}
            </Badge>
          </div>
          <DialogDescription className="text-xs">
            Upload institutional student records. No Firebase Auth accounts are created during import.
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1: UPLOAD */}
        {step === "upload" && (
          <div className="space-y-4 py-2">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
                <Upload className="h-6 w-6" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                Click to browse or drag and drop roster CSV
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                CSV must contain headers:{" "}
                <span className="font-mono text-[11px] font-medium text-foreground">
                  index_number, full_name, contact
                </span>
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3 text-xs">
              <div className="space-y-0.5">
                <p className="font-medium text-foreground">Need the standard CSV format?</p>
                <p className="text-muted-foreground text-[11px]">
                  Download the official HTU department template with example data.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                className="h-8 gap-1.5 text-xs shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Template CSV</span>
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: CONFIRM COURSE */}
        {step === "confirm_course" && (
          <div className="space-y-4 py-2">
            {detectedCourse ? (
              <div className="rounded-lg border border-info/30 bg-info-soft/40 p-3 text-xs flex items-start gap-2.5">
                <Sparkles className="h-4 w-4 text-info shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-info">Course track detected from filename</p>
                  <p className="text-muted-foreground leading-relaxed">
                    Filename <span className="font-mono text-foreground font-medium">{filename}</span>{" "}
                    matches track{" "}
                    <strong className="text-foreground uppercase">{detectedCourse}</strong>.
                    Confirm or adjust below.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-warning/30 bg-warning-soft/40 p-3 text-xs flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-warning">Manual track selection required</p>
                  <p className="text-muted-foreground leading-relaxed">
                    Could not unambiguously identify course from filename{" "}
                    <span className="font-mono text-foreground">{filename}</span>. Please choose the
                    applicable programme track.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Programme Course Track</Label>
                <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select course" />
                  </SelectTrigger>
                  <SelectContent>
                    {COURSE_OPTIONS.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.label} ({c.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Batch Commit Size</Label>
                <Select
                  value={String(batchSize)}
                  onValueChange={(val) => setBatchSize(Number(val) as 25 | 50 | 100)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25" className="text-xs">
                      25 rows / batch
                    </SelectItem>
                    <SelectItem value="50" className="text-xs">
                      50 rows / batch (Recommended)
                    </SelectItem>
                    <SelectItem value="100" className="text-xs">
                      100 rows / batch
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quick summary of parsed rows */}
            {clientSummary && (
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="rounded-lg border border-border bg-card p-2.5">
                  <p className="text-xs text-muted-foreground">Total Rows</p>
                  <p className="text-lg font-bold text-foreground">{clientSummary.total}</p>
                </div>
                <div className="rounded-lg border border-success/30 bg-success-soft/30 p-2.5">
                  <p className="text-xs text-success">Valid</p>
                  <p className="text-lg font-bold text-success">{clientSummary.valid}</p>
                </div>
                <div className="rounded-lg border border-danger/30 bg-danger-soft/30 p-2.5">
                  <p className="text-xs text-danger">Errors / Dups</p>
                  <p className="text-lg font-bold text-danger">
                    {clientSummary.errors + clientSummary.duplicatesInFile}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: DRY RUN REPORT */}
        {step === "dry_run" && dryRunReport && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-lg border border-border bg-card p-2">
                <p className="text-muted-foreground text-[11px]">Total</p>
                <p className="text-base font-bold text-foreground">{dryRunReport.total}</p>
              </div>
              <div className="rounded-lg border border-success/30 bg-success-soft/40 p-2">
                <p className="text-success text-[11px]">Ready to Import</p>
                <p className="text-base font-bold text-success">
                  {dryRunReport.valid - dryRunReport.skipped}
                </p>
              </div>
              <div className="rounded-lg border border-warning/30 bg-warning-soft/40 p-2">
                <p className="text-warning text-[11px]">Duplicate (Skip)</p>
                <p className="text-base font-bold text-warning">{dryRunReport.skipped}</p>
              </div>
              <div className="rounded-lg border border-danger/30 bg-danger-soft/40 p-2">
                <p className="text-danger text-[11px]">Errors</p>
                <p className="text-base font-bold text-danger">{dryRunReport.errors}</p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="max-h-56 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-[11px]">Index</TableHead>
                      <TableHead className="text-[11px]">Student Name</TableHead>
                      <TableHead className="text-[11px]">Status</TableHead>
                      <TableHead className="text-[11px]">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dryRunReport.rows.slice(0, 30).map((row, idx) => (
                      <TableRow key={idx} className="text-xs">
                        <TableCell className="font-mono text-[11px] py-1.5">
                          {row.index_number || "—"}
                        </TableCell>
                        <TableCell className="py-1.5 font-medium">{row.full_name}</TableCell>
                        <TableCell className="py-1.5">
                          {row.status === "imported" && (
                            <Badge variant="outline" className="text-success border-success/30 bg-success-soft text-[10px]">
                              Valid
                            </Badge>
                          )}
                          {row.status === "skipped" && (
                            <Badge variant="outline" className="text-warning border-warning/30 bg-warning-soft text-[10px]">
                              Duplicate
                            </Badge>
                          )}
                          {row.status === "error" && (
                            <Badge variant="outline" className="text-danger border-danger/30 bg-danger-soft text-[10px]">
                              Error
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-[11px] py-1.5">
                          {row.reason || "Ready for commit"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            {dryRunReport.rows.length > 30 && (
              <p className="text-[11px] text-muted-foreground text-center">
                Showing first 30 of {dryRunReport.rows.length} rows
              </p>
            )}
          </div>
        )}

        {/* STEP 4: COMMITTING PROGRESS */}
        {step === "committing" && (
          <div className="flex flex-col items-center justify-center py-12 space-y-3 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-semibold text-foreground">Committing Batches to Firestore...</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Writing student records in batches of {batchSize}. Please do not close this window.
            </p>
          </div>
        )}

        {/* STEP 5: SUMMARY */}
        {step === "summary" && commitResult && (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center justify-center py-4 text-center space-y-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
                <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Import Completed Successfully</h3>
              <p className="text-xs text-muted-foreground">
                All records have been processed and indexed into the active cohort roster.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg border border-success/30 bg-success-soft/30 p-2.5">
                <p className="text-success text-[11px] font-medium">Imported</p>
                <p className="text-xl font-bold text-success">{commitResult.imported}</p>
              </div>
              <div className="rounded-lg border border-warning/30 bg-warning-soft/30 p-2.5">
                <p className="text-warning text-[11px] font-medium">Skipped Duplicates</p>
                <p className="text-xl font-bold text-warning">{commitResult.skipped}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-2.5">
                <p className="text-muted-foreground text-[11px] font-medium">Errors</p>
                <p className="text-xl font-bold text-foreground">{commitResult.errors}</p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
          {step === "upload" && (
            <Button type="button" variant="outline" size="sm" onClick={handleClose}>
              Cancel
            </Button>
          )}

          {step === "confirm_course" && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep("upload")}
                className="gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={runDryRun}
                disabled={isLoading}
                className="gap-1.5"
              >
                {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Run Dry-Run Check</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          {step === "dry_run" && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep("confirm_course")}
                className="gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Adjust Settings</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={runCommit}
                disabled={isLoading || (dryRunReport?.valid === 0 && dryRunReport?.skipped === 0)}
                className="gap-1.5"
              >
                {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Commit {dryRunReport ? dryRunReport.valid - dryRunReport.skipped : 0} Rows</span>
              </Button>
            </>
          )}

          {step === "summary" && (
            <Button type="button" size="sm" onClick={handleClose}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
