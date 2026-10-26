"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "cn";

const ROUTE_NAME_MAP: Record<string, string> = {
  "my-team": "My Team",
  proposals: "Proposals",
  supervision: "Supervision",
  chapters: "Chapters",
  defense: "Defense",
  rubrics: "Rubrics",
  reports: "Reports",
  students: "Students & Pool",
  "peer-evaluation": "Peer Evaluation",
  deliverables: "Deliverables",
  grades: "Grades",
  archive: "Archive",
  notifications: "Notifications",
  "audit-logs": "Audit Logs",
  admin: "Admin",
  "staff-whitelist": "Staff Whitelist",
  users: "Users & Roles",
  login: "Sign In",
  "not-registered": "Registration Required",
  "complete-profile": "Complete Profile",
};

export function BreadcrumbNav() {
  const pathname = usePathname();

  const segments = React.useMemo(() => {
    if (!pathname || pathname === "/") return [];
    return pathname.split("/").filter(Boolean);
  }, [pathname]);

  if (segments.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Home className="h-3.5 w-3.5 text-foreground" aria-hidden="true" />
        <span className="font-semibold text-foreground">Dashboard</span>
      </div>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs">
      <Link
        href="/"
        className="flex items-center text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Dashboard"
      >
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>

      {segments.map((segment, index) => {
        const href = `/${segments.slice(0, index + 1).join("/")}`;
        const isLast = index === segments.length - 1;
        const displayName =
          ROUTE_NAME_MAP[segment] ??
          (segment.startsWith("[") && segment.endsWith("]")
            ? segment
            : segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " "));

        return (
          <React.Fragment key={href}>
            <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" aria-hidden="true" />
            {isLast ? (
              <span
                className="font-semibold text-foreground truncate max-w-[150px] sm:max-w-none"
                aria-current="page"
              >
                {displayName}
              </span>
            ) : (
              <Link
                href={href}
                className={cn(
                  "text-muted-foreground transition-colors hover:text-foreground truncate max-w-[120px] sm:max-w-none"
                )}
              >
                {displayName}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
