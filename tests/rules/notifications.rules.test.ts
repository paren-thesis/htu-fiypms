import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { ctx, seed, clearFirestoreData, cleanupTestEnv } from "./helpers";

describe("Rule: Notifications Collection", () => {
  const recipientUid = "user-recipient-1";
  const otherUserUid = "user-other-2";
  const notifId = "notif-test-1";

  beforeAll(async () => {
    await clearFirestoreData();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  beforeEach(async () => {
    await clearFirestoreData();

    await seed(async (db) => {
      await db.doc(`notifications/${notifId}`).set({
        id: notifId,
        user_id: recipientUid,
        title: "Milestone Reviewed",
        body: "Your supervisor approved Chapter 1.",
        type: "chapter_review",
        is_read: false,
        created_at: new Date(),
      });
    });
  });

  it("recipient can read their own notification", async () => {
    const userDb = await ctx({ uid: recipientUid });
    await assertSucceeds(userDb.doc(`notifications/${notifId}`).get());
  });

  it("other user cannot read recipient's notification", async () => {
    const otherDb = await ctx({ uid: otherUserUid });
    await assertFails(otherDb.doc(`notifications/${notifId}`).get());
  });

  it("client cannot create notifications (server actions only)", async () => {
    const userDb = await ctx({ uid: recipientUid });
    await assertFails(
      userDb.doc("notifications/new-notif").set({
        id: "new-notif",
        user_id: recipientUid,
        title: "Malicious Notif",
        body: "Fake alert",
        type: "system",
        is_read: false,
      })
    );
  });

  it("recipient can update is_read only (F-17)", async () => {
    const userDb = await ctx({ uid: recipientUid });
    await assertSucceeds(
      userDb.doc(`notifications/${notifId}`).update({
        is_read: true,
      })
    );
  });

  it("recipient cannot modify other fields like title, body, or user_id", async () => {
    const userDb = await ctx({ uid: recipientUid });
    await assertFails(
      userDb.doc(`notifications/${notifId}`).update({
        title: "Changed Title",
      })
    );
    await assertFails(
      userDb.doc(`notifications/${notifId}`).update({
        is_read: true,
        body: "Changed Body",
      })
    );
  });

  it("recipient can delete their own notification", async () => {
    const userDb = await ctx({ uid: recipientUid });
    await assertSucceeds(userDb.doc(`notifications/${notifId}`).delete());
  });

  it("other user cannot delete recipient's notification", async () => {
    const otherDb = await ctx({ uid: otherUserUid });
    await assertFails(otherDb.doc(`notifications/${notifId}`).delete());
  });
});
