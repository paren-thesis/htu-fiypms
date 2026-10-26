"use client";

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { BreadcrumbNav } from "./BreadcrumbNav";
import { CommandPalette } from "./CommandPalette";
import { RoleSwitcherDropdown } from "./RoleSwitcherDropdown";
import { AvatarMenu } from "./AvatarMenu";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { Button } from "@/components/ui/button";

export function TopNav() {
  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-border bg-card/95 px-3 sm:px-6 backdrop-blur supports-backdrop-filter:bg-card/75">
      {/* Left side: Mobile drawer trigger + Breadcrumbs */}
      <div className="flex items-center gap-3">
        <MobileNavDrawer />
        <div className="hidden sm:block">
          <BreadcrumbNav />
        </div>
      </div>

      {/* Right side: Command palette + Notifications + Role switcher + Avatar */}
      <div className="flex items-center gap-2 sm:gap-3">
        <CommandPalette />

        {/* Notifications Bell with static badge 0 */}
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Link href="/notifications" aria-label="Notifications (0 unread)">
            <Bell className="h-4 w-4" aria-hidden="true" />
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground tabular">
              0
            </span>
          </Link>
        </Button>

        <div className="h-4 w-px bg-border" aria-hidden="true" />

        <RoleSwitcherDropdown />

        <AvatarMenu />
      </div>
    </header>
  );
}
