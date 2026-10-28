"use client";

import * as React from "react";
import {
  Archive,
  Search,
  ExternalLink,
  FileText,
  Code2,
  X,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Tag,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  searchArchivedProjects,
  archiveProjects,
  type SerializedArchivedProject,
} from "@/app/actions/archive-projects";
import { tokenizeSearchQuery } from "@/lib/archive/tokens";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const DEFAULT_COURSES = [
  { id: "btech-cs", code: "BTECH-CS", name: "BTech Computer Science" },
  { id: "btech-ict", code: "BTECH-ICT", name: "BTech ICT" },
  { id: "hnd-cs", code: "HND-CS", name: "HND Computer Science" },
  { id: "hnd-ict", code: "HND-ICT", name: "HND ICT" },
];

const PAGE_SIZE = 9;

function formatExcerpt(text: string, maxLength = 240): string {
  if (!text) return "No abstract provided for this project.";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

export default function ArchivePage() {
  const { user, activeRole, loading: authLoading } = useAuth();

  const [searchInput, setSearchInput] = React.useState("");
  const [appliedQuery, setAppliedQuery] = React.useState("");
  const [selectedCourse, setSelectedCourse] = React.useState<string>("all");
  const [selectedYear, setSelectedYear] = React.useState<string>("all");
  const [reloadNonce, setReloadNonce] = React.useState(0);

  const [items, setItems] = React.useState<SerializedArchivedProject[]>([]);
  const [courses, setCourses] =
    React.useState<Array<{ id: string; code: string; name: string }>>(DEFAULT_COURSES);
  const [academicYears, setAcademicYears] = React.useState<
    Array<{ id: string; code: string }>
  >([]);

  const [cursorStack, setCursorStack] = React.useState<Array<string | undefined>>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isBackfilling, setIsBackfilling] = React.useState(false);

  const isCoordinatorOrAdmin =
    activeRole === "coordinator" || activeRole === "admin";

  const activeTokens = React.useMemo(
    () => tokenizeSearchQuery(appliedQuery, 10),
    [appliedQuery]
  );

  const currentCursor = cursorStack[pageIndex];

  React.useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    async function load() {
      try {
        if (!user) {
          if (!cancelled) {
            setItems([]);
            setLoading(false);
          }
          return;
        }

        const token = await user.getIdToken();
        if (cancelled) return;

        const res = await searchArchivedProjects(token, {
          query: appliedQuery.trim() || undefined,
          course_id: selectedCourse !== "all" ? selectedCourse : undefined,
          academic_year_id: selectedYear !== "all" ? selectedYear : undefined,
          cursor: currentCursor,
          limit: PAGE_SIZE,
        });

        if (cancelled) return;

        if (!res.ok) {
          setError(res.error || "Unable to load archived projects.");
          setLoading(false);
          return;
        }

        setError(null);
        setItems(res.items ?? []);
        setNextCursor(res.nextCursor ?? null);

        if (res.courses && res.courses.length > 0) {
          setCourses(res.courses);
        }
        if (res.academicYears && res.academicYears.length > 0) {
          setAcademicYears(res.academicYears);
        }
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "An unexpected error occurred while searching the archive."
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
    appliedQuery,
    selectedCourse,
    selectedYear,
    currentCursor,
    reloadNonce,
  ]);

  const triggerReload = () => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setCursorStack([undefined]);
    setPageIndex(0);
    setAppliedQuery(searchInput.trim());
    setReloadNonce((n) => n + 1);
  };

  const handleKeywordClick = (keyword: string) => {
    setLoading(true);
    setError(null);
    setSearchInput(keyword);
    setCursorStack([undefined]);
    setPageIndex(0);
    setAppliedQuery(keyword);
    setReloadNonce((n) => n + 1);
  };

  const handleResetFilters = () => {
    setLoading(true);
    setError(null);
    setSearchInput("");
    setAppliedQuery("");
    setSelectedCourse("all");
    setSelectedYear("all");
    setCursorStack([undefined]);
    setPageIndex(0);
    setReloadNonce((n) => n + 1);
  };

  const handleCourseChange = (value: string) => {
    setLoading(true);
    setError(null);
    setSelectedCourse(value);
    setCursorStack([undefined]);
    setPageIndex(0);
  };

  const handleYearChange = (value: string) => {
    setLoading(true);
    setError(null);
    setSelectedYear(value);
    setCursorStack([undefined]);
    setPageIndex(0);
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

  const handleBackfillArchive = async () => {
    if (!isCoordinatorOrAdmin || isBackfilling) return;
    const targetYear =
      selectedYear !== "all"
        ? selectedYear
        : academicYears[0]?.id || "2025-2026";

    setIsBackfilling(true);
    try {
      if (!user) {
        toast.error("Authentication required.");
        return;
      }
      const token = await user.getIdToken();

      const res = await archiveProjects(token, {
        academic_year_id: targetYear,
      });

      if (!res.ok) {
        toast.error(res.error || "Failed to backfill archived projects.");
        return;
      }

      toast.success(
        `Synced ${res.archived_count ?? 0} completed project(s) for ${targetYear}.`
      );
      triggerReload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to sync project archive."
      );
    } finally {
      setIsBackfilling(false);
    }
  };

  const hasActiveFilters =
    appliedQuery.length > 0 ||
    selectedCourse !== "all" ||
    selectedYear !== "all";

  const courseNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of courses) {
      map.set(c.id, c.code || c.name);
    }
    return map;
  }, [courses]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Archive"
        description="Search past final year project abstracts, GitHub repositories, manuscripts, and domain keywords."
        action={
          isCoordinatorOrAdmin ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBackfillArchive}
              disabled={isBackfilling || loading}
              className="gap-2 min-h-[44px] px-3.5"
            >
              <RefreshCw
                className={`h-4 w-4 ${isBackfilling ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span>
                {isBackfilling ? "Syncing Archive..." : "Sync Completed Teams"}
              </span>
            </Button>
          ) : undefined
        }
      />

      {/* Search & Filter Toolbar */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-4">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-col gap-3 lg:flex-row lg:items-center"
        >
          {/* Search Input */}
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by keyword, topic, or tech stack (e.g. firebase, iot, next.js)..."
              aria-label="Search archived projects"
              className="pl-10 pr-10 min-h-[44px] rounded-lg"
            />
            {searchInput.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  if (appliedQuery) {
                    setLoading(true);
                    setError(null);
                    setAppliedQuery("");
                    setCursorStack([undefined]);
                    setPageIndex(0);
                  }
                }}
                aria-label="Clear search query"
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Filters & Submit */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex-1 sm:flex-initial min-w-[160px]">
              <label htmlFor="archive-course-filter" className="sr-only">
                Filter by Programme
              </label>
              <select
                id="archive-course-filter"
                value={selectedCourse}
                onChange={(e) => handleCourseChange(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All Programmes</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} — {course.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 sm:flex-initial min-w-[150px]">
              <label htmlFor="archive-year-filter" className="sr-only">
                Filter by Academic Year
              </label>
              <select
                id="archive-year-filter"
                value={selectedYear}
                onChange={(e) => handleYearChange(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All Academic Years</option>
                {academicYears.map((yr) => (
                  <option key={yr.id} value={yr.id}>
                    {yr.code}
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="min-h-[44px] px-5 gap-2 rounded-lg"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              <span>Search</span>
            </Button>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleResetFilters}
                className="min-h-[44px] px-3 text-xs text-muted-foreground hover:text-foreground"
              >
                Reset
              </Button>
            )}
          </div>
        </form>

        {/* Active Search Tokens Indicator */}
        {activeTokens.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs"
            aria-live="polite"
          >
            <span className="font-medium text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>Matching tokens ({activeTokens.length}/10):</span>
            </span>
            {activeTokens.map((tok) => (
              <Badge
                key={tok}
                variant="secondary"
                className="font-mono text-[11px] px-2 py-0.5"
              >
                {tok}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to Load Project Archive</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <span>{error}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={triggerReload}
              className="min-h-[44px] self-start sm:self-center"
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Loading Skeleton Grid */}
      {loading ? (
        <div
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          aria-busy="true"
          aria-label="Loading archived projects"
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-xs space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-5 w-24 rounded-md" />
                  <Skeleton className="h-5 w-20 rounded-md" />
                </div>
                <Skeleton className="h-6 w-5/6" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap gap-1.5">
                  <Skeleton className="h-6 w-16 rounded-md" />
                  <Skeleton className="h-6 w-20 rounded-md" />
                  <Skeleton className="h-6 w-14 rounded-md" />
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Skeleton className="h-9 w-28 rounded-lg" />
                  <Skeleton className="h-9 w-28 rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon={<Search className="h-6 w-6 text-primary" aria-hidden="true" />}
            title="No Matching Archived Projects"
            description="No completed capstone projects matched your search keywords or programme/year filters. Try broader terms or reset your filters."
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="min-h-[44px] px-4 gap-1.5"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                <span>Reset Search & Filters</span>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Archive className="h-6 w-6 text-primary" aria-hidden="true" />}
            title="Project Archive Repository"
            description="Completed final year projects automatically transition into this searchable repository when official cohort grades are published."
            action={
              isCoordinatorOrAdmin ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleBackfillArchive}
                  disabled={isBackfilling}
                  className="min-h-[44px] px-4 gap-1.5"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${isBackfilling ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  <span>Sync Completed Teams</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={triggerReload}
                  className="min-h-[44px] px-4 gap-1.5"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  <span>Refresh Archive</span>
                </Button>
              )
            }
          />
        )
      ) : (
        <div className="space-y-6">
          {/* Result Cards Grid */}
          <div
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
            aria-live="polite"
          >
            {items.map((project) => {
              const programmeLabel =
                courseNameMap.get(project.course_id) ||
                project.course_id.toUpperCase();

              return (
                <article
                  key={project.id}
                  className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-xs transition-colors hover:border-primary/40"
                >
                  <div className="space-y-3">
                    {/* Metadata Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                          {programmeLabel}
                        </span>
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono font-medium text-muted-foreground tabular-nums">
                          {project.group_number}
                        </span>
                      </div>
                      <span className="font-medium text-muted-foreground tabular-nums">
                        {project.academic_year_id}
                      </span>
                    </div>

                    {/* Title */}
                    <h2 className="text-base font-semibold leading-snug text-foreground">
                      {project.title}
                    </h2>

                    {/* Abstract Excerpt */}
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {formatExcerpt(project.abstract, 240)}
                    </p>
                  </div>

                  <div className="mt-4 space-y-3 pt-3 border-t border-border/60">
                    {/* Keyword Chips */}
                    {project.keywords && project.keywords.length > 0 && (
                      <div
                        className="flex flex-wrap items-center gap-1.5"
                        aria-label="Project keywords"
                      >
                        <Tag
                          className="h-3.5 w-3.5 text-muted-foreground shrink-0 mr-0.5"
                          aria-hidden="true"
                        />
                        {project.keywords.slice(0, 8).map((kw) => (
                          <button
                            key={kw}
                            type="button"
                            onClick={() => handleKeywordClick(kw)}
                            title={`Search archive for "${kw}"`}
                            className="inline-flex items-center rounded-md border border-border bg-muted/50 px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {kw}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Repository & Manuscript Links */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {project.github_repository_url ? (
                        <a
                          href={project.github_repository_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-muted min-h-[44px]"
                        >
                          <Code2
                            className="h-3.5 w-3.5 text-primary"
                            aria-hidden="true"
                          />
                          <span>GitHub Repo</span>
                          <ExternalLink
                            className="h-3 w-3 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground min-h-[44px]">
                          <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>No Repo Link</span>
                        </span>
                      )}

                      {project.manuscript_url ? (
                        <a
                          href={project.manuscript_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-muted min-h-[44px]"
                        >
                          <FileText
                            className="h-3.5 w-3.5 text-primary"
                            aria-hidden="true"
                          />
                          <span>Manuscript</span>
                          <ExternalLink
                            className="h-3 w-3 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground min-h-[44px]">
                          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>No Manuscript</span>
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Cursor Pagination Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
            <div className="text-xs text-muted-foreground tabular-nums">
              Page <strong className="text-foreground">{pageIndex + 1}</strong> ·{" "}
              Showing <strong className="text-foreground">{items.length}</strong>{" "}
              archived project{items.length === 1 ? "" : "s"}
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
    </div>
  );
}
