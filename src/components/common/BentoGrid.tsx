import * as React from "react";
import { cn } from "cn";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface BentoGridProps extends React.ComponentProps<"div"> {
  children: React.ReactNode;
}

export function BentoGrid({ className, children, ...props }: BentoGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 md:grid-cols-6",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface BentoCardProps extends Omit<React.ComponentProps<typeof Card>, "title"> {
  span?: 1 | 2 | 3 | 4 | 5 | 6 | "full";
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  headerClassName?: string;
  contentClassName?: string;
}

const spanClasses: Record<string, string> = {
  "1": "md:col-span-1",
  "2": "md:col-span-2",
  "3": "md:col-span-3",
  "4": "md:col-span-4",
  "5": "md:col-span-5",
  "6": "md:col-span-6",
  full: "md:col-span-6",
};

export function BentoCard({
  span = 2,
  title,
  description,
  icon,
  action,
  className,
  headerClassName,
  contentClassName,
  children,
  ...props
}: BentoCardProps) {
  const spanClass = spanClasses[String(span)] ?? "md:col-span-2";

  return (
    <Card
      className={cn(
        "flex flex-col justify-between overflow-hidden transition-shadow hover:shadow-md",
        spanClass,
        className
      )}
      {...props}
    >
      {(title || description || icon || action) && (
        <CardHeader className={cn("space-y-1 pb-3", headerClassName)}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {icon && (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  {icon}
                </div>
              )}
              {title && (
                <CardTitle className="text-base font-semibold leading-tight text-foreground">
                  {title}
                </CardTitle>
              )}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
          {description && (
            <CardDescription className="text-xs text-muted-foreground">
              {description}
            </CardDescription>
          )}
        </CardHeader>
      )}
      {children && (
        <CardContent className={cn("pt-0 flex-1", contentClassName)}>
          {children}
        </CardContent>
      )}
    </Card>
  );
}
