"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import {
  AlertTriangle,
  Info,
  Users,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { getPeerSummary } from "@/app/actions/get-peer-summary";
import type { PeerSummary } from "@/lib/peer/summary";
import type { TeamDocument, UserDocument } from "@/types/firestore";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function StaffPeerSummaryView() {
  const { user, activeRole } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [teams, setTeams] = React.useState<TeamDocument[]>([]);
  const [selectedTeamId, setSelectedTeamId] = React.useState<string>(
    searchParams.get("team") || ""
  );
  const [loadingTeams, setLoadingTeams] = React.useState<boolean>(true);
  const [summary, setSummary] = React.useState<PeerSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = React.useState<boolean>(false);
  const [studentProfiles, setStudentProfiles] = React.useState<Record<string, UserDocument>>({});

  const isSupervisor = activeRole === "supervisor";

  // 1. Load relevant teams
  React.useEffect(() => {
    if (!user?.uid) return;

    let isCancelled = false;

    async function fetchTeams() {
      try {
        setLoadingTeams(true);
        let q;
        if (isSupervisor) {
          q = query(
            collection(db, "teams"),
            where("assigned_supervisor_id", "==", user?.uid)
          );
        } else {
          // Coordinators / Admins see all teams
          q = query(collection(db, "teams"));
        }

        const snap = await getDocs(q);
        const docs = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<TeamDocument, "id">) } as TeamDocument)
        );

        if (!isCancelled) {
          setTeams(docs);
          // If no team selected yet and teams exist, select the first team or URL query param
          const queryTeam = searchParams.get("team");
          if (queryTeam && docs.some((t) => t.id === queryTeam)) {
            setSelectedTeamId(queryTeam);
          } else if (docs.length > 0 && docs[0] && !selectedTeamId) {
            setSelectedTeamId(docs[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load staff teams:", err);
      } finally {
        if (!isCancelled) setLoadingTeams(false);
      }
    }

    fetchTeams();
    return () => {
      isCancelled = true;
    };
  }, [user?.uid, isSupervisor, searchParams, selectedTeamId]);

  // 2. Fetch summary when selectedTeamId changes
  React.useEffect(() => {
    if (!user || !selectedTeamId) return;

    let isCancelled = false;

    async function loadSummary() {
      try {
        setLoadingSummary(true);
        const idToken = await user!.getIdToken();
        const res = await getPeerSummary(idToken, { team_id: selectedTeamId });

        if (!isCancelled) {
          if (res.ok && res.summary) {
            setSummary(res.summary);

            // Fetch profiles for students in summary
            const profiles: Record<string, UserDocument> = {};
            for (const s of res.summary.student_list) {
              try {
                const uSnap = await getDoc(doc(db, "users", s.student_id));
                if (uSnap.exists()) {
                  profiles[s.student_id] = {
                    id: uSnap.id,
                    ...(uSnap.data() as Omit<UserDocument, "id">),
                  } as UserDocument;
                }
              } catch {
                // Ignore profile lookup errors
              }
            }
            if (!isCancelled) {
              setStudentProfiles(profiles);
            }
          } else {
            setSummary(null);
            toast.error(res.error || "Failed to load peer evaluation summary");
          }
        }
      } catch (err) {
        console.error("Failed to load peer summary:", err);
        if (!isCancelled) toast.error("Error loading peer summary report");
      } finally {
        if (!isCancelled) setLoadingSummary(false);
      }
    }

    loadSummary();
    return () => {
      isCancelled = true;
    };
  }, [user, selectedTeamId]);

  const handleTeamChange = (teamId: string) => {
    setSelectedTeamId(teamId);
    router.push(`/peer-evaluation?team=${teamId}`);
  };

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);

  return (
    <div className="space-y-6">
      {/* Policy Advisory Banner */}
      <Alert className="border-border bg-card">
        <Info className="h-4 w-4 text-primary" />
        <AlertTitle className="font-semibold text-foreground">
          Advisory Continuous Assessment Input (Decision D-02)
        </AlertTitle>
        <AlertDescription className="text-muted-foreground text-sm mt-1 leading-relaxed">
          Peer evaluation data provides supervisory visibility into individual member engagement to identify
          potential free-riding. In strict accordance with HTU policy (<strong>D-02</strong>), peer evaluations are
          <strong> strictly advisory</strong> for calibrating the team continuous assessment score and{" "}
          <strong>never alter individual marks directly</strong>. Individual evaluator identities are completely withheld.
        </AlertDescription>
      </Alert>

      {/* Team Selector & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Select Project Group</h3>
            <p className="text-xs text-muted-foreground">
              {isSupervisor ? "Review peer assessment summaries for your assigned teams" : "Inspect departmental group peer reviews"}
            </p>
          </div>
        </div>

        {loadingTeams ? (
          <Skeleton className="h-10 w-64" />
        ) : teams.length === 0 ? (
          <Badge variant="outline" className="text-muted-foreground">
            No Assigned Teams Found
          </Badge>
        ) : (
          <div className="w-full sm:w-72">
            <Select value={selectedTeamId} onValueChange={handleTeamChange}>
              <SelectTrigger className="w-full bg-background min-h-[44px]">
                <SelectValue placeholder="Choose a project team..." />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.group_number || t.course_id.toUpperCase()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Summary Content */}
      {loadingSummary ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : !summary ? (
        <Card className="border-border">
          <CardContent className="py-12 text-center space-y-2">
            <BookOpen className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium text-foreground">No peer evaluation data available</p>
            <p className="text-xs text-muted-foreground">
              Select a project team above to review aggregated peer assessment scores.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-border bg-card shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs font-medium text-muted-foreground">Team Composite Mean</div>
                <div className="text-2xl font-bold text-primary mt-1 font-mono">
                  {summary.team_mean > 0 ? `${summary.team_mean} / 10.0` : "N/A"}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Average across all peer scores</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs font-medium text-muted-foreground">Total Submissions</div>
                <div className="text-2xl font-bold text-foreground mt-1 font-mono">
                  {summary.total_ratings}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Confidential ratings recorded</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs font-medium text-muted-foreground">Group Members</div>
                <div className="text-2xl font-bold text-foreground mt-1 font-mono">
                  {summary.student_list.length}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Rostered team members</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs font-medium text-muted-foreground">Free-Rider Flags</div>
                <div className="text-2xl font-bold text-destructive mt-1 font-mono">
                  {summary.student_list.filter((s) => s.is_free_rider).length}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Scores &lt;75% team mean or &lt;5.0</p>
              </CardContent>
            </Card>
          </div>

          {/* Aggregated Breakdown Table */}
          <Card className="border-border shadow-sm overflow-hidden bg-card">
            <CardHeader className="bg-muted/20 border-b border-border py-4 px-5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Aggregated Teammate Contribution Analysis
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Individual ratings received per student. Evaluator identities are strictly confidential.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs font-mono">
                  {selectedTeam?.group_number || "TEAM"}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/10 hover:bg-muted/10 border-b border-border">
                    <TableHead className="text-xs font-semibold">Student</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Ratings Count</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Punctuality</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Technical</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Teamwork</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Mean Score</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Contribution Status</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {summary.student_list.map((studentSummary) => {
                    const profile = studentProfiles[studentSummary.student_id];
                    const name = profile?.name || "Team Member";
                    const indexNum = profile?.profile?.index_number || studentSummary.student_id;

                    return (
                      <TableRow key={studentSummary.student_id} className="border-b border-border hover:bg-muted/20">
                        <TableCell className="py-3 font-medium">
                          <div className="text-sm text-foreground font-semibold">{name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{indexNum}</div>
                        </TableCell>

                        <TableCell className="py-3 text-center font-mono text-sm">
                          {studentSummary.ratings_count}
                        </TableCell>

                        <TableCell className="py-3 text-center font-mono text-sm">
                          {studentSummary.ratings_count > 0 ? `${studentSummary.punctuality_mean} / 10` : "-"}
                        </TableCell>

                        <TableCell className="py-3 text-center font-mono text-sm">
                          {studentSummary.ratings_count > 0 ? `${studentSummary.technical_contribution_mean} / 10` : "-"}
                        </TableCell>

                        <TableCell className="py-3 text-center font-mono text-sm">
                          {studentSummary.ratings_count > 0 ? `${studentSummary.teamwork_mean} / 10` : "-"}
                        </TableCell>

                        <TableCell className="py-3 text-center font-mono font-bold text-primary">
                          {studentSummary.ratings_count > 0 ? `${studentSummary.mean_score.toFixed(1)} / 10.0` : "-"}
                        </TableCell>

                        <TableCell className="py-3 text-right">
                          {studentSummary.ratings_count === 0 ? (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              Awaiting Ratings
                            </Badge>
                          ) : studentSummary.is_free_rider ? (
                            <Badge variant="destructive" className="gap-1 font-semibold text-xs py-1">
                              <AlertTriangle className="h-3 w-3" />
                              Free-Rider Flag
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 text-xs py-1">
                              Good Standing
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
