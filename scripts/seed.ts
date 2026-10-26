import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../src/lib/firebase/admin';

interface CourseSeed {
  id: string;
  code: string;
  name: string;
  department: string;
}

const COURSES: CourseSeed[] = [
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

export async function runSeed(options: { isProdOverride?: boolean } = {}) {
  const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const isProdFlag =
    options.isProdOverride ?? process.argv.includes('--prod');

  if (!isEmulator && !isProdFlag) {
    console.error(
      'REFUSED: Seed script will not run against a live/production project unless the --prod flag is explicitly provided.'
    );
    throw new Error('Seed rejected: missing --prod flag for non-emulator environment');
  }

  console.log(`Starting FYPMS database seed (Emulator: ${isEmulator}, ProdFlag: ${isProdFlag})...`);

  // 1. Seed Courses
  for (const course of COURSES) {
    const courseRef = adminDb.collection('courses').doc(course.id);
    await courseRef.set(course, { merge: true });
    console.log(`  [course] Upserted ${course.id} (${course.code})`);
  }

  // 2. Seed Current Academic Year
  const currentCalendarYear = new Date().getFullYear();
  const rawSeedYear = process.env.SEED_YEAR;
  const startYear = rawSeedYear ? parseInt(rawSeedYear, 10) : currentCalendarYear;
  const endYear = startYear + 1;
  const yearId = `${startYear}-${endYear}`;
  const yearCode = `${startYear}/${endYear}`;

  const academicYearRef = adminDb.collection('academic_years').doc(yearId);
  const yearSnap = await academicYearRef.get();

  const deadlines = {
    roster_import_deadline: Timestamp.fromDate(new Date(startYear, 9, 15)), // Oct 15
    team_formation_deadline: Timestamp.fromDate(new Date(startYear, 10, 1)), // Nov 1
    topic_submission_deadline: Timestamp.fromDate(new Date(startYear, 10, 15)), // Nov 15
    chapters_deadline: Timestamp.fromDate(new Date(endYear, 3, 30)), // Apr 30
    defense_start_date: Timestamp.fromDate(new Date(endYear, 5, 1)), // Jun 1
    defense_end_date: Timestamp.fromDate(new Date(endYear, 5, 15)), // Jun 15
    grade_appeal_deadline: Timestamp.fromDate(new Date(endYear, 5, 30)), // Jun 30
  };

  const yearData: Record<string, unknown> = {
    id: yearId,
    code: yearCode,
    semester: 1,
    is_active: true,
    deadlines,
  };

  if (!yearSnap.exists) {
    yearData.grades_published = false;
    yearData.created_at = Timestamp.now();
  }

  await academicYearRef.set(yearData, { merge: true });
  console.log(`  [academic_year] Upserted active academic year ${yearId} (${yearCode})`);

  // 3. Initialize Counters for each course
  for (const course of COURSES) {
    const counterRef = academicYearRef.collection('counters').doc(course.id);
    const counterSnap = await counterRef.get();
    if (!counterSnap.exists) {
      await counterRef.set({ next_sequence: 1 });
      console.log(`  [counter] Initialized counter for ${course.id} to 1`);
    } else {
      console.log(`  [counter] Counter for ${course.id} already exists`);
    }
  }

  // 4. Seed Coordinator in staff_whitelist
  const coordinatorEmail = (
    process.env.SEED_COORDINATOR_EMAIL || 'coordinator@htu.edu.gh'
  ).toLowerCase().trim();

  if (!coordinatorEmail.endsWith('@htu.edu.gh')) {
    throw new Error(
      `SEED_COORDINATOR_EMAIL must end with @htu.edu.gh, got: "${coordinatorEmail}"`
    );
  }

  const staffRef = adminDb.collection('staff_whitelist').doc(coordinatorEmail);
  const staffSnap = await staffRef.get();

  const staffData: Record<string, unknown> = {
    email: coordinatorEmail,
    full_name: 'Lead Department Coordinator',
    roles: ['coordinator', 'admin'],
    department: 'Computer Science',
    programmes: ['btech-cs', 'btech-ict', 'hnd-cs', 'hnd-ict'],
    is_active: true,
  };

  if (!staffSnap.exists) {
    staffData.added_by_uid = 'system-seed';
    staffData.added_at = Timestamp.now();
    staffData.user_uid = null;
  }

  await staffRef.set(staffData, { merge: true });
  console.log(`  [staff_whitelist] Upserted coordinator ${coordinatorEmail}`);

  console.log('FYPMS database seed completed successfully.');
}

// Execute directly if run as main script via CLI / npm run seed
const isDirectRun =
  Boolean(process.argv[1]?.endsWith('seed.ts')) ||
  Boolean(process.argv[1]?.endsWith('seed.js')) ||
  (typeof require !== 'undefined' && require.main === module);

if (isDirectRun) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed script failed:', err);
      process.exit(1);
    });
}
