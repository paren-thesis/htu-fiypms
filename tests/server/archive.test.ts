import { describe, it, expect, beforeAll } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { publishGrades } from '@/app/actions/publish-grades';
import { archiveProjects, searchArchivedProjects } from '@/app/actions/archive-projects';
import { upsertAcademicYear } from '@/lib/models/academic-year/repo';
import { listApprovedHistoricalTopics } from '@/lib/models/topic/repo';
import { findSimilarTopics } from '@/lib/topics/similar';
import type {
  UserDocument,
  TeamDocument,
  TopicDocument,
  SoftwareDeliverableDocument,
  ArchivedProjectDocument,
} from '@/types/firestore';
import { fx, studentEmail, studentUid, staffUid } from '../../fixtures';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9199';
const YEAR_ID = '2024-2025';

async function createStudentToken(indexNumber: string): Promise<string> {
  const s = fx.student(indexNumber);
  const uid = studentUid(s.index_number);
  const email = studentEmail(s.index_number);

  try {
    const existing = await adminAuth.getUserByEmail(email);
    await adminAuth.deleteUser(existing.uid);
  } catch {
    // Ignore
  }

  await adminAuth.createUser({
    uid,
    email,
    displayName: s.full_name,
    emailVerified: true,
  });

  await adminAuth.setCustomUserClaims(uid, {
    roles: ['student'],
    activeRole: 'student',
    registered: true,
    profileComplete: true,
  });

  const userDoc: UserDocument = {
    uid,
    name: s.full_name,
    email,
    role: 'student',
    roles: ['student'],
    active_role: 'student',
    profile: {
      index_number: s.index_number,
      course_id: s.course_id,
      registered: true,
      profile_complete: true,
    },
    created_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  };
  await adminDb.collection('users').doc(uid).set(userDoc);

  const customToken = await adminAuth.createCustomToken(uid);
  const response = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=test-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );

  const data = (await response.json()) as { idToken: string };
  return data.idToken;
}

async function createStaffToken(email: string, activeRole = 'coordinator'): Promise<string> {
  const staff = fx.staffByEmail(email);
  const uid = staffUid(staff.email);

  try {
    const existing = await adminAuth.getUserByEmail(email);
    await adminAuth.deleteUser(existing.uid);
  } catch {
    // Ignore
  }

  await adminAuth.createUser({
    uid,
    email,
    displayName: staff.full_name,
    emailVerified: true,
  });

  await adminAuth.setCustomUserClaims(uid, {
    roles: staff.roles,
    activeRole,
    registered: true,
    profileComplete: true,
  });

  const userDoc: UserDocument = {
    uid,
    name: staff.full_name,
    email: staff.email.toLowerCase(),
    role: (staff.roles[0] as UserDocument['role']) || 'coordinator',
    roles: staff.roles as UserDocument['roles'],
    active_role: activeRole as UserDocument['active_role'],
    profile: {
      registered: true,
      profile_complete: true,
      staff_id: 'STAFF-ARC-01',
      programmes: staff.programmes,
    },
    created_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  };
  await adminDb.collection('users').doc(uid).set(userDoc);

  const customToken = await adminAuth.createCustomToken(uid);
  const response = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=test-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );

  const data = (await response.json()) as { idToken: string };
  return data.idToken;
}

