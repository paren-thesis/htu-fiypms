"use client";

import * as React from "react";
import {
  type User,
  signInWithPopup,
  signOut as firebaseSignOut,
  onIdTokenChanged,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase/client";
import { type UserRole } from "@/config/nav";

export interface UserClaims {
  roles: UserRole[];
  activeRole: UserRole;
  registered: boolean;
  profileComplete: boolean;
  email?: string;
}

export interface AuthContextValue {
  user: User | null;
  claims: UserClaims | null;
  activeRole: UserRole;
  availableRoles: UserRole[];
  setActiveRole: (role: UserRole) => void;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [claims, setClaims] = React.useState<UserClaims | null>(null);
  const [overrideActiveRole, setOverrideActiveRole] = React.useState<UserRole | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Subscribe to Firebase Auth state & ID token changes
  React.useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const tokenResult = await currentUser.getIdTokenResult();
          const idToken = tokenResult.token;

          // Sync session cookie via Route Handler
          const res = await fetch("/api/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          });

          if (!res.ok) {
            // Failed domain check or verification -> force client signout
            await firebaseSignOut(auth);
            setUser(null);
            setClaims(null);
            setLoading(false);
            return;
          }

          const rawRoles = Array.isArray(tokenResult.claims.roles)
            ? (tokenResult.claims.roles as UserRole[])
            : [];
          const rawActiveRole = (tokenResult.claims.activeRole as UserRole) || rawRoles[0] || "student";

          const parsedClaims: UserClaims = {
            roles: rawRoles,
            activeRole: rawActiveRole,
            registered: Boolean(tokenResult.claims.registered),
            profileComplete: Boolean(tokenResult.claims.profileComplete),
            email: currentUser.email || undefined,
          };
          setClaims(parsedClaims);
        } catch (err) {
          console.error("Failed to sync session on id token changed:", err);
        }
      } else {
        setUser(null);
        setClaims(null);
        setOverrideActiveRole(null);
        try {
          await fetch("/api/session", { method: "DELETE" });
        } catch {
          // Ignore delete network errors
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = React.useCallback(async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const email = result.user.email?.toLowerCase();
    if (!email || !email.endsWith("@htu.edu.gh")) {
      await firebaseSignOut(auth);
      throw new Error("Access denied: You must use an official @htu.edu.gh university account.");
    }
  }, []);

  const handleSignOut = React.useCallback(async () => {
    await firebaseSignOut(auth);
    try {
      await fetch("/api/session", { method: "DELETE" });
    } catch {
      // Ignore network errors
    }
    setUser(null);
    setClaims(null);
    setOverrideActiveRole(null);
  }, []);

  const refreshToken = React.useCallback(async () => {
    if (!auth.currentUser) return;
    const freshToken = await auth.currentUser.getIdToken(true);
    const tokenResult = await auth.currentUser.getIdTokenResult();

    // Re-sync session cookie
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: freshToken }),
    });

    const rawRoles = Array.isArray(tokenResult.claims.roles)
      ? (tokenResult.claims.roles as UserRole[])
      : [];
    const rawActiveRole = (tokenResult.claims.activeRole as UserRole) || rawRoles[0] || "student";

    setClaims({
      roles: rawRoles,
      activeRole: rawActiveRole,
      registered: Boolean(tokenResult.claims.registered),
      profileComplete: Boolean(tokenResult.claims.profileComplete),
      email: auth.currentUser.email || undefined,
    });
  }, []);

  const setActiveRole = React.useCallback((role: UserRole) => {
    setOverrideActiveRole(role);
  }, []);

  const activeRole: UserRole = React.useMemo(() => {
    if (overrideActiveRole) return overrideActiveRole;
    return claims?.activeRole || "coordinator";
  }, [overrideActiveRole, claims]);

  const availableRoles: UserRole[] = React.useMemo(() => {
    if (claims?.roles && claims.roles.length > 0) {
      return claims.roles;
    }
    return [
      "student",
      "supervisor",
      "coordinator",
      "panel_member",
      "admin",
    ];
  }, [claims]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      claims,
      activeRole,
      availableRoles,
      setActiveRole,
      loading,
      signInWithGoogle,
      signOut: handleSignOut,
      refreshToken,
    }),
    [
      user,
      claims,
      activeRole,
      availableRoles,
      setActiveRole,
      loading,
      signInWithGoogle,
      handleSignOut,
      refreshToken,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
