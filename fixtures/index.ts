/**
 * Typed access to the ONLY approved test data. Scripts, tests and seeds import from here.
 * Never hard-code index numbers, names, emails, phones, group numbers or UIDs elsewhere.
 */
import raw from './testusers.json';
import profileFile from './staff-profiles.json';

export type CourseId = 'btech-cs' | 'btech-ict' | 'hnd-cs' | 'hnd-ict';
export type Role = 'student' | 'supervisor' | 'coordinator' | 'admin' | 'panel_member';

export interface FxStudent { index_number: string; full_name: string; contact: string; email: string; course_id: CourseId; group_number: string }
export interface FxStaff { email: string; full_name: string; roles: Role[]; department: string; programmes: CourseId[]; is_active: boolean }
export interface FxGroup { group_number: string; course_id: CourseId; leader: string; members: string[] }
export interface FxAssignment { supervisor: string; assignments: string[]; note?: string }
export interface FxProfile { email: string; office_location: string; consultation_hours: string; phone?: string; research_interests: string[]; max_team_capacity: number }

const data = raw as unknown as { students: FxStudent[]; staff: FxStaff[]; groups: FxGroup[]; supervisor_assignments: FxAssignment[] };
const profiles = (profileFile as unknown as { profiles: FxProfile[] }).profiles;

/** Derived values: the only place these are built. */
export const studentEmail = (index: string): string => `${index}@htu.edu.gh`;
export const studentUid = (index: string): string => `stu-${index}`;
export const staffUid = (email: string): string => `staff-${email.split('@')[0]}`;
export const ACADEMIC_YEAR_START = 2026; // group numbers in the fixture end in 26

function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`Fixture not found: ${what}`);
  return v;
}

export const fx = {
  students: data.students,
  staff: data.staff,
  groups: data.groups,
  assignments: data.supervisor_assignments,
  profiles,
  student: (index: string) => must(data.students.find((s) => s.index_number === index), `student ${index}`),
  staffByEmail: (email: string) => must(data.staff.find((s) => s.email === email), `staff ${email}`),
  group: (groupNumber: string) => must(data.groups.find((g) => g.group_number === groupNumber), `group ${groupNumber}`),
  profile: (email: string) => profiles.find((p) => p.email === email),
  membersOf: (groupNumber: string) => data.students.filter((s) => s.group_number === groupNumber),
  supervisorOf: (groupNumber: string) => data.supervisor_assignments.find((a) => a.assignments.includes(groupNumber))?.supervisor,
  claimsFor(email: string) {
    const student = data.students.find((s) => studentEmail(s.index_number) === email);
    if (student) return { roles: ['student'], activeRole: 'student', registered: true, profileComplete: true };
    const s = this.staffByEmail(email);
    return { roles: s.roles, activeRole: s.roles[0], registered: true, profileComplete: Boolean(this.profile(email)) };
  },
};
