"use client";

import * as React from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import {
  Users,
  KeyRound,
  Copy,
  Check,
  Edit2,
  Crown,
  User as UserIcon,
  ShieldCheck,
  GraduationCap,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import type { TeamDocument, UserDocument } from "@/types/firestore";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LifecycleStepper } from "@/components/common/LifecycleStepper";
import { LockedCard } from "@/components/common/LockedCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RenameTeamModal } from "./RenameTeamModal";

interface TeamDetailsViewProps {
  team: TeamDocument;
  currentUserUid: string;
}

const PROGRAMME_NAMES: Record<string, string> = {
  "btech-cs": "BTech Computer Science",
  "btech-ict": "BTech Information & Communication Tech",
  "hnd-cs": "HND Computer Science",
  "hnd-ict": "HND Information & Communication Tech",
};

function getLifecycleIndex(status: TeamDocument["status"]): number {
  switch (status) {
    case "formation":
      return 0; // Formation
    case "topic_pending":
      return 1; // Topic
    case "topic_approved":
      return 2; // Supervisor
    case "defense_ready":
      return 4; // Defense
    case "completed":
      return 5; // Grades
    default:
      return 0;
  }
}

export function TeamDetailsView({ team, currentUserUid }: TeamDetailsViewProps) {
  const isLeader = team.leader_id === currentUserUid;
  const [renameModalOpen, setRenameModalOpen] = React.useState(false);
  const [inviteCode, setInviteCode] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [memberUsers, setMemberUsers] = React.useState<Record<string, UserDocument>>({});
  const [loadingMembers, setLoadingMembers] = React.useState(true);

  // 1. Live listener / fetch for invite code from teams/{id}/private/invite
  React.useEffect(() => {
    if (!team.id) return;

    const privateRef = doc(db, "teams", team.id, "private", "invite");
    const unsub = onSnapshot(
      privateRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as { code?: string };
          setInviteCode(data.code || null);
        } else {
          setInviteCode(null);
        }
      },
      (error) => {
        // Non-members will get permission denied per firestore.rules
        console.warn("Unable to read private team invite code:", error.message);
      }
    );

    return () => unsub();
  }, [team.id]);

  // 2. Fetch member user profiles for display
  React.useEffect(() => {
    let isMounted = true;
    async function loadMembers() {
      setLoadingMembers(true);
      const profiles: Record<string, UserDocument> = {};

      await Promise.all(
        team.member_ids.map(async (uid) => {
          try {
            const userSnap = await getDoc(doc(db, "users", uid));
            if (userSnap.exists()) {
              profiles[uid] = userSnap.data() as UserDocument;
            }
          } catch (err) {
            console.error(`Failed to load profile for ${uid}:`, err);
          }
        })
      );

      if (isMounted) {
        setMemberUsers(profiles);
        setLoadingMembers(false);
      }
    }

    loadMembers();
    return () => {
      isMounted = false;
    };
  }, [team.member_ids]);

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      toast.success("Invite code copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy code to clipboard");
    }
  };

  const courseDisplayName = PROGRAMME_NAMES[team.course_id.toLowerCase().trim()] || team.course_id.toUpperCase();
  const currentStepIndex = getLifecycleIndex(team.status);
  const isFull = team.member_count >= team.max_members;

  return (
    <div className="space-y-6">
      {/* Team Header Card */}
      <Card className="rounded-xl border bg-card shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold tracking-wider rounded-md bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5">
                  {team.group_number}
                </span>
                <StatusBadge domain="team" value={team.status} />
                <Badge variant="outline" className="text-xs font-medium">
                  <GraduationCap className="h-3 w-3 mr-1 text-muted-foreground" aria-hidden="true" />
                  {courseDisplayName}
                </Badge>
              </div>

              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{team.name}</h1>
                {isLeader && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRenameModalOpen(true)}
                    className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                    title="Rename Team"
                  >
                    <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Rename</span>
                  </Button>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Academic Cohort {team.academic_year_id} · Max Capacity: {team.max_members} Students
              </p>
            </div>

            {/* Quick capacity pill */}
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
              <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="font-medium text-foreground">
                <strong className="font-semibold text-primary">{team.member_count}</strong> of {team.max_members} spots filled
              </span>
            </div>
          </div>

          {/* Stepper Progress */}
          <div className="mt-6 pt-6 border-t border-border">
            <div className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Project Journey
            </div>
            <LifecycleStepper currentIndex={currentStepIndex} />
          </div>
        </CardContent>
      </Card>

      {/* Grid: Members + Sidebar (Invite Code & Supervisor) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column (2 Cols): Member List */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-xl border bg-card shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Team Members</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Official project teammates registered in your group.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-xs tabular-nums">
                {team.member_count} / {team.max_members}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {team.member_ids.map((uid) => {
                  const userDoc = memberUsers[uid];
                  const isMemberLeader = uid === team.leader_id;
                  const isCurrentUser = uid === currentUserUid;

                  return (
                    <div
                      key={uid}
                      className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                          {userDoc?.name ? (
                            userDoc.name
                              .split(" ")
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join("")
                              .toUpperCase()
                          ) : (
                            <UserIcon className="h-4 w-4" aria-hidden="true" />
                          )}
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {userDoc?.name || (loadingMembers ? "Loading..." : "Student")}
                            </span>
                            {isCurrentUser && (
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium text-muted-foreground">
                                You
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            {userDoc?.profile?.index_number && (
                              <span className="font-mono">{userDoc.profile.index_number}</span>
                            )}
                            {userDoc?.email && <span>· {userDoc.email}</span>}
                          </div>
                        </div>
                      </div>

                      <div>
                        {isMemberLeader ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                            <Crown className="h-3 w-3" aria-hidden="true" />
                            <span>Leader</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                            <span>Member</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!isFull && team.status === "formation" && (
                <div className="mt-5 rounded-lg border border-dashed border-border bg-muted/20 p-3 text-center text-xs text-muted-foreground">
                  Your team needs {Math.max(0, 4 - team.member_count)} more member{4 - team.member_count === 1 ? "" : "s"} to reach the minimum size of 4.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column (1 Col): Invite Code & Supervisor Card */}
        <div className="space-y-6">
          {/* Invite Code Card */}
          <Card className="rounded-xl border bg-card shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-primary">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                <CardTitle className="text-sm font-semibold">Team Invite Code</CardTitle>
              </div>
              <CardDescription className="text-xs text-muted-foreground">
                Share this code with teammates in your programme track to join your group.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {inviteCode ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
                    <span className="font-mono text-xl font-extrabold tracking-widest text-foreground select-all">
                      {inviteCode}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCopyCode}
                      className="h-8 gap-1.5 text-xs"
                      disabled={copied}
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Copy</span>
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Only students in <strong className="text-foreground">{courseDisplayName}</strong> can join this team.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                  {isFull
                    ? "Team has reached maximum capacity (5 members)."
                    : "Invite code is loading or unavailable."}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Supervisor Placeholder Card */}
          <LockedCard
            title="Project Supervisor"
            message="Supervisor matching and direct consultation details unlock once your topic proposals are approved."
            icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
          />
        </div>
      </div>

      {/* Rename Modal */}
      {isLeader && (
        <RenameTeamModal
          teamId={team.id}
          currentName={team.name}
          open={renameModalOpen}
          onOpenChange={setRenameModalOpen}
        />
      )}
    </div>
  );
}
