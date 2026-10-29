"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "cn";
import { useAuth } from "@/context/AuthContext";
import { getNavItemsForRole, isNavItemActive } from "@/config/nav";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function MobileNavDrawer() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab");
  const { activeRole } = useAuth();
  const navItems = getNavItemsForRole(activeRole);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 flex flex-col bg-card">
        <SheetHeader className="h-14 border-b border-border px-4 pr-12 flex flex-row items-center gap-2.5 space-y-0 text-left">
          <Image
            src="/logo-with-text.svg"
            alt="Ho Technical University"
            width={116}
            height={34}
            className="h-8 w-auto max-w-[116px] shrink-0 object-contain"
          />
          <div className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
          <div className="min-w-0">
            <SheetTitle className="text-xs font-bold tracking-tight text-foreground truncate leading-tight">
              FYPMS
            </SheetTitle>
            <p className="text-[10px] text-muted-foreground truncate leading-tight">
              Computer Science
            </p>
          </div>
        </SheetHeader>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = isNavItemActive(item, pathname, currentTab);

            return (
              <Link
                key={`${item.title}-${item.href}`}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors",
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
                <span className="truncate">{item.title}</span>
                {item.badge !== undefined && (
                  <span
                    className={cn(
                      "ml-auto inline-flex items-center justify-center rounded-full px-1.5 py-0.2 text-[10px] font-semibold tabular",
                      isActive
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-success shrink-0" aria-hidden="true" />
            <span className="text-xs font-medium capitalize">
              {activeRole.replace("_", " ")} workspace
            </span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
