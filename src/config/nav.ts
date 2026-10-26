import {
  LayoutDashboard,
  Users,
  FileText,
  UserCheck,
  BookOpen,
  PackageCheck,
  HeartHandshake,
  GraduationCap,
  Archive,
  ShieldCheck,
  ListChecks,
  Calendar,
  FileSpreadsheet,
  ScrollText,
  UserCog,
  type LucideIcon,
} from "lucide-react";

export type UserRole =
  | "student"
  | "supervisor"
  | "coordinator"
  | "panel_member"
  | "admin";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string | number;
}

export const ROLE_NAV_CONFIG: Record<UserRole, NavItem[]> = {
  student: [
    { title: "Dashboard", href: "/", icon: LayoutDashboard },
    { title: "My Team", href: "/my-team", icon: Users },
    { title: "Proposals", href: "/proposals", icon: FileText },
    { title: "Supervisor", href: "/supervision", icon: UserCheck },
    { title: "Chapters", href: "/chapters", icon: BookOpen },
    { title: "Deliverables", href: "/deliverables", icon: PackageCheck },
    { title: "Peer Evaluation", href: "/peer-evaluation", icon: HeartHandshake },
    { title: "Grades", href: "/grades", icon: GraduationCap },
    { title: "Archive", href: "/archive", icon: Archive },
  ],
  supervisor: [
    // Spec D-05: Supervisors must NOT see Roster Import, Students or Staff Whitelist
    { title: "Dashboard", href: "/", icon: LayoutDashboard },
    { title: "My Teams", href: "/my-team", icon: Users },
    { title: "Proposal Review", href: "/proposals", icon: FileText },
    { title: "Chapter Review", href: "/chapters", icon: BookOpen },
    { title: "Sign-off", href: "/deliverables", icon: PackageCheck },
    { title: "Assessments", href: "/defense", icon: Calendar },
    { title: "Archive", href: "/archive", icon: Archive },
  ],
  coordinator: [
    { title: "Dashboard", href: "/", icon: LayoutDashboard },
    { title: "Students & Pool", href: "/students", icon: GraduationCap },
    { title: "Staff Whitelist", href: "/admin/staff-whitelist", icon: ShieldCheck },
    { title: "Matching", href: "/supervision", icon: UserCheck },
    { title: "Rubrics", href: "/rubrics", icon: ListChecks },
    { title: "Defense", href: "/defense", icon: Calendar },
    { title: "Reports", href: "/reports", icon: FileSpreadsheet },
    { title: "Audit Logs", href: "/audit-logs", icon: ScrollText },
  ],
  panel_member: [
    { title: "Dashboard", href: "/", icon: LayoutDashboard },
    { title: "My Panels", href: "/defense", icon: Calendar },
    { title: "Marksheet", href: "/defense?tab=marksheet", icon: ListChecks },
  ],
  admin: [
    // Spec D-05: Admin sees both Students and Staff Whitelist
    { title: "Dashboard", href: "/", icon: LayoutDashboard },
    { title: "Students & Pool", href: "/students", icon: GraduationCap },
    { title: "Staff Whitelist", href: "/admin/staff-whitelist", icon: ShieldCheck },
    { title: "Users & Roles", href: "/admin/users", icon: UserCog },
    { title: "Audit Logs", href: "/audit-logs", icon: ScrollText },
  ],
};

export const ALL_ROUTES_LIST: { title: string; href: string; category?: string }[] = [
  { title: "Dashboard", href: "/", category: "General" },
  { title: "My Team", href: "/my-team", category: "Projects" },
  { title: "Topic Proposals", href: "/proposals", category: "Projects" },
  { title: "Supervisor & Matching", href: "/supervision", category: "Supervision" },
  { title: "Chapter Reviews", href: "/chapters", category: "Projects" },
  { title: "Defense Schedule & Panels", href: "/defense", category: "Defense" },
  { title: "Rubric Builder", href: "/rubrics", category: "Grading" },
  { title: "Broadsheet Reports", href: "/reports", category: "Reports" },
  { title: "Students & Roster Pool", href: "/students", category: "Administration" },
  { title: "Peer Evaluation", href: "/peer-evaluation", category: "Grading" },
  { title: "Deliverables & Sign-off", href: "/deliverables", category: "Projects" },
  { title: "Grades & Results", href: "/grades", category: "Grading" },
  { title: "Project Archive", href: "/archive", category: "General" },
  { title: "Notifications", href: "/notifications", category: "General" },
  { title: "Security Audit Logs", href: "/audit-logs", category: "Administration" },
  { title: "Staff Whitelist", href: "/admin/staff-whitelist", category: "Administration" },
  { title: "Users & Access Control", href: "/admin/users", category: "Administration" },
];

export function getNavItemsForRole(role: UserRole): NavItem[] {
  return ROLE_NAV_CONFIG[role] ?? ROLE_NAV_CONFIG.student;
}

/**
 * Accurately determines if a navigation item is currently active.
 * Handles exact matching for dashboard (/), subpath prefixes, and
 * tab differentiation between "My Panels" (/defense) and "Marksheet" (/defense?tab=marksheet).
 */
export function isNavItemActive(
  item: { title: string; href: string },
  pathname: string,
  currentTab?: string | null
): boolean {
  if (item.href === "/") {
    return pathname === "/";
  }

  // Panel Member "Marksheet" item (targeted via ?tab=marksheet or dynamic [panelId] route)
  if (item.title === "Marksheet") {
    if (pathname === "/defense" && currentTab === "marksheet") return true;
    if (pathname.startsWith("/defense/")) return true;
    return false;
  }

  // Panel Member "My Panels" item (the schedule overview at /defense)
  if (item.title === "My Panels") {
    if (currentTab === "marksheet") return false;
    if (pathname.startsWith("/defense/")) return false;
    return pathname === "/defense";
  }

  // Generic matching for all other routes
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
