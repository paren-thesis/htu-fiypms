import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { RosterStudentDocument, TeamDocument } from '@/types/firestore';
import {
  evaluateStudentStateWithFakes,
  isStudentOnActiveTeam,
} from './student-guards';
import { Timestamp } from 'firebase-admin/firestore';

describe('student-guards (unit tests with fakes)', () => {
  const mockNow = Timestamp.now();

  const mockActiveStudent: RosterStudentDocument = {
    index_number: '0323080001',
    full_name: 'Kofi Mensah',
    contact: '+233241234567',
    email: '0323080001@htu.edu.gh',
    course_id: 'btech-cs',
    imported_by_uid: 'coord-1',
    imported_at: mockNow,
    import_batch_id: 'batch-1',
    user_uid: 'stu-0323080001',
    signup_completed_at: mockNow,
    is_active: true,
  };

  const mockActiveTeam: TeamDocument = {
    id: 'team-cs-01',
    name: 'Alpha Systems',
    group_number: 'BCS26_01',
    course_id: 'btech-cs',
    academic_year_id: '2025-2026',
    leader_id: 'stu-0323080001',
    member_ids: ['stu-0323080001', 'stu-0323080002'],
    member_count: 2,
    max_members: 5,
    status: 'formation',
    created_at: mockNow,
    updated_at: mockNow,
  };

  const mockDisbandedTeam: TeamDocument = {
    ...mockActiveTeam,
    id: 'team-cs-disbanded',
    status: 'disbanded',
  };

  describe('evaluateStudentStateWithFakes', () => {
    it('returns empty/false state when student does not exist', () => {
      const state = evaluateStudentStateWithFakes(null, null);
      expect(state).toEqual({
        exists: false,
        linked: false,
        uid: null,
        onActiveTeam: false,
        teamId: undefined,
        active: false,
      });
    });

    it('identifies unlinked active student with missing is_active as active (A6 default)', () => {
      const unlinkedStudentWithoutIsActive: RosterStudentDocument = {
        ...mockActiveStudent,
        user_uid: null,
        signup_completed_at: null,
        is_active: undefined, // Missing value counts as true
      };

      const state = evaluateStudentStateWithFakes(unlinkedStudentWithoutIsActive, null);
      expect(state.exists).toBe(true);
      expect(state.linked).toBe(false);
      expect(state.uid).toBeNull();
      expect(state.active).toBe(true);
      expect(state.onActiveTeam).toBe(false);
      expect(state.teamId).toBeUndefined();
    });

    it('identifies deactivated student (is_active === false)', () => {
      const deactivatedStudent: RosterStudentDocument = {
        ...mockActiveStudent,
        is_active: false,
        deactivation_reason: 'Withdrawn from programme',
      };

      const state = evaluateStudentStateWithFakes(deactivatedStudent, null);
      expect(state.exists).toBe(true);
      expect(state.active).toBe(false);
    });

    it('identifies student on an active team', () => {
      const state = evaluateStudentStateWithFakes(mockActiveStudent, mockActiveTeam);
      expect(state.exists).toBe(true);
      expect(state.linked).toBe(true);
      expect(state.uid).toBe('stu-0323080001');
      expect(state.onActiveTeam).toBe(true);
      expect(state.teamId).toBe('team-cs-01');
      expect(state.active).toBe(true);
    });

    it('identifies student on a disbanded team as NOT on an active team', () => {
      const state = evaluateStudentStateWithFakes(mockActiveStudent, mockDisbandedTeam);
      expect(state.exists).toBe(true);
      expect(state.linked).toBe(true);
      expect(state.onActiveTeam).toBe(false);
      expect(state.teamId).toBeUndefined();
    });
  });

  describe('isStudentOnActiveTeam (with mocked Firestore)', () => {
    it('returns false when uid is empty or whitespace', async () => {
      expect(await isStudentOnActiveTeam('')).toBe(false);
      expect(await isStudentOnActiveTeam('   ')).toBe(false);
    });
  });
});
