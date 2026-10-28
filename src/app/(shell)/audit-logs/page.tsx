"use client";

import * as React from "react";
import {
  ScrollText,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  queryAuditLogs,
  type SerializedAuditLog,
} from "@/app/actions/admin-users";
import { AuditLogDetailSheet } from "@/components/admin/AuditLogDetailSheet";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { LockedCard } from "@/components/common/LockedCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 15;

export default function AuditLogsPage() {
  const { user, activeRole, availableRoles, loading: authLoading } = useAuth();

  const [actionFilter, setActionFilter] = React.useState<string>("all");
  const [actorInput, setActorInput] = React.useState<string>("");
  const [targetInput, setTargetInput] = React.useState<string>("");
  const [startDate, setStartDate] = React.useState<string>("");
  const [endDate, setEndDate] = React.useState<string>("");

  const [appliedFilters, setAppliedFilters] = React.useState({
    action: "all",
    actor: "",
    target: "",
    startDate: "",
    endDate: "",
  });

  const [cursorStack, setCursorStack] = React.useState<Array<string | undefined>>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = React.useState(0);

  const [logs, setLogs] = React.useState<SerializedAuditLog[]>([]);
  const [availableActions, setAvailableActions] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedLog, setSelectedLog] =
    React.useState<SerializedAuditLog | null>(null);

  const isCoordinatorOrAdmin =
    activeRole === "coordinator" ||
    activeRole === "admin" ||
    (availableRoles || []).includes("coordinator") ||
    (availableRoles || []).includes("admin");

  const currentCursor = cursorStack[pageIndex];

  React.useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    async function load() {
      try {
        if (!user || !isCoordinatorOrAdmin) {
          if (!cancelled) {
            setLogs([]);
            setLoading(false);
          }
          return;
        }

        const token = await user.getIdToken();
        if (cancelled) return;

        const res = await queryAuditLogs(token, {
          action:
            appliedFilters.action !== "all"
              ? appliedFilters.action
              : undefined,
          actor: appliedFilters.actor.trim() || undefined,
          target: appliedFilters.target.trim() || undefined,
          startDate: appliedFilters.startDate || undefined,
          endDate: appliedFilters.endDate || undefined,
          cursor: currentCursor,
          limit: PAGE_SIZE,
        });

        if (cancelled) return;

        if (!res.ok) {
          setError(res.error || "Unable to fetch security audit logs.");
          setLoading(false);
          return;
        }

        setError(null);
        setLogs(res.items ?? []);
        setNextCursor(res.nextCursor ?? null);
        if (res.availableActions && res.availableActions.length > 0) {
          setAvailableActions(res.availableActions);
        }
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unexpected error while loading audit logs."
          );
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    user,
    isCoordinatorOrAdmin,
    appliedFilters,
    currentCursor,
    reloadNonce,
  ]);

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setCursorStack([undefined]);
    setPageIndex(0);
    setAppliedFilters({
      action: actionFilter,
      actor: actorInput,
      target: targetInput,
      startDate,
      endDate,
    });
    setReloadNonce((n) => n + 1);
  };

  const handleResetFilters = () => {
    setLoading(true);
    setError(null);
    setActionFilter("all");
    setActorInput("");
    setTargetInput("");
    setStartDate("");
    setEndDate("");
    setCursorStack([undefined]);
    setPageIndex(0);
    setAppliedFilters({
      action: "all",
      actor: "",
      target: "",
      startDate: "",
      endDate: "",
    });
    setReloadNonce((n) => n + 1);
  };

  const handleNextPage = () => {
    if (!nextCursor) return;
    setLoading(true);
    setError(null);
    const nextIdx = pageIndex + 1;
    setCursorStack((prev) => {
      const copy = prev.slice(0, nextIdx);
      copy[nextIdx] = nextCursor;
      return copy;
    });
    setPageIndex(nextIdx);
  };

  const handlePrevPage = () => {
    if (pageIndex <= 0) return;
    setLoading(true);
    setError(null);
    setPageIndex((prev) => prev - 1);
  };

  const triggerReload = () => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  };

  if (!authLoading && !isCoordinatorOrAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Security Audit Logs"
          description="Immutable system audit trail tracking administrative actions, role claims, and score modifications."
        />
        <LockedCard
          title="Coordinator & Admin Access Only"
          message="Only Departmental Coordinators and System Administrators are authorized to inspect the system audit trail."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security Audit Logs"
        description="Immutable system audit trail tracking administrative actions, role claims, and score modifications."
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={triggerReload}
            disabled={loading}
            className="gap-1.5 min-h-[44px] px-3.5"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>Refresh Logs</span>
          </Button>
        }
      />

      {/* Filter Bar */}
      <form
        onSubmit={handleApplyFilters}
        className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Action Filter */}
          <div className="space-y-1">
            <Label htmlFor="audit-action-filter" className="text-xs">
              Action Type
            </Label>
            <select
              id="audit-action-filter"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="all">All Actions</option>
              {availableActions.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>

          {/* Actor Filter */}
          <div className="space-y-1">
            <Label htmlFor="audit-actor-filter" className="text-xs">
              Actor (Name / Email / UID)
            </Label>
            <Input
              id="audit-actor-filter"
              value={actorInput}
              onChange={(e) => setActorInput(e.target.value)}
              placeholder="e.g. coordinator@htu.edu.gh"
              className="min-h-[44px]"
            />
          </div>

          {/* Target Filter */}
          <div className="space-y-1">
            <Label htmlFor="audit-target-filter" className="text-xs">
              Target (Type / ID)
            </Label>
            <Input
              id="audit-target-filter"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder="e.g. team or BCS26_01"
              className="min-h-[44px]"
            />
          </div>

          {/* Start Date */}
          <div className="space-y-1">
            <Label htmlFor="audit-start-date" className="text-xs">
              From Date
            </Label>
            <Input
              id="audit-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="min-h-[44px] tabular-nums"
            />
          </div>

          {/* End Date */}
          <div className="space-y-1">
            <Label htmlFor="audit-end-date" className="text-xs">
              To Date
            </Label>
            <Input
              id="audit-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="min-h-[44px] tabular-nums"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetFilters}
            className="gap-1.5 min-h-[44px] px-3 text-xs text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset Filters</span>
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={loading}
            className="gap-1.5 min-h-[44px] px-4"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Apply Filters</span>
          </Button>
        </div>
      </form>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to Load Audit Logs</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 space-y-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <Skeleton key={n} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-6 w-6 text-primary" aria-hidden="true" />}
          title="No Audit Records Found"
          description="No audit trail entries matched your filter criteria."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="min-h-[44px] px-4"
            >
              Reset Filters
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium text-foreground">
                          {log.actor_name}
                        </div>
                        <div className="text-muted-foreground font-mono">
                          {log.actor_role}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-foreground">
                        {log.target_type}:{log.target_id}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                        {log.description}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="gap-1.5 text-xs min-h-[44px] sm:min-h-[36px]"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Inspect</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Cursor Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
            <div className="text-xs text-muted-foreground tabular-nums">
              Page <strong className="text-foreground">{pageIndex + 1}</strong> ·{" "}
              Showing <strong className="text-foreground">{logs.length}</strong>{" "}
              audit record{logs.length === 1 ? "" : "s"}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePrevPage}
                disabled={pageIndex === 0 || loading}
                className="gap-1.5 min-h-[44px] px-3.5"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span>Previous</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={!nextCursor || loading}
                className="gap-1.5 min-h-[44px] px-3.5"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <AuditLogDetailSheet
        log={selectedLog}
        open={Boolean(selectedLog)}
        onOpenChange={(open) => !open && setSelectedLog(null)}
      />
    </div>
  );
}
