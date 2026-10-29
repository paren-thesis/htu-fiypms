'use server';

// export const runtime = 'nodejs';

import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { changeStudentCourse as changeStudentCourseCore } from '@/app/actions/change-student-course';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import type {
  UserDocument,
  TeamDocument,
  AuditLogDocument,
  CourseDocument,
  AcademicYearDocument,
} from '@/types/firestore';

const VALID_ROLES = [
  'student',
  'supervisor',
  'coordinator',
  'admin',
  'panel_member',
] as const;

type ValidRole = (typeof VALID_ROLES)[number];

const updateRolesSchema = z.object({
  uid: z.string().trim().min(1, 'User UID is required'),
  roles: z
    .array(z.enum(VALID_ROLES))
    .min(1, 'At least one role must be assigned'),
});

const forceRevokeSessionSchema = z.object({
  uid: z.string().trim().min(1, 'User UID is required'),
  reason: z.string().trim().max(500).optional(),
});


const queryAuditLogsSchema = z.object({
  action: z.string().trim().optional(),
  actor: z.string().trim().optional(),
  target: z.string().trim().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  cursor: z.string().trim().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

function extractTokenAndPayload<T>(
  idTokenOrInput?: string | (T & { idToken?: string }),
  maybeInput?: T | string
): { idToken: string; rawInput: Record<string, unknown> } {
  let idToken: string | undefined;
  let rawInput: Record<string, unknown> = {};

  if (typeof idTokenOrInput === 'string') {
    idToken = idTokenOrInput;
    if (maybeInput && typeof maybeInput === 'object') {
      rawInput = { ...(maybeInput as Record<string, unknown>) };
    }
  } else if (idTokenOrInput && typeof idTokenOrInput === 'object') {
    const copy = { ...(idTokenOrInput as Record<string, unknown>) };
    if (typeof copy.idToken === 'string') {
      idToken = copy.idToken;
    }
    delete copy.idToken;
    rawInput = copy;
    if (!idToken && typeof maybeInput === 'string') {
      idToken = maybeInput;
    }
  }

  if (!idToken) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Missing authentication token');
  }

  return { idToken, rawInput };
}

export interface UpdateRolesInput {
  uid?: string;
  user_id?: string;
  userId?: string;
  roles: string[];
}

export interface UpdateRolesResult {
  ok: boolean;
  uid?: string;
  roles?: string[];
  active_role?: string;
  error?: string;
  code?: string;
}

/**
 * Admin-only Server Action: Update a user's roles.
 * Keeps users.roles, staff_whitelist.roles, and Firebase Auth custom claims consistent.
 * Enforces the last-admin guard so the last remaining admin cannot lose the 'admin' role.
 */
export async function updateRoles(
  idTokenOrInput?: string | (UpdateRolesInput & { idToken?: string }),
  maybeInput?: UpdateRolesInput | string
): Promise<UpdateRolesResult> {
  try {
    const { idToken, rawInput } = extractTokenAndPayload(idTokenOrInput, maybeInput);
    const caller = await requireUser(idToken, ['admin']);

    const normalizedInput = {
      uid: String(rawInput.uid ?? rawInput.user_id ?? rawInput.userId ?? '').trim(),
      roles: Array.isArray(rawInput.roles)
        ? Array.from(new Set(rawInput.roles.map((r) => String(r).trim())))
        : [],
    };

    const parsed = updateRolesSchema.safeParse(normalizedInput);
    if (!parsed.success) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message || 'Invalid role assignment input'
      );
    }

    const { uid, roles } = parsed.data;
    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new HttpError(404, 'USER_NOT_FOUND', `User ${uid} not found`);
    }

    const userData = userSnap.data() as UserDocument;
    const oldRoles = Array.isArray(userData.roles) ? userData.roles : [userData.role];
    const oldActiveRole = userData.active_role || userData.role;

    const hadAdmin = oldRoles.includes('admin') || userData.role === 'admin';
    const willHaveAdmin = roles.includes('admin');

    // Last-admin guard: cannot remove the last admin
    if (hadAdmin && !willHaveAdmin) {
      const adminsSnap = await adminDb
        .collection('users')
        .where('roles', 'array-contains', 'admin')
        .get();

      const otherAdminIds = adminsSnap.docs
        .map((d) => d.id)
        .filter((adminId) => adminId !== uid);

      if (otherAdminIds.length === 0) {
        throw new HttpError(
          400,
          'LAST_ADMIN_GUARD',
          'Cannot remove the admin role from the last remaining system administrator.'
        );
      }
    }

    const primaryRole: ValidRole = roles[0]!;
    const newActiveRole: ValidRole = roles.includes(oldActiveRole as ValidRole)
      ? (oldActiveRole as ValidRole)
      : primaryRole;

    // 1. Update users/{uid}
    await userRef.update({
      role: primaryRole,
      roles,
      active_role: newActiveRole,
      updated_at: FieldValue.serverTimestamp(),
    });

    // 2. Keep staff_whitelist/{email} consistent if entry exists
    if (userData.email) {
      const whitelistRef = adminDb
        .collection('staff_whitelist')
        .doc(userData.email.toLowerCase().trim());
      const whitelistSnap = await whitelistRef.get();
      if (whitelistSnap.exists) {
        await whitelistRef.update({
          roles,
        });
      }
    }

    // 3. Keep Firebase Auth custom claims consistent
    try {
      const authUser = await adminAuth.getUser(uid);
      const existingClaims = authUser.customClaims || {};
      await adminAuth.setCustomUserClaims(uid, {
        ...existingClaims,
        roles,
        activeRole: newActiveRole,
        registered: userData.profile?.registered ?? true,
        profileComplete: userData.profile?.profile_complete ?? true,
      });
    } catch {
      // Tolerate when Firestore user doc has no Auth emulator record yet
    }

    // 4. Write audit log
    await writeAudit({
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: 'admin',
      },
      action: 'user.roles_updated',
      target_type: 'user',
      target_id: uid,
      description: `Updated roles for ${userData.email || uid}: [${oldRoles.join(', ')}] -> [${roles.join(', ')}]`,
      metadata: {
        target_email: userData.email,
        old: {
          roles: oldRoles,
          active_role: oldActiveRole,
        },
        new: {
          roles,
          active_role: newActiveRole,
        },
      },
    });

    return {
      ok: true,
      uid,
      roles,
      active_role: newActiveRole,
    };
  } catch (error) {
    const actionErr = toActionError(error);
    return {
      ok: false,
      error: actionErr.error,
      code: actionErr.code,
    };
  }
}

