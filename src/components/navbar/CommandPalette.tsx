"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ALL_ROUTES_LIST, getNavItemsForRole } from "@/config/nav";
import { useAuth } from "@/context/AuthContext";

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const { activeRole } = useAuth();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const activeRoleNav = getNavItemsForRole(activeRole);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 w-full max-w-[200px] justify-between border-border bg-card px-2.5 text-xs text-muted-foreground shadow-none hover:bg-muted md:w-56"
        aria-label="Open command palette"
      >
        <span className="flex items-center gap-2">
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Search navigation...</span>
          <span className="sm:hidden">Search...</span>
        </span>
        <kbd className="pointer-events-none hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or route..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading={`Current Workspace (${activeRole})`}>
            {activeRoleNav.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={`role-${item.title}-${item.href}`}
                  value={`${item.title} ${item.href}`}
                  onSelect={() => handleSelect(item.href)}
                  className="flex items-center gap-2.5 py-2 cursor-pointer"
                >
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  <span className="font-medium text-foreground">{item.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{item.href}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="All System Pages">
            {ALL_ROUTES_LIST.map((item) => (
              <CommandItem
                key={`all-${item.title}-${item.href}`}
                value={`${item.title} ${item.href} ${item.category ?? ""}`}
                onSelect={() => handleSelect(item.href)}
                className="flex items-center justify-between py-2 cursor-pointer"
              >
                <span>{item.title}</span>
                <span className="text-xs text-muted-foreground">{item.href}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
