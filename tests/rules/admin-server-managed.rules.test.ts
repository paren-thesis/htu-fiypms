import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { ctx, seed, clearFirestoreData, cleanupTestEnv } from "./helpers";

describe("Rule: Admin & Server-Managed Collections", () => {
  const coordUid = "coordinator-1";
  const studentUid = "student-1";
  const yearId = "2026-2027";

  beforeAll(async () => {
    await clearFirestoreData();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  beforeEach(async () => {
    await clearFirestoreData();

    await seed(async (db) => {
      // Seed academic year with grades_published: false
      await db.doc(`academic_years/${yearId}`).set({
        id: yearId,
        code: "2026/2027",
        semester: 2,
        is_active: true,
        grades_published: false,
      });

      // Seed staff whitelist record
      await db.doc(`staff_whitelist/staff@htu.edu.gh`).set({
        email: "staff@htu.edu.gh",
        full_name: "Staff Member",
        roles: ["supervisor"],
        is_active: true,
      });

      // Seed student roster record
      await db.doc(`rosters/${yearId}/students/0420000001`).set({
        index_number: "0420000001",
        full_name: "Roster Student",
        email: "0420000001@htu.edu.gh",
        user_uid: studentUid,
      });

      // Seed audit log
      await db.doc(`audit_logs/log-1`).set({
        id: "log-1",
        action: "roster.imported",
        actor_id: coordUid,
        description: "Roster imported",
      });
    });
  });

  it("rosters client writes (create, update, delete) are denied to all clients", async () => {
    const coordDb = await ctx({
      uid: coordUid,
      roles: ["coordinator"],
      activeRole: "coordinator",
    });

    await assertFails(
      coordDb.doc(`rosters/${yearId}/students/0420000002`).set({
        index_number: "0420000002",
        full_name: "Hacked Roster",
      })
    );

    await assertFails(
      coordDb.doc(`rosters/${yearId}/students/0420000001`).update({
        user_uid: "new-uid",
      })
    );

    await assertFails(
      coordDb.doc(`rosters/${yearId}/students/0420000001`).delete()
    );
  });

  it("staff_whitelist client writes (create, update, delete) are denied to all clients", async () => {
    const coordDb = await ctx({
      uid: coordUid,
      roles: ["coordinator"],
      activeRole: "coordinator",
    });

    await assertFails(
      coordDb.doc("staff_whitelist/newstaff@htu.edu.gh").set({
        email: "newstaff@htu.edu.gh",
        roles: ["supervisor"],
        is_active: true,
      })
    );

    await assertFails(
      coordDb.doc("staff_whitelist/staff@htu.edu.gh").update({
        is_active: false,
      })
    );

    await assertFails(
      coordDb.doc("staff_whitelist/staff@htu.edu.gh").delete()
    );
  });

  it("academic_years.grades_published cannot be flipped by a client (Admin SDK only)", async () => {
    const coordDb = await ctx({
      uid: coordUid,
      roles: ["coordinator"],
      activeRole: "coordinator",
    });

    // Flipping grades_published from false to true is denied
    await assertFails(
      coordDb.doc(`academic_years/${yearId}`).update({
        grades_published: true,
      })
    );

    // Updating other metadata while keeping grades_published unchanged is allowed for coordinator
    await assertSucceeds(
      coordDb.doc(`academic_years/${yearId}`).update({
        is_active: true,
        grades_published: false,
      })
    );
  });

  it("audit_logs client writes are denied to everyone (immutable append-only via Admin SDK)", async () => {
    const coordDb = await ctx({
      uid: coordUid,
      roles: ["coordinator"],
      activeRole: "coordinator",
    });
    const adminDb = await ctx({
      uid: "admin-1",
      roles: ["admin"],
      activeRole: "admin",
    });

    await assertFails(
      coordDb.doc("audit_logs/new-log").set({
        action: "grade.submitted",
      })
    );
    await assertFails(
      adminDb.doc("audit_logs/new-log").set({
        action: "grade.submitted",
      })
    );
    await assertFails(coordDb.doc("audit_logs/log-1").delete());
  });

  it("audit_logs are readable only by coordinator and admin; denied to students", async () => {
    const coordDb = await ctx({
      uid: coordUid,
      roles: ["coordinator"],
      activeRole: "coordinator",
    });
    const studentDb = await ctx({ uid: studentUid });

    await assertSucceeds(coordDb.doc("audit_logs/log-1").get());
    await assertFails(studentDb.doc("audit_logs/log-1").get());
  });
});
