import 'server-only';

import { adminDb } from '@/lib/firebase/admin';
import type { TopicDocument, ArchivedProjectDocument } from '@/types/firestore';
import type { ApprovedTopicCandidate } from '@/lib/topics/similar';

export async function getTopic(id: string): Promise<TopicDocument | null> {
  const snap = await adminDb.collection('topics').doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<TopicDocument, 'id'>) };
}

export async function listTeamTopics(
  teamId: string,
  currentOnly = true
): Promise<TopicDocument[]> {
  let q = adminDb.collection('topics').where('team_id', '==', teamId);
  if (currentOnly) {
    q = q.where('is_current', '==', true);
  }

  const snap = await q.get();
  const topics = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<TopicDocument, 'id'>),
  }));

  return topics.sort((a, b) => a.preference_rank - b.preference_rank);
}

export async function getTopicHistory(
  topicId: string
): Promise<Array<TopicDocument & { versionId: string }>> {
  const snap = await adminDb
    .collection('topics')
    .doc(topicId)
    .collection('history')
    .orderBy('version', 'desc')
    .get();

  return snap.docs.map((d) => ({
    versionId: d.id,
    ...(d.data() as TopicDocument),
  }));
}

export async function listApprovedHistoricalTopics(
  excludeYearId?: string,
  limitCount = 300
): Promise<ApprovedTopicCandidate[]> {
  const [topicsSnap, archivedSnap] = await Promise.all([
    adminDb.collection('topics').where('status', '==', 'approved').limit(limitCount).get(),
    adminDb.collection('archived_projects').limit(limitCount).get(),
  ]);

  const results: ApprovedTopicCandidate[] = [];
  for (const doc of topicsSnap.docs) {
    const data = doc.data();
    if (excludeYearId && data.academic_year_id === excludeYearId) {
      continue;
    }

    results.push({
      id: doc.id,
      title: data.title || '',
      tech_stack: data.tech_stack || [],
      academic_year_id: data.academic_year_id,
    });
  }

  for (const doc of archivedSnap.docs) {
    const data = doc.data() as Omit<ArchivedProjectDocument, 'id'>;
    if (excludeYearId && data.academic_year_id === excludeYearId) {
      continue;
    }

    results.push({
      id: doc.id,
      title: data.title || '',
      tech_stack: data.keywords || [],
      keywords: data.keywords || [],
      academic_year_id: data.academic_year_id,
    });
  }

  return results;
}
