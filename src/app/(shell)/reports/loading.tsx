import { Skeleton } from "@/components/ui/skeleton";

export default function ReportsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 pb-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="rounded-xl border border-dashed border-border p-12 flex flex-col items-center justify-center space-y-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-9 w-36 mt-2" />
      </div>
    </div>
  );
}
