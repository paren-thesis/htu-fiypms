"use client";

import * as React from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { History, GitCommit, FileText, Loader2 } from "lucide-react";
import { db } from "@/lib/firebase/client";
import type { TopicDocument } from "@/types/firestore";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ProposalHistoryDrawerProps {
  topic: TopicDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TopicHistoryEntry extends TopicDocument {
  versionId: string;
  archived_at?: { toDate?: () => Date };
}

export function ProposalHistoryDrawer({
  topic,
  open,
  onOpenChange,
}: ProposalHistoryDrawerProps) {
  const [history, setHistory] = React.useState<TopicHistoryEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!open || !topic?.id) {
      return;
    }

    const historyRef = collection(db, "topics", topic.id, "history");
    const historyQuery = query(historyRef, orderBy("version", "desc"));

    const unsubscribe = onSnapshot(
      historyQuery,
      (snapshot) => {
        const entries: TopicHistoryEntry[] = snapshot.docs.map((docSnap) => ({
          versionId: docSnap.id,
          ...(docSnap.data() as TopicDocument),
        }));
        setHistory(entries);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to read topic history:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [open, topic?.id]);

  if (!topic) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl w-full flex flex-col p-0">
        <SheetHeader className="p-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2 text-primary mb-1">
            <History className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wider">Revision History</span>
          </div>
          <SheetTitle className="text-lg font-bold line-clamp-1">{topic.title}</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Rank {topic.preference_rank} · Current active revision: Version {topic.version} ({topic.status})
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            {/* Current Active Version Banner */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-primary text-primary font-bold">
                    v{topic.version} (Current)
                  </Badge>
                  <StatusBadge domain="topic" value={topic.status} />
                </div>
                <span className="text-[11px] text-muted-foreground">Active Proposal</span>
              </div>
              <h4 className="text-sm font-semibold text-foreground">{topic.title}</h4>
              <p className="text-xs text-muted-foreground line-clamp-3">{topic.abstract}</p>
              <div className="flex flex-wrap gap-1 pt-1">
                {topic.tech_stack?.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px] py-0 px-1.5 font-mono">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Historical Snapshots Section */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <GitCommit className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Previous Version Snapshots ({history.length})</span>
              </h4>

              {loading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground gap-2 text-xs">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading revision snapshots...</span>
                </div>
              ) : history.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  <FileText className="h-6 w-6 mx-auto mb-2 text-muted-foreground/60" />
                  <span>No prior revisions archived yet. Snapshots are created automatically when the team resubmits after revision requests.</span>
                </div>
              ) : (
                <div className="relative pl-6 border-l-2 border-border space-y-6 ml-2">
                  {history.map((snapshot) => {
                    const archivedDate = snapshot.archived_at?.toDate
                      ? snapshot.archived_at.toDate().toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "Archived";

                    // Detect changes against current version
                    const titleChanged = snapshot.title !== topic.title;
                    const abstractChanged = snapshot.abstract !== topic.abstract;
                    const tagsChanged =
                      JSON.stringify(snapshot.tech_stack?.sort()) !==
                      JSON.stringify(topic.tech_stack?.sort());

                    return (
                      <div key={snapshot.versionId} className="relative space-y-2">
                        {/* Dot on the timeline */}
                        <div className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-primary bg-background" />

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs font-mono">
                              v{snapshot.version}
                            </Badge>
                            <StatusBadge domain="topic" value={snapshot.status} />
                          </div>
                          <span className="text-[11px] text-muted-foreground">{archivedDate}</span>
                        </div>

                        {/* Summary of what changed */}
                        <div className="flex flex-wrap gap-1.5 text-[10px]">
                          {titleChanged && (
                            <Badge variant="secondary" className="bg-muted text-muted-foreground">
                              Title revised
                            </Badge>
                          )}
                          {abstractChanged && (
                            <Badge variant="secondary" className="bg-muted text-muted-foreground">
                              Abstract revised
                            </Badge>
                          )}
                          {tagsChanged && (
                            <Badge variant="secondary" className="bg-muted text-muted-foreground">
                              Tech tags changed
                            </Badge>
                          )}
                          {!titleChanged && !abstractChanged && !tagsChanged && (
                            <Badge variant="secondary" className="bg-muted text-muted-foreground">
                              Resubmission snapshot
                            </Badge>
                          )}
                        </div>

                        <div className="rounded-lg border bg-card p-3 space-y-2 text-xs">
                          <div className="font-medium text-foreground">{snapshot.title}</div>
                          <p className="text-muted-foreground text-[11px] line-clamp-2">
                            {snapshot.abstract}
                          </p>

                          {snapshot.review_notes && (
                            <div className="mt-2 rounded bg-warning-soft/60 border border-warning/20 p-2 text-[11px] text-warning">
                              <span className="font-semibold">Reviewer Notes: </span>
                              {snapshot.review_notes}
                            </div>
                          )}

                          <div className="flex flex-wrap gap-1 pt-1">
                            {snapshot.tech_stack?.map((t) => (
                              <span
                                key={t}
                                className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                              >
                                {t}
                              </span>
                            ))}
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
      </SheetContent>
    </Sheet>
  );
}
