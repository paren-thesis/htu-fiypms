import 'server-only';

import { adminDb } from '@/lib/firebase/admin';
import { buildKeywords, buildSearchTokens } from './tokens';
import { upsertArchivedProject } from '@/lib/models/archived-project/repo';
import type {
  ArchivedProjectDocument,
  SoftwareDeliverableDocument,
  TeamDocument,
  TopicDocument,
} from '@/types/firestore';

export interface ArchiveCompletedTeamsResult {
  academic_year_id: string;
  archivedCount: number;
  teamIds: string[];
  records: ArchivedProjectDocument[];
}

/**
 * Resolves the approved topic (or current topic fallback) for a completed team.
 */
async function resolveTeamTopic(team: TeamDocument): Promise<TopicDocument | null> {
  if (team.approved_topic_id) {
    const snap = await adminDb.collection('topics').doc(team.approved_topic_id).get();
    if (snap.exists) {
      return { id: snap.id, ...(snap.data() as Omit<TopicDocument, 'id'>) };
    }
  }

  const approvedSnap = await adminDb
    .collection('topics')
    .where('team_id', '==', team.id)
    .where('status', '==', 'approved')
    .limit(1)
    .get();

  if (!approvedSnap.empty && approvedSnap.docs[0]) {
    const d = approvedSnap.docs[0];
    return { id: d.id, ...(d.data() as Omit<TopicDocument, 'id'>) };
  }

  const currentSnap = await adminDb
    .collection('topics')
    .where('team_id', '==', team.id)
    .where('is_current', '==', true)
    .limit(1)
    .get();

  if (!currentSnap.empty && currentSnap.docs[0]) {
    const d = currentSnap.docs[0];
    return { id: d.id, ...(d.data() as Omit<TopicDocument, 'id'>) };
  }

  return null;
}

/**
 * Builds and persists an ArchivedProjectDocument for every completed team in `yearId`.
 * Idempotent: doc id = teamId, re-running updates the existing doc without creating duplicates.
 */
export async function archiveCompletedTeams(
  yearId: string
): Promise<ArchiveCompletedTeamsResult> {
  const teamsSnap = await adminDb
    .collection('teams')
    .where('academic_year_id', '==', yearId)
    .where('status', '==', 'completed')
    .get();

  const completedTeams: TeamDocument[] = teamsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<TeamDocument, 'id'>),
  }));

  const records: ArchivedProjectDocument[] = [];
  const teamIds: string[] = [];

  for (const team of completedTeams) {
    const [topic, deliverableSnap] = await Promise.all([
      resolveTeamTopic(team),
      adminDb.collection('software_deliverables').doc(team.id).get(),
    ]);

    const deliverable = deliverableSnap.exists
      ? (deliverableSnap.data() as SoftwareDeliverableDocument)
      : null;

    const title = topic?.title?.trim() || team.name;
    const abstract = topic?.abstract?.trim() || '';
    const techStack = Array.isArray(topic?.tech_stack) ? topic.tech_stack : [];

    const keywords = buildKeywords(title, abstract, techStack);
    const searchTokens = buildSearchTokens(title, abstract, techStack);

    const githubRepoUrl = deliverable?.github_repository_url?.trim() || undefined;
    const manuscriptUrl = deliverable?.google_drive_url?.trim() || undefined;

    const record = await upsertArchivedProject({
      id: team.id,
      title,
      abstract,
      keywords,
      search_tokens: searchTokens,
      academic_year_id: team.academic_year_id,
      course_id: team.course_id,
      group_number: team.group_number,
      github_repository_url: githubRepoUrl,
      manuscript_url: manuscriptUrl,
    });

    records.push(record);
    teamIds.push(team.id);
  }

  return {
    academic_year_id: yearId,
    archivedCount: records.length,
    teamIds,
    records,
  };
}

