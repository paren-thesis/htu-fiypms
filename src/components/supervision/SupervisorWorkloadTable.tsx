"use client";

import * as React from "react";
import { Users } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TeamDocument } from "@/types/firestore";

export interface SupervisorWorkloadItem {
  uid: string;
  name: string;
  email: string;
  current_assigned_count: number;
  max_capacity: number;
  assigned_team_ids: string[];
  status: "available" | "at_capacity";
  programmes?: string[];
}

export interface SupervisorWorkloadTableProps {
  supervisors: SupervisorWorkloadItem[];
  teamsMap: Record<string, TeamDocument>;
}

export function SupervisorWorkloadTable({
  supervisors,
  teamsMap,
}: SupervisorWorkloadTableProps) {
  if (supervisors.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
        <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground">No Supervisor Records Found</p>
        <p className="text-xs text-muted-foreground mt-1">
          Faculty supervisor workloads will appear here once whitelist profiles and supervision records are initialized.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="p-4 border-b border-border bg-muted/20">
        <h3 className="text-sm font-semibold text-foreground">Faculty Supervision Capacity</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Real-time active group allocation and quota thresholds across department staff.
        </p>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[260px]">Supervisor</TableHead>
              <TableHead className="w-[180px]">Programmes</TableHead>
              <TableHead className="w-[200px]">Workload Quota</TableHead>
              <TableHead className="w-[140px]">Status</TableHead>
              <TableHead>Assigned Groups</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {supervisors.map((s) => {
              const maxCap = Math.max(1, s.max_capacity || 5);
              const curr = s.current_assigned_count || 0;
              const isAtCapacity = curr >= maxCap;
              const pct = Math.min(100, Math.round((curr / maxCap) * 100));

              return (
                <TableRow key={s.uid}>
                  {/* Supervisor */}
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </div>
                  </TableCell>

                  {/* Programmes */}
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {s.programmes && s.programmes.length > 0 ? (
                        s.programmes.map((p) => (
                          <Badge
                            key={p}
                            variant="outline"
                            className="text-[10px] uppercase font-mono px-1.5 py-0"
                          >
                            {p}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground italic">All</span>
                      )}
                    </div>
                  </TableCell>

                  {/* Workload Quota */}
                  <TableCell>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Assigned:</span>
                        <span className="font-semibold tabular-nums text-foreground">
                          {curr} / {maxCap}
                        </span>
                      </div>
                      <Progress
                        value={pct}
                        className={`h-2 ${isAtCapacity ? "[&>div]:bg-destructive" : ""}`}
                      />
                    </div>
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <StatusBadge
                      domain="supervision"
                      value={isAtCapacity ? "at_capacity" : "available"}
                    />
                  </TableCell>

                  {/* Assigned Groups */}
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {s.assigned_team_ids.length > 0 ? (
                        s.assigned_team_ids.map((tid) => {
                          const t = teamsMap[tid];
                          const groupLabel = t ? t.group_number : tid.slice(0, 8);
                          const teamName = t ? t.name : "";

                          return (
                            <Badge
                              key={tid}
                              variant="secondary"
                              className="text-xs font-mono font-medium"
                              title={teamName ? `${groupLabel} — ${teamName}` : groupLabel}
                            >
                              {groupLabel}
                            </Badge>
                          );
                        })
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          None assigned
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
