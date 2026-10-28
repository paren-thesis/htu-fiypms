import { describe, it, expect } from "vitest";
import { newUnread, type NotificationLike } from "./diff";
import { getDateGroup, formatRelativeTime, toJsDate } from "./format";

interface TestNotification extends NotificationLike {
  title?: string;
}

describe("newUnread (pure diff)", () => {
  it("returns empty array when next is null, undefined, or empty", () => {
    const prev: NotificationLike[] = [{ id: "1", is_read: false }];
    expect(newUnread(prev, [])).toEqual([]);
    expect(newUnread(prev, null)).toEqual([]);
    expect(newUnread(prev, undefined)).toEqual([]);
  });

  it("returns empty array when all items in next were already in prev", () => {
    const prev: NotificationLike[] = [
      { id: "1", is_read: false },
      { id: "2", is_read: true },
    ];
    const next: NotificationLike[] = [
      { id: "1", is_read: false },
      { id: "2", is_read: true },
    ];
    expect(newUnread(prev, next)).toEqual([]);
  });

  it("returns newly arrived unread items", () => {
    const prev: TestNotification[] = [{ id: "1", is_read: false }];
    const next: TestNotification[] = [
      { id: "2", is_read: false, title: "New Topic" },
      { id: "1", is_read: false },
    ];
    const diff = newUnread(prev, next);
    expect(diff).toEqual([{ id: "2", is_read: false, title: "New Topic" }]);
  });

  it("filters out newly arrived items that are already read", () => {
    const prev: TestNotification[] = [{ id: "1", is_read: false }];
    const next: TestNotification[] = [
      { id: "2", is_read: true, title: "Already Read" },
      { id: "3", is_read: false, title: "Unread Alert" },
      { id: "1", is_read: false },
    ];
    const diff = newUnread(prev, next);
    expect(diff).toEqual([{ id: "3", is_read: false, title: "Unread Alert" }]);
  });

  it("does not return items in prev even if marked unread in next", () => {
    const prev: NotificationLike[] = [{ id: "1", is_read: true }];
    const next: NotificationLike[] = [{ id: "1", is_read: false }];
    expect(newUnread(prev, next)).toEqual([]);
  });

  it("handles empty prev gracefully", () => {
    const next: NotificationLike[] = [
      { id: "1", is_read: false },
      { id: "2", is_read: true },
    ];
    expect(newUnread([], next)).toEqual([{ id: "1", is_read: false }]);
    expect(newUnread(null, next)).toEqual([{ id: "1", is_read: false }]);
  });

  it("preserves ordering of incoming new unread items", () => {
    const prev: NotificationLike[] = [];
    const next: NotificationLike[] = [
      { id: "a", is_read: false },
      { id: "b", is_read: false },
      { id: "c", is_read: false },
    ];
    expect(newUnread(prev, next).map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});

describe("Notification format & group utilities", () => {
  const baseNow = new Date(2026, 9, 28, 12, 0, 0); // Oct 28, 2026 12:00:00

  it("groups dates into Today, Yesterday, This Week, and Older", () => {
    const today = new Date(2026, 9, 28, 8, 30, 0);
    const yesterday = new Date(2026, 9, 27, 14, 0, 0);
    const threeDaysAgo = new Date(2026, 9, 25, 10, 0, 0);
    const twoWeeksAgo = new Date(2026, 9, 10, 10, 0, 0);

    expect(getDateGroup(today, baseNow)).toBe("Today");
    expect(getDateGroup(yesterday, baseNow)).toBe("Yesterday");
    expect(getDateGroup(threeDaysAgo, baseNow)).toBe("This Week");
    expect(getDateGroup(twoWeeksAgo, baseNow)).toBe("Older");
  });

  it("formats relative time correctly", () => {
    expect(formatRelativeTime(new Date(baseNow.getTime() - 20 * 1000), baseNow)).toBe("Just now");
    expect(formatRelativeTime(new Date(baseNow.getTime() - 5 * 60 * 1000), baseNow)).toBe("5m ago");
    expect(formatRelativeTime(new Date(baseNow.getTime() - 3 * 3600 * 1000), baseNow)).toBe("3h ago");
    expect(formatRelativeTime(new Date(baseNow.getTime() - 24 * 3600 * 1000), baseNow)).toBe("Yesterday");
    expect(formatRelativeTime(new Date(baseNow.getTime() - 3 * 24 * 3600 * 1000), baseNow)).toBe("3d ago");
  });

  it("handles Firestore seconds object in toJsDate", () => {
    const secondsObj = { seconds: Math.floor(baseNow.getTime() / 1000), nanoseconds: 0 };
    expect(toJsDate(secondsObj).getTime()).toBe(Math.floor(baseNow.getTime() / 1000) * 1000);
  });
});
