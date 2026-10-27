"use client";

import * as React from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import {
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Send,
  AlertTriangle,
  History,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/client";
import { openTopic, decideTopic } from "@/app/actions/review-topic";
import type { TeamDocument, TopicDocument } from "@/types/firestore";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ProposalHistoryDrawer } from "./ProposalHistoryDrawer";
import { computeTopicSimilarity } from "@/lib/topics/similar";

const COURSE_NAMES: Record<string, string> = {
  "btech-cs": "BTech Computer Science",
  "btech-ict": "BTech ICT",
  "hnd-cs": "HND Computer Science",
  "hnd-ict": "HND ICT",
};

interface QueueItem {
  topic: TopicDocument;
  team?: TeamDocument;
}

export function ReviewQueue() {
  const { user, activeRole } = useAuth();
  const [topics, setTopics] = React.useState<TopicDocument[]>([]);
  const [teamsMap, setTeamsMap] = React.useState<Record<string, TeamDocument>>({});
  const [loading, setLoading] = React.useState(true);

  // Filters
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [courseFilter, setCourseFilter] = React.useState<string>("all");

  // Detail Sheet state
  const [selectedItem, setSelectedItem] = React.useState<QueueItem | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  // Decision Form State
  const [decision, setDecision] = React.useState<"approve" | "reject" | "request_revision">("approve");
  const [reviewNotes, setReviewNotes] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Real-time listener for current active proposals
  React.useEffect(() => {
    const topicsRef = collection(db, "topics");
    const topicsQuery = query(topicsRef, where("is_current", "==", true));

    const unsubTopics = onSnapshot(
      topicsQuery,
      (snapshot) => {
        const docs = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<TopicDocument, "id">),
          }))
          .filter((t) => t.status !== "draft"); // Queue displays submitted/under_review/approved/etc.

        // Sort by submitted_at desc
        docs.sort((a, b) => {
          const aTime = a.submitted_at?.toMillis ? a.submitted_at.toMillis() : 0;
          const bTime = b.submitted_at?.toMillis ? b.submitted_at.toMillis() : 0;
          return bTime - aTime;
        });

        setTopics(docs);
        setLoading(false);
      },
      (error) => {
        console.error("Firestore onSnapshot error on review queue topics:", error);
        setLoading(false);
      }
    );

    // Real-time listener for teams to resolve metadata
    const teamsRef = collection(db, "teams");
    const unsubTeams = onSnapshot(
      teamsRef,
      (snapshot) => {
        const map: Record<string, TeamDocument> = {};
        for (const docSnap of snapshot.docs) {
          map[docSnap.id] = {
            id: docSnap.id,
            ...(docSnap.data() as Omit<TeamDocument, "id">),
          };
        }
        setTeamsMap(map);
      },
      (error) => {
        console.error("Firestore onSnapshot error on teams map:", error);
      }
    );

    return () => {
      unsubTopics();
      unsubTeams();
    };
  }, []);

  // Filter items
  const filteredQueue = React.useMemo(() => {
    return topics
      .map((topic) => ({
        topic,
        team: teamsMap[topic.team_id],
      }))
      .filter(({ topic, team }) => {
        // Status filter
        if (statusFilter !== "all" && topic.status !== statusFilter) {
          return false;
        }

        // Course filter
        if (courseFilter !== "all" && team?.course_id !== courseFilter) {
          return false;
        }

        // Search text filter
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchTitle = topic.title.toLowerCase().includes(q);
          const matchGroup = team?.group_number?.toLowerCase().includes(q);
          const matchTeamName = team?.name?.toLowerCase().includes(q);
          if (!matchTitle && !matchGroup && !matchTeamName) {
            return false;
          }
        }

        return true;
      });
  }, [topics, teamsMap, statusFilter, courseFilter, search]);

  const handleOpenDetail = (item: QueueItem) => {
    setSelectedItem(item);
    setReviewNotes(item.topic.review_notes || "");
    setDecision("approve");
    setSheetOpen(true);
  };

  const handleStartReview = async () => {
    if (!selectedItem || !user) return;
    setIsSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      const res = await openTopic(idToken, { topicId: selectedItem.topic.id });

      if (!res.ok) {
        toast.error(res.error || "Failed to start review");
        return;
      }

      toast.success("Proposal moved to Under Review.");
      setSelectedItem((prev) =>
        prev
          ? {
              ...prev,
              topic: { ...prev.topic, status: "under_review" },
            }
          : null
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error opening topic");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !user) return;

    if (decision !== "approve" && reviewNotes.trim().length < 5) {
      toast.error("Review notes (min 5 characters) are required for revision or rejection.");
      return;
    }

    setIsSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      const res = await decideTopic(idToken, {
        topicId: selectedItem.topic.id,
        decision,
        review_notes: reviewNotes.trim(),
      });

      if (!res.ok) {
        toast.error(res.error || "Failed to record decision");
        return;
      }

      const actionText =
        decision === "approve"
          ? "approved"
          : decision === "reject"
          ? "rejected"
          : "revision requested";
      toast.success(`Proposal successfully ${actionText}!`);
      setSheetOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Find duplicate / similarity scores with other approved topics
  const similarApproved = React.useMemo(() => {
    if (!selectedItem) return [];
    const current = selectedItem.topic;

    const approvedTopics = topics.filter(
      (t) => t.status === "approved" && t.id !== current.id
    );

    const matches: Array<{ title: string; score: number }> = [];

    for (const app of approvedTopics) {
      const score = computeTopicSimilarity(
        { title: current.title, tech_stack: current.tech_stack || [] },
        { title: app.title, tech_stack: app.tech_stack || [] }
      );
      if (score >= 0.5) {
        matches.push({ title: app.title, score });
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }, [selectedItem, topics]);

  const isFacultyReviewer =
    activeRole === "supervisor" ||
    activeRole === "coordinator" ||
    activeRole === "admin";

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <Card className="rounded-xl border bg-card shadow-xs">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by topic title, group number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>

            {/* Filter Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                <span>Filters:</span>
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs w-[140px]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="revision_requested">Revision Requested</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>

              {/* Course Programme Filter */}
              <Select value={courseFilter} onValueChange={setCourseFilter}>
                <SelectTrigger className="h-8 text-xs w-[160px]">
                  <SelectValue placeholder="All Programmes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Programmes</SelectItem>
                  <SelectItem value="btech-cs">BTech CS</SelectItem>
                  <SelectItem value="btech-ict">BTech ICT</SelectItem>
                  <SelectItem value="hnd-cs">HND CS</SelectItem>
                  <SelectItem value="hnd-ict">HND ICT</SelectItem>
                </SelectContent>
              </Select>

              {(statusFilter !== "all" || courseFilter !== "all" || search) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStatusFilter("all");
                    setCourseFilter("all");
                    setSearch("");
                  }}
                  className="h-8 text-xs text-muted-foreground hover:text-foreground px-2"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Proposals Queue Table */}
      <Card className="rounded-xl border bg-card shadow-xs overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-[140px] text-xs font-semibold">Group / Team</TableHead>
              <TableHead className="w-[110px] text-xs font-semibold">Programme</TableHead>
              <TableHead className="w-[80px] text-xs font-semibold">Rank</TableHead>
              <TableHead className="text-xs font-semibold">Proposal Title</TableHead>
              <TableHead className="w-[130px] text-xs font-semibold">Status</TableHead>
              <TableHead className="w-[110px] text-xs font-semibold">Submitted</TableHead>
              <TableHead className="w-[100px] text-right text-xs font-semibold">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-xs text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span>Loading proposals queue...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredQueue.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-xs text-muted-foreground">
                  No topic proposals match the selected filter criteria.
                </TableCell>
              </TableRow>
            ) : (
              filteredQueue.map(({ topic, team }) => {
                const submittedDate = topic.submitted_at?.toDate
                  ? topic.submitted_at.toDate().toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })
                  : "Recent";

                const courseCode = team?.course_id
                  ? team.course_id.toUpperCase().replace("-", " ")
                  : "—";

                return (
                  <TableRow
                    key={topic.id}
                    className="hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() => handleOpenDetail({ topic, team })}
                  >
                    <TableCell className="font-medium text-xs">
                      <div className="font-bold text-foreground">
                        {team?.group_number || "—"}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate max-w-[130px]">
                        {team?.name || "Unnamed Group"}
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-mono py-0">
                        {courseCode}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          topic.preference_rank === 1
                            ? "bg-primary/10 text-primary font-bold text-[10px]"
                            : "text-[10px]"
                        }
                      >
                        Rank {topic.preference_rank}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <div className="font-semibold text-xs text-foreground line-clamp-1">
                        {topic.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground line-clamp-1">
                        {topic.abstract}
                      </div>
                    </TableCell>

                    <TableCell>
                      <StatusBadge domain="topic" value={topic.status} />
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {submittedDate}
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetail({ topic, team });
                        }}
                        className="h-7 text-xs px-2.5 font-medium"
                      >
                        {topic.status === "submitted" ? "Review" : "View"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Review Detail Sheet & Decision Form */}
      {selectedItem && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="sm:max-w-xl w-full flex flex-col p-0">
            <SheetHeader className="p-6 pb-4 border-b border-border">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-bold text-xs">
                    {selectedItem.team?.group_number}
                  </Badge>
                  <Badge variant="secondary" className="text-[11px]">
                    Rank {selectedItem.topic.preference_rank}{" "}
                    {selectedItem.topic.preference_rank === 1
                      ? "(Primary)"
                      : selectedItem.topic.preference_rank === 2
                      ? "(Secondary)"
                      : "(Tertiary)"}
                  </Badge>
                  <Badge variant="outline" className="text-[11px] font-mono">
                    v{selectedItem.topic.version}
                  </Badge>
                </div>
                <StatusBadge domain="topic" value={selectedItem.topic.status} />
              </div>
              <SheetTitle className="text-base font-bold pt-2">
                {selectedItem.topic.title}
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                Group: {selectedItem.team?.name} · Programme:{" "}
                {COURSE_NAMES[selectedItem.team?.course_id || ""] ||
                  selectedItem.team?.course_id?.toUpperCase()}
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="flex-1 p-6 space-y-5">
              <div className="space-y-5">
                {/* Version History Button */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Proposal Details
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setHistoryOpen(true)}
                    className="text-xs h-7 gap-1 text-primary hover:text-primary"
                  >
                    <History className="h-3.5 w-3.5" />
                    <span>View Revision History</span>
                  </Button>
                </div>

                {/* Similarity Warning (Duplicate Detection) */}
                {similarApproved.length > 0 && (
                  <div className="rounded-xl border border-warning/30 bg-warning-soft/40 p-3 space-y-1.5 text-xs text-warning">
                    <div className="flex items-center gap-1.5 font-semibold text-xs">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Potential Duplicate Overlap Detected</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      This topic shares high keyword similarity with approved projects:
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-[11px]">
                      {similarApproved.map((sim, i) => (
                        <li key={i}>
                          <span className="font-semibold text-foreground">{sim.title}</span>{" "}
                          <span className="font-mono text-warning font-bold">
                            ({Math.round(sim.score * 100)}% similarity)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Abstract */}
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-foreground">Project Abstract</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed bg-muted/30 p-3 rounded-lg border">
                    {selectedItem.topic.abstract}
                  </p>
                </div>

                {/* Problem Statement */}
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-foreground">Problem Statement</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed bg-muted/30 p-3 rounded-lg border">
                    {selectedItem.topic.problem_statement}
                  </p>
                </div>

                {/* Proposed Solution */}
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-foreground">Proposed Solution</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed bg-muted/30 p-3 rounded-lg border">
                    {selectedItem.topic.proposed_solution}
                  </p>
                </div>

                {/* Technology Stack Chips */}
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold text-foreground">Technology Stack</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedItem.topic.tech_stack?.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-xs font-mono py-0.5 px-2"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Existing Review Notes if any */}
                {selectedItem.topic.review_notes && (
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold text-foreground">Previous Review Notes</h4>
                    <p className="text-xs text-muted-foreground bg-warning-soft/30 border border-warning/20 p-2.5 rounded-lg">
                      {selectedItem.topic.review_notes}
                    </p>
                  </div>
                )}

                {/* Faculty Decision Form */}
                {isFacultyReviewer && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4 pt-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
                        Faculty Review Decision
                      </h4>
                    </div>

                    {selectedItem.topic.status === "submitted" ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          This proposal is currently in Submitted status. Click below to initiate review and lock preliminary evaluation.
                        </p>
                        <Button
                          size="sm"
                          onClick={handleStartReview}
                          disabled={isSubmitting}
                          className="w-full gap-2 text-xs font-medium"
                        >
                          {isSubmitting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Clock className="h-3.5 w-3.5" />
                          )}
                          <span>Open for Review (Move to Under Review)</span>
                        </Button>
                      </div>
                    ) : selectedItem.topic.status === "approved" ? (
                      <div className="rounded-lg bg-success-soft p-3 text-xs text-success font-medium flex items-center gap-2 border border-success/30">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>This topic proposal has already been approved for project execution.</span>
                      </div>
                    ) : (
                      <form onSubmit={handleDecisionSubmit} className="space-y-3.5">
                        {/* Decision Choice */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-foreground">
                            Decision Outcome
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => setDecision("approve")}
                              className={`rounded-lg border p-2 text-xs font-semibold transition-all ${
                                decision === "approve"
                                  ? "border-success bg-success-soft text-success shadow-xs font-bold"
                                  : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                              }`}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => setDecision("request_revision")}
                              className={`rounded-lg border p-2 text-xs font-semibold transition-all ${
                                decision === "request_revision"
                                  ? "border-warning bg-warning-soft text-warning shadow-xs font-bold"
                                  : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                              }`}
                            >
                              Request Revision
                            </button>
                            <button
                              type="button"
                              onClick={() => setDecision("reject")}
                              className={`rounded-lg border p-2 text-xs font-semibold transition-all ${
                                decision === "reject"
                                  ? "border-danger bg-danger-soft text-danger shadow-xs font-bold"
                                  : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                              }`}
                            >
                              Reject
                            </button>
                          </div>
                        </div>

                        {/* Reviewer Feedback Notes */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                            <span>Review Notes & Feedback</span>
                            {decision !== "approve" && (
                              <span className="text-[10px] text-danger font-medium">Required</span>
                            )}
                          </label>
                          <Textarea
                            placeholder={
                              decision === "approve"
                                ? "Optional commendations or initial scope guidance for the students..."
                                : "Explain necessary revisions, deficiencies, or reason for rejection (min 5 characters)..."
                            }
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            rows={3}
                            disabled={isSubmitting}
                            className="text-xs"
                          />
                        </div>

                        <Button
                          type="submit"
                          disabled={
                            isSubmitting ||
                            (decision !== "approve" && reviewNotes.trim().length < 5)
                          }
                          className="w-full gap-2 text-xs font-medium"
                        >
                          {isSubmitting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          <span>
                            {decision === "approve"
                              ? "Confirm & Approve Topic Proposal"
                              : decision === "reject"
                              ? "Reject Proposal"
                              : "Submit Revision Request"}
                          </span>
                        </Button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      )}

      {/* Revision History Drawer */}
      <ProposalHistoryDrawer
        topic={selectedItem?.topic || null}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
}
