import './setup-env';
import { fx, ACADEMIC_YEAR_START, studentEmail, studentUid, staffUid } from '../fixtures';
import { adminDb, adminAuth } from '../src/lib/firebase/admin';

interface CheckItem {
  name: string;
  passed: boolean;
  details?: string;
}

export async function checkData() {
  const checks: CheckItem[] = [];
  const unknown: string[] = [];

  const startYear = ACADEMIC_YEAR_START; // 2026
  const yearId = `${startYear}-${startYear + 1}`;

  // 1. Courses check
  const coursesSnap = await adminDb.collection('courses').get();
  const validCourseIds = ['btech-cs', 'btech-ict', 'hnd-cs', 'hnd-ict'];
  const courseIds = coursesSnap.docs.map((d) => d.id);
  const unknownCourses = courseIds.filter((id) => !validCourseIds.includes(id));
  unknown.push(...unknownCourses.map((c) => `course: ${c}`));

  const coursesPassed =
    validCourseIds.every((id) => courseIds.includes(id)) && unknownCourses.length === 0;
  checks.push({
    name: 'courses',
    passed: coursesPassed,
    details: `Found ${courseIds.length} courses (expected 4)`,
  });

  // 2. Academic year check
  const yearSnap = await adminDb.collection('academic_years').doc(yearId).get();
  const yearPassed = yearSnap.exists && yearSnap.data()?.is_active === true;
  checks.push({
    name: 'academic_year',
    passed: yearPassed,
    details: `Academic year ${yearId} exists and active: ${yearPassed}`,
  });

  // 3. Counters check
  const countersSnap = await adminDb
    .collection('academic_years')
    .doc(yearId)
    .collection('counters')
    .get();
  const counterIds = countersSnap.docs.map((d) => d.id);
  const countersPassed =
    validCourseIds.every((id) => counterIds.includes(id)) &&
    countersSnap.docs.every((d) => typeof d.data().next_sequence === 'number');
  checks.push({
    name: 'counters',
    passed: countersPassed,
    details: `Found ${counterIds.length} counters for academic year`,
  });

  // 4. Roster students check
  const rosterSnap = await adminDb
    .collection('rosters')
    .doc(yearId)
    .collection('students')
    .get();

  const fixtureIndexes = new Set(fx.students.map((s) => s.index_number));
  let rosterDataValid = true;

  for (const doc of rosterSnap.docs) {
    const data = doc.data();
    if (!fixtureIndexes.has(doc.id)) {
      unknown.push(`roster_student: ${doc.id}`);
      rosterDataValid = false;
      continue;
    }
    const fxStudent = fx.student(doc.id);
    const expectedEmail = studentEmail(doc.id);
    if (
      data.email !== expectedEmail ||
      data.contact !== fxStudent.contact ||
      data.course_id !== fxStudent.course_id
    ) {
      rosterDataValid = false;
    }
  }

  const allFixtureStudentsPresent = fx.students.every((s) =>
    rosterSnap.docs.some((d) => d.id === s.index_number)
  );

  const rosterPassed =
    allFixtureStudentsPresent &&
    rosterSnap.size === fx.students.length &&
    rosterDataValid &&
    unknown.filter((u) => u.startsWith('roster_student:')).length === 0;

  checks.push({
    name: 'roster_students',
    passed: rosterPassed,
    details: `Found ${rosterSnap.size} students (expected ${fx.students.length}), data matching: ${rosterDataValid}`,
  });

  // 5. Staff whitelist check
  const staffSnap = await adminDb.collection('staff_whitelist').get();
  const fixtureStaffEmails = new Set(fx.staff.map((s) => s.email));
  let staffDataValid = true;

  for (const doc of staffSnap.docs) {
    const data = doc.data();
    if (!fixtureStaffEmails.has(doc.id)) {
      unknown.push(`staff_whitelist: ${doc.id}`);
      staffDataValid = false;
      continue;
    }
    const fxStaff = fx.staffByEmail(doc.id);
    const rolesMatch =
      JSON.stringify([...(data.roles || [])].sort()) === JSON.stringify([...fxStaff.roles].sort());
    const programmesMatch =
      JSON.stringify([...(data.programmes || [])].sort()) ===
      JSON.stringify([...fxStaff.programmes].sort());

    if (!rolesMatch || !programmesMatch) {
      staffDataValid = false;
    }
  }

  const allFixtureStaffPresent = fx.staff.every((s) =>
    staffSnap.docs.some((d) => d.id === s.email)
  );

  const staffPassed =
    allFixtureStaffPresent &&
    staffSnap.size === fx.staff.length &&
    staffDataValid &&
    unknown.filter((u) => u.startsWith('staff_whitelist:')).length === 0;

  checks.push({
    name: 'staff_whitelist',
    passed: staffPassed,
    details: `Found ${staffSnap.size} staff (expected ${fx.staff.length}), data matching: ${staffDataValid}`,
  });

  // 6. Auth users check
  let authUsersValid = true;
  let authUserCount = 0;
  try {
    const listResult = await adminAuth.listUsers();
    authUserCount = listResult.users.length;
    for (const user of listResult.users) {
      const email = user.email;
      if (!email) {
        unknown.push(`auth_user_no_email: ${user.uid}`);
        authUsersValid = false;
        continue;
      }

      // Check if student or staff
      const student = fx.students.find((s) => studentEmail(s.index_number) === email);
      const staff = fx.staff.find((s) => s.email === email);

      if (!student && !staff) {
        unknown.push(`auth_user: ${email} (${user.uid})`);
        authUsersValid = false;
        continue;
      }

      const expectedUid = student ? studentUid(student.index_number) : staffUid(staff!.email);
      if (user.uid !== expectedUid) {
        unknown.push(`auth_user_uid_mismatch: ${email} got ${user.uid} expected ${expectedUid}`);
        authUsersValid = false;
      }

      const expectedClaims = fx.claimsFor(email);
      const userClaims = user.customClaims || {};
      for (const [k, v] of Object.entries(expectedClaims)) {
        if (JSON.stringify(userClaims[k]) !== JSON.stringify(v)) {
          authUsersValid = false;
        }
      }
    }
  } catch (err) {
    console.error('Auth check error:', err);
    authUsersValid = false;
  }

  checks.push({
    name: 'auth_users',
    passed: authUsersValid,
    details: `Auth users checked: ${authUserCount}, valid: ${authUsersValid}`,
  });

  // 7. Users docs in Firestore
  const usersSnap = await adminDb.collection('users').get();
  for (const doc of usersSnap.docs) {
    const isStudentUid = fx.students.some((s) => studentUid(s.index_number) === doc.id);
    const isStaffUid = fx.staff.some((s) => staffUid(s.email) === doc.id);
    if (!isStudentUid && !isStaffUid) {
      unknown.push(`user_doc: ${doc.id}`);
    }
  }

  // 8. Teams check (if any)
  const teamsSnap = await adminDb.collection('teams').get();
  for (const doc of teamsSnap.docs) {
    const data = doc.data();
    const isFxGroup = fx.groups.some((g) => g.group_number === data.group_number);
    if (!isFxGroup) {
      unknown.push(`team: ${doc.id} (${data.group_number})`);
    }
  }

  const ok = unknown.length === 0 && checks.every((c) => c.passed);
  const report = {
    ok,
    checks,
    unknown,
  };

  console.log(JSON.stringify(report, null, 2));
  return report;
}

const isDirectRun =
  Boolean(process.argv[1]?.endsWith('check-data.ts')) ||
  Boolean(process.argv[1]?.endsWith('check-data.js')) ||
  (typeof require !== 'undefined' && require.main === module);

if (isDirectRun) {
  checkData()
    .then((report) => {
      process.exit(report.ok ? 0 : 1);
    })
    .catch((err) => {
      console.error('Check data failed with exception:', err);
      process.exit(1);
    });
}
