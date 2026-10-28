"use client";

import * as React from "react";
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  AlertTriangle,
  Building2,
  Video,
  ShieldCheck,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import type {
  DefensePanelDocument,
  TeamDocument,
  StaffWhitelistDocument,
} from "@/types/firestore";
import { detectConflicts } from "@/lib/defense/conflicts";
import {
  createDefensePanel,
  updateDefensePanel,
} from "@/app/actions/manage-defense-panel";
import { ConflictAlertBadge } from "@/components/common/StatusBadge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export type CourseId = "btech-cs" | "btech-ict" | "hnd-cs" | "hnd-ict";

const COURSES: { id: CourseId; code: string; name: string }[] = [
  { id: "btech-cs", code: "BTECH-CS", name: "BTech Computer Science" },
  { id: "btech-ict", code: "BTECH-ICT", name: "BTech Information Communication Technology" },
  { id: "hnd-cs", code: "HND-CS", name: "HND Computer Science" },
  { id: "hnd-ict", code: "HND-ICT", name: "HND Information Communication Technology" },
];

export interface SlotDraft {
  slot_id: string;
  date: string; // YYYY-MM-DD
  start_time_str: string; // HH:MM
  end_time_str: string; // HH:MM
  team_id: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
}

function parseInitialSlots(panel: DefensePanelDocument | null): SlotDraft[] {
  if (!panel || !Array.isArray(panel.time_slots) || panel.time_slots.length === 0) {
    return [
      {
        slot_id: `slot_${Math.random().toString(36).substring(2, 9)}`,
        date: "2026-11-20",
        start_time_str: "09:00",
        end_time_str: "10:00",
        team_id: "",
        status: "scheduled",
      },
    ];
  }

  return panel.time_slots.map((s) => {
    let dateStr = "2026-11-20";
    let startStr = "09:00";
    let endStr = "10:00";

    try {
      const startMs =
        typeof s.start_time === "object" && s.start_time && "toMillis" in s.start_time
          ? (s.start_time as { toMillis: () => number }).toMillis()
          : Date.parse(String(s.start_time));
      const endMs =
        typeof s.end_time === "object" && s.end_time && "toMillis" in s.end_time
          ? (s.end_time as { toMillis: () => number }).toMillis()
          : Date.parse(String(s.end_time));

      if (!isNaN(startMs)) {
        const startDate = new Date(startMs);
        dateStr = startDate.toISOString().split("T")[0] || "2026-11-20";
        startStr = startDate.toISOString().split("T")[1]?.slice(0, 5) || "09:00";
      }
      if (!isNaN(endMs)) {
        const endDate = new Date(endMs);
        endStr = endDate.toISOString().split("T")[1]?.slice(0, 5) || "10:00";
      }
    } catch {
      // fallback defaults
    }

    return {
      slot_id: s.slot_id,
      date: dateStr,
      start_time_str: startStr,
      end_time_str: endStr,
      team_id: s.team_id || "",
      status: s.status || "scheduled",
    };
  });
}

interface PanelFormContentProps {
  editingPanel: DefensePanelDocument | null;
  existingPanels: DefensePanelDocument[];
  teams: TeamDocument[];
  staffWhitelist: StaffWhitelistDocument[];
  onClose: () => void;
  onSaved: () => void;
}

