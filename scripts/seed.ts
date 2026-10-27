import './setup-env';
import { Timestamp } from 'firebase-admin/firestore';
import { fx, ACADEMIC_YEAR_START, studentEmail } from '../fixtures';
import { adminDb } from '../src/lib/firebase/admin';

export const COURSES = [
  {
    id: 'btech-cs',
    code: 'BTECH-CS',
    name: 'BTech Computer Science',
    department: 'Computer Science',
  },
  {
    id: 'btech-ict',
    code: 'BTECH-ICT',
    name: 'BTech Information Communication Technology',
    department: 'Computer Science',
  },
  {
    id: 'hnd-cs',
    code: 'HND-CS',
    name: 'HND Computer Science',
    department: 'Computer Science',
  },
  {
    id: 'hnd-ict',
    code: 'HND-ICT',
    name: 'HND Information Communication Technology',
    department: 'Computer Science',
  },
];

export interface SeedOptions {
  mode?: 'base' | 'full';
  isProdOverride?: boolean;
}

export async function runSeed(options?: string | SeedOptions) {
  let mode: 'base' | 'full' = 'base';
  let isProdOverride = false;

  if (typeof options === 'string') {
    mode = options === 'full' ? 'full' : 'base';
  } else if (typeof options === 'object' && options !== null) {
    if (options.mode) mode = options.mode;
    if (options.isProdOverride !== undefined) isProdOverride = options.isProdOverride;
  }

  const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const isProdFlag = isProdOverride || process.argv.includes('--prod');

  if (!isEmulator && !isProdFlag) {
    console.error(
      'REFUSED: Seed script will not run against a live/production project unless the --prod flag is explicitly provided.'
    );
    throw new Error('Seed rejected: missing --prod flag for non-emulator environment');
  }

  if (mode === 'full') {
    console.log('Full seed mode not available yet');
    return;
  }

  console.log(`Starting FYPMS base database seed (mode: ${mode})...`);

  // 1. Seed Courses (4 courses)
  for (const course of COURSES) {
    await adminDb.collection('courses').doc(course.id).set(course);
    console.log(`  [course] Seeded ${course.id} (${course.code})`);
  }

  // 2. Current Academic Year (start year 2026 per fixture contract)
  const startYear = ACADEMIC_YEAR_START; // 2026
  const endYear = startYear + 1; // 2027
  const yearId = `${startYear}-${endYear}`;
  const yearCode = `${startYear}/${endYear}`;

  const deadlines = {
    roster_import_deadline: Timestamp.fromDate(new Date(startYear, 9, 15)), // Oct 15
    team_formation_deadline: Timestamp.fromDate(new Date(startYear, 10, 1)), // Nov 1
    topic_submission_deadline: Timestamp.fromDate(new Date(startYear, 10, 15)), // Nov 15
    chapters_deadline: Timestamp.fromDate(new Date(endYear, 3, 30)), // Apr 30
    defense_start_date: Timestamp.fromDate(new Date(endYear, 5, 1)), // Jun 1
    defense_end_date: Timestamp.fromDate(new Date(endYear, 5, 15)), // Jun 15
    grade_appeal_deadline: Timestamp.fromDate(new Date(endYear, 5, 30)), // Jun 30
  };

  const academicYearRef = adminDb.collection('academic_years').doc(yearId);
  await academicYearRef.set({
    id: yearId,
    code: yearCode,
    semester: 1,
    is_active: true,
    deadlines,
    grades_published: false,
    created_at: Timestamp.now(),
  });
  console.log(`  [academic_year] Seeded active academic year ${yearId} (${yearCode})`);

  // 3. Initialize Counters for each course
  for (const course of COURSES) {
    const counterRef = academicYearRef.collection('counters').doc(course.id);
    await counterRef.set({ next_sequence: 1 });
    console.log(`  [counter] Initialized counter for ${course.id} to 1`);
  }

  // 4. Seed 40 Roster Students
  const now = Timestamp.now();
  const batch = adminDb.batch();
  for (const student of fx.students) {
    const studentRef = adminDb
      .collection('rosters')
      .doc(yearId)
      .collection('students')
      .doc(student.index_number);

    batch.set(studentRef, {
      index_number: student.index_number,
      full_name: student.full_name,
      contact: student.contact,
      email: studentEmail(student.index_number),
      course_id: student.course_id,
      user_uid: null,
      signup_completed_at: null,
      import_batch_id: 'fixture-base',
      imported_by_uid: 'fixture',
      imported_at: now,
    });
  }
  await batch.commit();
  console.log(`  [rosters] Seeded ${fx.students.length} students into roster ${yearId}`);

  // 5. Seed Staff Whitelist (6 staff members)
  const staffBatch = adminDb.batch();
  for (const staff of fx.staff) {
    const staffRef = adminDb.collection('staff_whitelist').doc(staff.email);
    staffBatch.set(staffRef, {
      email: staff.email,
      full_name: staff.full_name,
      roles: staff.roles,
      department: staff.department,
      programmes: staff.programmes,
      is_active: staff.is_active,
      added_by_uid: 'fixture',
      added_at: now,
      user_uid: null,
    });
  }
  await staffBatch.commit();
  console.log(`  [staff_whitelist] Seeded ${fx.staff.length} staff entries`);

  console.log('FYPMS database base seed completed successfully.');
}

// CLI argument parsing
const args = process.argv.slice(2);
const modeIndex = args.indexOf('--mode');
const cliMode =
  modeIndex !== -1 && args[modeIndex + 1] ? (args[modeIndex + 1] as 'base' | 'full') : 'base';

const isDirectRun =
  Boolean(process.argv[1]?.endsWith('seed.ts')) ||
  Boolean(process.argv[1]?.endsWith('seed.js')) ||
  (typeof require !== 'undefined' && require.main === module);

if (isDirectRun) {
  runSeed({ mode: cliMode })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed script failed:', err);
      process.exit(1);
    });
}
