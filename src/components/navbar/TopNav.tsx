"use client";

import * as React from "react";
import { BreadcrumbNav } from "./BreadcrumbNav";
import { CommandPalette } from "./CommandPalette";
import { RoleSwitcherDropdown } from "./RoleSwitcherDropdown";
import { AvatarMenu } from "./AvatarMenu";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { NotificationBell } from "./NotificationBell";

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

        <NotificationBell />

        <div className="h-4 w-px bg-border" aria-hidden="true" />

        <RoleSwitcherDropdown />

        <AvatarMenu />
      </div>
    </header>
  );
}
