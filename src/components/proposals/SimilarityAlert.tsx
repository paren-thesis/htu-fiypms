"use client";

import * as React from "react";
import { AlertTriangle, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { SimilarTopicWarning } from "@/lib/topics/similar";

interface SimilarityAlertProps {
  warnings: SimilarTopicWarning[];
  onDismiss?: () => void;
}

export function SimilarityAlert({ warnings, onDismiss }: SimilarityAlertProps) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <Alert className="border-warning/30 bg-warning-soft text-warning relative">
      <AlertTriangle className="h-4 w-4" />
      <div className="flex-1 pr-6">
        <AlertTitle className="text-sm font-semibold flex items-center gap-2">
          <span>Topic Similarity Warning (≥ 60%)</span>
          <span className="text-xs font-normal text-muted-foreground">
            Submission succeeded, but high overlap detected with previous projects
          </span>
        </AlertTitle>
        <AlertDescription className="text-xs mt-1.5 space-y-1.5">
          <p className="text-muted-foreground">
            Your proposal shares technical keywords or title phrasing with previously approved projects in earlier academic years. Reviewers may request scope differentiation:
          </p>
          <ul className="list-disc pl-4 space-y-1">
            {warnings.map((w) => (
              <li key={w.topic_id} className="text-foreground">
                <span className="font-semibold">{w.title}</span>{" "}
                <span className="font-mono text-[11px] text-warning font-bold">
                  ({Math.round(w.score * 100)}% match)
                </span>
              </li>
            ))}
          </ul>
        </AlertDescription>
      </div>
      {onDismiss && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="absolute top-2 right-2 h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Dismiss</span>
        </Button>
      )}
    </Alert>
  );
}
