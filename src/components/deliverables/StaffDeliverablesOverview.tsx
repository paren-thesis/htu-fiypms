"use client";

import * as React from "react";
import { collection, query, onSnapshot, getDocs } from "firebase/firestore";
import {
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Cloud,
  FileCode,
  Search,
  Eye,
  BookOpen,
} from "lucide-react";
import { db } from "@/lib/firebase/client";
import { MarkdownViewer } from "./MarkdownViewer";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TeamDocument, SoftwareDeliverableDocument, UserDocument } from "@/types/firestore";

export function StaffDeliverablesOverview() {
  const [teams, setTeams] = React.useState<TeamDocument[]>([]);
  const [deliverablesMap, setDeliverablesMap] = React.useState<
    Record<string, SoftwareDeliverableDocument>
  >({});
  const [supervisorsMap, setSupervisorsMap] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState<boolean>(true);
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [selectedNotesDeliverable, setSelectedNotesDeliverable] =
    React.useState<SoftwareDeliverableDocument | null>(null);

  // 1. Stream all teams and deliverables
  React.useEffect(() => {
    const qTeams = query(collection(db, "teams"));
    const unsubscribeTeams = onSnapshot(
      qTeams,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<TeamDocument, "id">) } as TeamDocument)
        );
        setTeams(docs);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to stream teams:", error);
        setLoading(false);
      }
    );

    const qDeliverables = query(collection(db, "software_deliverables"));
    const unsubscribeDeliverables = onSnapshot(
      qDeliverables,
      (snapshot) => {
        const map: Record<string, SoftwareDeliverableDocument> = {};
        snapshot.docs.forEach((docSnap) => {
          map[docSnap.id] = {
            team_id: docSnap.id,
            ...(docSnap.data() as Omit<SoftwareDeliverableDocument, "team_id">),
          };
        });
        setDeliverablesMap(map);
      },
      (error) => {
        console.error("Failed to stream deliverables:", error);
      }
    );

    return () => {
      unsubscribeTeams();
      unsubscribeDeliverables();
    };
  }, []);

  // 2. Fetch staff names for supervisors
  React.useEffect(() => {
    let isCancelled = false;

    async function loadStaff() {
      try {
        const snap = await getDocs(collection(db, "users"));
        const map: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const u = d.data() as UserDocument;
          if (u.name) {
            map[d.id] = u.name;
          }
        });
        if (!isCancelled) setSupervisorsMap(map);
      } catch {
        // Ignore user lookup errors
      }
    }

    loadStaff();
    return () => {
      isCancelled = true;
    };
  }, []);

  const filteredTeams = teams.filter((t) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const nameMatch = t.name?.toLowerCase().includes(q);
    const groupMatch = t.group_number?.toLowerCase().includes(q);
    const courseMatch = t.course_id?.toLowerCase().includes(q);
    return nameMatch || groupMatch || courseMatch;
  });

  return (
    <div className="space-y-6">
      <Card className="border-border shadow-sm bg-card overflow-hidden">
        <CardHeader className="bg-muted/20 border-b border-border py-4 px-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">
                Department Software Deliverables & Sign-off Tracking
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Overview of repository submissions, live application demos, and formal supervisor approvals.
              </CardDescription>
            </div>

            <div className="w-full sm:w-64">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Filter by group or project..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs bg-background"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredTeams.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <BookOpen className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium text-foreground">No project teams found</p>
              <p className="text-xs text-muted-foreground">Try adjusting your search criteria.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10 hover:bg-muted/10 border-b border-border">
                  <TableHead className="text-xs font-semibold">Group / Team</TableHead>
                  <TableHead className="text-xs font-semibold">Programme</TableHead>
                  <TableHead className="text-xs font-semibold">Supervisor</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Repository</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Demo & Bundle</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Setup Notes</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Sign-off Status</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredTeams.map((team) => {
                  const deliverable = deliverablesMap[team.id];
                  const hasDeliverable = Boolean(deliverable);
                  const isSignedOff = Boolean(deliverable?.approved_by_supervisor_at);
                  const supervisorName = team.assigned_supervisor_id
                    ? supervisorsMap[team.assigned_supervisor_id] || "Assigned"
                    : "Unassigned";

                  return (
                    <TableRow key={team.id} className="border-b border-border hover:bg-muted/20">
                      <TableCell className="py-3 font-medium">
                        <div className="text-sm font-semibold text-foreground">{team.name}</div>
                        <div className="text-xs font-mono text-muted-foreground">
                          {team.group_number || "NO-GROUP"}
                        </div>
                      </TableCell>

                      <TableCell className="py-3 text-xs uppercase font-mono">
                        {team.course_id}
                      </TableCell>

                      <TableCell className="py-3 text-xs text-muted-foreground">
                        {supervisorName}
                      </TableCell>

                      <TableCell className="py-3 text-center">
                        {hasDeliverable && deliverable?.github_repository_url ? (
                          <a
                            href={deliverable.github_repository_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <GitBranch className="h-3.5 w-3.5" />
                            Repo
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {hasDeliverable && deliverable?.live_demo_url ? (
                            <a
                              href={deliverable.live_demo_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              title="Open Live Demo"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Demo
                            </a>
                          ) : null}

                          {hasDeliverable && deliverable?.google_drive_url ? (
                            <a
                              href={deliverable.google_drive_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              title="Open Cloud Manuscript"
                            >
                              <Cloud className="h-3.5 w-3.5" />
                              Cloud
                            </a>
                          ) : null}

                          {!deliverable?.live_demo_url && !deliverable?.google_drive_url && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="py-3 text-center">
                        {hasDeliverable && deliverable?.environment_setup_notes ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedNotesDeliverable(deliverable)}
                            className="h-8 text-xs gap-1 text-primary hover:bg-primary/10"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Notes
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="py-3 text-right">
                        {isSignedOff ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 gap-1 text-xs py-1">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            Signed Off
                          </Badge>
                        ) : hasDeliverable ? (
                          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-xs py-1">
                            Submitted
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground py-1">
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Setup Notes Inspection Dialog */}
      <Dialog
        open={Boolean(selectedNotesDeliverable)}
        onOpenChange={(open) => {
          if (!open) setSelectedNotesDeliverable(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <FileCode className="h-5 w-5 text-primary" />
              Environment Setup Instructions & Notes
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Technical dependencies, runtime instructions, and environment configuration.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 border border-border rounded-md bg-muted/10 my-2">
            <MarkdownViewer
              content={selectedNotesDeliverable?.environment_setup_notes || ""}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedNotesDeliverable(null)}
              className="min-h-[44px]"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
