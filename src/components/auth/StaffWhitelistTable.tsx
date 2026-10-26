"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Edit2,
  UserX,
  UserCheck,
  Loader2,
  Building2,
  BookOpen,
  Mail,
  Phone,
  Shield,
  Filter,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import type { StaffWhitelistDocument } from "@/types/firestore";
import type { StaffRole } from "@/lib/models/staff-whitelist/schema";
import {
  addStaffWhitelistEntry,
  updateStaffWhitelistEntry,
  deactivateStaffWhitelistEntry,
  reactivateStaffWhitelistEntry,
} from "@/app/actions/manage-staff-whitelist";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface StaffWhitelistTableProps {
  initialStaff: StaffWhitelistDocument[];
}

const AVAILABLE_ROLES: { id: StaffRole; label: string; description: string }[] = [
  { id: "coordinator", label: "Coordinator", description: "Program coordination and administration" },
  { id: "supervisor", label: "Supervisor", description: "Project proposal and continuous assessment supervision" },
  { id: "panel_member", label: "Panel Member", description: "Oral defense and marksheet examination" },
  { id: "admin", label: "System Admin", description: "System audit logs and platform configuration" },
];

const AVAILABLE_PROGRAMMES: { id: string; label: string }[] = [
  { id: "btech-cs", label: "BTech Computer Science" },
  { id: "btech-ict", label: "BTech ICT" },
  { id: "hnd-cs", label: "HND Computer Science" },
  { id: "hnd-ict", label: "HND ICT" },
];

