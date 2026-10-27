"use client";

import * as React from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { AlertCircle, ArrowRight, ShieldAlert, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/client";
import type { TeamDocument } from "@/types/firestore";
import { PageHeader } from "@/components/common/PageHeader";
import { CreateTeamCard } from "@/components/students/CreateTeamCard";
import { JoinTeamCard } from "@/components/students/JoinTeamCard";
import { TeamDetailsView } from "@/components/students/TeamDetailsView";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function MyTeamPage() {
  const { user, activeRole, loading: authLoading } = useAuth();
  const [team, setTeam] = React.useState<TeamDocument | null>(null);
  const [firestoreLoading, setFirestoreLoading] = React.useState(true);
  const [listenerError, setListenerError] = React.useState<string | null>(null);

  // Set up live Firestore listener for the student's active team
  React.useEffect(() => {
    if (!user || activeRole !== "student") {
      return;
    }

    // Query teams where member_ids contains current user UID
    const teamsQuery = query(
      collection(db, "teams"),
      where("member_ids", "array-contains", user.uid)
    );

    const unsubscribe = onSnapshot(
      teamsQuery,
      (snapshot) => {
        const activeTeams = snapshot.docs
          .map((doc) => doc.data() as TeamDocument)
          .filter((t) => t.status !== "disbanded");

        // Take the active team if one exists
        if (activeTeams.length > 0 && activeTeams[0]) {
          setTeam(activeTeams[0]);
        } else {
          setTeam(null);
        }
        setFirestoreLoading(false);
      },
      (error) => {
        console.error("Firestore onSnapshot error on teams query:", error);
        setListenerError("Failed to synchronize team data in real-time. Please refresh the page.");
        setFirestoreLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user, activeRole]);

  // 1. Initial Authentication & Team Loading State
  if (authLoading || (activeRole === "student" && firestoreLoading)) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 pb-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  // 2. Non-Student Role View Notice (Prompt requirement)
  if (activeRole !== "student") {
    const isSupervisor = activeRole === "supervisor";
    const redirectLink = isSupervisor ? "/supervision" : "/students";
    const redirectLabel = isSupervisor ? "Go to Supervision" : "Go to Students & Pool";

    return (
      <div className="space-y-6">
        <PageHeader
          title="My Team"
          description="Student capstone project group formation and membership workspace."
        />

        <Card className="rounded-xl border bg-card shadow-sm max-w-2xl mx-auto">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/20 text-accent-foreground mb-2">
              <ShieldAlert className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <CardTitle className="text-lg font-semibold">Student Workspace Notice</CardTitle>
            <CardDescription className="text-sm text-muted-foreground max-w-md mx-auto">
              The <strong>My Team</strong> page is dedicated to student team self-formation and invite code management.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center pb-8">
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              As an active <strong className="text-foreground capitalize">{activeRole}</strong>, you can oversee student teams, review project proposals, and manage student allocations from your designated role dashboard.
            </p>
            <div className="pt-2">
              <Button asChild className="gap-2">
                <Link href={redirectLink}>
                  <span>{redirectLabel}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 3. Error State
  if (listenerError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="My Team"
          description="Form your project team, invite classmates, and track your capstone lifecycle."
        />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Connection Error</AlertTitle>
          <AlertDescription>{listenerError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // 4. Student has an active team
  if (team && user) {
    return (
      <div className="space-y-6">
        <TeamDetailsView team={team} currentUserUid={user.uid} />
      </div>
    );
  }

  // 5. Student does not belong to any active team -> Show Create & Join forms
  return (
    <div className="space-y-6">
      <PageHeader
        title="My Team"
        description="Form your project team, invite classmates in your course track, or join an existing group."
      />

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-primary flex items-center gap-3">
        <Sparkles className="h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <span className="font-semibold">Capstone Group Formation is Open:</span> Every final-year student must belong to a single project group of 4 to 5 members within their programme track.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <CreateTeamCard />
        <JoinTeamCard />
      </div>
    </div>
  );
}
