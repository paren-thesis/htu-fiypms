import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { ctx, unauthCtx, seed, clearFirestoreData, cleanupTestEnv } from "./helpers";

describe("Rule: Membership & Domain Access Gating", () => {
  beforeAll(async () => {
    await clearFirestoreData();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  beforeEach(async () => {
    await clearFirestoreData();

    // Seed test records
    await seed(async (db) => {
      await db.doc("users/user-1").set({
        name: "Test Student",
        email: "user-1@htu.edu.gh",
      });
      await db.doc("teams/team-1").set({
        name: "Group 1",
        member_ids: ["user-1"],
      });
      await db.doc("topics/topic-1").set({
        title: "Test Topic",
        team_id: "team-1",
      });
    });
  });

  it("unauthenticated client cannot read users, teams, or topics", async () => {
    const db = await unauthCtx();

    await assertFails(db.doc("users/user-1").get());
    await assertFails(db.doc("teams/team-1").get());
    await assertFails(db.doc("topics/topic-1").get());
  });

  it("a Google account with registered: false reads nothing (users, teams, topics) (F-01)", async () => {
    const db = await ctx({
      uid: "unregistered-user",
      email: "unregistered@htu.edu.gh",
      registered: false,
      email_verified: true,
    });

    await assertFails(db.doc("users/user-1").get());
    await assertFails(db.doc("teams/team-1").get());
    await assertFails(db.doc("topics/topic-1").get());
  });

  it("a Google account with a non-htu email reads nothing (users, teams, topics)", async () => {
    const db = await ctx({
      uid: "gmail-user",
      email: "intruder@gmail.com",
      registered: true,
      email_verified: true,
    });

    await assertFails(db.doc("users/user-1").get());
    await assertFails(db.doc("teams/team-1").get());
    await assertFails(db.doc("topics/topic-1").get());
  });

  it("an unverified email reads nothing", async () => {
    const db = await ctx({
      uid: "unverified-user",
      email: "unverified@htu.edu.gh",
      registered: true,
      email_verified: false,
    });

    await assertFails(db.doc("users/user-1").get());
    await assertFails(db.doc("teams/team-1").get());
    await assertFails(db.doc("topics/topic-1").get());
  });

  it("a registered member with verified @htu.edu.gh email can read users, teams, and topics", async () => {
    const db = await ctx({
      uid: "user-1",
      email: "user-1@htu.edu.gh",
      registered: true,
      email_verified: true,
    });

    await assertSucceeds(db.doc("users/user-1").get());
    await assertSucceeds(db.doc("teams/team-1").get());
    await assertSucceeds(db.doc("topics/topic-1").get());
  });
});
