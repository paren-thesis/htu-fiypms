import * as React from "react";
import { cn } from "cn";
import { Lock } from "lucide-react";

export interface LockedCardProps {
  title?: string;
  message?: string;
  icon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function LockedCard({
  title = "Restricted Access",
  message = "Unlocks when your topic is approved",
  icon,
  className,
  children,
}: LockedCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center",
        className
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
        {icon ?? <Lock className="h-5 w-5" aria-hidden="true" />}
      </div>
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <p className="mt-1 text-xs text-muted-foreground max-w-xs">{message}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
