import { describe, it, expect } from "vitest";
import { getNavItemsForRole, isNavItemActive } from "./nav";

describe("Navigation Configuration & RBAC Filtering (Spec D-05)", () => {
  it("supervisor nav must NOT contain Students, Roster Import, or Staff Whitelist", () => {
    const supervisorItems = getNavItemsForRole("supervisor");
    const titles = supervisorItems.map((item) => item.title.toLowerCase());
    const hrefs = supervisorItems.map((item) => item.href);

    expect(titles).not.toContain("students");
    expect(titles).not.toContain("students & pool");
    expect(titles).not.toContain("roster import");
    expect(titles).not.toContain("staff whitelist");

    expect(hrefs).not.toContain("/students");
    expect(hrefs).not.toContain("/admin/staff-whitelist");
  });

  it("coordinator nav contains both Students and Staff Whitelist", () => {
    const coordinatorItems = getNavItemsForRole("coordinator");
    const hrefs = coordinatorItems.map((item) => item.href);

    expect(hrefs).toContain("/students");
    expect(hrefs).toContain("/admin/staff-whitelist");
  });

  it("admin nav contains both Students and Staff Whitelist", () => {
    const adminItems = getNavItemsForRole("admin");
    const hrefs = adminItems.map((item) => item.href);

    expect(hrefs).toContain("/students");
    expect(hrefs).toContain("/admin/staff-whitelist");
    expect(hrefs).toContain("/admin/users");
  });

  it("student nav contains expected project lifecycle items", () => {
    const studentItems = getNavItemsForRole("student");
    const hrefs = studentItems.map((item) => item.href);

    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/my-team");
    expect(hrefs).toContain("/proposals");
    expect(hrefs).toContain("/supervision");
    expect(hrefs).toContain("/chapters");
    expect(hrefs).toContain("/deliverables");
    expect(hrefs).toContain("/peer-evaluation");
    expect(hrefs).toContain("/grades");
    expect(hrefs).toContain("/archive");
  });

  it("panel_member nav contains dashboard and marksheet/defense", () => {
    const panelItems = getNavItemsForRole("panel_member");
    const hrefs = panelItems.map((item) => item.href);

    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/defense");
    expect(hrefs).toContain("/defense?tab=marksheet");
  });

  it("panel_member: only My Panels is active on /defense", () => {
    const panelItems = getNavItemsForRole("panel_member");
    const myPanels = panelItems.find((i) => i.title === "My Panels")!;
    const marksheet = panelItems.find((i) => i.title === "Marksheet")!;

    expect(isNavItemActive(myPanels, "/defense", null)).toBe(true);
    expect(isNavItemActive(marksheet, "/defense", null)).toBe(false);
  });

  it("panel_member: only Marksheet is active on /defense?tab=marksheet", () => {
    const panelItems = getNavItemsForRole("panel_member");
    const myPanels = panelItems.find((i) => i.title === "My Panels")!;
    const marksheet = panelItems.find((i) => i.title === "Marksheet")!;

    expect(isNavItemActive(myPanels, "/defense", "marksheet")).toBe(false);
    expect(isNavItemActive(marksheet, "/defense", "marksheet")).toBe(true);
  });

  it("panel_member: only Marksheet is active on dynamic /defense/[panelId]", () => {
    const panelItems = getNavItemsForRole("panel_member");
    const myPanels = panelItems.find((i) => i.title === "My Panels")!;
    const marksheet = panelItems.find((i) => i.title === "Marksheet")!;

    expect(isNavItemActive(myPanels, "/defense/panel-101", null)).toBe(false);
    expect(isNavItemActive(marksheet, "/defense/panel-101", null)).toBe(true);
  });
});
