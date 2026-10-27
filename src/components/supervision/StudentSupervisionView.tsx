"use client";

import * as React from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot, doc } from "firebase/firestore";
import {
  UserCheck,
  Building,
  Clock,
  Phone,
  Mail,
  Users,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/client";
import type {
  TeamDocument,
  TopicDocument,
  UserDocument,
  SupervisorContactDocument,
} from "@/types/firestore";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LockedCard } from "@/components/common/LockedCard";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function StudentSupervisionView() {
  const { user } = useAuth();
  const [team, setTeam] = React.useState<TeamDocument | null>(null);
  const [teamLoading, setTeamLoading] = React.useState(true);
  const [listenerError, setListenerError] = React.useState<string | null>(null);

  const [supervisorUser, setSupervisorUser] = React.useState<UserDocument | null>(null);
  const [approvedTopic, setApprovedTopic] = React.useState<TopicDocument | null>(null);

  // Gated contact state
  const [contact, setContact] = React.useState<SupervisorContactDocument | null>(null);
  const [contactGranted, setContactGranted] = React.useState(false);
  const [contactLoading, setContactLoading] = React.useState(false);

  // 1. Listen to student's active team
  React.useEffect(() => {
    if (!user) return;

    const teamsQuery = query(
      collection(db, "teams"),
      where("member_ids", "array-contains", user.uid)
    );

    const unsubscribe = onSnapshot(
      teamsQuery,
      (snapshot) => {
        const active = snapshot.docs
          .map((d) => d.data() as TeamDocument)
          .filter((t) => t.status !== "disbanded");

        if (active.length > 0 && active[0]) {
          setTeam(active[0]);
        } else {
          setTeam(null);
        }
        setTeamLoading(false);
      },
      (error) => {
        console.error("Firestore onSnapshot error on student team:", error);
        setListenerError("Failed to synchronize your team information.");
        setTeamLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // 2. Listen to supervisor user document once assigned
  React.useEffect(() => {
    if (!team?.assigned_supervisor_id) {
      return;
    }

    const supDocRef = doc(db, "users", team.assigned_supervisor_id);
    const unsubscribe = onSnapshot(
      supDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setSupervisorUser(snapshot.data() as UserDocument);
        } else {
          setSupervisorUser(null);
        }
      },
      (error) => {
        console.error("Firestore onSnapshot error on supervisor user:", error);
      }
    );

    return () => {
      unsubscribe();
      setSupervisorUser(null);
    };
  }, [team?.assigned_supervisor_id]);

  // 3. Listen to approved topic details
  React.useEffect(() => {
    if (!team?.id) {
      return;
    }

    // Query topics for this team
    const topicsQuery = query(
      collection(db, "topics"),
      where("team_id", "==", team.id)
    );

    const unsubscribe = onSnapshot(
      topicsQuery,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => d.data() as TopicDocument);
        const approved = docs.find((t) => t.status === "approved") || docs.find((t) => t.is_current);
        setApprovedTopic(approved || null);
      },
      (error) => {
        console.error("Firestore onSnapshot error on approved topic:", error);
      }
    );

    return () => {
      unsubscribe();
      setApprovedTopic(null);
    };
  }, [team?.id]);

  // 4. Read gated supervisor contact info if assignment is accepted
  const isAccepted = team?.supervisor_assignment?.status === "accepted";
  const supervisorId = team?.assigned_supervisor_id;

  React.useEffect(() => {
    if (!isAccepted || !supervisorId) {
      return;
    }

    const contactDocRef = doc(db, "supervisor_contacts", supervisorId);

    const unsubscribe = onSnapshot(
      contactDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setContact(snapshot.data() as SupervisorContactDocument);
          setContactGranted(true);
        } else {
          // Document might not exist in database, but read was allowed
          setContact(null);
          setContactGranted(true);
        }
        setContactLoading(false);
      },
      () => {
        // Read failed because Firestore security rules denied (grant does not exist yet)
        setContact(null);
        setContactGranted(false);
        setContactLoading(false);
      }
    );

    return () => {
      unsubscribe();
      setContact(null);
      setContactGranted(false);
      setContactLoading(false);
    };
  }, [isAccepted, supervisorId]);

  if (teamLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (listenerError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Synchronization Error</AlertTitle>
        <AlertDescription>{listenerError}</AlertDescription>
      </Alert>
    );
  }

  // If no team: empty state guiding to /my-team
  if (!team) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="No Project Team Found"
        description="You must be registered in an active final year capstone project team before faculty supervision can be allocated."
        action={
          <Link href="/my-team">
            <Button size="sm" variant="default">
              Go to My Team
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </Link>
        }
      />
    );
  }

  const assignment = team.supervisor_assignment;
  const supervisorName = supervisorUser
    ? supervisorUser.name || supervisorUser.email
    : "Faculty Supervisor";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. "My Supervisor" Card */}
        <Card className="border-border shadow-sm flex flex-col justify-between">
          <CardHeader className="p-6 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-foreground">
                    Project Supervisor
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    {team.group_number} — {team.name}
                  </CardDescription>
                </div>
              </div>

              {/* Status Badge */}
              <StatusBadge
                domain="supervision"
                value={
                  !team.assigned_supervisor_id || !assignment
                    ? "not_assigned"
                    : assignment.status === "accepted"
                    ? "accepted"
                    : assignment.status === "declined"
                    ? "declined"
                    : "proposed"
                }
              />
            </div>
          </CardHeader>

          <CardContent className="p-6 pt-0 space-y-4">
            {!team.assigned_supervisor_id || !assignment ? (
              <div className="rounded-lg bg-muted/30 p-4 border border-border/60 text-center space-y-1.5">
                <p className="text-sm font-semibold text-foreground">Supervisor Allocation Pending</p>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Your project coordinator will match and assign a faculty supervisor once topic proposals are reviewed.
                </p>
              </div>
            ) : assignment.status === "proposed" ? (
              <div className="rounded-lg bg-info-soft p-4 border border-info/30 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-info">Assignment Proposed</p>
                  <Badge variant="outline" className="text-[10px] border-info/40 text-info">
                    72h Window Active
                  </Badge>
                </div>
                <p className="text-sm font-semibold text-foreground">{supervisorName}</p>
                <p className="text-xs text-muted-foreground">
                  The faculty supervisor has been proposed and notified. Contact and office details will unlock once the assignment is formally accepted.
                </p>
              </div>
            ) : assignment.status === "declined" ? (
              <div className="rounded-lg bg-danger-soft p-4 border border-danger/30 space-y-1.5">
                <p className="text-xs font-semibold text-danger">Reassignment Pending</p>
                <p className="text-xs text-muted-foreground">
                  The previous assignment request was declined by faculty. Your project coordinator will assign an alternate supervisor shortly.
                </p>
              </div>
            ) : (
              /* Accepted Supervisor Details */
              <div className="space-y-3">
                <div className="rounded-lg bg-muted/30 p-3.5 border border-border/60">
                  <p className="text-xs text-muted-foreground">Assigned Faculty Member</p>
                  <p className="text-sm font-bold text-foreground mt-0.5">{supervisorName}</p>
                  {supervisorUser?.email && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5">
                      <Mail className="h-3.5 w-3.5 text-primary" />
                      <span>{supervisorUser.email}</span>
                    </div>
                  )}
                </div>

                {/* Approved Topic Card (Acceptance Criteria: student sees approved topic after acceptance) */}
                {approvedTopic && (
                  <div className="rounded-lg bg-success-soft p-3.5 border border-success/30 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-success uppercase tracking-wider">
                        Approved Capstone Topic
                      </span>
                      <StatusBadge domain="topic" value="approved" />
                    </div>
                    <p className="text-xs font-bold text-foreground">
                      {approvedTopic.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground line-clamp-3">
                      {approvedTopic.abstract}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. Gated Contact Details Card */}
        <div className="flex flex-col">
          {!isAccepted || !contactGranted ? (
            /* Locked Card State: Before acceptance or before grant is verified */
            <LockedCard
              title="Supervisor Consultation Details Locked"
              message="Supervisor consultation hours, office location, and direct contact numbers unlock when your supervisor accepts the assignment and your project topic is approved."
              className="h-full min-h-[260px]"
            />
          ) : contactLoading ? (
            <Card className="border-border shadow-sm h-full p-6 space-y-4">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </Card>
          ) : (
            /* Unlocked Gated Contact Details */
            <Card className="border-border shadow-sm h-full flex flex-col justify-between">
              <CardHeader className="p-6 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold text-foreground">
                      Consultation Details
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Authorized contact and office hours for project milestones.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-xs border-success/40 text-success bg-success-soft gap-1">
                    <UserCheck className="h-3 w-3" />
                    Access Granted
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-6 pt-1 space-y-3.5">
                {/* Office Location */}
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/60">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0 mt-0.5">
                    <Building className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Office Location</p>
                    <p className="text-xs font-semibold text-foreground mt-0.5">
                      {contact?.office_location || "Department of Computer Science"}
                    </p>
                  </div>
                </div>

                {/* Consultation Hours */}
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/60">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0 mt-0.5">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Consultation Hours</p>
                    <p className="text-xs font-semibold text-foreground mt-0.5">
                      {contact?.consultation_hours || "By appointment via institutional email"}
                    </p>
                  </div>
                </div>

                {/* Phone Contact */}
                {contact?.phone && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/60">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0 mt-0.5">
                      <Phone className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Contact Phone</p>
                      <p className="text-xs font-semibold text-foreground font-mono mt-0.5">
                        {contact.phone}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
