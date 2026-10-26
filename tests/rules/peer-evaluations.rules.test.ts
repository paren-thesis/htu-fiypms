import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { ctx, seed, clearFirestoreData, cleanupTestEnv } from "./helpers";

describe("Rule: Peer Evaluations", () => {
  const teamId = "team-peer-1";
  const studentA = "student-a";
  const studentB = "student-b";
  const outsider = "student-outsider";

  const validPeerId = `${teamId}__${studentA}__${studentB}`;

  beforeAll(async () => {
    await clearFirestoreData();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  beforeEach(async () => {
    await clearFirestoreData();

    await seed(async (db) => {
      // Seed team with members studentA and studentB
      await db.doc(`teams/${teamId}`).set({
        id: teamId,
        member_ids: [studentA, studentB],
      });
    });
  });

  it("peer evaluation allows valid rating submission by a teammate", async () => {
    const studentADb = await ctx({ uid: studentA });

    await assertSucceeds(
      studentADb.doc(`peer_evaluations/${validPeerId}`).set({
        team_id: teamId,
        evaluator_id: studentA,
        evaluatee_id: studentB,
        punctuality_score: 8,
        technical_contribution_score: 9,
        teamwork_score: 7,
        average_score: 8.0,
        comments: "Excellent teammate",
      })
    );
  });

  it("peer evaluation rejects self-rating", async () => {
    const studentADb = await ctx({ uid: studentA });
    const selfId = `${teamId}__${studentA}__${studentA}`;

    await assertFails(
      studentADb.doc(`peer_evaluations/${selfId}`).set({
        team_id: teamId,
        evaluator_id: studentA,
        evaluatee_id: studentA,
        punctuality_score: 10,
        technical_contribution_score: 10,
        teamwork_score: 10,
        average_score: 10.0,
        comments: "Self rating",
      })
    );
  });

  it("peer evaluation rejects rating a non-teammate", async () => {
    const studentADb = await ctx({ uid: studentA });
    const nonTeammateId = `${teamId}__${studentA}__${outsider}`;

    await assertFails(
      studentADb.doc(`peer_evaluations/${nonTeammateId}`).set({
        team_id: teamId,
        evaluator_id: studentA,
        evaluatee_id: outsider,
        punctuality_score: 5,
        technical_contribution_score: 5,
        teamwork_score: 5,
        average_score: 5.0,
        comments: "Not in team",
      })
    );
  });

  it("peer evaluation rejects mismatched/non-deterministic id", async () => {
    const studentADb = await ctx({ uid: studentA });
    const badId = "custom-peer-id-123";

    await assertFails(
      studentADb.doc(`peer_evaluations/${badId}`).set({
        team_id: teamId,
        evaluator_id: studentA,
        evaluatee_id: studentB,
        punctuality_score: 8,
        technical_contribution_score: 8,
        teamwork_score: 8,
        average_score: 8.0,
        comments: "Mismatched ID",
      })
    );
  });

  it("peer evaluation rejects scores outside 1-10 range", async () => {
    const studentADb = await ctx({ uid: studentA });

    // Punctuality = 0 (below 1)
    await assertFails(
      studentADb.doc(`peer_evaluations/${validPeerId}`).set({
        team_id: teamId,
        evaluator_id: studentA,
        evaluatee_id: studentB,
        punctuality_score: 0,
        technical_contribution_score: 8,
        teamwork_score: 8,
        average_score: 5.3,
        comments: "Score too low",
      })
    );

    // Teamwork = 11 (above 10)
    await assertFails(
      studentADb.doc(`peer_evaluations/${validPeerId}`).set({
        team_id: teamId,
        evaluator_id: studentA,
        evaluatee_id: studentB,
        punctuality_score: 8,
        technical_contribution_score: 8,
        teamwork_score: 11,
        average_score: 9.0,
        comments: "Score too high",
      })
    );
  });

  it("peer evaluation is immutable: client update and delete are denied", async () => {
    await seed(async (db) => {
      await db.doc(`peer_evaluations/${validPeerId}`).set({
        team_id: teamId,
        evaluator_id: studentA,
        evaluatee_id: studentB,
        punctuality_score: 8,
        technical_contribution_score: 8,
        teamwork_score: 8,
        average_score: 8.0,
        comments: "Initial",
      });
    });

    const studentADb = await ctx({ uid: studentA });

    await assertFails(
      studentADb.doc(`peer_evaluations/${validPeerId}`).update({
        punctuality_score: 9,
      })
    );
    await assertFails(studentADb.doc(`peer_evaluations/${validPeerId}`).delete());
  });

  it("confidentiality: evaluatee cannot read peer ratings about themselves", async () => {
    await seed(async (db) => {
      await db.doc(`peer_evaluations/${validPeerId}`).set({
        team_id: teamId,
        evaluator_id: studentA,
        evaluatee_id: studentB,
        punctuality_score: 5,
        technical_contribution_score: 5,
        teamwork_score: 5,
        average_score: 5.0,
        comments: "Confidential feedback",
      });
    });

    // Evaluator can read their own submission
    const studentADb = await ctx({ uid: studentA });
    await assertSucceeds(studentADb.doc(`peer_evaluations/${validPeerId}`).get());

    // Evaluatee cannot read ratings about themselves
    const studentBDb = await ctx({ uid: studentB });
    await assertFails(studentBDb.doc(`peer_evaluations/${validPeerId}`).get());

    // Coordinator/supervisor can read
    const coordDb = await ctx({
      uid: "coord-1",
      roles: ["coordinator"],
      activeRole: "coordinator",
    });
    await assertSucceeds(coordDb.doc(`peer_evaluations/${validPeerId}`).get());
  });
});
