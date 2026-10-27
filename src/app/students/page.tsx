import * as React from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { StudentsRosterTable } from "@/components/students/StudentsRosterTable";
import { getCurrentAcademicYear } from "@/lib/models/academic-year/repo";
import { listRosterStudents } from "@/lib/models/roster/repo";
import { CalendarX } from "lucide-react";

export const metadata: Metadata = {
  title: "Student Roster · FYPMS",
  description:
    "Manage cohort student rosters, track course assignments, and verify institutional account linkages.",
};

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const currentYear = await getCurrentAcademicYear();

  if (!currentYear) {
    return (
      <div className="container mx-auto space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl">
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

  const students = await listRosterStudents(currentYear.id);
  const rosterKey = `${currentYear.id}:${students.length}:${students
    .map((s) => s.index_number + (s.user_uid ? '1' : '0'))
    .join(',')}`;

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Student Roster"
        description={`Manage ${currentYear.code} cohort student onboarding, track course track allocations, and monitor institutional account activation.`}
      />

      <StudentsRosterTable
        key={rosterKey}
        initialStudents={students}
        academicYearId={currentYear.id}
      />
    </div>
  );
}
