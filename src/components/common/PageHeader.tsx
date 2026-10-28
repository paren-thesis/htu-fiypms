import * as React from "react";
import { cn } from "cn";

export interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  action,
  badge,
  className,
  children,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 pb-6 md:flex-row md:items-center md:justify-between",
        className
      )}
    >
      <div className="space-y-1.5 min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground max-w-2xl">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex flex-wrap shrink-0 items-center gap-2.5">{action}</div>}
      {children}
    </div>
  );
}
