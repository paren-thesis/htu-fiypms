import { existsSync, readFileSync } from 'node:fs';

// 1. Stub 'server-only' so Node CLI can import files that declare 'server-only'
try {
  const serverOnlyPath = require.resolve('server-only');
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  } as unknown as NodeModule;
} catch {
  // Ignore
}

// 2. Load environment variables (.env.local takes precedence, then .env)
const envFile = existsSync('.env.local') ? '.env.local' : existsSync('.env') ? '.env' : null;
if (envFile) {
  const envContent = readFileSync(envFile, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    const key = match?.[1]?.trim();
    const rawVal = match?.[2]?.trim();
    if (key && rawVal !== undefined) {
      let value = rawVal;
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

// 3. Ensure live Cloud Firestore is targeted
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = 'false';
process.env.NEXT_PUBLIC_USE_EMULATORS = 'false';
process.env.FIREBASE_ADMIN_PROJECT_ID = 'htu-fiypms';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'htu-fiypms';

const COURSES = [
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

async function main() {
  const { adminDb } = await import('../src/lib/firebase/admin');
  const { Timestamp } = await import('firebase-admin/firestore');

  console.log(' Connected to live Firestore!');

  // 1. Seed / Ensure Courses
  console.log('\n--- 1. Ensuring Courses Collection ---');
  for (const course of COURSES) {
    await adminDb.collection('courses').doc(course.id).set(course, { merge: true });
    console.log(`  [courses]  ${course.id} (${course.code})`);
  }

  // 2. Ensure Active Academic Year (2026-2027)
  console.log('\n--- 2. Ensuring Active Academic Year ---');
  const yearId = '2026-2027';
  const yearCode = '2026/2027';
  const academicYearRef = adminDb.collection('academic_years').doc(yearId);
  const yearSnap = await academicYearRef.get();

  if (!yearSnap.exists) {
    const deadlines = {
      roster_import_deadline: Timestamp.fromDate(new Date(2026, 9, 15)),
      team_formation_deadline: Timestamp.fromDate(new Date(2026, 10, 1)),
      topic_submission_deadline: Timestamp.fromDate(new Date(2026, 10, 15)),
      chapters_deadline: Timestamp.fromDate(new Date(2027, 3, 30)),
      defense_start_date: Timestamp.fromDate(new Date(2027, 5, 1)),
      defense_end_date: Timestamp.fromDate(new Date(2027, 5, 15)),
      grade_appeal_deadline: Timestamp.fromDate(new Date(2027, 5, 30)),
    };

    await academicYearRef.set({
      id: yearId,
      code: yearCode,
      semester: 1,
      is_active: true,
      deadlines,
      grades_published: false,
      created_at: Timestamp.now(),
    });
    console.log(`  [academic_years] Created active academic year ${yearId}`);
  } else {
    await academicYearRef.update({ is_active: true });
    console.log(`  [academic_years] Verified active academic year ${yearId}`);
  }

  // Ensure counters exist for each course under this academic year
  for (const course of COURSES) {
    const counterRef = academicYearRef.collection('counters').doc(course.id);
    const counterSnap = await counterRef.get();
    if (!counterSnap.exists) {
      await counterRef.set({ next_sequence: 1 });
      console.log(`  [counters] Initialized counter for ${course.id}`);
    }
  }

  // 3. Add Student to Roster
  console.log('\n--- 3. Adding Student to Roster ---');
  const indexNumber = '0323080150';
  const email = '0323080150@htu.edu.gh';
  const courseId = 'btech-ict';
  const fullName = 'Prosper Ntim';
  const contact = '0543061951';

  const rosterRef = adminDb
    .collection('rosters')
    .doc(yearId)
    .collection('students')
    .doc(indexNumber);

  const existingStudent = await rosterRef.get();

  await rosterRef.set(
    {
      index_number: indexNumber,
      full_name: fullName,
      contact: contact,
      email: email,
      course_id: courseId,
      is_active: true,
      user_uid: existingStudent.exists ? existingStudent.data()?.user_uid ?? null : null,
      signup_completed_at: existingStudent.exists
        ? existingStudent.data()?.signup_completed_at ?? null
        : null,
      import_batch_id: 'manual-entry',
      imported_by_uid: 'admin',
      imported_at: existingStudent.exists
        ? existingStudent.data()?.imported_at ?? Timestamp.now()
        : Timestamp.now(),
    },
    { merge: true }
  );

  console.log(`  [rosters/${yearId}/students] Added/Updated student ${indexNumber}`);
  console.log(`     - Name: ${fullName}`);
  console.log(`     - Email: ${email}`);
  console.log(`     - Programme: ${courseId} (BTech ICT)`);
  console.log(`     - Contact: ${contact}`);

  console.log('\n All set! You can now log into the application with Google using 0323080150@htu.edu.gh.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error executing setup script:', err);
  process.exit(1);
});
