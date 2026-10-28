"use client";

import * as React from "react";
import {
  FileSpreadsheet,
  FileText,
  Download,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Lock,
  Layers,
  GraduationCap,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  generateBroadsheet,
  getBroadsheetPreview,
  type BroadsheetPreviewResult,
} from "@/app/actions/generate-broadsheet";
import type { BroadsheetStudentRow } from "@/lib/export";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";

const PROGRAMME_OPTIONS = [
  { value: "all", label: "All Programmes (Segregated Sheets)" },
  { value: "btech-cs", label: "BTech Computer Science (BTECH-CS)" },
  { value: "btech-ict", label: "BTech ICT (BTECH-ICT)" },
  { value: "hnd-cs", label: "HND Computer Science (HND-CS)" },
  { value: "hnd-ict", label: "HND ICT (HND-ICT)" },
];

const ACADEMIC_YEARS = [
  { value: "2025-2026", label: "2025/2026 Academic Year" },
  { value: "2026-2027", label: "2026/2027 Academic Year" },
];

/**
 * Utility to decode base64 into a Blob and trigger a native browser file download.
 */
function downloadBase64(base64: string, filename: string, mime: string) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { user, activeRole, availableRoles } = useAuth();

  // Filters
  const [academicYear, setAcademicYear] = React.useState<string>("2025-2026");
  const [courseTrack, setCourseTrack] = React.useState<string>("all");

  // Preview data state
  const [previewData, setPreviewData] = React.useState<BroadsheetPreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = React.useState<boolean>(false);

  // Individual export loading states
  const [downloadingCsv, setDownloadingCsv] = React.useState<boolean>(false);
  const [downloadingXlsx, setDownloadingXlsx] = React.useState<boolean>(false);
  const [downloadingPdf, setDownloadingPdf] = React.useState<boolean>(false);

  // Role validation
  const isAuthorized =
    activeRole === "coordinator" ||
    activeRole === "admin" ||
    (availableRoles || []).includes("coordinator") ||
    (availableRoles || []).includes("admin");

  // Fetch preview manually
  const loadPreview = React.useCallback(async () => {
    if (!user) return;
    try {
      setLoadingPreview(true);
      const token = await user.getIdToken();
      const res = await getBroadsheetPreview({
        idToken: token,
        academic_year_id: academicYear,
        course_id: courseTrack,
      });

      if (!res.ok) {
        toast.error(res.error || "Failed to load broadsheet preview");
      } else {
        setPreviewData(res);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading broadsheet preview";
      toast.error(msg);
    } finally {
      setLoadingPreview(false);
    }
  }, [user, academicYear, courseTrack]);

  // Synchronize preview data on filter change
  React.useEffect(() => {
    if (!isAuthorized || !user) return;
    let isCancelled = false;

    user.getIdToken().then(async (token) => {
      if (isCancelled) return;
      setLoadingPreview(true);
      try {
        const res = await getBroadsheetPreview({
          idToken: token,
          academic_year_id: academicYear,
          course_id: courseTrack,
        });

        if (isCancelled) return;
        if (!res.ok) {
          toast.error(res.error || "Failed to load broadsheet preview");
        } else {
          setPreviewData(res);
        }
      } catch (err: unknown) {
        if (isCancelled) return;
        const msg = err instanceof Error ? err.message : "Error loading broadsheet preview";
        toast.error(msg);
      } finally {
        if (!isCancelled) {
          setLoadingPreview(false);
        }
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [isAuthorized, user, academicYear, courseTrack]);

  // Export handlers
  const handleExport = async (format: "csv" | "xlsx" | "pdf") => {
    if (!user) return;

    if (format === "csv") setDownloadingCsv(true);
    if (format === "xlsx") setDownloadingXlsx(true);
    if (format === "pdf") setDownloadingPdf(true);

    try {
      const token = await user.getIdToken();
      const res = await generateBroadsheet({
        idToken: token,
        academic_year_id: academicYear,
        course_id: courseTrack,
        format,
      });

      if (!res.ok || !res.base64 || !res.filename || !res.mime) {
        throw new Error(res.error || `Failed to export ${format.toUpperCase()}`);
      }

      downloadBase64(res.base64, res.filename, res.mime);
      toast.success(`${format.toUpperCase()} broadsheet downloaded successfully`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Export failed`;
      toast.error(msg);
    } finally {
      if (format === "csv") setDownloadingCsv(false);
      if (format === "xlsx") setDownloadingXlsx(false);
      if (format === "pdf") setDownloadingPdf(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Reports & Broadsheets"
          description="Compile and export departmental grade broadsheets."
        />
        <EmptyState
          icon={<Lock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
          title="Access Restricted"
          description="Official broadsheet compilation and export is restricted to Departmental Coordinators and Administrators."
        />
      </div>
    );
  }

  const rows: BroadsheetStudentRow[] = previewData?.rows || [];
  const totalStudents = previewData?.total_students ?? 0;
  const isAllLocked = Boolean(previewData?.is_all_locked);
  const hasIncomplete = Boolean(previewData?.has_incomplete);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Official Broadsheet Reports"
        description="Compile, review, and export official Department Broadsheets in Excel (.xlsx with live formulas), registrar-compatible CSV, and printable PDF."
      />

      {/* Filter and Export Bar */}
      <Card className="border shadow-sm">
        <CardContent className="p-4 sm:p-5 flex flex-col md:flex-row md:items-end justify-between gap-4">
          {/* Left: Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="space-y-1 sm:w-48">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                Academic Year
              </label>
              <Select value={academicYear} onValueChange={setAcademicYear}>
                <SelectTrigger className="w-full text-xs min-h-[44px]">
                  <SelectValue placeholder="Select year" />
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

            <div className="space-y-1 sm:w-64">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                Programme Track
              </label>
              <Select value={courseTrack} onValueChange={setCourseTrack}>
                <SelectTrigger className="w-full text-xs min-h-[44px]">
                  <SelectValue placeholder="Select programme" />
                </SelectTrigger>
                <SelectContent>
                  {PROGRAMME_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="pt-2 sm:pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={loadPreview}
                disabled={loadingPreview}
                className="w-full sm:w-auto min-h-[44px] text-xs font-medium"
              >
                {loadingPreview ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Filter className="h-4 w-4 mr-1.5 text-muted-foreground" />
                )}
                Refresh Preview
              </Button>
            </div>
          </div>

          {/* Right: Three Download Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0">
            {/* 1. CSV Download */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("csv")}
              disabled={downloadingCsv || rows.length === 0}
              className="min-h-[44px] text-xs font-semibold border-primary/30 hover:bg-primary/5 text-primary"
            >
              {downloadingCsv ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Download className="h-4 w-4 mr-1.5" />
              )}
              Download CSV
            </Button>

            {/* 2. Excel Download */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("xlsx")}
              disabled={downloadingXlsx || rows.length === 0}
              className="min-h-[44px] text-xs font-semibold border-emerald-600/30 hover:bg-emerald-50 text-emerald-800"
            >
              {downloadingXlsx ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 mr-1.5" />
              )}
              Download Excel (.xlsx)
            </Button>

            {/* 3. PDF Download */}
            <Button
              size="sm"
              onClick={() => handleExport("pdf")}
              disabled={downloadingPdf || rows.length === 0}
              className="min-h-[44px] text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {downloadingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <FileText className="h-4 w-4 mr-1.5" />
              )}
              Download PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Ranked Students</p>
              <p className="text-2xl font-bold text-foreground mt-0.5">{totalStudents}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
              <GraduationCap className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Publication Status</p>
              <div className="mt-1">
                {isAllLocked ? (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 gap-1 text-xs">
                    <CheckCircle2 className="h-3 w-3" />
                    All Grades Locked
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 gap-1 text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    DRAFT (Unlocked)
                  </Badge>
                )}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-muted text-muted-foreground">
              <Lock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Evaluation Integrity</p>
              <div className="mt-1">
                {hasIncomplete ? (
                  <Badge variant="outline" className="bg-rose-50 text-rose-800 border-rose-300 gap-1 text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    Incomplete Scores Present
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 gap-1 text-xs">
                    <CheckCircle2 className="h-3 w-3" />
                    All Teams Scored
                  </Badge>
                )}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-muted text-muted-foreground">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview Table Card */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Broadsheet Preview
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Showing first {rows.length} records for {academicYear} (sorted by Programme, Group, and Index Number).
              </CardDescription>
            </div>
            {totalStudents > 50 && (
              <Badge variant="outline" className="text-xs self-start sm:self-auto">
                First 50 of {totalStudents} rows
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loadingPreview ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={<FileSpreadsheet className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
                title="No Student Scores Found"
                description="No teams or student grades have been compiled for the selected academic year and programme filter."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-12 text-center text-xs font-semibold">#</TableHead>
                    <TableHead className="text-xs font-semibold">Index Number</TableHead>
                    <TableHead className="text-xs font-semibold">Full Name</TableHead>
                    <TableHead className="text-xs font-semibold">Programme</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Group No.</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Supv (40%)</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Panel (60%)</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Composite (100%)</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => (
                    <TableRow key={`${row.group_number}-${row.index_number}-${idx}`} className="hover:bg-muted/20">
                      <TableCell className="text-center text-xs text-muted-foreground py-3">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium py-3">
                        {row.index_number}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-foreground py-3">
                        {row.full_name}
                      </TableCell>
                      <TableCell className="text-xs uppercase text-muted-foreground py-3">
                        {row.course_id}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs font-medium text-foreground py-3">
                        {row.group_number}
                      </TableCell>
                      <TableCell className="text-right text-xs py-3">
                        {row.supervisor_score !== null && row.supervisor_score !== undefined
                          ? row.supervisor_score.toFixed(2)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs py-3">
                        {row.panel_average_score !== null && row.panel_average_score !== undefined
                          ? row.panel_average_score.toFixed(2)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs font-bold text-foreground py-3">
                        {row.composite_final_score !== null && row.composite_final_score !== undefined
                          ? row.composite_final_score.toFixed(2)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-center py-3">
                        {row.is_locked ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[11px] py-0.5">
                            Locked
                          </Badge>
                        ) : row.is_incomplete ? (
                          <Badge variant="outline" className="bg-rose-50 text-rose-800 border-rose-300 text-[11px] py-0.5">
                            Incomplete
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[11px] py-0.5">
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
