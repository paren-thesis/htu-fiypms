"use client";

import * as React from "react";
import { History, ExternalLink, Calendar, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ChapterHistoryEntry } from "@/types/firestore";

interface ChapterHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapterNumber: number;
  chapterTitle: string;
  history: ChapterHistoryEntry[];
}

export function ChapterHistoryModal({
  open,
  onOpenChange,
  chapterNumber,
  chapterTitle,
  history,
}: ChapterHistoryModalProps) {
  const formatTimestamp = (ts?: { seconds: number; nanoseconds: number }) => {
    if (!ts || typeof ts.seconds !== "number") return "—";
    return new Date(ts.seconds * 1000).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />;
      case "revision_needed":
        return <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
    }
  };

  const sortedHistory = React.useMemo(() => {
    return [...history].sort((a, b) => b.version - a.version);
  }, [history]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <History className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Version History — Chapter {chapterNumber}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {chapterTitle} · Prior submission links and supervisor evaluation timestamps
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {sortedHistory.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No prior version snapshots recorded for this chapter.
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedHistory.map((item) => (
              <div
                key={`v-${item.version}`}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3.5 text-sm transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs font-semibold">
                      v{item.version}
                    </Badge>
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      {getStatusIcon(item.status)}
                      <span className="capitalize">{item.status.replace("_", " ")}</span>
                    </span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    asChild
                  >
                    <a
                      href={item.document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open external manuscript snapshot"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      View Link
                    </a>
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-muted-foreground pt-1 border-t border-border/50">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>Submitted: {formatTimestamp(item.submitted_at)}</span>
                  </div>
                  {item.reviewed_at && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>Reviewed: {formatTimestamp(item.reviewed_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
