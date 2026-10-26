// TODO(02-01): Temporary DevSession for phase 0/1. Replaced by AuthContext in 02-01.
"use client";

import * as React from "react";
import { type UserRole } from "@/config/nav";

export interface DevUser {
  name: string;
  email: string;
  roles: UserRole[];
  activeRole: UserRole;
}

interface DevSessionContextValue {
  user: DevUser;
  activeRole: UserRole;
  setActiveRole: (role: UserRole) => void;
  availableRoles: UserRole[];
}

const DevSessionContext = React.createContext<DevSessionContextValue | undefined>(undefined);

const ALL_ROLES: UserRole[] = [
  "student",
  "supervisor",
  "coordinator",
  "panel_member",
  "admin",
];

export function DevSessionProvider({
  children,
  initialRole,
}: {
  children: React.ReactNode;
  initialRole?: UserRole;
}) {
  const envRole = (process.env.NEXT_PUBLIC_DEV_ROLE as UserRole) || undefined;
  const startingRole: UserRole = initialRole ?? envRole ?? "coordinator";

  const [activeRole, setActiveRoleState] = React.useState<UserRole>(startingRole);

  const user: DevUser = React.useMemo(() => {
    const roleNames: Record<UserRole, string> = {
      student: "Kofi Boateng (Student)",
      supervisor: "Dr. Alex Mensah (Supervisor)",
      coordinator: "Dr. Alex Mensah (Coordinator)",
      panel_member: "Dr. Alex Mensah (Panel Examiner)",
      admin: "System Administrator",
    };

    const roleEmails: Record<UserRole, string> = {
      student: "0420000001@htu.edu.gh",
      supervisor: "amensah@htu.edu.gh",
      coordinator: "amensah@htu.edu.gh",
      panel_member: "amensah@htu.edu.gh",
      admin: "admin@htu.edu.gh",
    };

    return {
      name: roleNames[activeRole] ?? "HTU Faculty Member",
      email: roleEmails[activeRole] ?? "faculty@htu.edu.gh",
      roles: ALL_ROLES,
      activeRole,
    };
  }, [activeRole]);

  const setActiveRole = React.useCallback((role: UserRole) => {
    setActiveRoleState(role);
  }, []);

  const value = React.useMemo(
    () => ({
      user,
      activeRole,
      setActiveRole,
      availableRoles: ALL_ROLES,
    }),
    [user, activeRole, setActiveRole]
  );

  return (
    <DevSessionContext.Provider value={value}>
      {children}
    </DevSessionContext.Provider>
  );
}

export function useDevSession() {
  const context = React.useContext(DevSessionContext);
  if (!context) {
    throw new Error("useDevSession must be used within a DevSessionProvider");
  }
  return context;
}
