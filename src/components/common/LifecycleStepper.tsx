"use client";

import * as React from "react";
import { cn } from "cn";
import { Check } from "lucide-react";

export const DEFAULT_LIFECYCLE_STEPS = [
  "Formation",
  "Topic",
  "Supervisor",
  "Chapters",
  "Defense",
  "Grades",
] as const;

export type LifecycleStepName = (typeof DEFAULT_LIFECYCLE_STEPS)[number];

export interface LifecycleStepperProps {
  currentIndex: number;
  steps?: readonly string[];
  className?: string;
  onStepClick?: (index: number) => void;
}

export function LifecycleStepper({
  currentIndex,
  steps = DEFAULT_LIFECYCLE_STEPS,
  className,
  onStepClick,
}: LifecycleStepperProps) {
  return (
    <nav
      aria-label="Project Journey"
      className={cn("w-full overflow-x-auto p-2", className)}
    >
      <ol className="flex min-w-[560px] items-center justify-between gap-2">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isUpcoming = index > currentIndex;

          return (
            <li
              key={step}
              className={cn(
                "flex flex-1 items-center",
                index < steps.length - 1 ? "after:h-0.5 after:flex-1 after:transition-colors" : "",
                index < steps.length - 1 && isCompleted
                  ? "after:bg-primary"
                  : "after:bg-muted"
              )}
            >
              <div
                role={onStepClick ? "button" : undefined}
                tabIndex={onStepClick ? 0 : undefined}
                onClick={() => onStepClick?.(index)}
                onKeyDown={(e) => {
                  if (onStepClick && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onStepClick(index);
                  }
                }}
                className={cn(
                  "group flex items-center gap-2.5 text-xs font-medium transition-all select-none",
                  onStepClick ? "cursor-pointer" : "cursor-default"
                )}
                aria-current={isCurrent ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular transition-all",
                    isCompleted &&
                      "border-primary bg-primary text-primary-foreground",
                    isCurrent &&
                      "border-2 border-primary bg-primary/10 text-primary",
                    isUpcoming &&
                      "border-muted bg-card text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5 stroke-[2.5]" aria-hidden="true" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap transition-colors",
                    isCurrent && "font-semibold text-primary",
                    isCompleted && "font-medium text-foreground",
                    isUpcoming && "text-muted-foreground"
                  )}
                >
                  {step}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
