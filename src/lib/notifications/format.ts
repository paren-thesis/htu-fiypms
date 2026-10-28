export type DateGroupKey = "Today" | "Yesterday" | "This Week" | "Older";

export function toJsDate(val: unknown): Date {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (typeof (val as { toDate?: () => Date }).toDate === "function") {
    try {
      return (val as { toDate: () => Date }).toDate();
    } catch {
      return new Date();
    }
  }
  if (typeof val === "object" && val !== null && "seconds" in val) {
    return new Date((val as { seconds: number }).seconds * 1000);
  }
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

export function getDateGroup(date: Date, now = new Date()): DateGroupKey {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const startOfThisWeek = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);

  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";
  if (date >= startOfThisWeek) return "This Week";
  return "Older";
}

export function formatRelativeTime(val: unknown, now = new Date()): string {
  const date = toJsDate(val);
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);

  if (diffSecs < 60) return "Just now";
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}
