"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { cn } from "cn";
import { useDevSession } from "@/context/DevSession";
import { getNavItemsForRole } from "@/config/nav";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function AppSidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const { activeRole } = useDevSession();
  const navItems = getNavItemsForRole(activeRole);

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r border-border bg-card transition-all duration-200 select-none",
        "w-16 lg:w-64",
        className
      )}
      aria-label="Sidebar Navigation"
    >
      {/* Brand Header */}
      <div className="flex h-14 items-center border-b border-border px-3 lg:px-5">
        <Link
          href="/"
          className="flex items-center gap-2.5 overflow-hidden font-semibold text-foreground"
          aria-label="HTU FYPMS Home"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <GraduationCap className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="hidden lg:flex flex-col overflow-hidden">
            <span className="text-sm font-bold tracking-tight text-foreground truncate">
              HTU · FYPMS
            </span>
            <span className="text-[10px] text-muted-foreground truncate leading-none">
              Computer Science
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto p-2 lg:p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Tooltip key={item.href} delayDuration={0}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors",
                    "justify-center lg:justify-start",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive ? "text-primary-foreground" : "text-muted-foreground"
                    )}
                    aria-hidden="true"
                  />
                  <span className="hidden lg:inline truncate">{item.title}</span>
                  {item.badge !== undefined && (
                    <span
                      className={cn(
                        "ml-auto hidden lg:inline-flex items-center justify-center rounded-full px-1.5 py-0.2 text-[10px] font-semibold tabular",
                        isActive
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="lg:hidden text-xs font-medium"
              >
                {item.title}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      {/* Role Footer Badge */}
      <div className="border-t border-border p-2 lg:p-3">
        <div className="flex items-center gap-2 rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground justify-center lg:justify-start">
          <div className="h-2 w-2 rounded-full bg-success shrink-0" aria-hidden="true" />
          <span className="hidden lg:inline text-[11px] font-medium truncate capitalize">
            {activeRole.replace("_", " ")} workspace
          </span>
        </div>
      </div>
    </aside>
  );
}
