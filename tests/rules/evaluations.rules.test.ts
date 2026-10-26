import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { ctx, seed, clearFirestoreData, cleanupTestEnv } from "./helpers";

describe("Rule: Evaluations (Digital Marksheet)", () => {
  const teamId = "team-1";
  const studentUid = "student-1";
  const foreignStudentUid = "student-2";
  const examinerUid = "examiner-1";
  const validEvalId = `${teamId}__${examinerUid}__team`;
  const invalidEvalId = "arbitrary-eval-id";

  beforeAll(async () => {
    await clearFirestoreData();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  beforeEach(async () => {
    await clearFirestoreData();

    await seed(async (db) => {
      // Seed team with member
      await db.doc(`teams/${teamId}`).set({
        id: teamId,
        member_ids: [studentUid],
      });

      // Seed unpublished evaluation
      await db.doc(`evaluations/${validEvalId}`).set({
        id: validEvalId,
        team_id: teamId,
        evaluator_id: examinerUid,
        evaluator_role: "panel_member",
        rubric_id: "rubric-1",
        scores: { c1: 15 },
        total_score: 15,
        comments: "Good architecture",
        is_published: false,
      });

      // Seed published evaluation for team-1
      await db.doc(`evaluations/pub_${validEvalId}`).set({
        id: `pub_${validEvalId}`,
        team_id: teamId,
        evaluator_id: examinerUid,
        evaluator_role: "panel_member",
        rubric_id: "rubric-1",
        scores: { c1: 18 },
        total_score: 18,
        comments: "Published remarks",
        is_published: true,
      });
    });
  });

  it("evaluations are unreadable by students before is_published is true", async () => {
    const studentDb = await ctx({ uid: studentUid });

    await assertFails(studentDb.doc(`evaluations/${validEvalId}`).get());
  });

  it("evaluations are readable by own team members after is_published is true", async () => {
    const studentDb = await ctx({ uid: studentUid });

    await assertSucceeds(studentDb.doc(`evaluations/pub_${validEvalId}`).get());
  });

  it("evaluations are unreadable by other teams even after publication", async () => {
    const otherStudentDb = await ctx({ uid: foreignStudentUid });

    await assertFails(otherStudentDb.doc(`evaluations/pub_${validEvalId}`).get());
  });

  it("evaluator and staff can read unpublished evaluations", async () => {
    const examinerDb = await ctx({
      uid: examinerUid,
      roles: ["panel_member"],
      activeRole: "panel_member",
    });
    const coordinatorDb = await ctx({
      uid: "coord-1",
      roles: ["coordinator"],
      activeRole: "coordinator",
    });

    await assertSucceeds(examinerDb.doc(`evaluations/${validEvalId}`).get());
    await assertSucceeds(coordinatorDb.doc(`evaluations/${validEvalId}`).get());
  });

  it("evaluation create requires id {teamId}__{uid}__team and is_published false", async () => {
    const examinerDb = await ctx({
      uid: examinerUid,
      roles: ["panel_member"],
      activeRole: "panel_member",
    });

    const newTeamId = "team-new";
    const correctId = `${newTeamId}__${examinerUid}__team`;

    // Denied with mismatched/non-deterministic id
    await assertFails(
      examinerDb.doc(`evaluations/${invalidEvalId}`).set({
        team_id: newTeamId,
        evaluator_id: examinerUid,
        evaluator_role: "panel_member",
        rubric_id: "rubric-1",
        scores: { c1: 20 },
        total_score: 20,
        comments: "Good",
        is_published: false,
      })
    );

    // Denied if is_published is true at creation
    await assertFails(
      examinerDb.doc(`evaluations/${correctId}`).set({
        team_id: newTeamId,
        evaluator_id: examinerUid,
        evaluator_role: "panel_member",
        rubric_id: "rubric-1",
        scores: { c1: 20 },
        total_score: 20,
        comments: "Good",
        is_published: true,
      })
    );

    // Allowed with correct deterministic id and is_published: false
    await assertSucceeds(
      examinerDb.doc(`evaluations/${correctId}`).set({
        team_id: newTeamId,
        evaluator_id: examinerUid,
        evaluator_role: "panel_member",
        rubric_id: "rubric-1",
        scores: { c1: 20 },
        total_score: 20,
        comments: "Good",
        is_published: false,
      })
    );
  });

  it("evaluator cannot flip is_published to true on update (Admin SDK only)", async () => {
    const examinerDb = await ctx({
      uid: examinerUid,
      roles: ["panel_member"],
      activeRole: "panel_member",
    });

    // Evaluator updating score while is_published remains false: allowed
    await assertSucceeds(
      examinerDb.doc(`evaluations/${validEvalId}`).update({
        scores: { c1: 17 },
        total_score: 17,
        is_published: false,
      })
    );

    // Evaluator attempting to publish: denied
    await assertFails(
      examinerDb.doc(`evaluations/${validEvalId}`).update({
        is_published: true,
      })
    );
  });
});