export interface ForceRevokeSessionInput {
  uid?: string;
  user_id?: string;
  userId?: string;
  reason?: string;
}

export interface ForceRevokeSessionResult {
  ok: boolean;
  uid?: string;
  revoked?: boolean;
  error?: string;
  code?: string;
}

/**
 * Admin-only Server Action: Force revoke a user's Firebase Auth refresh tokens.
 */
export async function forceRevokeSession(
  idTokenOrInput?: string | (ForceRevokeSessionInput & { idToken?: string }),
  maybeInput?: ForceRevokeSessionInput | string
): Promise<ForceRevokeSessionResult> {
  try {
    const { idToken, rawInput } = extractTokenAndPayload(idTokenOrInput, maybeInput);
    const caller = await requireUser(idToken, ['admin']);

    const normalizedInput = {
      uid: String(rawInput.uid ?? rawInput.user_id ?? rawInput.userId ?? '').trim(),
      reason:
        typeof rawInput.reason === 'string' && rawInput.reason.trim().length > 0
          ? rawInput.reason.trim()
          : undefined,
    };

    const parsed = forceRevokeSessionSchema.safeParse(normalizedInput);
    if (!parsed.success) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message || 'Invalid session revocation input'
      );
    }

    const { uid, reason } = parsed.data;
    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new HttpError(404, 'USER_NOT_FOUND', `User ${uid} not found`);
    }

    const userData = userSnap.data() as UserDocument;

    await adminAuth.revokeRefreshTokens(uid);

    await writeAudit({
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: 'admin',
      },
      action: 'user.session_revoked',
      target_type: 'user',
      target_id: uid,
      description: `Force revoked refresh tokens for ${userData.email || uid}`,
      metadata: {
        target_email: userData.email,
        reason: reason || 'Administrative session revocation',
      },
    });

    return {
      ok: true,
      uid,
      revoked: true,
    };
  } catch (error) {
    const actionErr = toActionError(error);
    return {
      ok: false,
      error: actionErr.error,
      code: actionErr.code,
    };
  }
}

export interface ChangeStudentCourseInput {
  uid?: string;
  user_id?: string;
  student_uid?: string;
  userId?: string;
  new_course_id?: string;
  course_id?: string;
  courseId?: string;
  justification?: string;
  reason?: string;
  academic_year_id?: string;
}

export interface ChangeStudentCourseResult {
  ok: boolean;
  uid?: string;
  old_course_id?: string;
  new_course_id?: string;
  error?: string;
  code?: string;
}

/**
 * Admin-only Server Action: Change a student's allocated course_id (Spec FR-01.10).
 * Requires written justification, verifies the student does NOT belong to any active team,
 * updates both users/{uid}.profile.course_id and the corresponding roster entry, and writes audit_logs.
 */
