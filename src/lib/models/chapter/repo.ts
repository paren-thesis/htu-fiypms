import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { ChapterDocument, ChapterFeedback, ChapterHistoryEntry } from "@/types/firestore";
import type { ChapterNumber, CreateChapterIn } from "./schema";
import { DEFAULT_CHAPTER_TITLES } from "./schema";

export const CHAPTERS_COLLECTION = "chapters";

/**
 * Returns deterministic document ID for a team's chapter: `${teamId}__ch${n}`.
 */
export function chapterDocId(teamId: string, chapterNumber: ChapterNumber | number): string {
  return `${teamId}__ch${chapterNumber}`;
}

export function getChapterRef(teamId: string, chapterNumber: ChapterNumber | number) {
  const id = chapterDocId(teamId, chapterNumber);
  return adminDb.collection(CHAPTERS_COLLECTION).doc(id);
}

export async function getChapter(
  teamId: string,
  chapterNumber: ChapterNumber | number
): Promise<ChapterDocument | null> {
  const ref = getChapterRef(teamId, chapterNumber);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return snap.data() as ChapterDocument;
}

export async function getChapterById(id: string): Promise<ChapterDocument | null> {
  const snap = await adminDb.collection(CHAPTERS_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return snap.data() as ChapterDocument;
}

export async function listTeamChapters(teamId: string): Promise<ChapterDocument[]> {
  const snap = await adminDb
    .collection(CHAPTERS_COLLECTION)
    .where("team_id", "==", teamId)
    .get();

  const chapters = snap.docs.map((d) => d.data() as ChapterDocument);
  return chapters.sort((a, b) => a.chapter_number - b.chapter_number);
}

export function createChapterInTx(
  tx: FirebaseFirestore.Transaction,
  input: CreateChapterIn
): { id: string; ref: FirebaseFirestore.DocumentReference } {
  const id = chapterDocId(input.team_id, input.chapter_number);
  const ref = adminDb.collection(CHAPTERS_COLLECTION).doc(id);

  const docData: ChapterDocument = {
    id,
    team_id: input.team_id,
    chapter_number: input.chapter_number,
    title: input.title || DEFAULT_CHAPTER_TITLES[input.chapter_number] || `Chapter ${input.chapter_number}`,
    document_url: input.document_url,
    version: 1,
    status: "pending",
    feedback: [],
    history: [],
    submitted_at: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
  };

  tx.set(ref, docData);
  return { id, ref };
}

export function resubmitChapterInTx(
  tx: FirebaseFirestore.Transaction,
  existingChapter: ChapterDocument,
  newUrl: string,
  newTitle?: string
): void {
  const ref = adminDb.collection(CHAPTERS_COLLECTION).doc(existingChapter.id);

  const historyEntry: ChapterHistoryEntry = {
    version: existingChapter.version,
    document_url: existingChapter.document_url,
    submitted_at: existingChapter.submitted_at,
    reviewed_at: existingChapter.reviewed_at,
    status: existingChapter.status,
  };

  const updatedHistory = [...(existingChapter.history || []), historyEntry];

  tx.update(ref, {
    version: existingChapter.version + 1,
    document_url: newUrl,
    title: newTitle || existingChapter.title,
    status: "pending",
    history: updatedHistory,
    submitted_at: FieldValue.serverTimestamp(),
    reviewed_at: FieldValue.delete(),
  });
}

export function reviewChapterInTx(
  tx: FirebaseFirestore.Transaction,
  chapterId: string,
  decision: "approved" | "revision_needed",
  newFeedback: ChapterFeedback[] = []
): void {
  const ref = adminDb.collection(CHAPTERS_COLLECTION).doc(chapterId);

  tx.update(ref, {
    status: decision,
    feedback: FieldValue.arrayUnion(...newFeedback),
    reviewed_at: FieldValue.serverTimestamp(),
  });
}
