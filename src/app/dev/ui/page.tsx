import { notFound } from "next/navigation";
import {
  StatusBadge,
  ConflictAlertBadge,
  EmptyState,
  LockedCard,
  PageHeader,
  BentoGrid,
  BentoCard,
  LifecycleStepper,
} from "@/components/common";
import {
  TOPIC_STATUS_CONFIG,
  CHAPTER_STATUS_CONFIG,
  TEAM_STATUS_CONFIG,
  DEFENSE_STATUS_CONFIG,
  CONFLICT_STATUS_CONFIG,
  type TopicStatus,
  type ChapterStatus,
  type TeamStatus,
  type DefenseStatus,
  type ConflictStatus,
} from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  FolderPlus,
  Info,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";

export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const topicStatuses = Object.keys(TOPIC_STATUS_CONFIG) as TopicStatus[];
  const chapterStatuses = Object.keys(CHAPTER_STATUS_CONFIG) as ChapterStatus[];
  const teamStatuses = Object.keys(TEAM_STATUS_CONFIG) as TeamStatus[];
  const defenseStatuses = Object.keys(DEFENSE_STATUS_CONFIG) as DefenseStatus[];
  const conflictStatuses = Object.keys(CONFLICT_STATUS_CONFIG) as ConflictStatus[];

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-10">
      <PageHeader
        title="UI Design System & Component Kit"
        description="Development preview for FYPMS Calm Bento design system, HTU brand tokens, status badges, and common building blocks."
        action={
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Action Button
          </Button>
        }
      />

      {/* 1. Lifecycle Stepper */}
      <Card>
        <CardHeader>
          <CardTitle>Project Journey Lifecycle Stepper</CardTitle>
          <CardDescription>
            Shows students, supervisors, and coordinators current progress through capstone milestones.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <LifecycleStepper currentIndex={2} />
        </CardContent>
      </Card>

      {/* 2. Status Badges across all domains */}
      <Card>
        <CardHeader>
          <CardTitle>Semantic Status Badges</CardTitle>
          <CardDescription>
            Domain-specific status badges with icon + label + tone pairings per spec.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Topic Proposals</h4>
            <div className="flex flex-wrap gap-2.5">
              {topicStatuses.map((status) => (
                <StatusBadge key={status} domain="topic" value={status} />
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Chapter Reviews (1–5)</h4>
            <div className="flex flex-wrap gap-2.5">
              {chapterStatuses.map((status) => (
                <StatusBadge key={status} domain="chapter" value={status} />
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Project Teams</h4>
            <div className="flex flex-wrap gap-2.5">
              {teamStatuses.map((status) => (
                <StatusBadge key={status} domain="team" value={status} />
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Oral Defense Slots</h4>
            <div className="flex flex-wrap gap-2.5">
              {defenseStatuses.map((status) => (
                <StatusBadge key={status} domain="defense" value={status} />
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Panel & Schedule Conflicts</h4>
            <div className="flex flex-wrap gap-2.5">
              {conflictStatuses.map((status) => (
                <ConflictAlertBadge
                  key={status}
                  value={status}
                  message={status === "warning" ? "Panel member double-booked" : "Direct examiner overlap conflict"}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Bento Grid Dashboard Layout */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Calm Bento Dashboard Grid</h2>
          <p className="text-xs text-muted-foreground">
            Six-column responsive grid with cards spanning 1, 2, 3, or full width.
          </p>
        </div>

        <BentoGrid>
          <BentoCard
            span={6}
            title="Project Milestone Journey"
            description="Derived from team.status + academic_year.deadlines"
            icon={<Sparkles className="h-4 w-4" />}
          >
            <LifecycleStepper currentIndex={1} />
          </BentoCard>

          <BentoCard
            span={3}
            title="Assigned Supervisor"
            description="Consultation contact unlocked"
            icon={<Users className="h-4 w-4" />}
            action={<StatusBadge domain="team" value="topic_approved" />}
          >
            <div className="py-2 text-sm">
              <p className="font-semibold text-foreground">Dr. Eyram Agbe</p>
              <p className="text-xs text-muted-foreground">Department of Computer Science</p>
            </div>
          </BentoCard>

          <BentoCard
            span={3}
            title="Defense Call-Up"
            description="Oral defense schedule"
            icon={<Info className="h-4 w-4" />}
            action={<StatusBadge domain="defense" value="scheduled" />}
          >
            <div className="py-2 text-sm">
              <p className="font-medium text-foreground">Dec 14, 2026 · 10:00 AM</p>
              <p className="text-xs text-muted-foreground">CS Lab 2 — Panel B</p>
            </div>
          </BentoCard>
        </BentoGrid>
      </div>

      {/* 4. Common States: EmptyState & LockedCard */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Empty State Pattern</CardTitle>
            <CardDescription>
              Used in tables, proposal queues, and student rosters when no records exist.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={<FolderPlus className="h-6 w-6 text-muted-foreground" />}
              title="No proposals submitted yet"
              description="Get started by formulating your capstone topic proposal with your teammates."
              action={
                <Button size="sm">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Submit Topic
                </Button>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gated / Locked Content Pattern</CardTitle>
            <CardDescription>
              Restricted states for chapters, supervisor contacts, and defense marksheets.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <LockedCard
              title="Supervisor Consultation Hours"
              message="Unlocks when your capstone proposal is formally approved by the coordinator."
            />
            <LockedCard
              title="Chapter 2 Submission"
              message="Unlocks sequentially after Chapter 1 is reviewed and accepted."
            />
          </CardContent>
        </Card>
      </div>

      {/* 5. Core Primitives & Focus Ring Validation */}
      <Card>
        <CardHeader>
          <CardTitle>Form Controls & HTU Blue Focus Rings</CardTitle>
          <CardDescription>
            Validates HTU primary color (hsl 221 83% 46%), borders, and inputs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <Button>Primary Button (HTU Blue)</Button>
            <Button variant="secondary">Secondary Button</Button>
            <Button variant="outline">Outline Button</Button>
            <Button variant="ghost">Ghost Button</Button>
            <Button variant="destructive">Destructive Button</Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="test-input" className="text-xs font-semibold text-foreground">
                Text Input
              </label>
              <Input id="test-input" placeholder="e.g. 0420230001 (Index Number)" />
            </div>

            <div className="space-y-2">
              <label htmlFor="test-textarea" className="text-xs font-semibold text-foreground">
                Textarea
              </label>
              <Textarea id="test-textarea" placeholder="Project problem statement and methodology..." />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-2">
            <div className="flex items-center gap-2">
              <Checkbox id="terms" defaultChecked />
              <label htmlFor="terms" className="text-xs font-medium cursor-pointer">
                Active group participant
              </label>
            </div>

            <div className="flex items-center gap-2">
              <Switch id="auto-match" defaultChecked />
              <label htmlFor="auto-match" className="text-xs font-medium cursor-pointer">
                Jaccard supervisor matching
              </label>
            </div>

            <div className="w-48 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Milestone</span>
                <span className="tabular font-medium">65%</span>
              </div>
              <Progress value={65} />
            </div>
          </div>

          <Tabs defaultValue="overview" className="w-full">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
              <TabsTrigger value="evaluations">Evaluations</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="p-3 text-xs text-muted-foreground">
              Overview tab content rendering in calm bento container.
            </TabsContent>
            <TabsContent value="deliverables" className="p-3 text-xs text-muted-foreground">
              Deliverables tab content.
            </TabsContent>
            <TabsContent value="evaluations" className="p-3 text-xs text-muted-foreground">
              Defense evaluations content.
            </TabsContent>
          </Tabs>

          <div className="space-y-3">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Institutional Identity Notice</AlertTitle>
              <AlertDescription className="text-xs">
                Authentication is strictly gated to @htu.edu.gh Google Workspace accounts.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Unregistered Cohort Warning</AlertTitle>
              <AlertDescription className="text-xs">
                Your index number was not found in the current cohort roster. Please contact the coordinator.
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
