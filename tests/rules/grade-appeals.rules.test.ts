import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { ctx, seed, clearFirestoreData, cleanupTestEnv } from "./helpers";

describe("Rule: Grade Appeals (Spec Amendment A4)", () => {
  const teamId = "team-appeal-rule-1";
  const studentUid = "student-owner";
  const otherStudentUid = "student-other";
  const coordinatorUid = "coordinator-rule-1";
  const adminUid = "admin-rule-1";
  const appealId = `${teamId}__${studentUid}`;

  beforeAll(async () => {
    await clearFirestoreData();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  beforeEach(async () => {
    await clearFirestoreData();

    await seed(async (db) => {
      // Seed a team
      await db.doc(`teams/${teamId}`).set({
        id: teamId,
        member_ids: [studentUid],
      });

      // Seed an existing appeal
      await db.doc(`grade_appeals/${appealId}`).set({
        id: appealId,
        team_id: teamId,
        student_id: studentUid,
        reason: "Discrepancy in continuous assessment marksheet tally.",
        status: "submitted",
      });
    });
  });

  it("owning student can read their own grade appeal", async () => {
    const studentDb = await ctx({ uid: studentUid });
    await assertSucceeds(studentDb.doc(`grade_appeals/${appealId}`).get());
  });

  it("non-owning student cannot read another student's grade appeal", async () => {
    const otherStudentDb = await ctx({ uid: otherStudentUid });
    await assertFails(otherStudentDb.doc(`grade_appeals/${appealId}`).get());
  });

  it("coordinator can read any grade appeal", async () => {
    const coordDb = await ctx({
      uid: coordinatorUid,
      roles: ["coordinator"],
      activeRole: "coordinator",
    });
    await assertSucceeds(coordDb.doc(`grade_appeals/${appealId}`).get());
  });

  it("admin can read any grade appeal", async () => {
    const adminDb = await ctx({
      uid: adminUid,
      roles: ["admin"],
      activeRole: "admin",
    });
    await assertSucceeds(adminDb.doc(`grade_appeals/${appealId}`).get());
  });

  it("students cannot create, update, or delete grade appeals directly via client SDK", async () => {
    const studentDb = await ctx({ uid: studentUid });

    // Client create denied
    await assertFails(
      studentDb.doc(`grade_appeals/new_appeal`).set({
        id: "new_appeal",
        team_id: teamId,
        student_id: studentUid,
        reason: "Client attempting to insert appeal record directly.",
        status: "submitted",
      })
    );

    // Client update denied
    await assertFails(
      studentDb.doc(`grade_appeals/${appealId}`).update({
        status: "resolved",
      })
    );

    // Client delete denied
    await assertFails(studentDb.doc(`grade_appeals/${appealId}`).delete());
  });

  it("coordinators and admins cannot write grade appeals via client SDK (Server Actions only)", async () => {
    const coordDb = await ctx({
      uid: coordinatorUid,
      roles: ["coordinator"],
      activeRole: "coordinator",
    });

    await assertFails(
      coordDb.doc(`grade_appeals/${appealId}`).update({
        status: "resolved",
      })
    );

    const adminDb = await ctx({
      uid: adminUid,
      roles: ["admin"],
      activeRole: "admin",
    });

    await assertFails(coordDb.doc(`grade_appeals/${appealId}`).delete());
    await assertFails(adminDb.doc(`grade_appeals/${appealId}`).delete());
  });
});
