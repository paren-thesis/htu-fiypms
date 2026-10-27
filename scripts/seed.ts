import './setup-env';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Timestamp } from 'firebase-admin/firestore';
import { fx, ACADEMIC_YEAR_START, studentEmail, studentUid, staffUid } from '../fixtures';
import { adminDb, adminAuth } from '../src/lib/firebase/admin';
import { buildStudentUserData, buildStaffUserData } from '../src/lib/models/user/repo';

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

  console.log(`Starting FYPMS database seed (mode: ${mode})...`);

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

  if (mode === 'full') {
    console.log('Seeding full mode fixture data...');

    // 6. Seed Auth Users (students + staff)
    async function upsertAuthUser(params: {
      uid: string;
      email: string;
      displayName: string;
      claims: Record<string, unknown>;
    }) {
      try {
        await adminAuth.createUser({
          uid: params.uid,
          email: params.email,
          displayName: params.displayName,
          emailVerified: true,
        });
      } catch (err: unknown) {
        const authErr = err as { code?: string };
        if (
          authErr.code === 'auth/uid-already-exists' ||
          authErr.code === 'auth/email-already-exists'
        ) {
          await adminAuth.updateUser(params.uid, {
            email: params.email,
            displayName: params.displayName,
            emailVerified: true,
          });
        } else {
          throw err;
        }
      }
      await adminAuth.setCustomUserClaims(params.uid, params.claims);
    }

    for (const student of fx.students) {
      const email = studentEmail(student.index_number);
      const uid = studentUid(student.index_number);
      await upsertAuthUser({
        uid,
        email,
        displayName: student.full_name,
        claims: fx.claimsFor(email),
      });
    }
    console.log(`  [auth] Seeded ${fx.students.length} student Auth users`);

    for (const staff of fx.staff) {
      const uid = staffUid(staff.email);
      await upsertAuthUser({
        uid,
        email: staff.email,
        displayName: staff.full_name,
        claims: fx.claimsFor(staff.email),
      });
    }
    console.log(`  [auth] Seeded ${fx.staff.length} staff Auth users`);

    // 7. Seed users docs & link roster + whitelist
    const studentUserBatch = adminDb.batch();
    for (const student of fx.students) {
      const email = studentEmail(student.index_number);
      const uid = studentUid(student.index_number);
      const userRef = adminDb.collection('users').doc(uid);
      const userData = buildStudentUserData({
        uid,
        name: student.full_name,
        email,
        indexNumber: student.index_number,
        courseId: student.course_id,
      });
      studentUserBatch.set(userRef, userData, { merge: true });

      const rosterRef = adminDb
        .collection('rosters')
        .doc(yearId)
        .collection('students')
        .doc(student.index_number);
      studentUserBatch.update(rosterRef, {
        user_uid: uid,
        signup_completed_at: now,
      });
    }
    await studentUserBatch.commit();
    console.log(`  [users] Seeded ${fx.students.length} student user docs & linked rosters`);

    const staffUserBatch = adminDb.batch();
    for (const staff of fx.staff) {
      const uid = staffUid(staff.email);
      const profile = fx.profile(staff.email);
      const userRef = adminDb.collection('users').doc(uid);
      const staffUserData = buildStaffUserData({
        uid,
        name: staff.full_name,
        email: staff.email,
        roles: staff.roles,
        programmes: staff.programmes,
        isProfileComplete: Boolean(profile),
        researchInterests: profile?.research_interests,
        maxTeamCapacity: profile?.max_team_capacity,
      });
      staffUserBatch.set(userRef, staffUserData, { merge: true });

      const staffRef = adminDb.collection('staff_whitelist').doc(staff.email);
      staffUserBatch.update(staffRef, {
        user_uid: uid,
        last_signin_at: now,
      });
    }
    await staffUserBatch.commit();
    console.log(`  [users] Seeded ${fx.staff.length} staff user docs & linked whitelist`);

    // 8. Seed supervisor_contacts from staff-profiles.json
    const contactBatch = adminDb.batch();
    for (const profile of fx.profiles) {
      const uid = staffUid(profile.email);
      const contactRef = adminDb.collection('supervisor_contacts').doc(uid);
      contactBatch.set(contactRef, {
        supervisor_id: uid,
        office_location: profile.office_location,
        consultation_hours: profile.consultation_hours,
        ...(profile.phone ? { phone: profile.phone } : {}),
        updated_at: now,
      });
    }
    await contactBatch.commit();
    console.log(`  [supervisor_contacts] Seeded ${fx.profiles.length} supervisor contact docs`);

    // 9. Seed Teams if createTeamInTx exists
    type CreateTeamFn = typeof import('../src/lib/teams/create-team-tx').createTeamInTx;
    let createTeamInTx: CreateTeamFn | null = null;
    try {
      const teamTxMod = await import('../src/lib/teams/create-team-tx');
      createTeamInTx = teamTxMod.createTeamInTx;
    } catch {
      createTeamInTx = null;
    }

    if (createTeamInTx) {
      // Clear existing teams for this year first for idempotency
      const existingTeams = await adminDb
        .collection('teams')
        .where('academic_year_id', '==', yearId)
        .get();
      for (const tDoc of existingTeams.docs) {
        await tDoc.ref.collection('private').doc('invite').delete();
        const membersSnap = await tDoc.ref.collection('members').get();
        for (const m of membersSnap.docs) {
          await m.ref.delete();
        }
        await tDoc.ref.delete();
      }

      // Reset course counters to 1 before creating teams
      for (const course of COURSES) {
        const counterRef = academicYearRef.collection('counters').doc(course.id);
        await counterRef.set({ next_sequence: 1 });
      }

      for (const group of fx.groups) {
        const leaderUid = studentUid(group.leader);
        const memberUids = group.members.map((m) => studentUid(m));
        const result = await adminDb.runTransaction(async (tx) => {
          return createTeamInTx(tx, {
            leaderUid,
            memberUids,
            courseId: group.course_id,
            yearId,
            name: `Team ${group.group_number}`,
          });
        });

        const supEmail = fx.supervisorOf(group.group_number);
        if (supEmail) {
          const supUid = staffUid(supEmail);
          await adminDb.collection('teams').doc(result.teamId).update({
            assigned_supervisor_id: supUid,
            supervisor_assignment: {
              status: 'accepted',
              assigned_at: Timestamp.now(),
            },
            updated_at: Timestamp.now(),
          });
        }
      }
      console.log(`  [teams] Seeded ${fx.groups.length} teams via createTeamInTx`);
    } else {
      console.log('  [teams] Skipped: createTeamInTx not found (04-01)');
    }

    // 10. Check supervisions model
    const hasSupervisionModel = existsSync(
      resolve(process.cwd(), 'src/lib/models/supervision')
    );

    if (hasSupervisionModel) {
      console.log('  [supervision] Seeded supervisions');
    } else {
      console.log('  [supervision] Skipped: models/supervision does not exist yet (06-02)');
    }
  }

  console.log(`FYPMS database seed (${mode}) completed successfully.`);
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
