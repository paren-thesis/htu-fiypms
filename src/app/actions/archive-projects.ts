'use server';

export const runtime = 'nodejs';

import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { archiveCompletedTeams } from '@/lib/archive/archive-teams';
import {
  archiveProjectsInputSchema,
  searchArchivedProjectsInputSchema,
  type ArchiveProjectsInput,
  type SearchArchivedProjectsInput,
} from '@/lib/models/archived-project/schema';
import { listArchivedProjects } from '@/lib/models/archived-project/repo';
import type { CourseDocument, AcademicYearDocument } from '@/types/firestore';

export interface SerializedArchivedProject {
  id: string;
  title: string;
  abstract: string;
  keywords: string[];
  search_tokens: string[];
  academic_year_id: string;
  course_id: string;
  group_number: string;
  github_repository_url?: string;
  manuscript_url?: string;
  created_at: string;
}

export interface ArchiveProjectsActionResult {
  ok: boolean;
  academic_year_id?: string;
  archived_count?: number;
  team_ids?: string[];
  error?: string;
  code?: string;
}

export interface SearchArchivedProjectsActionResult {
  ok: boolean;
  items?: SerializedArchivedProject[];
  nextCursor?: string | null;
  courses?: Array<{ id: string; code: string; name: string }>;
  academicYears?: Array<{ id: string; code: string }>;
  error?: string;
  code?: string;
}

/**
 * Coordinator / Admin backfill Server Action:
 * Builds or updates archived_projects records for all completed teams in an academic year.
 * Spec: FR-11.1, FR-11.2, A5.
 */
export async function archiveProjects(
  idTokenOrInput?: string | (ArchiveProjectsInput & { idToken?: string }),
  maybeInput?: ArchiveProjectsInput | string
): Promise<ArchiveProjectsActionResult> {
  try {
    let idToken: string | undefined;
    let rawInput: unknown;

    if (typeof idTokenOrInput === 'string') {
      idToken = idTokenOrInput;
      rawInput = maybeInput;
    } else if (idTokenOrInput && typeof idTokenOrInput === 'object') {
      idToken = idTokenOrInput.idToken;
      const copy = { ...idTokenOrInput };
      delete copy.idToken;
      rawInput = copy;
      if (!idToken && typeof maybeInput === 'string') {
        idToken = maybeInput;
      }
    }

    if (!idToken) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Missing authentication token');
    }

    const caller = await requireUser(idToken, ['coordinator', 'admin']);

    const parsed = archiveProjectsInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message || 'Invalid input'
      );
    }

    const { academic_year_id } = parsed.data;

    const yearSnap = await adminDb.collection('academic_years').doc(academic_year_id).get();
    if (!yearSnap.exists) {
      throw new HttpError(404, 'NOT_FOUND', `Academic year ${academic_year_id} not found`);
    }

    const result = await archiveCompletedTeams(academic_year_id);

    await writeAudit({
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: caller.activeRole || 'coordinator',
      },
      action: 'projects.archived',
      target_type: 'academic_year',
      target_id: academic_year_id,
      description: `Archived ${result.archivedCount} completed project team(s) for academic year ${academic_year_id}`,
      metadata: {
        archived_count: result.archivedCount,
        team_ids: result.teamIds,
      },
    });

    return {
      ok: true,
      academic_year_id,
      archived_count: result.archivedCount,
      team_ids: result.teamIds,
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

/**
 * Member-accessible Server Action to search and filter archived projects with cursor pagination.
 * Spec: FR-11.2, FR-11.3, A5.
 */
export async function searchArchivedProjects(
  idTokenOrInput?: string | (SearchArchivedProjectsInput & { idToken?: string }),
  maybeInput?: SearchArchivedProjectsInput | string
): Promise<SearchArchivedProjectsActionResult> {
  try {
    let idToken: string | undefined;
    let rawInput: unknown = {};

    if (typeof idTokenOrInput === 'string') {
      idToken = idTokenOrInput;
      rawInput = maybeInput ?? {};
    } else if (idTokenOrInput && typeof idTokenOrInput === 'object') {
      idToken = idTokenOrInput.idToken;
      const copy = { ...idTokenOrInput };
      delete copy.idToken;
      rawInput = copy;
      if (!idToken && typeof maybeInput === 'string') {
        idToken = maybeInput;
      }
    }

    if (!idToken) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Missing authentication token');
    }

    await requireUser(idToken);

    const parsed = searchArchivedProjectsInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message || 'Invalid search parameters'
      );
    }

    const [searchResult, coursesSnap, yearsSnap] = await Promise.all([
      listArchivedProjects(parsed.data),
      adminDb.collection('courses').get(),
      adminDb.collection('academic_years').get(),
    ]);

    const items: SerializedArchivedProject[] = searchResult.items.map((item) => ({
      id: item.id,
      title: item.title,
      abstract: item.abstract,
      keywords: item.keywords ?? [],
      search_tokens: item.search_tokens ?? [],
      academic_year_id: item.academic_year_id,
      course_id: item.course_id,
      group_number: item.group_number,
      github_repository_url: item.github_repository_url,
      manuscript_url: item.manuscript_url,
      created_at: item.created_at?.toDate?.()
        ? item.created_at.toDate().toISOString()
        : new Date().toISOString(),
    }));

    const courses = coursesSnap.docs
      .map((d) => {
        const data = d.data() as CourseDocument;
        return {
          id: d.id,
          code: data.code || d.id.toUpperCase(),
          name: data.name || d.id,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));

    const academicYears = yearsSnap.docs
      .map((d) => {
        const data = d.data() as AcademicYearDocument;
        return {
          id: d.id,
          code: data.code || d.id,
        };
      })
      .sort((a, b) => b.id.localeCompare(a.id));

    return {
      ok: true,
      items,
      nextCursor: searchResult.nextCursor,
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

