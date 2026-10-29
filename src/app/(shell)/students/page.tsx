import * as React from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { StudentsRosterTable } from "@/components/students/StudentsRosterTable";
import { UnassignedPool } from "@/components/students/UnassignedPool";
import { getCurrentAcademicYear } from "@/lib/models/academic-year/repo";
import { listRosterStudents } from "@/lib/models/roster/repo";
import { serializeForClient } from "@/lib/serialize";
import { CalendarX, Users, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


export const metadata: Metadata = {
  title: "Students Management · FYPMS",
  description:
    "Manage cohort student rosters, track course assignments, monitor account linkages, and execute auto-grouping.",
};

export default async function StudentsPage() {
  await connection();
  const currentYear = await getCurrentAcademicYear();

  if (!currentYear) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Student Roster"
          description="Final year cohort roster and course track enrollments."
        />
        <EmptyState
          title="No Active Academic Year"
          description="An active academic year must be configured or seeded before student rosters can be managed."
          icon={<CalendarX className="h-6 w-6 text-slate-400" />}
        />
      </div>
    );
  }

  const rawStudents = await listRosterStudents(currentYear.id);
  const students = serializeForClient(rawStudents);
  const rosterKey = `${currentYear.id}:${students.length}:${students
    .map((s) => s.index_number + (s.user_uid ? "1" : "0"))
    .join(",")}`;

  const deadline = currentYear.deadlines?.team_formation_deadline;
  let formationDeadlineStr: string | null = null;
  if (deadline) {
    formationDeadlineStr =
      typeof (deadline as { toDate?: () => Date }).toDate === "function"
        ? deadline.toDate().toISOString()
        : new Date(deadline as unknown as string).toISOString();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students Management"
        description={`Manage ${currentYear.code} student onboarding, allocate course tracks, and oversee unassigned groups.`}
      />

      <Tabs defaultValue="roster" className="w-full flex flex-col">
        <TabsList className="w-fit bg-muted p-1 rounded-lg">
          <TabsTrigger value="roster" className="gap-2 text-xs font-medium">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Cohort Roster ({students.length})</span>
          </TabsTrigger>
          <TabsTrigger value="pool" className="gap-2 text-xs font-medium">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>Unassigned Pool</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="mt-4 space-y-6">
          <StudentsRosterTable
            key={rosterKey}
            initialStudents={students}
            academicYearId={currentYear.id}
          />
        </TabsContent>

        <TabsContent value="pool" className="mt-4 space-y-6">
          <UnassignedPool
            academicYearId={currentYear.id}
            formationDeadline={formationDeadlineStr}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
