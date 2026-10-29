"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Search,
  Upload,
  Download,
  Phone,
  Mail,
  CheckCircle2,
  Clock,
  GraduationCap,
  Plus,
  MoreHorizontal,
  Edit,
  ArrowRightLeft,
  UserX,
  UserCheck,
  Trash2,
  Eye,
  AlertTriangle,
  Info,
} from "lucide-react";
import type { RosterStudentDocument } from "@/types/firestore";
import { generateRosterTemplateCsv } from "@/lib/roster/csv";
import { RosterImportModal } from "./RosterImportModal";
import { useAuth } from "@/context/AuthContext";
import {
  createStudent,
  updateStudent,
  deactivateStudent,
  reactivateStudent,
  deleteStudent,
} from "@/app/actions/manage-student";
import { changeStudentCourse } from "@/app/actions/change-student-course";
import {
  createStudentSchema,
  updateStudentSchema,
  deactivateStudentSchema,
  changeStudentCourseSchema,
  type CreateStudentInput,
  type UpdateStudentInput,
  type DeactivateStudentInput,
  type ChangeStudentCourseInput,
} from "@/lib/models/roster/schema";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  const router = useRouter();
  const { user } = useAuth();
  const students = initialStudents;

  const [searchQuery, setSearchQuery] = React.useState("");
  const [courseFilter, setCourseFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);

  // Active dialog states
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [selectedStudent, setSelectedStudent] = React.useState<RosterStudentDocument | null>(null);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isChangeCourseOpen, setIsChangeCourseOpen] = React.useState(false);
  const [isDeactivateOpen, setIsDeactivateOpen] = React.useState(false);
  const [isReactivateOpen, setIsReactivateOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = React.useState(false);

  // Confirmation input for delete
  const [deleteConfirmationInput, setDeleteConfirmationInput] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Form hooks
  const addForm = useForm<CreateStudentInput>({
    resolver: zodResolver(createStudentSchema),
    defaultValues: {
      index_number: "",
      full_name: "",
      contact: "",
      course_id: "btech-cs",
      academic_year_id: academicYearId,
    },
  });

  const editForm = useForm<UpdateStudentInput>({
    resolver: zodResolver(updateStudentSchema),
  });

  const changeCourseForm = useForm<ChangeStudentCourseInput>({
    resolver: zodResolver(changeStudentCourseSchema),
  });

  const deactivateForm = useForm<DeactivateStudentInput>({
    resolver: zodResolver(deactivateStudentSchema),
  });

  // Reset forms on open
  const openEditDialog = (student: RosterStudentDocument) => {
    setSelectedStudent(student);
    editForm.reset({
      index_number: student.index_number,
      full_name: student.full_name,
      contact: student.contact,
      academic_year_id: academicYearId,
    });
    setIsEditOpen(true);
  };

  const openChangeCourseDialog = (student: RosterStudentDocument) => {
    setSelectedStudent(student);
    const alternativeCourse =
      COURSES.find((c) => c.id !== student.course_id)?.id || "btech-ict";
    changeCourseForm.reset({
      index_number: student.index_number,
      course_id: alternativeCourse,
      justification: "",
      academic_year_id: academicYearId,
    });
    setIsChangeCourseOpen(true);
  };

  const openDeactivateDialog = (student: RosterStudentDocument) => {
    setSelectedStudent(student);
    deactivateForm.reset({
      index_number: student.index_number,
      reason: "",
      academic_year_id: academicYearId,
    });
    setIsDeactivateOpen(true);
  };

  const openReactivateDialog = (student: RosterStudentDocument) => {
    setSelectedStudent(student);
    setIsReactivateOpen(true);
  };

  const openDeleteDialog = (student: RosterStudentDocument) => {
    setSelectedStudent(student);
    setDeleteConfirmationInput("");
    setIsDeleteOpen(true);
  };

  const openDetailsDialog = (student: RosterStudentDocument) => {
    setSelectedStudent(student);
    setIsDetailsOpen(true);
  };

  // Submit handlers
  const handleAddSubmit = async (values: CreateStudentInput) => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      await createStudent(idToken, {
        ...values,
        academic_year_id: academicYearId,
      });
      toast.success(`Student ${values.full_name} (${values.index_number}) added successfully`);
      setIsAddOpen(false);
      addForm.reset();
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create student";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (values: UpdateStudentInput) => {
    if (!user || !selectedStudent) return;
    setIsSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      await updateStudent(idToken, {
        ...values,
        index_number: selectedStudent.index_number,
        academic_year_id: academicYearId,
      });
      toast.success(`Student record for ${selectedStudent.index_number} updated`);
      setIsEditOpen(false);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update student";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangeCourseSubmit = async (values: ChangeStudentCourseInput) => {
    if (!user || !selectedStudent) return;
    setIsSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      await changeStudentCourse(idToken, {
        index_number: selectedStudent.index_number,
        course_id: values.course_id,
        justification: values.justification,
        academic_year_id: academicYearId,
      });
      toast.success(`Course allocation for ${selectedStudent.index_number} changed`);
      setIsChangeCourseOpen(false);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to change course allocation";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivateSubmit = async (values: DeactivateStudentInput) => {
    if (!user || !selectedStudent) return;
    setIsSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      await deactivateStudent(idToken, {
        index_number: selectedStudent.index_number,
        reason: values.reason,
        academic_year_id: academicYearId,
      });
      toast.success(`Student record for ${selectedStudent.index_number} deactivated`);
      setIsDeactivateOpen(false);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to deactivate student";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReactivateSubmit = async () => {
    if (!user || !selectedStudent) return;
    setIsSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      await reactivateStudent(idToken, {
        index_number: selectedStudent.index_number,
        academic_year_id: academicYearId,
      });
      toast.success(`Student record for ${selectedStudent.index_number} reactivated`);
      setIsReactivateOpen(false);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reactivate student";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!user || !selectedStudent) return;
    if (deleteConfirmationInput !== selectedStudent.index_number) {
      toast.error("Confirmation index number does not match");
      return;
    }
    setIsSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      await deleteStudent(idToken, {
        index_number: selectedStudent.index_number,
        academic_year_id: academicYearId,
      });
      toast.success(`Student record ${selectedStudent.index_number} deleted`);
      setIsDeleteOpen(false);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete student";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
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

      const isActive = item.is_active !== false;
      const isLinked = item.user_uid !== null;

      let matchesStatus = true;
      if (statusFilter === "active") matchesStatus = isActive;
      else if (statusFilter === "inactive") matchesStatus = !isActive;
      else if (statusFilter === "linked") matchesStatus = isLinked;
      else if (statusFilter === "unlinked") matchesStatus = !isLinked;

      return matchesSearch && matchesCourse && matchesStatus;
    });
  }, [students, searchQuery, courseFilter, statusFilter]);

  const activeCount = React.useMemo(
    () => students.filter((s) => s.is_active !== false).length,
    [students]
  );

  const linkedCount = React.useMemo(
    () => students.filter((s) => s.user_uid !== null).length,
    [students]
  );

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
            <p className="text-muted-foreground">Total Enrolled</p>
            <p className="text-xl font-bold text-foreground mt-0.5">{students.length}</p>
          </div>
          <div className="rounded-lg border border-success/30 bg-success-soft/30 p-3 shadow-xs">
            <p className="text-success font-medium">Active Students</p>
            <p className="text-xl font-bold text-success mt-0.5">{activeCount}</p>
          </div>
          <div className="rounded-lg border border-info/30 bg-info-soft/30 p-3 shadow-xs">
            <p className="text-info font-medium">Linked Accounts</p>
            <p className="text-xl font-bold text-info mt-0.5">{linkedCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
            <p className="text-muted-foreground">Pending Sign-In</p>
            <p className="text-xl font-bold text-muted-foreground mt-0.5">
              {students.length - linkedCount}
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative min-w-[200px] flex-1 max-w-sm">
              <Search
                className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
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

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-9 text-xs">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
                <SelectItem value="linked">Linked Only</SelectItem>
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
              variant="outline"
              size="sm"
              onClick={() => setIsImportModalOpen(true)}
              className="h-9 gap-1.5 text-xs"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Import CSV</span>
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => {
                addForm.reset({
                  index_number: "",
                  full_name: "",
                  contact: "",
                  course_id: "btech-cs",
                  academic_year_id: academicYearId,
                });
                setIsAddOpen(true);
              }}
              className="h-9 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Student</span>
            </Button>
          </div>
        </div>

        {/* Roster Table Container */}
        <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-[130px] text-xs font-semibold text-foreground">
                    Index Number
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">
                    Student Details
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">
                    Contact Phone
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">
                    Course Track
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">
                    Status
                  </TableHead>
                  <TableHead className="w-[60px] text-right text-xs font-semibold text-foreground pr-4">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-36 text-center">
                      <div className="flex flex-col items-center justify-center space-y-1 text-muted-foreground">
                        <GraduationCap className="h-8 w-8 stroke-1 text-muted-foreground/60 mb-1" />
                        <p className="text-sm font-medium text-foreground">No students in roster</p>
                        <p className="text-xs">
                          {searchQuery || courseFilter !== "all" || statusFilter !== "all"
                            ? "Try clearing your filters to see enrolled students."
                            : "Click 'Add Student' or 'Import CSV' to populate the cohort roster."}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStudents.map((student) => {
                    const isLinked = student.user_uid !== null;
                    const isActive = student.is_active !== false;

                    return (
                      <TableRow
                        key={student.index_number}
                        className={`hover:bg-muted/30 ${
                          !isActive ? "opacity-60 bg-muted/20" : ""
                        }`}
                      >
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
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Active / Inactive Badge */}
                            {isActive ? (
                              <Badge
                                variant="outline"
                                className="border-success/30 text-success bg-success-soft/30 text-[10px]"
                              >
                                Active
                              </Badge>
                            ) : (
                              <Badge
                                variant="destructive"
                                className="bg-danger-soft text-danger border-danger/30 text-[10px]"
                              >
                                Inactive
                              </Badge>
                            )}

                            {/* Linkage Badge */}
                            {isLinked ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-info/30 bg-info-soft/40 px-2 py-0.5 text-[10px] font-medium text-info">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                Linked
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                <Clock className="h-2.5 w-2.5" />
                                Pending Sign-In
                              </span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="py-2.5 text-right pr-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                aria-label="Student actions"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 text-xs">
                              <DropdownMenuItem
                                onClick={() => openDetailsDialog(student)}
                                className="gap-2 cursor-pointer"
                              >
                                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>View Details</span>
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onClick={() => openEditDialog(student)}
                                className="gap-2 cursor-pointer"
                              >
                                <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>Edit Record</span>
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onClick={() => openChangeCourseDialog(student)}
                                className="gap-2 cursor-pointer"
                              >
                                <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>Change Course Track</span>
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />

                              {isActive ? (
                                <DropdownMenuItem
                                  onClick={() => openDeactivateDialog(student)}
                                  className="gap-2 text-warning cursor-pointer focus:text-warning"
                                >
                                  <UserX className="h-3.5 w-3.5" />
                                  <span>Deactivate Student</span>
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => openReactivateDialog(student)}
                                  className="gap-2 text-success cursor-pointer focus:text-success"
                                >
                                  <UserCheck className="h-3.5 w-3.5" />
                                  <span>Reactivate Student</span>
                                </DropdownMenuItem>
                              )}

                              <DropdownMenuSeparator />

                              {isLinked ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="w-full">
                                      <DropdownMenuItem
                                        disabled
                                        className="gap-2 text-danger opacity-50 cursor-not-allowed"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        <span>Delete Student</span>
                                      </DropdownMenuItem>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="text-xs max-w-xs">
                                    Cannot delete: student account has completed sign-in. Deactivate
                                    instead.
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => openDeleteDialog(student)}
                                  className="gap-2 text-danger cursor-pointer focus:text-danger"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span>Delete Student</span>
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* 1. Add Student Dialog */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent className="max-w-md p-0 flex flex-col h-[90vh] max-h-[90vh]">
            <DialogHeader className="p-6 pb-2 border-b border-border shrink-0">
              <DialogTitle className="text-base font-semibold">Add Student to Cohort</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Register a new student into the active cohort roster.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={addForm.handleSubmit(handleAddSubmit)}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="add-index" className="text-xs font-medium">
                    Index Number (10 digits) <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="add-index"
                    placeholder="e.g. 0323080001"
                    maxLength={10}
                    className="font-mono text-xs"
                    {...addForm.register("index_number")}
                  />
                  {addForm.formState.errors.index_number && (
                    <p className="text-[11px] text-danger">
                      {addForm.formState.errors.index_number.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="add-name" className="text-xs font-medium">
                    Full Name <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="add-name"
                    placeholder="e.g. Kofi Mensah"
                    className="text-xs"
                    {...addForm.register("full_name")}
                  />
                  {addForm.formState.errors.full_name && (
                    <p className="text-[11px] text-danger">
                      {addForm.formState.errors.full_name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="add-contact" className="text-xs font-medium">
                    Contact Phone <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="add-contact"
                    placeholder="e.g. +233 24 123 4567"
                    className="font-mono text-xs"
                    {...addForm.register("contact")}
                  />
                  {addForm.formState.errors.contact && (
                    <p className="text-[11px] text-danger">
                      {addForm.formState.errors.contact.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="add-course" className="text-xs font-medium">
                    Course Programme <span className="text-danger">*</span>
                  </Label>
                  <Select
                    defaultValue="btech-cs"
                    onValueChange={(val) => addForm.setValue("course_id", val)}
                  >
                    <SelectTrigger id="add-course" className="text-xs">
                      <SelectValue placeholder="Select programme track" />
                    </SelectTrigger>
                    <SelectContent>
                      {COURSES.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          {c.name} ({c.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="p-4 border-t border-border shrink-0 flex items-center justify-end gap-2 bg-muted/20">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddOpen(false)}
                  disabled={isSubmitting}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting}
                  className="text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isSubmitting ? "Adding..." : "Add Student"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* 2. Edit Student Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-md p-0 flex flex-col h-[90vh] max-h-[90vh]">
            <DialogHeader className="p-6 pb-2 border-b border-border shrink-0">
              <DialogTitle className="text-base font-semibold">Edit Student Record</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Update name or contact phone for {selectedStudent?.index_number}.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={editForm.handleSubmit(handleEditSubmit)}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Index Number</Label>
                  <Input
                    value={selectedStudent?.index_number || ""}
                    disabled
                    className="font-mono text-xs bg-muted/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-name" className="text-xs font-medium">
                    Full Name <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="edit-name"
                    placeholder="Full name"
                    className="text-xs"
                    {...editForm.register("full_name")}
                  />
                  {editForm.formState.errors.full_name && (
                    <p className="text-[11px] text-danger">
                      {editForm.formState.errors.full_name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-contact" className="text-xs font-medium">
                    Contact Phone <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="edit-contact"
                    placeholder="Phone number"
                    className="font-mono text-xs"
                    {...editForm.register("contact")}
                  />
                  {editForm.formState.errors.contact && (
                    <p className="text-[11px] text-danger">
                      {editForm.formState.errors.contact.message}
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter className="p-4 border-t border-border shrink-0 flex items-center justify-end gap-2 bg-muted/20">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditOpen(false)}
                  disabled={isSubmitting}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting} className="text-xs">
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* 3. Change Course Dialog */}
        <Dialog open={isChangeCourseOpen} onOpenChange={setIsChangeCourseOpen}>
          <DialogContent className="max-w-md p-0 flex flex-col h-[90vh] max-h-[90vh]">
            <DialogHeader className="p-6 pb-2 border-b border-border shrink-0">
              <DialogTitle className="text-base font-semibold">Change Course Track</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Re-allocate student {selectedStudent?.index_number} to a different programme track.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={changeCourseForm.handleSubmit(handleChangeCourseSubmit)}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                <div className="rounded-lg border border-info/30 bg-info-soft/30 p-3 text-xs text-info flex items-start gap-2">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Current course track:{" "}
                    <strong className="uppercase font-mono">
                      {selectedStudent?.course_id}
                    </strong>
                    . Course changes are prohibited if the student is currently part of an active team.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="change-course" className="text-xs font-medium">
                    New Programme Track <span className="text-danger">*</span>
                  </Label>
                  <Select
                    defaultValue={
                      COURSES.find((c) => c.id !== selectedStudent?.course_id)?.id || "btech-ict"
                    }
                    onValueChange={(val) => changeCourseForm.setValue("course_id", val)}
                  >
                    <SelectTrigger id="change-course" className="text-xs">
                      <SelectValue placeholder="Select new programme" />
                    </SelectTrigger>
                    <SelectContent>
                      {COURSES.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          {c.name} ({c.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="change-justification" className="text-xs font-medium">
                    Written Justification (min 20 characters){" "}
                    <span className="text-danger">*</span>
                  </Label>
                  <Textarea
                    id="change-justification"
                    rows={3}
                    placeholder="Provide justification for course transfer..."
                    className="text-xs resize-none"
                    {...changeCourseForm.register("justification")}
                  />
                  {changeCourseForm.formState.errors.justification && (
                    <p className="text-[11px] text-danger">
                      {changeCourseForm.formState.errors.justification.message}
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter className="p-4 border-t border-border shrink-0 flex items-center justify-end gap-2 bg-muted/20">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsChangeCourseOpen(false)}
                  disabled={isSubmitting}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting} className="text-xs">
                  {isSubmitting ? "Changing Track..." : "Change Course"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* 4. Deactivate Student Dialog */}
        <Dialog open={isDeactivateOpen} onOpenChange={setIsDeactivateOpen}>
          <DialogContent className="max-w-md p-0 flex flex-col h-[90vh] max-h-[90vh]">
            <DialogHeader className="p-6 pb-2 border-b border-border shrink-0">
              <DialogTitle className="text-base font-semibold text-warning">
                Deactivate Student
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Deactivating {selectedStudent?.full_name} ({selectedStudent?.index_number}) will
                revoke active sessions and prevent signing in.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={deactivateForm.handleSubmit(handleDeactivateSubmit)}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                <div className="rounded-lg border border-warning/30 bg-warning-soft/30 p-3 text-xs text-warning flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Cannot deactivate if the student is currently on an active project team. The
                    student record can be reactivated at any time by a coordinator or admin.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="deactivate-reason" className="text-xs font-medium">
                    Deactivation Reason (min 10 characters){" "}
                    <span className="text-danger">*</span>
                  </Label>
                  <Textarea
                    id="deactivate-reason"
                    rows={3}
                    placeholder="e.g. Student withdrew from semester, deferred, etc."
                    className="text-xs resize-none"
                    {...deactivateForm.register("reason")}
                  />
                  {deactivateForm.formState.errors.reason && (
                    <p className="text-[11px] text-danger">
                      {deactivateForm.formState.errors.reason.message}
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter className="p-4 border-t border-border shrink-0 flex items-center justify-end gap-2 bg-muted/20">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDeactivateOpen(false)}
                  disabled={isSubmitting}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  disabled={isSubmitting}
                  className="text-xs bg-warning text-white hover:bg-warning/90"
                >
                  {isSubmitting ? "Deactivating..." : "Deactivate Student"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* 5. Reactivate Student Dialog */}
        <Dialog open={isReactivateOpen} onOpenChange={setIsReactivateOpen}>
          <DialogContent className="max-w-md p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold text-success">
                Reactivate Student
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Are you sure you want to restore active status for{" "}
                <strong>{selectedStudent?.full_name}</strong> ({selectedStudent?.index_number})?
                The student will be permitted to access the system and participate in teams.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="mt-4 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsReactivateOpen(false)}
                disabled={isSubmitting}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleReactivateSubmit}
                disabled={isSubmitting}
                className="text-xs bg-success text-white hover:bg-success/90"
              >
                {isSubmitting ? "Reactivating..." : "Reactivate Student"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 6. Delete Student Dialog */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent className="max-w-md p-0 flex flex-col h-[90vh] max-h-[90vh]">
            <DialogHeader className="p-6 pb-2 border-b border-border shrink-0">
              <DialogTitle className="text-base font-semibold text-danger">
                Delete Student Record
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                This action permanently removes the student from the cohort roster.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
              <div className="rounded-lg border border-danger/30 bg-danger-soft/30 p-3 text-xs text-danger flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Hard delete is only permitted for students who have never signed in and do not
                  belong to any project team.
                </span>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  To confirm deletion, type the student index number{" "}
                  <strong className="font-mono text-foreground">
                    {selectedStudent?.index_number}
                  </strong>{" "}
                  below:
                </p>
                <Input
                  value={deleteConfirmationInput}
                  onChange={(e) => setDeleteConfirmationInput(e.target.value.trim())}
                  placeholder={selectedStudent?.index_number}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <DialogFooter className="p-4 border-t border-border shrink-0 flex items-center justify-end gap-2 bg-muted/20">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsDeleteOpen(false)}
                disabled={isSubmitting}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDeleteSubmit}
                disabled={
                  isSubmitting || deleteConfirmationInput !== selectedStudent?.index_number
                }
                className="text-xs"
              >
                {isSubmitting ? "Deleting..." : "Delete Permanently"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 7. Student Details Dialog */}
        <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <DialogContent className="max-w-md p-0 flex flex-col h-[90vh] max-h-[90vh]">
            <DialogHeader className="p-6 pb-2 border-b border-border shrink-0">
              <DialogTitle className="text-base font-semibold">Student Record Details</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Read-only overview of student onboarding and account linkage.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border p-2.5 bg-muted/20">
                  <p className="text-muted-foreground">Index Number</p>
                  <p className="font-mono font-semibold text-foreground mt-0.5">
                    {selectedStudent?.index_number}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-2.5 bg-muted/20">
                  <p className="text-muted-foreground">Course Track</p>
                  <p className="font-mono uppercase font-semibold text-foreground mt-0.5">
                    {selectedStudent?.course_id}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-muted-foreground">Full Name</p>
                <p className="font-medium text-foreground">{selectedStudent?.full_name}</p>
              </div>

              <div className="space-y-1">
                <p className="text-muted-foreground">Institutional Email</p>
                <p className="font-mono text-foreground">{selectedStudent?.email}</p>
              </div>

              <div className="space-y-1">
                <p className="text-muted-foreground">Contact Phone</p>
                <p className="font-mono text-foreground">{selectedStudent?.contact}</p>
              </div>

              <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/20">
                <p className="font-semibold text-foreground">Lifecycle & Onboarding</p>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Account Status:</span>
                  {selectedStudent?.is_active !== false ? (
                    <Badge
                      variant="outline"
                      className="border-success/30 text-success bg-success-soft/30 text-[10px]"
                    >
                      Active
                    </Badge>
                  ) : (
                    <Badge
                      variant="destructive"
                      className="bg-danger-soft text-danger border-danger/30 text-[10px]"
                    >
                      Inactive
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Portal Linkage:</span>
                  {selectedStudent?.user_uid ? (
                    <span className="font-mono text-info font-medium text-[11px]">
                      Linked ({selectedStudent.user_uid.slice(0, 12)}...)
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-[11px]">
                      Pending First Sign-In
                    </span>
                  )}
                </div>

                {selectedStudent?.is_active === false && (
                  <div className="pt-2 border-t border-border space-y-1">
                    <p className="text-danger font-medium text-[11px]">Deactivation Reason:</p>
                    <p className="text-muted-foreground text-[11px] italic">
                      {selectedStudent.deactivation_reason || "None recorded"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="p-4 border-t border-border shrink-0 flex items-center justify-end bg-muted/20">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsDetailsOpen(false)}
                className="text-xs"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
    </TooltipProvider>
  );
}
