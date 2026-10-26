import { describe, it, expect } from 'vitest';
import { adminDb } from '@/lib/firebase/admin';
import { getCourse, listCourses, upsertCourse } from '@/lib/models/course/repo';
import {
  getCurrentAcademicYear,
  getAcademicYear,
  upsertAcademicYear,
  initCounter,
  incrementCounterInTx,
  getCounter,
} from '@/lib/models/academic-year/repo';
import { runSeed } from '../../scripts/seed';

describe('Server Models: Course & Academic Year', () => {
  it('upserts and retrieves courses', async () => {
    const course = await upsertCourse({
      id: 'btech-cs',
      code: 'BTECH-CS',
      name: 'BTech Computer Science',
      department: 'Computer Science',
    });

    expect(course.id).toBe('btech-cs');

    const fetched = await getCourse('btech-cs');
    expect(fetched).not.toBeNull();
    expect(fetched?.code).toBe('BTECH-CS');
  });

  it('upserts and retrieves academic year and active year', async () => {
    const startYear = 2026;
    const yearId = `${startYear}-${startYear + 1}`;
    const code = `${startYear}/${startYear + 1}`;

    const year = await upsertAcademicYear({
      id: yearId,
      code,
      semester: 1,
      is_active: true,
      deadlines: {
        roster_import_deadline: new Date(2026, 9, 15),
        team_formation_deadline: new Date(2026, 10, 1),
        topic_submission_deadline: new Date(2026, 10, 15),
        chapters_deadline: new Date(2027, 3, 30),
        defense_start_date: new Date(2027, 5, 1),
        defense_end_date: new Date(2027, 5, 15),
      },
    });

    expect(year.id).toBe(yearId);
    expect(year.grades_published).toBe(false);

    const activeYear = await getCurrentAcademicYear();
    expect(activeYear).not.toBeNull();
    expect(activeYear?.id).toBe(yearId);

    const byId = await getAcademicYear(yearId);
    expect(byId?.code).toBe(code);
  });

  it('manages course sequence counters and increments in transaction', async () => {
    const yearId = '2026-2027';
    const courseId = 'btech-cs';

    await initCounter(yearId, courseId, 1);
    const counter = await getCounter(yearId, courseId);
    expect(counter?.next_sequence).toBe(1);

    // Increment in transaction
    let seq1 = 0;
    await adminDb.runTransaction(async (tx) => {
      seq1 = await incrementCounterInTx(tx, yearId, courseId);
    });
    expect(seq1).toBe(1);

    let seq2 = 0;
    await adminDb.runTransaction(async (tx) => {
      seq2 = await incrementCounterInTx(tx, yearId, courseId);
    });
    expect(seq2).toBe(2);

    const updatedCounter = await getCounter(yearId, courseId);
    expect(updatedCounter?.next_sequence).toBe(3);
  });
});

describe('Database Seed Script: Idempotency & Safety', () => {
  it('refuses to run when not in emulator and without --prod override', async () => {
    const originalHost = process.env.FIRESTORE_EMULATOR_HOST;
    try {
      delete process.env.FIRESTORE_EMULATOR_HOST;
      await expect(runSeed({ isProdOverride: false })).rejects.toThrowError(
        /missing --prod flag/
      );
    } finally {
      process.env.FIRESTORE_EMULATOR_HOST = originalHost;
    }
  });

  it('running seed twice leaves exactly 4 courses, 1 current academic year and 1 coordinator entry', async () => {
    // Run seed first time
    await runSeed();

    // Run seed second time (idempotent)
    await runSeed();

    const courses = await listCourses();
    expect(courses.length).toBe(4);
    expect(courses.map((c) => c.id).sort()).toEqual([
      'btech-cs',
      'btech-ict',
      'hnd-cs',
      'hnd-ict',
    ]);

    const academicYearsSnap = await adminDb
      .collection('academic_years')
      .where('is_active', '==', true)
      .get();
    expect(academicYearsSnap.docs.length).toBe(1);

    const staffSnap = await adminDb
      .collection('staff_whitelist')
      .where('email', '==', 'coordinator@htu.edu.gh')
      .get();
    const firstStaffDoc = staffSnap.docs[0];
    expect(firstStaffDoc).toBeDefined();
    const staffData = firstStaffDoc!.data();
    expect(staffData.roles).toEqual(['coordinator', 'admin']);
    expect(staffData.is_active).toBe(true);
  });
});
