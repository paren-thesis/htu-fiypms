import { Skeleton } from "@/components/ui/skeleton";

export default function NotRegisteredLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center space-y-2">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <Skeleton className="h-10 w-10 rounded-full mx-auto" />
          <Skeleton className="h-5 w-48 mx-auto" />
          <Skeleton className="h-4 w-72 mx-auto" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}
