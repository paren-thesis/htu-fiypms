"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Users,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  Crown,
  UserCheck,
  UserX,
  Clock,
  Layers,
  ShieldAlert,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  autoGroupStudents,
  type AutoGroupActionResult,
} from "@/app/actions/auto-group-students";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface UnassignedPoolProps {
  academicYearId: string;
  formationDeadline?: string | null;
}

const COURSE_LABELS: Record<string, string> = {
  "btech-cs": "BTech Computer Science",
  "btech-ict": "BTech ICT",
  "hnd-cs": "HND Computer Science",
  "hnd-ict": "HND ICT",
};

export function UnassignedPool({
  academicYearId,
  formationDeadline,
}: UnassignedPoolProps) {
  const { user, activeRole } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [committing, setCommitting] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [data, setData] = React.useState<AutoGroupActionResult | null>(null);
  const [activeTab, setActiveTab] = React.useState("groups");

  const fetchPool = React.useCallback(async () => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const res = await autoGroupStudents(idToken, {
        mode: "preview",
        yearId: academicYearId,
      });

      if (!res.ok) {
        toast.error(res.error || "Failed to load pool data");
      } else {
        setData(res);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load unassigned pool");
    } finally {
      setLoading(false);
    }
  }, [user, academicYearId]);

  React.useEffect(() => {
    let isMounted = true;
    async function init() {
      if (!user) return;
      try {
        const idToken = await user.getIdToken();
        const res = await autoGroupStudents(idToken, {
          mode: "preview",
          yearId: academicYearId,
        });

        if (!isMounted) return;
        if (!res.ok) {
          toast.error(res.error || "Failed to load pool data");
        } else {
          setData(res);
        }
      } catch (err) {
        if (isMounted) {
          toast.error(err instanceof Error ? err.message : "Failed to load unassigned pool");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    init();
    return () => {
      isMounted = false;
    };
  }, [user, academicYearId]);

  const handleRefresh = async () => {
    setLoading(true);
    await fetchPool();
  };

  const handleCommit = async () => {
    if (!user) return;
    setCommitting(true);
    try {
      const idToken = await user.getIdToken();
      const res = await autoGroupStudents(idToken, {
        mode: "commit",
        yearId: academicYearId,
      });

      if (!res.ok) {
        toast.error(res.error || "Failed to commit auto-grouping");
        return;
      }

      toast.success(
        `Auto-grouping committed successfully! Created ${res.createdTeams?.length || 0} project teams.`
      );
      setConfirmOpen(false);
      // Reload pool to reflect newly assigned teams
      await handleRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to execute auto-grouping");
    } finally {
      setCommitting(false);
    }
  };

  const isDeadlinePassed = data?.isDeadlinePassed ?? true;
  const isAdmin = activeRole === "admin";
  const canCommit = isDeadlinePassed || isAdmin;

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const summary = data?.summary || {
    totalStudents: 0,
    totalAssigned: 0,
    totalLeftovers: 0,
    totalGroups: 0,
  };

  const formattedDeadline = formationDeadline
    ? new Date(formationDeadline).toLocaleDateString(undefined, {
        dateStyle: "medium",
      })
    : null;

  return (
    <div className="space-y-6">
      {/* Top Banner: Deadline & Status */}
      {!isDeadlinePassed ? (
        <Alert className="border-warning/30 bg-warning-soft text-warning">
          <Clock className="h-4 w-4" />
          <AlertTitle className="text-sm font-semibold">Formation Deadline Active</AlertTitle>
          <AlertDescription className="text-xs">
            Student self-service group formation is still open
            {formattedDeadline ? ` (Deadline: ${formattedDeadline})` : ""}. Auto-grouping is restricted until the deadline has passed.
            {isAdmin ? (
              <span className="font-semibold ml-1 text-foreground underline">
                Administrator override is active.
              </span>
            ) : (
              <span className="ml-1">Only System Administrators can execute auto-grouping before the deadline.</span>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-primary flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <span className="font-semibold">Auto-Grouping Engine Ready:</span> All unassigned registered students can be partitioned into optimal groups of 4 to 5 members strictly clustered by course track.
            </div>
          </div>
          <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 shrink-0">
            Formation Closed
          </Badge>
        </div>
      )}

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-xl border bg-card shadow-sm p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Unassigned in Pool</span>
            <Users className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
            {summary.totalStudents}
          </div>
          <p className="text-[11px] text-muted-foreground">Registered & awaiting group</p>
        </Card>

        <Card className="rounded-xl border bg-card shadow-sm p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Formable Groups</span>
            <Layers className="h-4 w-4 text-success" aria-hidden="true" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
            {summary.totalGroups}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {summary.totalAssigned} students to allocate (4-5/team)
          </p>
        </Card>

        <Card className="rounded-xl border bg-card shadow-sm p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Leftover Students</span>
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
            {summary.totalLeftovers}
          </div>
          <p className="text-[11px] text-muted-foreground">Below 4-member minimum track quota</p>
        </Card>

        <Card className="rounded-xl border bg-card shadow-sm p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Not Yet Signed In</span>
            <UserX className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
            {data?.notYetSignedInCount || 0}
          </div>
          <p className="text-[11px] text-muted-foreground">On roster but account pending</p>
        </Card>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading || committing}
            className="gap-1.5 h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            <span>Refresh Pool</span>
          </Button>
          <span className="text-xs text-muted-foreground">
            {summary.totalStudents === 0 ? "Pool is currently empty." : `Ready to process ${summary.totalStudents} pooled students.`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={!canCommit || committing || summary.totalGroups === 0}
            className="gap-2 h-9 font-medium"
            title={!canCommit ? "Formation deadline has not passed yet" : undefined}
          >
            {committing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <UserCheck className="h-4 w-4" aria-hidden="true" />
            )}
            <span>Commit Auto-Grouping</span>
          </Button>
        </div>
      </div>

      {/* Tabs View: Proposed Groups, Leftovers, Not-Yet-Signed-In */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted p-1 rounded-lg">
          <TabsTrigger value="groups" className="text-xs font-medium gap-1.5">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Proposed Groups ({data?.groups.length || 0})</span>
          </TabsTrigger>
          <TabsTrigger value="leftovers" className="text-xs font-medium gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Leftovers ({data?.leftovers.length || 0})</span>
          </TabsTrigger>
          <TabsTrigger value="unlinked" className="text-xs font-medium gap-1.5">
            <UserX className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Not Yet Signed In ({data?.notYetSignedIn.length || 0})</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Proposed Groups */}
        <TabsContent value="groups" className="space-y-4">
          {(!data?.groups || data.groups.length === 0) ? (
            <Card className="rounded-xl border border-dashed border-border p-12 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" aria-hidden="true" />
              <CardTitle className="text-sm font-semibold text-foreground">No Groups to Form</CardTitle>
              <CardDescription className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                There are either no unassigned registered students in the pool, or the number of students per course is below the minimum group threshold (4).
              </CardDescription>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {data.groups.map((group, index) => {
                const courseName = COURSE_LABELS[group.course_id] || group.course_id.toUpperCase();
                return (
                  <Card key={`${group.course_id}-${index}`} className="rounded-xl border bg-card shadow-sm">
                    <CardHeader className="pb-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs font-semibold text-primary border-primary/30 bg-primary/5">
                          {group.course_id.toUpperCase()}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {group.group_size} Members
                        </Badge>
                      </div>
                      <CardTitle className="text-base font-semibold">{group.name}</CardTitle>
                      <CardDescription className="text-xs text-muted-foreground">
                        Programme: {courseName}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="divide-y divide-border text-xs">
                        {group.members.map((member) => {
                          const isLeader = member.uid === group.leader_uid;
                          return (
                            <div
                              key={member.uid}
                              className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
                            >
                              <div className="space-y-0.5">
                                <span className="font-semibold text-foreground block">
                                  {member.full_name}
                                </span>
                                <span className="font-mono text-muted-foreground">
                                  {member.index_number}
                                </span>
                              </div>
                              {isLeader && (
                                <Badge className="bg-primary/10 text-primary border border-primary/20 text-[10px] gap-1">
                                  <Crown className="h-3 w-3" aria-hidden="true" />
                                  <span>Leader</span>
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Leftovers */}
        <TabsContent value="leftovers" className="space-y-4">
          {(!data?.leftovers || data.leftovers.length === 0) ? (
            <Card className="rounded-xl border border-dashed border-border p-12 text-center">
              <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-3" aria-hidden="true" />
              <CardTitle className="text-sm font-semibold text-foreground">Zero Leftover Students</CardTitle>
              <CardDescription className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                Every pooled student was successfully assigned to a 4 or 5 member project group.
              </CardDescription>
            </Card>
          ) : (
            <div className="space-y-4">
              <Alert className="border-warning/30 bg-warning-soft text-warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="text-xs font-semibold">Track-Isolated Leftovers</AlertTitle>
                <AlertDescription className="text-xs">
                  These students cannot be formed into teams of 4-5 without violating course track isolation. They remain in the pool and require manual allocation or admin intervention.
                </AlertDescription>
              </Alert>

              <Card className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Index Number</TableHead>
                      <TableHead className="text-xs">Full Name</TableHead>
                      <TableHead className="text-xs">Programme Track</TableHead>
                      <TableHead className="text-xs text-right">Pool Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.leftovers.map((student) => (
                      <TableRow key={student.uid}>
                        <TableCell className="font-mono text-xs font-semibold">
                          {student.index_number}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-foreground">
                          {student.full_name}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {COURSE_LABELS[student.course_id] || student.course_id.toUpperCase()}
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          <Badge variant="outline" className="border-warning/30 text-warning bg-warning-soft text-[10px]">
                            Unassigned Leftover
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Not Yet Signed In */}
        <TabsContent value="unlinked" className="space-y-4">
          {(!data?.notYetSignedIn || data.notYetSignedIn.length === 0) ? (
            <Card className="rounded-xl border border-dashed border-border p-12 text-center">
              <UserCheck className="h-8 w-8 text-success mx-auto mb-3" aria-hidden="true" />
              <CardTitle className="text-sm font-semibold text-foreground">100% Account Linkage</CardTitle>
              <CardDescription className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                All students on the cohort roster have authenticated with their @htu.edu.gh credentials.
              </CardDescription>
            </Card>
          ) : (
            <div className="space-y-4">
              <Alert className="border-muted bg-muted/40 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <AlertTitle className="text-xs font-semibold">Pending Account Activation</AlertTitle>
                <AlertDescription className="text-xs">
                  These students appear on the official cohort roster but have not yet logged in with their institutional email. They cannot be auto-grouped until they complete first-time sign-in.
                </AlertDescription>
              </Alert>

              <Card className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Index Number</TableHead>
                      <TableHead className="text-xs">Full Name</TableHead>
                      <TableHead className="text-xs">Programme Track</TableHead>
                      <TableHead className="text-xs">Contact Phone</TableHead>
                      <TableHead className="text-xs text-right">Roster Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.notYetSignedIn.map((student) => (
                      <TableRow key={student.index_number}>
                        <TableCell className="font-mono text-xs font-semibold">
                          {student.index_number}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-foreground">
                          {student.full_name}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {COURSE_LABELS[student.course_id] || student.course_id.toUpperCase()}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {student.contact || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Pending Login
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Commit Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <ShieldAlert className="h-5 w-5 text-primary" aria-hidden="true" />
              <span>Confirm Cohort Auto-Grouping</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              You are about to generate official project teams for all eligible students currently in the unassigned pool.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Teams to Create:</span>
                <strong className="font-semibold text-foreground">{summary.totalGroups} Teams</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Students to Allocate:</span>
                <strong className="font-semibold text-foreground">{summary.totalAssigned} Students</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unassigned Leftovers:</span>
                <span className="font-semibold text-warning">{summary.totalLeftovers} Students</span>
              </div>
            </div>

            <p className="text-muted-foreground">
              Each team member will receive an in-app notification with their assigned group number and team details. Leaders are deterministically selected by index number.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(false)}
              disabled={committing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCommit}
              disabled={committing}
              className="gap-1.5"
            >
              {committing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              <span>Confirm & Commit</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