export function StaffWhitelistTable({ initialStaff }: StaffWhitelistTableProps) {
  const router = useRouter();
  const { user } = useAuth();

  const [staffList, setStaffList] = React.useState<StaffWhitelistDocument[]>(initialStaff);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<string>("all");
  const [programmeFilter, setProgrammeFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  // Sheet (Add / Edit) state
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [editingStaff, setEditingStaff] = React.useState<StaffWhitelistDocument | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Form Fields
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [department, setDepartment] = React.useState("Computer Science");
  const [phone, setPhone] = React.useState("");
  const [selectedRoles, setSelectedRoles] = React.useState<StaffRole[]>(["supervisor"]);
  const [selectedProgrammes, setSelectedProgrammes] = React.useState<string[]>([
    "btech-cs",
    "btech-ict",
  ]);

  // Dialog (Deactivate / Reactivate) state
  const [confirmDialog, setConfirmDialog] = React.useState<{
    isOpen: boolean;
    staff: StaffWhitelistDocument | null;
    action: "deactivate" | "reactivate";
  }>({
    isOpen: false,
    staff: null,
    action: "deactivate",
  });
  const [isActionLoading, setIsActionLoading] = React.useState(false);


  // Filtered List
  const filteredStaff = React.useMemo(() => {
    return staffList.filter((item) => {
      // Search
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        item.full_name.toLowerCase().includes(query) ||
        item.email.toLowerCase().includes(query) ||
        item.department.toLowerCase().includes(query);

      // Role Filter
      const matchesRole =
        roleFilter === "all" || item.roles.includes(roleFilter.toLowerCase());

      // Programme Filter
      const matchesProgramme =
        programmeFilter === "all" ||
        item.programmes.map((p) => p.toLowerCase()).includes(programmeFilter.toLowerCase());

      // Status Filter
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && item.is_active) ||
        (statusFilter === "inactive" && !item.is_active);

      return matchesSearch && matchesRole && matchesProgramme && matchesStatus;
    });
  }, [staffList, searchQuery, roleFilter, programmeFilter, statusFilter]);

  const openAddSheet = () => {
    setEditingStaff(null);
    setFullName("");
    setEmail("");
    setDepartment("Computer Science");
    setPhone("");
    setSelectedRoles(["supervisor"]);
    setSelectedProgrammes(["btech-cs", "btech-ict"]);
    setIsSheetOpen(true);
  };

  const openEditSheet = (staff: StaffWhitelistDocument) => {
    setEditingStaff(staff);
    setFullName(staff.full_name);
    setEmail(staff.email);
    setDepartment(staff.department);
    setPhone(staff.phone || "");
    setSelectedRoles(staff.roles as StaffRole[]);
    setSelectedProgrammes(staff.programmes);
    setIsSheetOpen(true);
  };

  const handleToggleRole = (role: StaffRole) => {
    if (selectedRoles.includes(role)) {
      if (selectedRoles.length === 1) {
        toast.error("At least one role is required");
        return;
      }
      setSelectedRoles(selectedRoles.filter((r) => r !== role));
    } else {
      setSelectedRoles([...selectedRoles, role]);
    }
  };

  const handleToggleProgramme = (progId: string) => {
    if (selectedProgrammes.includes(progId)) {
      if (selectedProgrammes.length === 1) {
        toast.error("At least one programme is required");
        return;
      }
      setSelectedProgrammes(selectedProgrammes.filter((p) => p !== progId));
    } else {
      setSelectedProgrammes([...selectedProgrammes, progId]);
    }
  };

  const handleSubmitSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("You must be authenticated to perform this action");
      return;
    }

    if (!fullName.trim()) {
      toast.error("Full name is required");
      return;
    }

    if (!editingStaff && (!email.trim() || !email.trim().endsWith("@htu.edu.gh"))) {
      toast.error("A valid university email ending with @htu.edu.gh is required");
      return;
    }

    if (selectedRoles.length === 0) {
      toast.error("Please select at least one role");
      return;
    }

    if (selectedProgrammes.length === 0) {
      toast.error("Please select at least one programme");
      return;
    }

    setIsSubmitting(true);
    try {
      const idToken = await user.getIdToken();

      if (editingStaff) {
        // Edit flow
        const res = await updateStaffWhitelistEntry({
          idToken,
          email: editingStaff.email,
          patch: {
            full_name: fullName.trim(),
            roles: selectedRoles,
            department: department.trim(),
            programmes: selectedProgrammes,
            phone: phone.trim() || undefined,
          },
        });

        if (res.ok) {
          toast.success(`Updated ${editingStaff.full_name}`);
          setStaffList((prev) =>
            prev.map((s) =>
              s.email === editingStaff.email
                ? {
                    ...s,
                    full_name: fullName.trim(),
                    roles: selectedRoles,
                    department: department.trim(),
                    programmes: selectedProgrammes,
                    phone: phone.trim() || undefined,
                  }
                : s
            )
          );
          setIsSheetOpen(false);
          router.refresh();
        } else {
          toast.error(res.error || "Failed to update staff member");
        }
      } else {
        // Add flow
        const cleanEmail = email.trim().toLowerCase();
        const res = await addStaffWhitelistEntry({
          idToken,
          email: cleanEmail,
          full_name: fullName.trim(),
          roles: selectedRoles,
          department: department.trim(),
          programmes: selectedProgrammes,
          phone: phone.trim() || undefined,
        });

        if (res.ok && res.data) {
          toast.success(`Added ${fullName.trim()} to staff whitelist`);
          setStaffList((prev) => [res.data!, ...prev]);
          setIsSheetOpen(false);
          router.refresh();
        } else {
          toast.error(res.error || "Failed to add staff member");
        }
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error?.message || "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActiveConfirm = async () => {
    if (!user || !confirmDialog.staff) return;

    setIsActionLoading(true);
    try {
      const idToken = await user.getIdToken();
      const targetEmail = confirmDialog.staff.email;

      if (confirmDialog.action === "deactivate") {
        const res = await deactivateStaffWhitelistEntry({ idToken, email: targetEmail });
        if (res.ok) {
          toast.success(`Deactivated ${confirmDialog.staff.full_name}`);
          setStaffList((prev) =>
            prev.map((s) => (s.email === targetEmail ? { ...s, is_active: false } : s))
          );
          router.refresh();
        } else {
          toast.error(res.error || "Failed to deactivate staff member");
        }
      } else {
        const res = await reactivateStaffWhitelistEntry({ idToken, email: targetEmail });
        if (res.ok) {
          toast.success(`Reactivated ${confirmDialog.staff.full_name}`);
          setStaffList((prev) =>
            prev.map((s) => (s.email === targetEmail ? { ...s, is_active: true } : s))
          );
          router.refresh();
        } else {
          toast.error(res.error || "Failed to reactivate staff member");
        }
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error?.message || "Action failed");
    } finally {
      setIsActionLoading(false);
      setConfirmDialog({ isOpen: false, staff: null, action: "deactivate" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative min-w-[240px] flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search by name, email, department..."
              className="pl-9 h-9 text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Role Filter */}
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="coordinator">Coordinator</SelectItem>
              <SelectItem value="supervisor">Supervisor</SelectItem>
              <SelectItem value="panel_member">Panel Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>

          {/* Programme Filter */}
          <Select value={programmeFilter} onValueChange={setProgrammeFilter}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="All Tracks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tracks</SelectItem>
              {AVAILABLE_PROGRAMMES.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] h-9 text-xs">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Add Staff Button */}
        <Button onClick={openAddSheet} size="sm" className="h-9 gap-1.5 shrink-0">
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Add Staff Member</span>
        </Button>
      </div>

      {/* Staff Whitelist Table */}
      <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[260px] text-xs font-semibold text-foreground">
                Staff Member
              </TableHead>
              <TableHead className="text-xs font-semibold text-foreground">
                Roles
              </TableHead>
              <TableHead className="text-xs font-semibold text-foreground">
                Supervised Tracks
              </TableHead>
              <TableHead className="text-xs font-semibold text-foreground">
                Status
              </TableHead>
              <TableHead className="text-right text-xs font-semibold text-foreground">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStaff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-36 text-center">
                  <div className="flex flex-col items-center justify-center space-y-1 text-muted-foreground">
                    <Filter className="h-8 w-8 stroke-1 text-muted-foreground/60 mb-1" />
                    <p className="text-sm font-medium text-foreground">No staff entries found</p>
                    <p className="text-xs">
                      Try refining your search filter or add a new faculty member.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredStaff.map((staff) => {
                const isCurrentUser = user?.email?.toLowerCase() === staff.email.toLowerCase();

                return (
                  <TableRow key={staff.email} className="hover:bg-muted/30">
                    {/* Staff Member Info */}
                    <TableCell className="align-top py-3">
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground text-xs sm:text-sm">
                          {staff.full_name}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Mail className="h-3 w-3 shrink-0" />
                          {staff.email}
                        </span>
                        {staff.phone && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Phone className="h-3 w-3 shrink-0" />
                            {staff.phone}
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground/80 flex items-center gap-1 mt-1">
                          <Building2 className="h-3 w-3 shrink-0" />
                          {staff.department}
                        </span>
                      </div>
                    </TableCell>

                    {/* Roles Badges */}
                    <TableCell className="align-top py-3">
                      <div className="flex flex-wrap gap-1">
                        {staff.roles.map((role) => (
                          <Badge
                            key={role}
                            variant="secondary"
                            className="capitalize text-[11px] font-medium border-border"
                          >
                            {role.replace("_", " ")}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>

                    {/* Supervised Tracks */}
                    <TableCell className="align-top py-3">
                      <div className="flex flex-wrap gap-1">
                        {staff.programmes.map((prog) => (
                          <span
                            key={prog}
                            className="inline-flex items-center gap-1 rounded bg-muted/70 px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground"
                          >
                            <BookOpen className="h-2.5 w-2.5" />
                            {prog.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell className="align-top py-3">
                      {staff.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                          <span className="h-1.5 w-1.5 rounded-full bg-success" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
                          <span className="h-1.5 w-1.5 rounded-full bg-danger" />
                          Inactive
                        </span>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="align-top py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => openEditSheet(staff)}
                          title="Edit staff details"
                          aria-label={`Edit ${staff.full_name}`}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>

                        {staff.is_active ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isCurrentUser}
                            className="h-8 w-8 text-danger hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                            onClick={() =>
                              setConfirmDialog({
                                isOpen: true,
                                staff,
                                action: "deactivate",
                              })
                            }
                            title={
                              isCurrentUser
                                ? "Cannot deactivate yourself"
                                : "Deactivate staff member"
                            }
                            aria-label={`Deactivate ${staff.full_name}`}
                          >
                            <UserX className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-success hover:bg-success-soft hover:text-success"
                            onClick={() =>
                              setConfirmDialog({
                                isOpen: true,
                                staff,
                                action: "reactivate",
                              })
                            }
                            title="Reactivate staff member"
                            aria-label={`Reactivate ${staff.full_name}`}
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add / Edit Staff Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editingStaff ? "Edit Staff Whitelist Entry" : "Add Staff Member"}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {editingStaff
                ? "Update faculty roles, department, and assigned supervision tracks."
                : "Whitelist faculty members prior to their first institutional sign-in."}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmitSheet} className="space-y-4 py-4 text-xs">
            {/* Full Name */}
            <div className="space-y-1.5">
              <Label htmlFor="staff-fullname" className="text-xs font-medium">
                Full Name <span className="text-danger">*</span>
              </Label>
              <Input
                id="staff-fullname"
                placeholder="e.g. Dr. Kwami Klu"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="h-9 text-xs"
              />
            </div>

            {/* Email Address */}
            <div className="space-y-1.5">
              <Label htmlFor="staff-email" className="text-xs font-medium">
                University Email <span className="text-danger">*</span>
              </Label>
              <Input
                id="staff-email"
                type="email"
                placeholder="e.g. kklu@htu.edu.gh"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={Boolean(editingStaff)}
                required
                className="h-9 text-xs font-mono disabled:opacity-60"
              />
              <p className="text-[11px] text-muted-foreground">
                Must end with @htu.edu.gh. Cannot be altered once registered.
              </p>
            </div>

            {/* Department */}
            <div className="space-y-1.5">
              <Label htmlFor="staff-dept" className="text-xs font-medium">
                Department
              </Label>
              <Input
                id="staff-dept"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Phone Number (Optional) */}
            <div className="space-y-1.5">
              <Label htmlFor="staff-phone" className="text-xs font-medium">
                Contact Phone <span className="text-muted-foreground text-[10px]">(Optional)</span>
              </Label>
              <Input
                id="staff-phone"
                placeholder="e.g. +233 24 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Roles Multi-Select */}
            <div className="space-y-2 pt-1 border-t border-border">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-primary" />
                Staff Roles <span className="text-danger">*</span>
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Staff can hold multiple roles and switch active contexts.
              </p>
              <div className="space-y-2 pt-1">
                {AVAILABLE_ROLES.map((role) => (
                  <div
                    key={role.id}
                    className="flex items-start space-x-2.5 rounded-md border border-border p-2.5 hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => handleToggleRole(role.id)}
                  >
                    <Checkbox
                      id={`role-${role.id}`}
                      checked={selectedRoles.includes(role.id)}
                      onCheckedChange={() => handleToggleRole(role.id)}
                      className="mt-0.5"
                    />
                    <div className="space-y-0.5">
                      <Label
                        htmlFor={`role-${role.id}`}
                        className="text-xs font-medium leading-none cursor-pointer text-foreground"
                      >
                        {role.label}
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        {role.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Supervised Programmes Multi-Select */}
            <div className="space-y-2 pt-1 border-t border-border">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
                Superviseable Programme Tracks <span className="text-danger">*</span>
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Required for supervisor matching algorithm (FR-04.2a).
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {AVAILABLE_PROGRAMMES.map((prog) => {
                  const isChecked = selectedProgrammes.includes(prog.id);
                  return (
                    <div
                      key={prog.id}
                      onClick={() => handleToggleProgramme(prog.id)}
                      className={`flex items-center space-x-2 rounded-md border p-2 cursor-pointer transition-colors ${
                        isChecked
                          ? "border-primary/50 bg-primary/5"
                          : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <Checkbox
                        id={`prog-${prog.id}`}
                        checked={isChecked}
                        onCheckedChange={() => handleToggleProgramme(prog.id)}
                      />
                      <Label
                        htmlFor={`prog-${prog.id}`}
                        className="text-xs font-medium cursor-pointer"
                      >
                        {prog.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>

            <SheetFooter className="pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsSheetOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                {editingStaff ? "Save Changes" : "Add to Whitelist"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Deactivate / Reactivate Confirm Dialog */}
      <Dialog
        open={confirmDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog({ isOpen: false, staff: null, action: "deactivate" });
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              {confirmDialog.action === "deactivate"
                ? "Deactivate Staff Access"
                : "Reactivate Staff Access"}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed pt-1">
              {confirmDialog.action === "deactivate" ? (
                <span>
                  Are you sure you want to deactivate{" "}
                  <strong className="text-foreground">{confirmDialog.staff?.full_name}</strong> (
                  <span className="font-mono text-xs">{confirmDialog.staff?.email}</span>)?
                  <br />
                  <br />
                  Their institutional session will be immediately revoked and they will be barred
                  from accessing coordinator, supervisor, and panel member functions.
                </span>
              ) : (
                <span>
                  Are you sure you want to reactivate access for{" "}
                  <strong className="text-foreground">{confirmDialog.staff?.full_name}</strong> (
                  <span className="font-mono text-xs">{confirmDialog.staff?.email}</span>)?
                  <br />
                  <br />
                  They will regain full system access under their configured roles.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isActionLoading}
              onClick={() =>
                setConfirmDialog({ isOpen: false, staff: null, action: "deactivate" })
              }
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant={confirmDialog.action === "deactivate" ? "destructive" : "default"}
              disabled={isActionLoading}
              onClick={handleToggleActiveConfirm}
            >
              {isActionLoading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {confirmDialog.action === "deactivate" ? "Confirm Deactivation" : "Reactivate Staff"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
