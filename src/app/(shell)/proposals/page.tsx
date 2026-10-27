"use client";

import * as React from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Users, ArrowRight, ShieldAlert, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/client";
import type { TeamDocument } from "@/types/firestore";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { TeamProposalsView } from "@/components/proposals/TeamProposalsView";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function ProposalsPage() {
  const { user, activeRole, loading: authLoading } = useAuth();
  const [team, setTeam] = React.useState<TeamDocument | null>(null);
  const [firestoreLoading, setFirestoreLoading] = React.useState(true);
  const [listenerError, setListenerError] = React.useState<string | null>(null);

  const isStudent = activeRole === "student";

  // Set up live Firestore listener for the student's active team
  React.useEffect(() => {
    if (!user || !isStudent) {
      return;
    }

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

        if (activeTeams.length > 0 && activeTeams[0]) {
          setTeam(activeTeams[0]);
        } else {
          setTeam(null);
        }
        setFirestoreLoading(false);
      },
      (error) => {
        console.error("Firestore onSnapshot error on teams query:", error);
        setListenerError("Failed to synchronize group details. Please refresh the page.");
        setFirestoreLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, isStudent]);

  // 1. Initial Authentication & Team Loading State
  if (authLoading || (isStudent && firestoreLoading)) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  // 2. Non-Student Role View
  if (activeRole !== "student") {
    const isSupervisor = activeRole === "supervisor";
    const redirectLink = isSupervisor ? "/supervision" : "/students";
    const redirectLabel = isSupervisor ? "Go to Supervision" : "Go to Students & Pool";

    return (
      <div className="space-y-6">
        <PageHeader
          title="Topic Proposals"
          description="Student capstone project topic proposal drafting and submission workspace."
        />

        <Card className="rounded-xl border bg-card shadow-sm max-w-2xl mx-auto">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/20 text-accent-foreground mb-2">
              <ShieldAlert className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <CardTitle className="text-lg font-semibold">Faculty & Admin Notice</CardTitle>
            <CardDescription className="text-sm text-muted-foreground max-w-md mx-auto">
              This proposals workspace is designated for student project groups to draft and submit their ranked project proposals.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center pb-8">
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              As an active <strong className="text-foreground capitalize">{activeRole}</strong>, you can oversee cohort progress, review assigned project proposals, and manage student allocations from your dedicated workspace.
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

  // 3. Listener Error State
  if (listenerError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Topic Proposals"
          description="Draft, submit, and manage your project topic proposals and versioned revisions."
        />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Connection Error</AlertTitle>
          <AlertDescription>{listenerError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // 4. Student has no active team yet
  if (!team && user) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Topic Proposals"
          description="Draft, submit, and manage your project topic proposals and versioned revisions."
        />
        <EmptyState
          icon={<Users className="h-6 w-6 text-primary" aria-hidden="true" />}
          title="No Project Team Joined"
          description="You must belong to an active project group before drafting and submitting topic proposals. Create a team or join using an invite code."
          action={
            <Button asChild size="sm" className="gap-2">
              <Link href="/my-team">
                <span>Go to My Team</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  // 5. Student has an active team -> Show Proposals Workspace
  return (
    <div className="space-y-6">
      <PageHeader
        title="Topic Proposals"
        description={`${team!.group_number} · ${team!.name} — Draft and submit up to three ranked proposals for departmental review.`}
      />

      <TeamProposalsView team={team!} currentUserUid={user!.uid} />
    </div>
  );
}
