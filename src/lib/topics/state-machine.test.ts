import { describe, it, expect } from 'vitest';
import {
  canTransition,
  getAllowedTransitions,
  ALL_TOPIC_STATUSES,
  type TopicStatus,
  type TopicTransitionActor,
} from './state-machine';

describe('Topic Proposal State Machine (FR-03.2)', () => {
  const allowedTransitions: { from: TopicStatus; to: TopicStatus; actor: TopicTransitionActor }[] = [
    { from: 'draft', to: 'submitted', actor: 'team' },
    { from: 'submitted', to: 'under_review', actor: 'supervisor' },
    { from: 'under_review', to: 'approved', actor: 'supervisor' },
    { from: 'under_review', to: 'rejected', actor: 'supervisor' },
    { from: 'under_review', to: 'revision_requested', actor: 'supervisor' },
    { from: 'revision_requested', to: 'submitted', actor: 'team' },
    { from: 'rejected', to: 'submitted', actor: 'team' },
  ];

  it('allows all specified valid transitions for the correct actor', () => {
    for (const { from, to, actor } of allowedTransitions) {
      expect(canTransition(from, to, actor)).toBe(true);
    }
  });

  it('allows coordinator and admin to act as supervisor on staff transitions', () => {
    const supervisorTransitions: { from: TopicStatus; to: TopicStatus }[] = [
      { from: 'submitted', to: 'under_review' },
      { from: 'under_review', to: 'approved' },
      { from: 'under_review', to: 'rejected' },
      { from: 'under_review', to: 'revision_requested' },
    ];

    for (const { from, to } of supervisorTransitions) {
      expect(canTransition(from, to, 'coordinator')).toBe(true);
      expect(canTransition(from, to, 'admin')).toBe(true);
      // Team cannot perform these
      expect(canTransition(from, to, 'team')).toBe(false);
    }
  });

  it('disallows team transitions when attempted by supervisor or staff', () => {
    expect(canTransition('draft', 'submitted', 'supervisor')).toBe(false);
    expect(canTransition('revision_requested', 'submitted', 'supervisor')).toBe(false);
    expect(canTransition('rejected', 'submitted', 'supervisor')).toBe(false);
  });

  it('disallows same-state transitions', () => {
    const actors: TopicTransitionActor[] = ['team', 'supervisor', 'coordinator', 'admin'];
    for (const status of ALL_TOPIC_STATUSES) {
      for (const actor of actors) {
        expect(canTransition(status, status, actor)).toBe(false);
      }
    }
  });

  it('exhaustively disallows every illegal pair', () => {
    const actors: TopicTransitionActor[] = ['team', 'supervisor'];

    for (const actor of actors) {
      for (const from of ALL_TOPIC_STATUSES) {
        for (const to of ALL_TOPIC_STATUSES) {
          const isExplicitlyAllowed = allowedTransitions.some(
            (t) => t.from === from && t.to === to && t.actor === actor
          );

          if (!isExplicitlyAllowed) {
            expect(canTransition(from, to, actor)).toBe(false);
          }
        }
      }
    }
  });

  it('getAllowedTransitions returns correct sets for each state and actor', () => {
    expect(getAllowedTransitions('draft', 'team')).toEqual(['submitted']);
    expect(getAllowedTransitions('draft', 'supervisor')).toEqual([]);

    expect(getAllowedTransitions('submitted', 'team')).toEqual([]);
    expect(getAllowedTransitions('submitted', 'supervisor')).toEqual(['under_review']);

    expect(getAllowedTransitions('under_review', 'supervisor')).toEqual([
      'approved',
      'rejected',
      'revision_requested',
    ]);
    expect(getAllowedTransitions('under_review', 'team')).toEqual([]);

    expect(getAllowedTransitions('revision_requested', 'team')).toEqual(['submitted']);
    expect(getAllowedTransitions('rejected', 'team')).toEqual(['submitted']);

    expect(getAllowedTransitions('approved', 'team')).toEqual([]);
    expect(getAllowedTransitions('approved', 'supervisor')).toEqual([]);
  });
});
