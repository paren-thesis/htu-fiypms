import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { ctx, seed, clearFirestoreData, cleanupTestEnv, unauthCtx } from "./helpers";

describe("Rule: Archived Projects (Spec Amendment A5)", () => {
  const projectId = "team-archive-rule-1";
  const studentUid = "student-archive-1";
  const supervisorUid = "supervisor-archive-1";
  const coordinatorUid = "coordinator-archive-1";
  const adminUid = "admin-archive-1";

  beforeAll(async () => {
    await clearFirestoreData();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  beforeEach(async () => {
    await clearFirestoreData();

    await seed(async (db) => {
      await db.doc(`archived_projects/${projectId}`).set({
        id: projectId,
        title: "Smart Grid Load Balancing System",
        abstract: "Real-time load distribution across microgrids using IoT.",
        keywords: ["iot", "esp32", "smart", "grid"],
        search_tokens: ["smart", "grid", "load", "balancing", "iot", "esp32"],
        academic_year_id: "2025-2026",
        course_id: "btech-cs",
        group_number: "BCS26_01",
      });
    });
  });

  it("registered student, supervisor, coordinator, and admin can read archived_projects", async () => {
    const studentDb = await ctx({ uid: studentUid });
    await assertSucceeds(studentDb.doc(`archived_projects/${projectId}`).get());

    const supDb = await ctx({
      uid: supervisorUid,
      roles: ["supervisor"],
      activeRole: "supervisor",
    });
    await assertSucceeds(supDb.doc(`archived_projects/${projectId}`).get());

    const coordDb = await ctx({
      uid: coordinatorUid,
      roles: ["coordinator"],
      activeRole: "coordinator",
    });
    await assertSucceeds(coordDb.doc(`archived_projects/${projectId}`).get());

    const adminDb = await ctx({
      uid: adminUid,
      roles: ["admin"],
      activeRole: "admin",
    });
    await assertSucceeds(adminDb.doc(`archived_projects/${projectId}`).get());
  });

  it("unregistered or unauthenticated users cannot read archived_projects", async () => {
    const unregDb = await ctx({
      uid: "unreg-user",
      registered: false,
    });
    await assertFails(unregDb.doc(`archived_projects/${projectId}`).get());

    const anonDb = await unauthCtx();
    await assertFails(anonDb.doc(`archived_projects/${projectId}`).get());
  });

  it("denies all client writes (create, update, delete) to archived_projects for all roles", async () => {
    const studentDb = await ctx({ uid: studentUid });
    const coordDb = await ctx({
      uid: coordinatorUid,
      roles: ["coordinator"],
      activeRole: "coordinator",
    });
    const adminDb = await ctx({
      uid: adminUid,
      roles: ["admin"],
      activeRole: "admin",
    });

    await assertFails(
      studentDb.doc("archived_projects/new-proj").set({
        id: "new-proj",
        title: "Hacked Archive",
      })
    );

    await assertFails(
      coordDb.doc("archived_projects/new-proj").set({
        id: "new-proj",
        title: "Client Created Archive",
      })
    );

    await assertFails(
      coordDb.doc(`archived_projects/${projectId}`).update({
        title: "Modified Title",
      })
    );

    await assertFails(
      adminDb.doc(`archived_projects/${projectId}`).delete()
    );
  });
});

