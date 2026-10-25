import * as React from "react";
import { cn } from "cn";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Clock,
  Flag,
  XCircle,
} from "lucide-react";
import {
  getStatusConfig,
  type BadgeTone,
  type ConflictStatus,
  type StatusConfig,
  type StatusDomain,
  type StatusDomainMap,
} from "./status";

export type StatusBadgeProps<D extends StatusDomain = StatusDomain> = {
  domain: D;
  value: StatusDomainMap[D];
  className?: string;
};

const toneStyles: Record<BadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-info-soft text-info border-info/30",
  success: "bg-success-soft text-success border-success/30",
  warning: "bg-warning-soft text-warning border-warning/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  primary: "bg-accent text-accent-foreground border-primary/30",
};

function StatusIcon({ iconType }: { iconType: StatusConfig["iconType"] }) {
  switch (iconType) {
    case "clock":
      return <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case "check":
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case "alert":
      return <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case "x":
      return <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case "pulse":
      return (
        <span className="relative flex h-2 w-2 shrink-0 items-center justify-center mr-0.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      );
    case "flag":
      return <Flag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case "circle":
    default:
      return <CircleDot className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
}

export function StatusBadge<D extends StatusDomain>({
  domain,
  value,
  className,
}: StatusBadgeProps<D>) {
  const config = getStatusConfig(domain, value);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tabular transition-colors select-none",
        toneStyles[config.tone],
        className
      )}
    >
      <StatusIcon iconType={config.iconType} />
      <span>{config.label}</span>
    </span>
  );
}

export function ConflictAlertBadge({
  value = "warning",
  message,
  className,
}: {
  value?: ConflictStatus;
  message?: string;
  className?: string;
}) {
  const config = getStatusConfig("conflict", value);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular select-none",
        toneStyles[config.tone],
        className
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{message ?? config.label}</span>
    </span>
  );
}
