"use client";

import * as React from "react";
import {
  Search,
  Upload,
  Download,
  Phone,
  Mail,
  CheckCircle2,
  Clock,
  GraduationCap,
} from "lucide-react";
import type { RosterStudentDocument } from "@/types/firestore";
import { generateRosterTemplateCsv } from "@/lib/roster/csv";
import { RosterImportModal } from "./RosterImportModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface StudentsRosterTableProps {
  initialStudents: RosterStudentDocument[];
  academicYearId: string;
}

const COURSES = [
  { id: "btech-cs", code: "BTECH-CS", name: "BTech Computer Science" },
  { id: "btech-ict", code: "BTECH-ICT", name: "BTech ICT" },
  { id: "hnd-cs", code: "HND-CS", name: "HND Computer Science" },
  { id: "hnd-ict", code: "HND-ICT", name: "HND ICT" },
];

export function StudentsRosterTable({
  initialStudents,
  academicYearId,
}: StudentsRosterTableProps) {
  const students = initialStudents;
  const [searchQuery, setSearchQuery] = React.useState("");
  const [courseFilter, setCourseFilter] = React.useState("all");
  const [linkFilter, setLinkFilter] = React.useState("all");
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);

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

  const filteredStudents = React.useMemo(() => {
    return students.filter((item) => {
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        item.index_number.toLowerCase().includes(query) ||
        item.full_name.toLowerCase().includes(query) ||
        item.contact.toLowerCase().includes(query);

      const matchesCourse =
        courseFilter === "all" || item.course_id.toLowerCase() === courseFilter.toLowerCase();

      const matchesLink =
        linkFilter === "all" ||
        (linkFilter === "linked" && item.user_uid !== null) ||
        (linkFilter === "unlinked" && item.user_uid === null);

      return matchesSearch && matchesCourse && matchesLink;
    });
  }, [students, searchQuery, courseFilter, linkFilter]);

  const linkedCount = React.useMemo(
    () => students.filter((s) => s.user_uid !== null).length,
    [students]
  );

  return (
    <div className="space-y-4">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
          <p className="text-muted-foreground">Total Enrolled</p>
          <p className="text-xl font-bold text-foreground mt-0.5">{students.length}</p>
        </div>
        <div className="rounded-lg border border-success/30 bg-success-soft/30 p-3 shadow-xs">
          <p className="text-success font-medium">Linked Accounts</p>
          <p className="text-xl font-bold text-success mt-0.5">{linkedCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
          <p className="text-muted-foreground">Pending Sign-In</p>
          <p className="text-xl font-bold text-muted-foreground mt-0.5">
            {students.length - linkedCount}
          </p>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 shadow-xs">
          <p className="text-primary font-medium">Academic Year</p>
          <p className="text-base font-bold text-primary mt-1 font-mono">{academicYearId}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search by index, name, or phone..."
              className="pl-9 h-9 text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Course Track Filter */}
          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="All Tracks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tracks</SelectItem>
              {COURSES.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">
                  {c.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Account Link Status Filter */}
          <Select value={linkFilter} onValueChange={setLinkFilter}>
            <SelectTrigger className="w-[130px] h-9 text-xs">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="linked">Linked</SelectItem>
              <SelectItem value="unlinked">Pending Sign-In</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            className="h-9 gap-1.5 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">CSV Template</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => setIsImportModalOpen(true)}
            className="h-9 gap-1.5 text-xs"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import Roster</span>
          </Button>
        </div>
      </div>

      {/* Roster Table */}
      <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[140px] text-xs font-semibold text-foreground">
                Index Number
              </TableHead>
              <TableHead className="text-xs font-semibold text-foreground">
                Student Name
              </TableHead>
              <TableHead className="text-xs font-semibold text-foreground">
                Contact Phone
              </TableHead>
              <TableHead className="text-xs font-semibold text-foreground">
                Course Track
              </TableHead>
              <TableHead className="text-xs font-semibold text-foreground">
                Onboarding Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStudents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-36 text-center">
                  <div className="flex flex-col items-center justify-center space-y-1 text-muted-foreground">
                    <GraduationCap className="h-8 w-8 stroke-1 text-muted-foreground/60 mb-1" />
                    <p className="text-sm font-medium text-foreground">No students in roster</p>
                    <p className="text-xs">
                      {searchQuery || courseFilter !== "all" || linkFilter !== "all"
                        ? "Try clearing your filters to see enrolled students."
                        : "Click 'Import Roster' to upload the first cohort CSV."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredStudents.map((student) => {
                const isLinked = student.user_uid !== null;

                return (
                  <TableRow key={student.index_number} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs font-medium text-foreground py-2.5">
                      {student.index_number}
                    </TableCell>

                    <TableCell className="py-2.5">
                      <div className="flex flex-col">
                        <span className="font-medium text-xs sm:text-sm text-foreground">
                          {student.full_name}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground flex items-center gap-1">
                          <Mail className="h-2.5 w-2.5" />
                          {student.email}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="font-mono text-xs text-muted-foreground py-2.5">
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 text-muted-foreground/70" />
                        {student.contact}
                      </span>
                    </TableCell>

                    <TableCell className="py-2.5">
                      <Badge variant="outline" className="font-mono uppercase text-[11px]">
                        {student.course_id}
                      </Badge>
                    </TableCell>

                    <TableCell className="py-2.5">
                      {isLinked ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                          <CheckCircle2 className="h-3 w-3" />
                          Linked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Pending Sign-In
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Import Modal */}
      <RosterImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        academicYearId={academicYearId}
        onImportSuccess={() => {
          router.refresh();
        }}
      />
    </div>
  );
}
