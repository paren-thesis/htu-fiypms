"use client";

import * as React from "react";
import {
  ScrollText,
  User,
  Target,
  Clock,
  ArrowRight,
  Code2,
} from "lucide-react";
import type { SerializedAuditLog } from "@/app/actions/admin-users";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

interface AuditLogDetailSheetProps {
  log: SerializedAuditLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuditLogDetailSheet({
  log,
  open,
  onOpenChange,
}: AuditLogDetailSheetProps) {
  if (!log) return null;

  const metadata = log.metadata ?? {};
  const oldVal = metadata.old;
  const newVal = metadata.new;
  const hasDiff = oldVal !== undefined || newVal !== undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-6 space-y-6">
        <SheetHeader className="space-y-1 border-b border-border p-0 pb-4 pr-10 text-left">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-primary" aria-hidden="true" />
            <Badge variant="secondary" className="font-mono text-xs">
              {log.action}
            </Badge>
          </div>
          <SheetTitle className="text-base font-semibold leading-snug pt-1">
            {log.description}
          </SheetTitle>
          <SheetDescription className="text-xs font-mono tabular-nums">
            Event ID: {log.id}
          </SheetDescription>
        </SheetHeader>

        {/* Metadata Summary Cards */}
        <div className="space-y-3 text-xs">
          <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <User className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>Actor Context</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div>
                <span className="block text-[10px] uppercase tracking-wider">
                  Name / Email
                </span>
                <span className="font-medium text-foreground break-all">
                  {log.actor_name} ({log.actor_email})
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider">
                  Active Role & UID
                </span>
                <span className="font-mono text-foreground">
                  {log.actor_role} · {log.actor_id}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Target
                  className="h-3.5 w-3.5 text-primary"
                  aria-hidden="true"
                />
                <span>Target Entity</span>
              </div>
              <p className="font-mono text-foreground break-all">
                {log.target_type} : {log.target_id}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Clock
                  className="h-3.5 w-3.5 text-primary"
                  aria-hidden="true"
                />
                <span>Recorded At</span>
              </div>
              <p className="font-mono text-foreground tabular-nums">
                {new Date(log.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Old vs New Values Comparison */}
        {hasDiff && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <ArrowRight
                className="h-3.5 w-3.5 text-primary"
                aria-hidden="true"
              />
              <span>State Transition (Old vs New Values)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Previous State (old)
                </span>
                <pre className="overflow-x-auto text-[11px] font-mono text-foreground whitespace-pre-wrap break-words">
                  {oldVal !== undefined
                    ? JSON.stringify(oldVal, null, 2)
                    : "—"}
                </pre>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Updated State (new)
                </span>
                <pre className="overflow-x-auto text-[11px] font-mono text-foreground whitespace-pre-wrap break-words">
                  {newVal !== undefined
                    ? JSON.stringify(newVal, null, 2)
                    : "—"}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Full Metadata Payload */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Code2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>Full Details Payload (metadata)</span>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3.5">
            <pre className="overflow-x-auto text-[11px] font-mono text-foreground whitespace-pre-wrap break-words">
              {Object.keys(metadata).length > 0
                ? JSON.stringify(metadata, null, 2)
                : "No extra metadata fields attached."}
            </pre>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

