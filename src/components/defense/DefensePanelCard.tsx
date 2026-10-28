"use client";

import * as React from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  MapPin,
  Video,
  ExternalLink,
  Edit,
  UserCheck,
  Users,
  FolderGit2,
  FileCheck2,
} from "lucide-react";
import { cn } from "cn";
import type { DefensePanelDocument, TeamDocument } from "@/types/firestore";
import type { DefenseConflict } from "@/lib/defense/conflicts";
import { toEpochMs } from "@/lib/defense/conflicts";
import { StatusBadge, ConflictAlertBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface DefensePanelCardProps {
  panel: DefensePanelDocument;
  teamsMap: Record<string, TeamDocument>;
  facultyMap: Record<string, { name: string; email: string }>;
  conflicts: DefenseConflict[];
  onEdit?: (panel: DefensePanelDocument) => void;
  userRole?: string;
  currentUserId?: string;
}

export type TimeVal = Parameters<typeof toEpochMs>[0];

export function formatTime(val: TimeVal): string {
  const ms = toEpochMs(val);
  if (!ms) return "TBD";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ms));
}

export function formatDate(val: TimeVal): string {
  const ms = toEpochMs(val);
  if (!ms) return "Date TBD";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}

export function DefensePanelCard({
  panel,
  teamsMap,
  facultyMap,
  conflicts,
  onEdit,
  userRole,
  currentUserId,
}: DefensePanelCardProps) {
  // Filter conflicts relevant to this panel
  const panelConflicts = conflicts.filter((c) =>
    c.panel_ids.includes(panel.id)
  );

  const chair = facultyMap[panel.chair_id] || {
    name: "Unassigned Chair",
    email: "",
  };

  const examiners = (panel.examiner_ids || []).map(
    (id) => facultyMap[id] || { name: `Examiner (${id.slice(0, 6)})`, email: "" }
  );

  const isCoordinatorOrAdmin = userRole === "coordinator" || userRole === "admin";
  const isMemberOfPanel =
    panel.chair_id === currentUserId ||
    (panel.examiner_ids || []).includes(currentUserId || "");

  // Sort slots by start time
  const sortedSlots = [...(panel.time_slots || [])].sort((a, b) => {
    return toEpochMs(a.start_time) - toEpochMs(b.start_time);
  });

  return (
    <Card className="rounded-xl border bg-card shadow-sm transition-all hover:shadow-md">
      <CardHeader className="p-5 pb-3 border-b bg-muted/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-base text-foreground tracking-tight">
                {panel.panel_name}
              </h3>
              <Badge variant="outline" className="text-xs uppercase font-mono">
                {panel.course_id}
              </Badge>
              {panel.is_published ? (
                <Badge variant="outline" className="text-xs border-success/30 bg-success-soft text-success">
                  Published
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  Draft
                </Badge>
              )}
              {panelConflicts.length > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="cursor-help inline-flex">
                        <ConflictAlertBadge
                          value="danger"
                          message={`${panelConflicts.length} Conflict${
                            panelConflicts.length > 1 ? "s" : ""
                          }`}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs space-y-1 bg-popover text-popover-foreground">
                      <p className="font-semibold text-danger">Scheduling Conflict Detected:</p>
                      {panelConflicts.map((c, i) => (
                        <p key={i} className="text-muted-foreground">
                          • {c.message}
                        </p>
                      ))}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-0.5">
              <div className="flex items-center gap-1.5">
                {panel.is_virtual ? (
                  <>
                    <Video className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    {panel.virtual_meeting_url ? (
                      <a
                        href={panel.virtual_meeting_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
                      >
                        Join Virtual Meeting
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    ) : (
                      <span>Virtual Session (Link pending)</span>
                    )}
                  </>
                ) : (
                  <>
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>Venue: {panel.venue || "TBD"}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {(isCoordinatorOrAdmin || isMemberOfPanel) && (
              <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                <Link href={`/defense/${panel.id}`}>
                  <FileCheck2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  <span>Marksheet</span>
                </Link>
              </Button>
            )}

            {isCoordinatorOrAdmin && onEdit && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1 text-xs"
                onClick={() => onEdit(panel)}
              >
                <Edit className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Edit</span>
              </Button>
            )}
          </div>
        </div>

        {/* Panel Officers */}
        <div className="pt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs border-t border-border/50 text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <UserCheck className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
            <span className="font-medium text-foreground">Chair:</span>
            <span>{chair.name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="font-medium text-foreground">Examiners:</span>
            <span>{examiners.map((e) => e.name).join(", ") || "None assigned"}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Presentation Slots Timeline ({sortedSlots.length})
        </h4>

        {sortedSlots.length === 0 ? (
          <div className="p-4 rounded-lg border border-dashed text-center text-xs text-muted-foreground">
            No presentation slots scheduled for this panel yet.
          </div>
        ) : (
          <div className="space-y-2">
            {sortedSlots.map((slot) => {
              const team = slot.team_id ? teamsMap[slot.team_id] : null;
              const slotConflict = panelConflicts.find((c) =>
                c.slot_ids.includes(slot.slot_id)
              );

              return (
                <div
                  key={slot.slot_id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border text-xs gap-3 transition-colors",
                    slotConflict
                      ? "border-danger/40 bg-danger-soft/20"
                      : "border-border bg-card hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="flex items-center gap-1.5 font-mono font-medium text-foreground bg-muted px-2 py-1 rounded shrink-0">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      <span>
                        {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        {team ? (
                          <span className="font-medium text-foreground">
                            {team.name}
                            {team.group_number && (
                              <span className="text-muted-foreground ml-1">
                                ({team.group_number})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="italic text-muted-foreground">
                            Open presentation slot (Unassigned)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                        <Calendar className="h-3 w-3 inline mr-0.5" aria-hidden="true" />
                        <span>{formatDate(slot.start_time)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                    {slotConflict && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              <ConflictAlertBadge
                                value="danger"
                                message="Slot Conflict"
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs bg-popover text-popover-foreground">
                            {slotConflict.message}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                    <StatusBadge
                      domain="defense"
                      value={slot.status as "scheduled" | "in_progress" | "completed" | "cancelled"}
                    />

                    {team && (
                      <Button asChild size="sm" variant="ghost" className="h-7 text-xs px-2 gap-1 text-primary">
                        <Link href={`/deliverables?teamId=${team.id}`}>
                          <FolderGit2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Deliverables</span>
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