describe('Project Archive & Searchable Repository (FR-11.1, FR-11.2, FR-11.3, A5)', () => {
  let coordinatorToken: string;
  let supervisorToken: string;
  let studentToken: string;

  const student1 = fx.students[0]!;
  const student2 = fx.students[1]!;
  const teamAId = 'team-archive-test-a';
  const teamBId = 'team-archive-test-b';
  const topicAId = 'topic-archive-test-a';
  const topicBId = 'topic-archive-test-b';

  beforeAll(async () => {
    await upsertAcademicYear({
      id: YEAR_ID,
      code: '2024/2025',
      semester: 2,
      is_active: false,
      deadlines: {
        roster_import_deadline: new Date('2024-11-01'),
        team_formation_deadline: new Date('2024-11-15'),
        topic_submission_deadline: new Date('2024-11-30'),
        chapters_deadline: new Date('2025-04-01'),
        defense_start_date: new Date('2025-05-01'),
        defense_end_date: new Date('2025-05-15'),
      },
    });

    await adminDb.collection('academic_years').doc(YEAR_ID).update({
      grades_published: false,
    });

    coordinatorToken = await createStaffToken('coordinator@htu.edu.gh', 'coordinator');
    supervisorToken = await createStaffToken('kappiah@htu.edu.gh', 'supervisor');
    studentToken = await createStudentToken(student1.index_number);
    await createStudentToken(student2.index_number);

    const uid1 = studentUid(student1.index_number);
    const uid2 = studentUid(student2.index_number);

    // Seed Approved Topics
    const topicA: TopicDocument = {
      id: topicAId,
      team_id: teamAId,
      title: 'Solar Microgrid Telemetry and Predictive Fault Detection',
      abstract:
        'An edge-computing telemetry framework monitoring photovoltaic inverter voltage and predicting battery degradation.',
      problem_statement: 'Rural microgrids fail unexpectedly without remote diagnostics.',
      proposed_solution: 'Edge telemetry with LoRaWAN and TensorFlow Lite.',
      tech_stack: ['TensorFlow', 'LoRaWAN', 'FastAPI'],
      preference_rank: 1,
      version: 1,
      is_current: true,
      status: 'approved',
      submitted_at: Timestamp.now(),
      reviewed_at: Timestamp.now(),
    };

    const topicB: TopicDocument = {
      id: topicBId,
      team_id: teamBId,
      title: 'Decentralized Academic Transcript Verification Portal',
      abstract:
        'Tamper-evident digital credential verification for university registrars and employers.',
      problem_statement: 'Manual transcript verification takes weeks.',
      proposed_solution: 'Smart contract verification registry.',
      tech_stack: ['Solidity', 'Next.js', 'PostgreSQL'],
      preference_rank: 1,
      version: 1,
      is_current: true,
      status: 'approved',
      submitted_at: Timestamp.now(),
      reviewed_at: Timestamp.now(),
    };

    await adminDb.collection('topics').doc(topicAId).set(topicA);
    await adminDb.collection('topics').doc(topicBId).set(topicB);

    // Seed Signed-off Software Deliverables
    const delivA: SoftwareDeliverableDocument = {
      team_id: teamAId,
      github_repository_url: 'https://github.com/htu-caps/solar-microgrid',
      google_drive_url: 'https://drive.google.com/file/d/solar-manuscript-123/view',
      environment_setup_notes: 'Run docker compose up',
      submitted_by_user_id: uid1,
      approved_by_supervisor_at: Timestamp.now(),
      supervisor_signoff_notes: 'Verified hardware and repository.',
      submitted_at: Timestamp.now(),
    };

    const delivB: SoftwareDeliverableDocument = {
      team_id: teamBId,
      github_repository_url: 'https://github.com/htu-caps/transcript-verify',
      google_drive_url: 'https://drive.google.com/file/d/transcript-manuscript-456/view',
      environment_setup_notes: 'npm install && npm run build',
      submitted_by_user_id: uid2,
      approved_by_supervisor_at: Timestamp.now(),
      supervisor_signoff_notes: 'Approved.',
      submitted_at: Timestamp.now(),
    };

    await adminDb.collection('software_deliverables').doc(teamAId).set(delivA);
    await adminDb.collection('software_deliverables').doc(teamBId).set(delivB);

    // Seed Teams ready for grade publication
    const teamA: TeamDocument = {
      id: teamAId,
      name: 'SolarGrid Team',
      group_number: 'BCS25_01',
      course_id: 'btech-cs',
      academic_year_id: YEAR_ID,
      leader_id: uid1,
      member_ids: [uid1],
      member_count: 1,
      max_members: 5,
      status: 'defense_ready',
      approved_topic_id: topicAId,
      scores_summary: {
        supervisor_score: 88,
        panel_average_score: 84,
        composite_final_score: 85.6,
        is_locked: false,
      },
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };

    const teamB: TeamDocument = {
      id: teamBId,
      name: 'ChainVerify Team',
      group_number: 'BICT25_01',
      course_id: 'btech-ict',
      academic_year_id: YEAR_ID,
      leader_id: uid2,
      member_ids: [uid2],
      member_count: 1,
      max_members: 5,
      status: 'defense_ready',
      approved_topic_id: topicBId,
      scores_summary: {
        supervisor_score: 82,
        panel_average_score: 80,
        composite_final_score: 80.8,
        is_locked: false,
      },
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };

    await adminDb.collection('teams').doc(teamAId).set(teamA);
    await adminDb.collection('teams').doc(teamBId).set(teamB);
  });

  it('publishing grades creates one archive record per completed team and re-running creates no duplicates', async () => {
    const pubRes = await publishGrades(coordinatorToken, {
      academic_year_id: YEAR_ID,
    });
    expect(pubRes.ok).toBe(true);

    const snap1 = await adminDb
      .collection('archived_projects')
      .where('academic_year_id', '==', YEAR_ID)
      .get();

    expect(snap1.size).toBe(2);

    const docA = snap1.docs.find((d) => d.id === teamAId)?.data() as ArchivedProjectDocument;
    expect(docA).toBeDefined();
    expect(docA.title).toBe('Solar Microgrid Telemetry and Predictive Fault Detection');
    expect(docA.github_repository_url).toBe('https://github.com/htu-caps/solar-microgrid');
    expect(docA.manuscript_url).toBe(
      'https://drive.google.com/file/d/solar-manuscript-123/view'
    );
    expect(docA.keywords).toContain('tensorflow');
    expect(docA.search_tokens).toContain('lorawan');

    const firstCreatedAtMillis = docA.created_at.toMillis();

    // Re-run publishGrades and backfill action archiveProjects
    const pubRes2 = await publishGrades(coordinatorToken, {
      academic_year_id: YEAR_ID,
    });
    expect(pubRes2.ok).toBe(true);

    const backfillRes = await archiveProjects(coordinatorToken, {
      academic_year_id: YEAR_ID,
    });
    expect(backfillRes.ok).toBe(true);
    expect(backfillRes.archived_count).toBe(2);

    const snap2 = await adminDb
      .collection('archived_projects')
      .where('academic_year_id', '==', YEAR_ID)
      .get();

    // Still strictly 2 records (no duplicates) and original created_at preserved
    expect(snap2.size).toBe(2);
    const docAAfter = snap2.docs.find((d) => d.id === teamAId)?.data() as ArchivedProjectDocument;
    expect(docAAfter.created_at.toMillis()).toBe(firstCreatedAtMillis);
  });

  it('restricts archiveProjects backfill action to coordinator and admin only', async () => {
    const studentRes = await archiveProjects(studentToken, {
      academic_year_id: YEAR_ID,
    });
    expect(studentRes.ok).toBe(false);
    expect(studentRes.code).toBe('FORBIDDEN_ROLE');

    const supRes = await archiveProjects(supervisorToken, {
      academic_year_id: YEAR_ID,
    });
    expect(supRes.ok).toBe(false);
    expect(supRes.code).toBe('FORBIDDEN_ROLE');
  });

  it('finds a past project by a keyword from its tech stack and supports programme/year filters & pagination', async () => {
    // Search by tech_stack keyword "LoRaWAN" (case-insensitive)
    const searchRes = await searchArchivedProjects(studentToken, {
      query: 'LoRaWAN',
    });
    expect(searchRes.ok).toBe(true);
    expect(searchRes.items?.length).toBeGreaterThanOrEqual(1);
    expect(searchRes.items?.some((item) => item.id === teamAId)).toBe(true);
    expect(searchRes.items?.some((item) => item.id === teamBId)).toBe(false);

    // Search by tech_stack keyword "Solidity" with course filter
    const solidityRes = await searchArchivedProjects(studentToken, {
      query: 'Solidity',
      course_id: 'btech-ict',
      academic_year_id: YEAR_ID,
    });
    expect(solidityRes.ok).toBe(true);
    expect(solidityRes.items?.length).toBe(1);
    expect(solidityRes.items?.[0]?.id).toBe(teamBId);

    // Cursor pagination check (limit = 1)
    const page1 = await searchArchivedProjects(studentToken, {
      academic_year_id: YEAR_ID,
      limit: 1,
    });
    expect(page1.ok).toBe(true);
    expect(page1.items?.length).toBe(1);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await searchArchivedProjects(studentToken, {
      academic_year_id: YEAR_ID,
      limit: 1,
      cursor: page1.nextCursor!,
    });
    expect(page2.ok).toBe(true);
    expect(page2.items?.length).toBe(1);
    expect(page2.items?.[0]?.id).not.toBe(page1.items?.[0]?.id);
  });

  it('extends topic similarity detection to compare against archived_projects', async () => {
    // Seed an archived project directly that is NOT in the topics collection
    await adminDb.collection('archived_projects').doc('legacy-archived-only-1').set({
      id: 'legacy-archived-only-1',
      title: 'Automated Cocoa Pod Disease Classification with Convolutional Neural Networks',
      abstract: 'Deep learning mobile detector for cocoa swollen shoot virus.',
      keywords: ['pytorch', 'flutter', 'cocoa', 'disease', 'classification', 'convolutional'],
      search_tokens: [
        'automated',
        'cocoa',
        'pod',
        'disease',
        'classification',
        'convolutional',
        'neural',
        'networks',
        'pytorch',
        'flutter',
      ],
      academic_year_id: '2023-2024',
      course_id: 'btech-cs',
      group_number: 'BCS24_09',
      created_at: Timestamp.now(),
    });

    const historical = await listApprovedHistoricalTopics('2026-2027', 300);
    const warnings = findSimilarTopics(
      {
        title: 'Cocoa Pod Disease Classification using Convolutional Neural Networks',
        tech_stack: ['PyTorch', 'Flutter'],
      },
      historical,
      0.6
    );

    expect(warnings.some((w) => w.topic_id === 'legacy-archived-only-1')).toBe(true);
  });
});