function PanelFormContent({
  editingPanel,
  existingPanels,
  teams,
  staffWhitelist,
  onClose,
  onSaved,
}: PanelFormContentProps) {
  const { user } = useAuth();

  // Form State initialized directly from props
  const [courseId, setCourseId] = React.useState<CourseId>(
    (editingPanel?.course_id as CourseId) || "btech-cs"
  );
  const [panelName, setPanelName] = React.useState(
    editingPanel?.panel_name || "Panel A - Software Systems"
  );
  const [isVirtual, setIsVirtual] = React.useState(Boolean(editingPanel?.is_virtual));
  const [venue, setVenue] = React.useState(editingPanel?.venue || "CS Lab 1");
  const [virtualMeetingUrl, setVirtualMeetingUrl] = React.useState(
    editingPanel?.virtual_meeting_url || ""
  );
  const [chairId, setChairId] = React.useState(editingPanel?.chair_id || "");
  const [includeOtherProgrammes, setIncludeOtherProgrammes] = React.useState(false);
  const [examinerIds, setExaminerIds] = React.useState<string[]>(
    editingPanel?.examiner_ids || []
  );
  const [crossProgrammeJustification, setCrossProgrammeJustification] = React.useState("");
  const [slots, setSlots] = React.useState<SlotDraft[]>(() =>
    parseInitialSlots(editingPanel)
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Map active faculty staff members
  const facultyMembers = React.useMemo(() => {
    return staffWhitelist.filter((s) => s.is_active && s.user_uid);
  }, [staffWhitelist]);

  // Check which examiners/chair are cross-programme
  const hasCrossProgrammeFaculty = React.useMemo(() => {
    const selectedUids = new Set([chairId, ...examinerIds].filter(Boolean));
    for (const uid of selectedUids) {
      const staff = staffWhitelist.find((s) => s.user_uid === uid);
      if (staff && Array.isArray(staff.programmes)) {
        if (!staff.programmes.includes(courseId)) {
          return true;
        }
      }
    }
    return false;
  }, [chairId, examinerIds, courseId, staffWhitelist]);

  // Candidates filtered by programme
  const availableFaculty = React.useMemo(() => {
    if (includeOtherProgrammes || hasCrossProgrammeFaculty) {
      return facultyMembers;
    }
    return facultyMembers.filter((s) => (s.programmes || []).includes(courseId));
  }, [facultyMembers, includeOtherProgrammes, hasCrossProgrammeFaculty, courseId]);

  // Eligible teams: same course_id, status === 'defense_ready', not slotted in another active panel
  const eligibleTeams = React.useMemo(() => {
    const slottedInOtherPanels = new Set<string>();
    for (const p of existingPanels) {
      if (editingPanel && p.id === editingPanel.id) continue;
      for (const slot of p.time_slots || []) {
        if (slot.team_id && slot.status !== "cancelled") {
          slottedInOtherPanels.add(slot.team_id);
        }
      }
    }

    return teams.filter((t) => {
      if (t.course_id !== courseId) return false;
      if (t.status !== "defense_ready") return false;
      if (slottedInOtherPanels.has(t.id)) return false;
      return true;
    });
  }, [teams, courseId, existingPanels, editingPanel]);

  // Real-time conflict detection while editing
  const liveConflicts = React.useMemo(() => {
    const draftSlots = slots.map((s) => {
      const startIso = `${s.date}T${s.start_time_str}:00Z`;
      const endIso = `${s.date}T${s.end_time_str}:00Z`;

      return {
        slot_id: s.slot_id,
        team_id: s.team_id || "",
        start_time: startIso,
        end_time: endIso,
        status: s.status,
      };
    });

    const draftPanel = {
      id: editingPanel ? editingPanel.id : "draft_panel_id",
      panel_name: panelName || "Draft Panel",
      course_id: courseId,
      venue: isVirtual ? "Virtual" : venue,
      is_virtual: isVirtual,
      chair_id: chairId,
      examiner_ids: examinerIds,
      time_slots: draftSlots,
    };

    const otherPanels = existingPanels.filter(
      (p) => !editingPanel || p.id !== editingPanel.id
    );

    const allPanelsToCheck = [...otherPanels, draftPanel];
    const detected = detectConflicts(allPanelsToCheck);

    return detected.filter((c) => c.panel_ids.includes(draftPanel.id));
  }, [
    slots,
    panelName,
    courseId,
    venue,
    isVirtual,
    chairId,
    examinerIds,
    existingPanels,
    editingPanel,
  ]);

  const handleAddSlot = () => {
    const lastSlot = slots[slots.length - 1];
    let nextStart = "10:00";
    let nextEnd = "11:00";
    let nextDate = "2026-11-20";

    if (lastSlot) {
      nextDate = lastSlot.date;
      nextStart = lastSlot.end_time_str;
      const [h, m] = lastSlot.end_time_str.split(":").map(Number);
      const nextHour = (h ?? 9) + 1;
      nextEnd = `${String(nextHour).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
    }

    setSlots((prev) => [
      ...prev,
      {
        slot_id: `slot_${Math.random().toString(36).substring(2, 9)}`,
        date: nextDate,
        start_time_str: nextStart,
        end_time_str: nextEnd,
        team_id: "",
        status: "scheduled",
      },
    ]);
  };

  const handleUpdateSlot = (index: number, updates: Partial<SlotDraft>) => {
    setSlots((prev) => {
      const next = [...prev];
      const target = next[index];
      if (target) {
        next[index] = { ...target, ...updates };
      }
      return next;
    });
  };

  const handleRemoveSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleExaminer = (uid: string) => {
    setExaminerIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("You must be signed in as a coordinator or admin.");
      return;
    }

    if (!panelName.trim()) {
      toast.error("Please enter a panel name.");
      return;
    }

    if (!chairId) {
      toast.error("Please select a Panel Chair.");
      return;
    }

    if (examinerIds.length === 0) {
      toast.error("Please assign at least one examiner to this panel.");
      return;
    }

    if (hasCrossProgrammeFaculty && !crossProgrammeJustification.trim()) {
      toast.error(
        "A cross-programme justification is required for assigned faculty from other programmes."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const idToken = await user.getIdToken();

      const formattedSlots = slots.map((s) => ({
        slot_id: s.slot_id,
        team_id: s.team_id || "",
        start_time: `${s.date}T${s.start_time_str}:00Z`,
        end_time: `${s.date}T${s.end_time_str}:00Z`,
        status: s.status,
      }));

      if (editingPanel) {
        const res = await updateDefensePanel(idToken, {
          panel_id: editingPanel.id,
          panel_name: panelName,
          venue: isVirtual ? "Virtual" : venue,
          is_virtual: isVirtual,
          virtual_meeting_url: isVirtual ? virtualMeetingUrl : "",
          chair_id: chairId,
          examiner_ids: examinerIds,
          time_slots: formattedSlots,
          cross_programme_justification: crossProgrammeJustification.trim() || undefined,
        });

        if (res.ok) {
          toast.success("Defense panel updated successfully.");
          onSaved();
          onClose();
        } else {
          toast.error(res.error || "Failed to update defense panel.");
        }
      } else {
        const res = await createDefensePanel(idToken, {
          academic_year_id: "2026-2027",
          course_id: courseId,
          panel_name: panelName,
          venue: isVirtual ? "Virtual" : venue,
          is_virtual: isVirtual,
          virtual_meeting_url: isVirtual ? virtualMeetingUrl : "",
          chair_id: chairId,
          examiner_ids: examinerIds,
          time_slots: formattedSlots,
          cross_programme_justification: crossProgrammeJustification.trim() || undefined,
        });

        if (res.ok) {
          toast.success("Defense panel created successfully.");
          onSaved();
          onClose();
        } else {
          toast.error(res.error || "Failed to create defense panel.");
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Live Conflict Warning Banner */}
      {liveConflicts.length > 0 && (
        <div className="mx-6 mt-4 p-3 rounded-lg border border-danger/40 bg-danger-soft/30 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-danger shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-danger">
                Scheduling Conflict Detected ({liveConflicts.length})
              </span>
              <ConflictAlertBadge value="danger" message="Conflict Alert" />
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-danger/90">
              {liveConflicts.map((c, i) => (
                <li key={i}>{c.message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-6 space-y-6">
          <div className="space-y-6 pr-4">
            {/* 1. Basic Info */}
            <div className="space-y-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Panel Session Details
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="panel-course" className="text-xs font-medium">
                    Academic Programme
                  </Label>
                  <Select
                    disabled={Boolean(editingPanel)}
                    value={courseId}
                    onValueChange={(val) => setCourseId(val as CourseId)}
                  >
                    <SelectTrigger id="panel-course" className="h-9 text-xs">
                      <SelectValue placeholder="Select course" />
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
                  <Label htmlFor="panel-name" className="text-xs font-medium">
                    Panel Identifier / Name
                  </Label>
                  <Input
                    id="panel-name"
                    placeholder="e.g. Panel A - Software Systems"
                    value={panelName}
                    onChange={(e) => setPanelName(e.target.value)}
                    required
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {/* Venue vs Virtual Meeting */}
              <div className="p-3.5 rounded-lg border bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="virtual-switch" className="text-xs font-medium cursor-pointer">
                      Virtual Defense Session
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Enable if presentations are conducted via Google Meet or Teams.
                    </p>
                  </div>
                  <Switch
                    id="virtual-switch"
                    checked={isVirtual}
                    onCheckedChange={setIsVirtual}
                  />
                </div>

                {isVirtual ? (
                  <div className="space-y-1.5 pt-1">
                    <Label htmlFor="virtual-url" className="text-xs font-medium flex items-center gap-1.5">
                      <Video className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                      Meeting Link URL
                    </Label>
                    <Input
                      id="virtual-url"
                      placeholder="https://meet.google.com/xyz-abcd-efg"
                      value={virtualMeetingUrl}
                      onChange={(e) => setVirtualMeetingUrl(e.target.value)}
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5 pt-1">
                    <Label htmlFor="venue" className="text-xs font-medium flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      Physical Examination Venue
                    </Label>
                    <Input
                      id="venue"
                      placeholder="e.g. CS Lab 2, Main Campus"
                      value={venue}
                      onChange={(e) => setVenue(e.target.value)}
                      required={!isVirtual}
                      className="h-9 text-xs"
                    />
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* 2. Faculty Allocation */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Panel Officers & Examiners
                </h4>

                <div className="flex items-center gap-2">
                  <Switch
                    id="programme-switch"
                    checked={includeOtherProgrammes}
                    onCheckedChange={setIncludeOtherProgrammes}
                  />
                  <Label htmlFor="programme-switch" className="text-xs text-muted-foreground cursor-pointer">
                    Include other programmes
                  </Label>
                </div>
              </div>

              {/* Chair Selector */}
              <div className="space-y-1.5">
                <Label htmlFor="panel-chair" className="text-xs font-medium flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Panel Chair (Session Lead)
                </Label>
                <Select value={chairId} onValueChange={setChairId}>
                  <SelectTrigger id="panel-chair" className="h-9 text-xs">
                    <SelectValue placeholder="Select faculty member as Chair" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFaculty.map((staff) => {
                      const inProgramme = (staff.programmes || []).includes(courseId);
                      return (
                        <SelectItem key={staff.user_uid!} value={staff.user_uid!} className="text-xs">
                          {staff.full_name} ({staff.email}) {!inProgramme && "[Cross-Programme]"}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Examiners Multi-Select */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">
                  Panel Examiners ({examinerIds.length} selected)
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border rounded-lg bg-card">
                  {availableFaculty.map((staff) => {
                    const isSelected = examinerIds.includes(staff.user_uid!);
                    const inProg = (staff.programmes || []).includes(courseId);

                    return (
                      <button
                        key={staff.user_uid!}
                        type="button"
                        onClick={() => toggleExaminer(staff.user_uid!)}
                        className={`flex items-center justify-between p-2 rounded-md border text-left text-xs transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border hover:bg-muted/50 text-foreground"
                        }`}
                      >
                        <div className="truncate mr-2">
                          <span className="block truncate">{staff.full_name}</span>
                          {!inProg && (
                            <span className="text-[10px] text-amber-600 block">
                              Cross-Programme
                            </span>
                          )}
                        </div>
                        {isSelected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cross Programme Justification */}
              {hasCrossProgrammeFaculty && (
                <div className="space-y-1.5 p-3 rounded-lg border border-warning/40 bg-warning-soft/20">
                  <Label htmlFor="cross-justification" className="text-xs font-semibold text-warning flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    Cross-Programme Justification (Mandatory & Audited)
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    One or more assigned faculty members belong to another academic track. State the pedagogical rationale.
                  </p>
                  <Textarea
                    id="cross-justification"
                    placeholder="e.g. Dr. Owusu provides specialized cloud architecture evaluation for this distributed systems cohort."
                    value={crossProgrammeJustification}
                    onChange={(e) => setCrossProgrammeJustification(e.target.value)}
                    required
                    className="text-xs min-h-[60px]"
                  />
                </div>
              )}
            </div>

            <Separator />

            {/* 3. Slot Schedule Editor */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Presentation Time Slots ({slots.length})
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Schedule team presentation windows. Conflicts are audited and blocked on publish.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddSlot}
                  className="h-8 gap-1.5 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Add Slot</span>
                </Button>
              </div>

              {slots.length === 0 ? (
                <div className="p-4 rounded-lg border border-dashed text-center text-xs text-muted-foreground">
                  No presentation slots scheduled. Click &quot;Add Slot&quot; to create one.
                </div>
              ) : (
                <div className="space-y-3">
                  {slots.map((slot, index) => {
                    const isSlotInConflict = liveConflicts.some((c) =>
                      c.slot_ids.includes(slot.slot_id)
                    );

                    return (
                      <div
                        key={slot.slot_id}
                        className={`p-3.5 rounded-lg border space-y-3 text-xs transition-colors ${
                          isSlotInConflict
                            ? "border-danger/50 bg-danger-soft/20"
                            : "border-border bg-card"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-[11px]">
                              Slot #{index + 1}
                            </Badge>
                            {isSlotInConflict && (
                              <ConflictAlertBadge
                                value="danger"
                                message="Overlapping Slot"
                              />
                            )}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveSlot(index)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" aria-hidden="true" />
                              Date
                            </Label>
                            <Input
                              type="date"
                              value={slot.date}
                              onChange={(e) =>
                                handleUpdateSlot(index, { date: e.target.value })
                              }
                              required
                              className="h-8 text-xs font-mono"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              Start Time
                            </Label>
                            <Input
                              type="time"
                              value={slot.start_time_str}
                              onChange={(e) =>
                                handleUpdateSlot(index, { start_time_str: e.target.value })
                              }
                              required
                              className="h-8 text-xs font-mono"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              End Time
                            </Label>
                            <Input
                              type="time"
                              value={slot.end_time_str}
                              onChange={(e) =>
                                handleUpdateSlot(index, { end_time_str: e.target.value })
                              }
                              required
                              className="h-8 text-xs font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                          <div className="sm:col-span-2 space-y-1">
                            <Label className="text-[11px] text-muted-foreground">
                              Slotted Project Team (Defense Ready)
                            </Label>
                            <Select
                              value={slot.team_id || "none"}
                              onValueChange={(val) =>
                                handleUpdateSlot(index, { team_id: val === "none" ? "" : val })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select candidate team" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none" className="text-xs italic text-muted-foreground">
                                  -- Open / No team assigned --
                                </SelectItem>
                                {eligibleTeams.map((t) => (
                                  <SelectItem key={t.id} value={t.id} className="text-xs">
                                    {t.name} {t.group_number ? `(${t.group_number})` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">
                              Slot Status
                            </Label>
                            <Select
                              value={slot.status}
                              onValueChange={(val) =>
                                handleUpdateSlot(index, {
                                  status: val as SlotDraft["status"],
                                })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="scheduled" className="text-xs">
                                  Scheduled
                                </SelectItem>
                                <SelectItem value="in_progress" className="text-xs">
                                  In Progress
                                </SelectItem>
                                <SelectItem value="completed" className="text-xs">
                                  Completed
                                </SelectItem>
                                <SelectItem value="cancelled" className="text-xs">
                                  Cancelled
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="p-4 border-t bg-muted/20 flex flex-row items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting}
            className="gap-1.5"
          >
            {isSubmitting
              ? "Saving Panel..."
              : editingPanel
              ? "Update Defense Panel"
              : "Create Defense Panel"}
          </Button>
        </SheetFooter>
      </form>
    </>
  );
}

export interface PanelFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  editingPanel: DefensePanelDocument | null;
  existingPanels: DefensePanelDocument[];
  teams: TeamDocument[];
  staffWhitelist: StaffWhitelistDocument[];
  onSaved: () => void;
}

export function PanelFormSheet({
  isOpen,
  onClose,
  editingPanel,
  existingPanels,
  teams,
  staffWhitelist,
  onSaved,
}: PanelFormSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl p-0 flex flex-col h-full bg-background border-l shadow-xl"
      >
        <SheetHeader className="p-6 pb-4 border-b">
          <SheetTitle className="text-lg font-bold text-foreground">
            {editingPanel ? `Edit Defense Panel — ${editingPanel.panel_name}` : "Create New Defense Panel"}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Configure panel session details, examiner allocations, and presentation slot schedules.
          </SheetDescription>
        </SheetHeader>

        {isOpen && (
          <PanelFormContent
            key={editingPanel ? editingPanel.id : "new_panel"}
            editingPanel={editingPanel}
            existingPanels={existingPanels}
            teams={teams}
            staffWhitelist={staffWhitelist}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
