"use client";

import * as React from "react";
import {
  CheckCircle2,
  Copy,
  Edit,
  Archive,
  Layers,
  ChevronDown,
  ChevronUp,
  Loader2,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  activateRubric,
  duplicateRubric,
  archiveRubric,
} from "@/app/actions/manage-rubric";
import type { RubricDocument } from "@/types/firestore";

interface RubricCardProps {
  rubric: RubricDocument;
  onEdit: (rubric: RubricDocument) => void;
  onActionComplete?: () => void;
}

const CATEGORY_CHIPS: Record<string, { label: string; className: string }> = {
  oral_defense: {
    label: "Oral Defense",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  system_demo: {
    label: "System Demo",
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
  technical_architecture: {
    label: "Architecture",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

export function RubricCard({ rubric, onEdit, onActionComplete }: RubricCardProps) {
  const { user } = useAuth();
  const [expanded, setExpanded] = React.useState(false);
  const [activating, setActivating] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);

  const handleActivate = async () => {
    if (!user) return;
    try {
      setActivating(true);
      const token = await user.getIdToken();
      const res = await activateRubric(token, { rubric_id: rubric.id });

      if (!res.ok) {
        toast.error(res.error || "Failed to activate rubric.");
        return;
      }

      toast.success(`'${rubric.title}' is now the active defense rubric.`);
      onActionComplete?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Activation failed.";
      toast.error(msg);
    } finally {
      setActivating(false);
    }
  };

  const handleDuplicate = async () => {
    if (!user) return;
    try {
      setActionLoading(true);
      const token = await user.getIdToken();
      const res = await duplicateRubric(token, { rubric_id: rubric.id });

      if (!res.ok) {
        toast.error(res.error || "Failed to duplicate rubric.");
        return;
      }

      toast.success(`Rubric duplicated as '${rubric.title} (Copy)'.`);
      onActionComplete?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Duplication failed.";
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!user) return;
    try {
      setActionLoading(true);
      const token = await user.getIdToken();
      const res = await archiveRubric(token, { rubric_id: rubric.id });

      if (!res.ok) {
        if (res.code === "RUBRIC_IN_USE") {
          toast.error("Cannot archive: existing defense evaluations reference this rubric.");
        } else {
          toast.error(res.error || "Failed to archive rubric.");
        }
        return;
      }

      toast.success(`Rubric '${rubric.title}' archived.`);
      onActionComplete?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Archive failed.";
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div
      className={`rounded-xl border bg-card p-5 transition-shadow shadow-xs hover:shadow-sm ${
        rubric.is_active
          ? "border-primary/40 ring-1 ring-primary/20 bg-primary/[0.01]"
          : "border-border"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-base font-bold text-foreground tracking-tight">
              {rubric.title}
            </h3>
            {rubric.is_active ? (
              <Badge
                variant="outline"
                className="bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold gap-1 px-2 py-0.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                <span>Active Rubric</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-xs">
                Inactive
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap pt-1">
            <div className="flex items-center gap-1 font-medium">
              <Scale className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>Weight:</span>
              <span className="text-foreground">
                Supervisor {rubric.supervisor_weight_pct}% / Panel {rubric.panel_weight_pct}%
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="tabular-nums font-semibold text-foreground">
                {rubric.criteria.length}
              </span>
              <span>criteria</span>
              <span className="text-border">|</span>
              <span className="tabular-nums font-semibold text-foreground">
                {rubric.max_score}
              </span>
              <span>max pts</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          {!rubric.is_active ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleActivate}
              disabled={activating || actionLoading}
              className="gap-1.5 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary font-medium"
            >
              {activating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>Activate</span>
            </Button>
          ) : (
            <Badge
              variant="secondary"
              className="bg-primary/10 text-primary border-primary/20 text-xs px-2.5 py-1"
            >
              Current Active
            </Badge>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(rubric)}
            disabled={actionLoading || activating}
            className="gap-1 text-muted-foreground hover:text-foreground"
          >
            <Edit className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Edit</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={actionLoading || activating}
                className="text-muted-foreground"
              >
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDuplicate} className="gap-2 text-xs">
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Duplicate Rubric</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleArchive}
                className="gap-2 text-xs text-destructive focus:text-destructive"
              >
                <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Archive Rubric</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Criteria Breakdown & Toggle */}
      <div className="mt-4 pt-3 border-t border-border/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            {rubric.criteria.map((c) => {
              const chip = CATEGORY_CHIPS[c.category] || {
                label: c.category,
                className: "bg-muted text-muted-foreground border-border",
              };
              return (
                <Badge
                  key={c.id}
                  variant="outline"
                  className={`text-xs px-2 py-0.5 ${chip.className}`}
                >
                  {chip.label}: <strong className="ml-1 tabular-nums">{c.max_points} pts</strong>
                </Badge>
              );
            })}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground hover:text-foreground gap-1 h-7 px-2"
          >
            <span>{expanded ? "Hide details" : "View criteria"}</span>
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </Button>
        </div>

        {/* Collapsible Details */}
        {expanded && (
          <div className="mt-3 space-y-2 pt-2 border-t border-border/40">
            {rubric.criteria.map((c, i) => (
              <div
                key={c.id}
                className="p-3 rounded-lg bg-muted/40 border border-border/40 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {i + 1}. {c.title}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      ({c.id})
                    </span>
                  </div>
                  {c.description && (
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      {c.description}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right font-medium text-foreground tabular-nums">
                  {c.max_points} / {rubric.max_score} pts
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
