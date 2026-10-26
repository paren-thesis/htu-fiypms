import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* PageHeader Skeleton */}
      <div className="flex flex-col gap-4 pb-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Bento Grid Skeletons */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
        <div className="md:col-span-6 rounded-xl border border-border bg-card p-6 shadow-sm">
          <Skeleton className="h-5 w-40 mb-2" />
          <Skeleton className="h-3 w-64 mb-6" />
          <Skeleton className="h-10 w-full" />
        </div>

        <div className="md:col-span-2 rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-full" />
        </div>

        <div className="md:col-span-2 rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-full" />
        </div>

        <div className="md:col-span-2 rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-full" />
        </div>

        <div className="md:col-span-3 rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-16 w-full" />
        </div>

        <div className="md:col-span-3 rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}
