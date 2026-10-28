import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { ctx, seed, clearFirestoreData, cleanupTestEnv } from "./helpers";

describe("Rule: Users & Supervisor Contacts Access", () => {
  const supervisorUid = "sup-1";
  const studentUid = "student-1";
  const ungovernedStudentUid = "student-2";

  beforeAll(async () => {
    await clearFirestoreData();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  beforeEach(async () => {
    await clearFirestoreData();

    await seed(async (db) => {
      // Seed user profile
      await db.doc(`users/${studentUid}`).set({
        name: "Test Student",
        email: `${studentUid}@htu.edu.gh`,
        profile: { course_id: "btech-cs" },
      });

      // Seed supervisor contact
      await db.doc(`supervisor_contacts/${supervisorUid}`).set({
        supervisor_id: supervisorUid,
        phone: "+233241234567",
        office_location: "Block B, Room 204",
        consultation_hours: "Mondays 2-4pm",
      });

      // Grant access to studentUid only
      await db
        .doc(`supervisor_contacts/${supervisorUid}/grants/${studentUid}`)
        .set({
          student_id: studentUid,
          team_id: "team-1",
        });
    });
  });

  it("users client writes (create, update, delete) are denied even to document owner (F-03)", async () => {
    const studentDb = await ctx({ uid: studentUid });

    // Client update denied (must go through Server Action update-profile.ts)
    await assertFails(
      studentDb.doc(`users/${studentUid}`).update({
        "profile.course_id": "btech-ict",
      })
    );

    // Client create denied
    await assertFails(
      studentDb.doc(`users/new-student`).set({
        name: "New Student",
      })
    );

    // Client delete denied
    await assertFails(studentDb.doc(`users/${studentUid}`).delete());
  });

  it("supervisor_contacts is denied to a student until a grant doc exists (F-02)", async () => {
    const ungrantedDb = await ctx({ uid: ungovernedStudentUid });

    await assertFails(
      ungrantedDb.doc(`supervisor_contacts/${supervisorUid}`).get()
    );
  });

  it("supervisor_contacts is readable once a grant doc exists for that student", async () => {
    const grantedDb = await ctx({ uid: studentUid });

    await assertSucceeds(
      grantedDb.doc(`supervisor_contacts/${supervisorUid}`).get()
    );
  });

  it("supervisor_contacts is readable by the supervisor themselves, coordinator, and admin", async () => {
    const supDb = await ctx({
      uid: supervisorUid,
      roles: ["supervisor"],
      activeRole: "supervisor",
    });
    const coordDb = await ctx({
      uid: "coord-1",
      roles: ["coordinator"],
      activeRole: "coordinator",
    });
    const adminDb = await ctx({
      uid: "admin-1",
      roles: ["admin"],
      activeRole: "admin",
    });

    await assertSucceeds(supDb.doc(`supervisor_contacts/${supervisorUid}`).get());
    await assertSucceeds(coordDb.doc(`supervisor_contacts/${supervisorUid}`).get());
    await assertSucceeds(adminDb.doc(`supervisor_contacts/${supervisorUid}`).get());
  });

  it("supervisor_contacts client writes are completely denied", async () => {
    const supDb = await ctx({
      uid: supervisorUid,
      roles: ["supervisor"],
      activeRole: "supervisor",
    });

    await assertFails(
      supDb.doc(`supervisor_contacts/${supervisorUid}`).update({
        phone: "+233509999999",
      })
    );
  });
});