export async function changeStudentCourse(
  idTokenOrInput?: string | (ChangeStudentCourseInput & { idToken?: string }),
  maybeInput?: ChangeStudentCourseInput | string
): Promise<ChangeStudentCourseResult> {
  try {
    const { idToken, rawInput } = extractTokenAndPayload(idTokenOrInput, maybeInput);
    const res = await changeStudentCourseCore(idToken, {
      uid: String(rawInput.uid ?? rawInput.user_id ?? rawInput.student_uid ?? rawInput.userId ?? '').trim() || undefined,
      new_course_id: String(rawInput.new_course_id ?? rawInput.course_id ?? rawInput.courseId ?? '').toLowerCase().trim() || undefined,
      justification: String(rawInput.justification ?? rawInput.reason ?? '').trim(),
      academic_year_id: typeof rawInput.academic_year_id === 'string' ? rawInput.academic_year_id.trim() : undefined,
    });

    return {
      ok: true,
      uid: res.uid,
      old_course_id: res.old_course_id,
      new_course_id: res.new_course_id,
    };
  } catch (error) {
    const actionErr = toActionError(error);
    return {
      ok: false,
      error: actionErr.error,
      code: actionErr.code,
    };
  }
}

export interface SerializedAdminUser {
  uid: string;
  name: string;
  email: string;
  role: string;
  roles: string[];
  active_role: string;
  index_number?: string;
  staff_id?: string;
  course_id?: string;
  programmes?: string[];
  registered: boolean;
  profile_complete: boolean;
  active_team_id?: string;
  active_team_group?: string;
  created_at: string;
}

export interface SerializedAdminTeam {
  id: string;
  name: string;
  group_number: string;
  course_id: string;
  academic_year_id: string;
  leader_id: string;
  member_ids: string[];
  member_count: number;
  max_members: number;
  status: TeamDocument['status'];
  assigned_supervisor_id?: string;
}

export interface ListAdminDirectoryResult {
  ok: boolean;
  users?: SerializedAdminUser[];
  teams?: SerializedAdminTeam[];
  courses?: Array<{ id: string; code: string; name: string }>;
  academicYears?: Array<{ id: string; code: string }>;
  error?: string;
  code?: string;
}

/**
 * Admin-only Server Action: Fetch directory of users, teams, courses, and academic years for /admin/users.
 */
