import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { ctx, seed, clearFirestoreData, cleanupTestEnv } from "./helpers";

describe("Rule: Teams & Invite Codes", () => {
  const leaderUid = "leader-1";
  const memberUid = "member-1";
  const nonMemberUid = "outsider-1";
  const teamId = "team-cs-1";

  beforeAll(async () => {
    await clearFirestoreData();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  beforeEach(async () => {
    await clearFirestoreData();

    await seed(async (db) => {
      // Seed team document
      await db.doc(`teams/${teamId}`).set({
        id: teamId,
        name: "Alpha Group",
        group_number: "BCS26_01",
        course_id: "btech-cs",
        academic_year_id: "2026-2027",
        leader_id: leaderUid,
        member_ids: [leaderUid, memberUid],
        member_count: 2,
        max_members: 5,
        status: "formation",
      });

      // Seed team invite copy
      await db.doc(`teams/${teamId}/private/invite`).set({
        code: "K9X2P4",
      });

      // Seed global lookup invite code
      await db.doc(`invite_codes/K9X2P4`).set({
        code: "K9X2P4",
        team_id: teamId,
      });
    });
  });

  it("teams client create is denied (Server Action create-team.ts only)", async () => {
    const leaderDb = await ctx({ uid: leaderUid });

    await assertFails(
      leaderDb.doc("teams/new-team").set({
        name: "New Group",
        leader_id: leaderUid,
        member_ids: [leaderUid],
      })
    );
  });

  it("teams leader may only update the name field", async () => {
    const leaderDb = await ctx({ uid: leaderUid });

    // Allowed: leader updating name
    await assertSucceeds(
      leaderDb.doc(`teams/${teamId}`).update({
        name: "Beta Group",
      })
    );

    // Denied: leader attempting to mutate member_ids, course_id, or status
    await assertFails(
      leaderDb.doc(`teams/${teamId}`).update({
        name: "Gamma Group",
        status: "defense_ready",
      })
    );
    await assertFails(
      leaderDb.doc(`teams/${teamId}`).update({
        member_ids: [leaderUid, memberUid, "extra-user"],
      })
    );
  });

  it("non-leader team member or outsider cannot update team name", async () => {
    const memberDb = await ctx({ uid: memberUid });
    const outsiderDb = await ctx({ uid: nonMemberUid });

    await assertFails(
      memberDb.doc(`teams/${teamId}`).update({
        name: "Hacked by Member",
      })
    );

    await assertFails(
      outsiderDb.doc(`teams/${teamId}`).update({
        name: "Hacked by Outsider",
      })
    );
  });

  it("invite_codes collection is completely unreadable by clients (server-only lookup)", async () => {
    const leaderDb = await ctx({ uid: leaderUid });
    const coordDb = await ctx({
      uid: "coord-1",
      roles: ["coordinator"],
      activeRole: "coordinator",
    });

    await assertFails(leaderDb.doc("invite_codes/K9X2P4").get());
    await assertFails(coordDb.doc("invite_codes/K9X2P4").get());
  });

  it("teams/{id}/private/invite is readable by team members and coordinators only", async () => {
    const leaderDb = await ctx({ uid: leaderUid });
    const memberDb = await ctx({ uid: memberUid });
    const outsiderDb = await ctx({ uid: nonMemberUid });
    const coordDb = await ctx({
      uid: "coord-1",
      roles: ["coordinator"],
      activeRole: "coordinator",
    });

    // Members and coordinator can read
    await assertSucceeds(leaderDb.doc(`teams/${teamId}/private/invite`).get());
    await assertSucceeds(memberDb.doc(`teams/${teamId}/private/invite`).get());
    await assertSucceeds(coordDb.doc(`teams/${teamId}/private/invite`).get());

    // Outsider student cannot read
    await assertFails(outsiderDb.doc(`teams/${teamId}/private/invite`).get());
  });
});
