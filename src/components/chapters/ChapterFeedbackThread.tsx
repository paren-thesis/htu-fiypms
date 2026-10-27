"use client";

import * as React from "react";
import { MessageSquare, Calendar } from "lucide-react";
import type { ChapterFeedback } from "@/types/firestore";

interface ChapterFeedbackThreadProps {
  feedback: ChapterFeedback[];
  reviewNotes?: string;
}

export function ChapterFeedbackThread({ feedback, reviewNotes }: ChapterFeedbackThreadProps) {
  if ((!feedback || feedback.length === 0) && !reviewNotes) {
    return null;
  }

  const formatTimestamp = (ts?: { seconds: number; nanoseconds: number }) => {
    if (!ts || typeof ts.seconds !== "number") return null;
    return new Date(ts.seconds * 1000).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-border bg-muted/30 p-3.5 text-sm">
      <div className="flex items-center gap-2 font-medium text-foreground">
        <MessageSquare className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
        <span>Supervisor Review & Feedback</span>
      </div>

      {reviewNotes && (
        <div className="rounded-md border border-border/60 bg-card p-3 text-sm text-foreground">
          <p className="font-medium text-xs text-muted-foreground uppercase tracking-wider mb-1">
            General Review Notes
          </p>
          <p className="whitespace-pre-wrap leading-relaxed">{reviewNotes}</p>
        </div>
      )}

      {feedback && feedback.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="font-medium text-xs text-muted-foreground uppercase tracking-wider">
            Line-Item Action Points ({feedback.length})
          </p>
          <ul className="space-y-2">
            {feedback.map((item, idx) => {
              const formattedDate = formatTimestamp(item.created_at);
              return (
                <li
                  key={item.id || `fb-${idx}`}
                  className="flex flex-col gap-1 rounded-md border border-border/50 bg-card px-3 py-2 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-xs text-primary/80">#{idx + 1}</span>
                    {formattedDate && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Calendar className="h-3 w-3" aria-hidden="true" />
                        {formattedDate}
                      </span>
                    )}
                  </div>
                  <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                    {item.content}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