export async function listAdminDirectory(
  idToken: string
): Promise<ListAdminDirectoryResult> {
  try {
    if (!idToken) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Missing authentication token');
    }
    await requireUser(idToken, ['admin']);

    const [usersSnap, teamsSnap, coursesSnap, yearsSnap] = await Promise.all([
      adminDb.collection('users').get(),
      adminDb.collection('teams').get(),
      adminDb.collection('courses').get(),
      adminDb.collection('academic_years').get(),
    ]);

    const rawTeams: TeamDocument[] = teamsSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<TeamDocument, 'id'>),
    }));

    // Map student UID -> active team
    const activeTeamByMember = new Map<string, { id: string; group_number: string }>();
    for (const t of rawTeams) {
      if (t.status !== 'disbanded' && Array.isArray(t.member_ids)) {
        for (const mId of t.member_ids) {
          activeTeamByMember.set(mId, { id: t.id, group_number: t.group_number });
        }
      }
    }

    const users: SerializedAdminUser[] = usersSnap.docs
      .map((d) => {
        const u = d.data() as UserDocument;
        const activeTeam = activeTeamByMember.get(d.id);
        return {
          uid: d.id,
          name: u.name || d.id,
          email: u.email || '',
          role: u.role || 'student',
          roles: Array.isArray(u.roles) ? u.roles : [u.role || 'student'],
          active_role: u.active_role || u.role || 'student',
          index_number: u.profile?.index_number,
          staff_id: u.profile?.staff_id,
          course_id: u.profile?.course_id,
          programmes: u.profile?.programmes,
          registered: Boolean(u.profile?.registered),
          profile_complete: Boolean(u.profile?.profile_complete),
          active_team_id: activeTeam?.id,
          active_team_group: activeTeam?.group_number,
          created_at: u.created_at?.toDate?.()
            ? u.created_at.toDate().toISOString()
            : new Date().toISOString(),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const teams: SerializedAdminTeam[] = rawTeams
      .map((t) => ({
        id: t.id,
        name: t.name,
        group_number: t.group_number,
        course_id: t.course_id,
        academic_year_id: t.academic_year_id,
        leader_id: t.leader_id,
        member_ids: Array.isArray(t.member_ids) ? t.member_ids : [],
        member_count: t.member_count ?? 0,
        max_members: t.max_members ?? 5,
        status: t.status,
        assigned_supervisor_id: t.assigned_supervisor_id,
      }))
      .sort((a, b) => a.group_number.localeCompare(b.group_number));

    const courses = coursesSnap.docs
      .map((d) => {
        const c = d.data() as CourseDocument;
        return {
          id: d.id,
          code: c.code || d.id.toUpperCase(),
          name: c.name || d.id,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));

    const academicYears = yearsSnap.docs
      .map((d) => {
        const y = d.data() as AcademicYearDocument;
        return {
          id: d.id,
          code: y.code || d.id,
        };
      })
      .sort((a, b) => b.id.localeCompare(a.id));

    return {
      ok: true,
      users,
      teams,
      courses,
      academicYears,
    };
  } catch (error) {
    const actionErr = toActionError(error);
    return {
      ok: false,
      error: actionErr.error,
      code: actionErr.code,
    };
  }
}

export interface SerializedAuditLog {
  id: string;
  actor_id: string;
  actor_name: string;
  actor_email: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string;
  description: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  timestamp: string;
}

export interface QueryAuditLogsInput {
  action?: string;
  actor?: string;
  target?: string;
  startDate?: string;
  endDate?: string;
  cursor?: string;
  limit?: number;
}

export interface QueryAuditLogsResult {
  ok: boolean;
  items?: SerializedAuditLog[];
  nextCursor?: string | null;
  hasMore?: boolean;
  availableActions?: string[];
  error?: string;
  code?: string;
}

/**
 * Coordinator / Admin Server Action: Query audit_logs with filters and cursor pagination.
 */
export async function queryAuditLogs(
  idTokenOrInput?: string | (QueryAuditLogsInput & { idToken?: string }),
  maybeInput?: QueryAuditLogsInput | string
): Promise<QueryAuditLogsResult> {
  try {
    const { idToken, rawInput } = extractTokenAndPayload(idTokenOrInput, maybeInput);
    await requireUser(idToken, ['coordinator', 'admin']);

    const parsed = queryAuditLogsSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message || 'Invalid audit log filter parameters'
      );
    }

    const {
      action,
      actor,
      target,
      startDate,
      endDate,
      cursor,
      limit = 20,
    } = parsed.data;

    let ref: FirebaseFirestore.Query = adminDb
      .collection('audit_logs')
      .orderBy('timestamp', 'desc');

    if (action && action !== 'all') {
      ref = ref.where('action', '==', action);
    }

    const snap = await ref.limit(500).get();
    const rawLogs: AuditLogDocument[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<AuditLogDocument, 'id'>),
    }));

    const availableActionsSet = new Set<string>();
    for (const log of rawLogs) {
      if (log.action) availableActionsSet.add(log.action);
    }

    const actorNeedle = actor?.toLowerCase().trim() || '';
    const targetNeedle = target?.toLowerCase().trim() || '';
    const startMs = startDate ? new Date(`${startDate}T00:00:00.000Z`).getTime() : null;
    const endMs = endDate ? new Date(`${endDate}T23:59:59.999Z`).getTime() : null;

    const filtered = rawLogs.filter((log) => {
      if (actorNeedle) {
        const hay = `${log.actor_id || ''} ${log.actor_name || ''} ${log.actor_email || ''} ${log.actor_role || ''}`.toLowerCase();
        if (!hay.includes(actorNeedle)) return false;
      }
      if (targetNeedle) {
        const hay = `${log.target_type || ''} ${log.target_id || ''} ${log.description || ''}`.toLowerCase();
        if (!hay.includes(targetNeedle)) return false;
      }
      const tsMs = log.timestamp?.toMillis?.() ?? 0;
      if (startMs && !isNaN(startMs) && tsMs < startMs) return false;
      if (endMs && !isNaN(endMs) && tsMs > endMs) return false;
      return true;
    });

    let startIndex = 0;
    if (cursor) {
      const idx = filtered.findIndex((item) => item.id === cursor);
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }

    const pageItems = filtered.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < filtered.length;
    const nextCursor =
      hasMore && pageItems.length > 0
        ? pageItems[pageItems.length - 1]!.id
        : null;

    const serialized: SerializedAuditLog[] = pageItems.map((log) => ({
      id: log.id,
      actor_id: log.actor_id,
      actor_name: log.actor_name,
      actor_email: log.actor_email,
      actor_role: log.actor_role,
      action: log.action,
      target_type: log.target_type,
      target_id: log.target_id,
      description: log.description,
      metadata: log.metadata
        ? (JSON.parse(JSON.stringify(log.metadata)) as Record<string, unknown>)
        : undefined,
      ip_address: log.ip_address,
      timestamp: log.timestamp?.toDate?.()
        ? log.timestamp.toDate().toISOString()
        : new Date().toISOString(),
    }));

    return {
      ok: true,
      items: serialized,
      nextCursor,
      hasMore,
      availableActions: Array.from(availableActionsSet).sort(),
    };
  } catch (error) {
    const actionErr = toActionError(error);
    return {
      ok: false,
      error: actionErr.error,
      code: actionErr.code,
    };
  }
}

