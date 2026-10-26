"use client";

import * as React from "react";
import Link from "next/link";
import { LogOut, User, Bell } from "lucide-react";
import { useDevSession } from "@/context/DevSession";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function AvatarMenu() {
  const { user, activeRole } = useDevSession();

  const initials = React.useMemo(() => {
    if (!user.name) return "U";
    const parts = user.name.trim().split(/\s+/);
    const first = parts[0]?.charAt(0);
    const second = parts[1]?.charAt(0);
    if (first && second) {
      return `${first}${second}`.toUpperCase();
    }
    return user.name.slice(0, 2).toUpperCase();
  }, [user.name]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 rounded-full ring-offset-background transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="User account menu"
        >
          <Avatar className="h-8 w-8 border border-border">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-1">
        <DropdownMenuLabel className="font-normal px-2 py-2">
          <div className="flex flex-col space-y-1">
            <p className="text-xs font-semibold leading-none text-foreground">{user.name}</p>
            <p className="text-[11px] leading-none text-muted-foreground truncate">{user.email}</p>
            <div className="pt-1">
              <span className="inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary capitalize">
                {activeRole.replace("_", " ")}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="text-xs cursor-pointer">
          <Link href="/notifications" className="flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span>Notifications</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="text-xs cursor-pointer">
          <Link href="/complete-profile" className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span>Profile Settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="text-xs text-danger cursor-pointer">
          <Link href="/login" className="flex items-center gap-2">
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Sign Out</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
