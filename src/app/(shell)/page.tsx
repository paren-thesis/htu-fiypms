import * as React from "react";
import Link from "next/link";
import {
  Calendar,
  Users,
  UserCheck,
  FileText,
  Bell,
  ArrowRight,
  Clock,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { BentoGrid, BentoCard } from "@/components/common/BentoGrid";
import { LifecycleStepper } from "@/components/common/LifecycleStepper";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Welcome to the Ho Technical University Final Year Project Management System."
        action={
          <Button asChild size="sm" className="gap-1.5 shadow-xs">
            <Link href="/my-team">
              <span>View Workspace</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        }
      />

      <BentoGrid>
        {/* Full-width Lifecycle Stepper */}
        <BentoCard
          span="full"
          title="Project Journey"
          description="Sequential milestones across the final year project lifecycle"
          icon={<Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />}
          action={
            <StatusBadge domain="team" value="formation" />
          }
        >
          <div className="py-2">
            <LifecycleStepper currentIndex={0} />
          </div>
        </BentoCard>

        {/* Next Deadline */}
        <BentoCard
          span={2}
          title="Upcoming Deadline"
          description="Academic Year 2026/2027"
          icon={<Calendar className="h-4 w-4 text-warning" aria-hidden="true" />}
        >
          <div className="flex flex-col justify-between h-full space-y-4">
            <div>
              <div className="text-xl font-bold tracking-tight text-foreground">
                Team Formation
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Final date to submit team rosters and declare project group
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-warning">
              <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold tabular">14 days remaining</span>
            </div>
          </div>
        </BentoCard>

        {/* Team Status */}
        <BentoCard
          span={2}
          title="My Team"
          description="CS-2026 Cohort"
          icon={<Users className="h-4 w-4 text-primary" aria-hidden="true" />}
          action={
            <Button variant="ghost" size="sm" asChild className="h-7 text-xs px-2">
              <Link href="/my-team">Manage</Link>
            </Button>
          }
        >
          <div className="space-y-3">
            <div>
              <div className="text-sm font-semibold text-foreground">
                Group CS-01
              </div>
              <p className="text-xs text-muted-foreground">
                BTech Computer Science · 3 / 4 Members
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <StatusBadge domain="topic" value="draft" />
            </div>
          </div>
        </BentoCard>

        {/* Supervisor */}
        <BentoCard
          span={2}
          title="Supervisor"
          description="Allocated Faculty"
          icon={<UserCheck className="h-4 w-4 text-success" aria-hidden="true" />}
        >
          <div className="space-y-2">
            <div className="text-sm font-semibold text-foreground">
              Dr. Alex Mensah
            </div>
            <p className="text-xs text-muted-foreground">
              Department of Computer Science
            </p>
            <div className="text-xs text-muted-foreground pt-1">
              <span className="font-medium text-foreground">Office:</span> Block B, Room 204
            </div>
          </div>
        </BentoCard>

        {/* Latest Feedback */}
        <BentoCard
          span={3}
          title="Latest Review & Feedback"
          description="Recent review transitions and chapter notes"
          icon={<FileText className="h-4 w-4 text-primary" aria-hidden="true" />}
        >
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Topic Proposal</span>
              <span className="text-[10px] text-muted-foreground">Awaiting review</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Your topic proposal has been saved. Submit it to your supervisor once your team roster is locked.
            </p>
          </div>
        </BentoCard>

        {/* Notifications / Announcements */}
        <BentoCard
          span={3}
          title="Department Announcements"
          description="Notices from Project Coordinators"
          icon={<Bell className="h-4 w-4 text-info" aria-hidden="true" />}
          action={
            <Button variant="ghost" size="sm" asChild className="h-7 text-xs px-2">
              <Link href="/notifications">All notices</Link>
            </Button>
          }
        >
          <div className="space-y-2">
            <div className="rounded-lg border border-border bg-card p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">Cohort Onboarding Started</span>
                <span className="text-[10px] text-muted-foreground">Today</span>
              </div>
              <p className="text-muted-foreground">
                Welcome to the 2026/2027 academic project cycle. Form teams of 3 to 4 students.
              </p>
            </div>
          </div>
        </BentoCard>
      </BentoGrid>
    </div>
  );
}
