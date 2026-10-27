"use client";

import * as React from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Users, Sparkles } from "lucide-react";
import { db } from "@/lib/firebase/client";
import type { TeamDocument, TopicDocument } from "@/types/firestore";
import type { SimilarTopicWarning } from "@/lib/topics/similar";
import { LockedCard } from "@/components/common/LockedCard";
import { Button } from "@/components/ui/button";
import { ProposalSlotCard } from "./ProposalSlotCard";
import { ProposalFormSheet, type ProposalFormMode } from "./ProposalFormSheet";
import { ProposalHistoryDrawer } from "./ProposalHistoryDrawer";
import { SimilarityAlert } from "./SimilarityAlert";

interface TeamProposalsViewProps {
  team: TeamDocument;
  currentUserUid: string;
}

export function TeamProposalsView({ team, currentUserUid }: TeamProposalsViewProps) {
  const isLeader = team.leader_id === currentUserUid;
  const [topics, setTopics] = React.useState<TopicDocument[]>([]);
  const [warnings, setWarnings] = React.useState<SimilarTopicWarning[]>([]);

  // Modal / Sheet states
  const [formOpen, setFormOpen] = React.useState(false);
  const [formMode, setFormMode] = React.useState<ProposalFormMode>("create");
  const [formRank, setFormRank] = React.useState<1 | 2 | 3>(1);
  const [selectedTopic, setSelectedTopic] = React.useState<TopicDocument | null>(null);

  // History Drawer state
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyTopic, setHistoryTopic] = React.useState<TopicDocument | null>(null);

  // Real-time Firestore listener on team's current topic proposals
  React.useEffect(() => {
    if (!team.id) return;

    const topicsRef = collection(db, "topics");
    const topicsQuery = query(
      topicsRef,
      where("team_id", "==", team.id),
      where("is_current", "==", true)
    );

    const unsubscribe = onSnapshot(
      topicsQuery,
      (snapshot) => {
        const docs = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<TopicDocument, "id">),
        }));
        setTopics(docs);
      },
      (error) => {
        console.error("Firestore onSnapshot error on topics query:", error);
      }
    );

    return () => unsubscribe();
  }, [team.id]);

  // Index topics by preference_rank (1, 2, 3)
  const rank1Topic = topics.find((t) => t.preference_rank === 1);
  const rank2Topic = topics.find((t) => t.preference_rank === 2);
  const rank3Topic = topics.find((t) => t.preference_rank === 3);

  const handleOpenCreate = (rank: 1 | 2 | 3) => {
    setFormMode("create");
    setFormRank(rank);
    setSelectedTopic(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (topic: TopicDocument) => {
    setFormMode("edit");
    setFormRank(topic.preference_rank);
    setSelectedTopic(topic);
    setFormOpen(true);
  };

  const handleOpenResubmit = (topic: TopicDocument) => {
    setFormMode("resubmit");
    setFormRank(topic.preference_rank);
    setSelectedTopic(topic);
    setFormOpen(true);
  };

  const handleOpenHistory = (topic: TopicDocument) => {
    setHistoryTopic(topic);
    setHistoryOpen(true);
  };

  const handleSubmissionSuccess = (
    _topicId: string,
    submissionWarnings?: SimilarTopicWarning[]
  ) => {
    if (submissionWarnings && submissionWarnings.length > 0) {
      setWarnings(submissionWarnings);
    }
  };

  const hasMinMembers = team.member_count >= 4;

  return (
    <div className="space-y-6">
      {/* Similarity Warnings Alert */}
      <SimilarityAlert
        warnings={warnings}
        onDismiss={() => setWarnings([])}
      />

      {/* Minimum Members Lock Banner (Spec requirement) */}
      {!hasMinMembers && (
        <LockedCard
          title="Team Formation Incomplete (< 4 Members)"
          message={`Your project team currently has ${team.member_count} of 4 minimum members. You can draft and refine proposals, but submission to faculty is locked until your team reaches at least 4 members.`}
          icon={<Users className="h-5 w-5 text-warning" aria-hidden="true" />}
          className="border-warning/30 bg-warning-soft/30 text-left items-start p-5"
        >
          <Button asChild size="sm" variant="outline" className="text-xs h-8">
            <Link href="/my-team">Go to My Team to Invite Members</Link>
          </Button>
        </LockedCard>
      )}

      {/* Guide Card */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-primary flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <span className="font-semibold">Capstone Proposal Quota:</span> Each group submits up to three ranked proposals (Rank 1 Primary, Rank 2 Secondary, Rank 3 Tertiary). Reviewers evaluate and approve exactly one proposal per team.
          </div>
        </div>
      </div>

      {/* 3 Rank Slot Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ProposalSlotCard
          rank={1}
          topic={rank1Topic}
          team={team}
          isLeader={isLeader}
          onOpenCreate={handleOpenCreate}
          onOpenEdit={handleOpenEdit}
          onOpenResubmit={handleOpenResubmit}
          onOpenHistory={handleOpenHistory}
          onSubmissionSuccess={handleSubmissionSuccess}
        />

        <ProposalSlotCard
          rank={2}
          topic={rank2Topic}
          team={team}
          isLeader={isLeader}
          onOpenCreate={handleOpenCreate}
          onOpenEdit={handleOpenEdit}
          onOpenResubmit={handleOpenResubmit}
          onOpenHistory={handleOpenHistory}
          onSubmissionSuccess={handleSubmissionSuccess}
        />

        <ProposalSlotCard
          rank={3}
          topic={rank3Topic}
          team={team}
          isLeader={isLeader}
          onOpenCreate={handleOpenCreate}
          onOpenEdit={handleOpenEdit}
          onOpenResubmit={handleOpenResubmit}
          onOpenHistory={handleOpenHistory}
          onSubmissionSuccess={handleSubmissionSuccess}
        />
      </div>

      {/* Proposal Create / Edit / Resubmit Sheet */}
      <ProposalFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        teamId={team.id}
        mode={formMode}
        initialRank={formRank}
        existingTopic={selectedTopic}
        onSuccess={handleSubmissionSuccess}
      />

      {/* Proposal Revision History Drawer */}
      <ProposalHistoryDrawer
        topic={historyTopic}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
}
