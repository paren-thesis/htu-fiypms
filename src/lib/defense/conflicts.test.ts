import { describe, it, expect } from 'vitest';
import {
  overlaps,
  detectConflicts,
  type DefensePanelInput,
} from './conflicts';

describe('Defense Scheduling Conflict Detection', () => {
  describe('overlaps(a, b)', () => {
    it('detects intersecting intervals', () => {
      expect(overlaps({ start: 100, end: 200 }, { start: 150, end: 250 })).toBe(true);
      expect(overlaps({ start: 150, end: 250 }, { start: 100, end: 200 })).toBe(true);
      expect(overlaps({ start: 100, end: 300 }, { start: 150, end: 200 })).toBe(true);
    });

    it('returns false for disjoint intervals', () => {
      expect(overlaps({ start: 100, end: 200 }, { start: 300, end: 400 })).toBe(false);
    });

    it('returns false for back-to-back intervals (strict inequality)', () => {
      expect(overlaps({ start: 100, end: 200 }, { start: 200, end: 300 })).toBe(false);
      expect(overlaps({ start: 200, end: 300 }, { start: 100, end: 200 })).toBe(false);
    });
  });

  describe('detectConflicts(panels)', () => {
    const baseTime = 1700000000000;
    const hour = 3600000;

    it('returns no conflicts when panels have distinct examiners, venues and times', () => {
      const panels: DefensePanelInput[] = [
        {
          id: 'p1',
          panel_name: 'Panel 1',
          venue: 'CS Lab 1',
          is_virtual: false,
          chair_id: 'chair_1',
          examiner_ids: ['examiner_1', 'examiner_2'],
          time_slots: [
            {
              slot_id: 's1',
              team_id: 'team_1',
              start_time: baseTime,
              end_time: baseTime + hour,
              status: 'scheduled',
            },
          ],
        },
        {
          id: 'p2',
          panel_name: 'Panel 2',
          venue: 'CS Lab 2',
          is_virtual: false,
          chair_id: 'chair_2',
          examiner_ids: ['examiner_3', 'examiner_4'],
          time_slots: [
            {
              slot_id: 's2',
              team_id: 'team_2',
              start_time: baseTime,
              end_time: baseTime + hour,
              status: 'scheduled',
            },
          ],
        },
      ];

      const conflicts = detectConflicts(panels);
      expect(conflicts).toHaveLength(0);
    });

    it('returns no conflict for back-to-back slots with same examiner or venue', () => {
      const panels: DefensePanelInput[] = [
        {
          id: 'p1',
          panel_name: 'Panel 1',
          venue: 'CS Lab 1',
          is_virtual: false,
          chair_id: 'chair_1',
          examiner_ids: ['examiner_shared'],
          time_slots: [
            {
              slot_id: 's1',
              team_id: 'team_1',
              start_time: baseTime,
              end_time: baseTime + hour, // 10:00 - 11:00
              status: 'scheduled',
            },
          ],
        },
        {
          id: 'p2',
          panel_name: 'Panel 2',
          venue: 'CS Lab 1', // Same venue, but back-to-back
          is_virtual: false,
          chair_id: 'chair_2',
          examiner_ids: ['examiner_shared'], // Same examiner, but back-to-back
          time_slots: [
            {
              slot_id: 's2',
              team_id: 'team_2',
              start_time: baseTime + hour, // 11:00 - 12:00
              end_time: baseTime + 2 * hour,
              status: 'scheduled',
            },
          ],
        },
      ];

      const conflicts = detectConflicts(panels);
      expect(conflicts).toHaveLength(0);
    });

    it('detects examiner double-booked across different panels during overlapping slots', () => {
      const panels: DefensePanelInput[] = [
        {
          id: 'p1',
          panel_name: 'Software Systems Panel',
          venue: 'CS Lab 1',
          is_virtual: false,
          chair_id: 'chair_1',
          examiner_ids: ['dr_mensah', 'dr_adams'],
          time_slots: [
            {
              slot_id: 'slot_1',
              team_id: 'team_1',
              start_time: baseTime,
              end_time: baseTime + hour,
              status: 'scheduled',
            },
          ],
        },
        {
          id: 'p2',
          panel_name: 'Data Engineering Panel',
          venue: 'CS Lab 2',
          is_virtual: false,
          chair_id: 'dr_mensah', // dr_mensah is chair here and examiner in p1
          examiner_ids: ['dr_kofi'],
          time_slots: [
            {
              slot_id: 'slot_2',
              team_id: 'team_2',
              start_time: baseTime + 1800000, // Starts 30 min in (overlaps)
              end_time: baseTime + hour + 1800000,
              status: 'scheduled',
            },
          ],
        },
      ];

      const conflicts = detectConflicts(panels);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.type).toBe('examiner_double_booked');
      expect(conflicts[0]?.details.faculty_id).toBe('dr_mensah');
    });

    it('detects physical venue double-booked across panels (case-insensitive)', () => {
      const panels: DefensePanelInput[] = [
        {
          id: 'p1',
          panel_name: 'Panel Alpha',
          venue: 'CS Lab 2',
          is_virtual: false,
          chair_id: 'chair_1',
          examiner_ids: ['ex_1'],
          time_slots: [
            {
              slot_id: 'slot_a',
              team_id: 'team_a',
              start_time: baseTime,
              end_time: baseTime + hour,
              status: 'scheduled',
            },
          ],
        },
        {
          id: 'p2',
          panel_name: 'Panel Beta',
          venue: 'cs lab 2', // Lowercase match
          is_virtual: false,
          chair_id: 'chair_2',
          examiner_ids: ['ex_2'],
          time_slots: [
            {
              slot_id: 'slot_b',
              team_id: 'team_b',
              start_time: baseTime + 900000, // Overlaps
              end_time: baseTime + hour + 900000,
              status: 'scheduled',
            },
          ],
        },
      ];

      const conflicts = detectConflicts(panels);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.type).toBe('venue_double_booked');
      expect(conflicts[0]?.details.venue?.toLowerCase()).toBe('cs lab 2');
    });

    it('ignores cancelled slots for both examiner and venue conflicts', () => {
      const panels: DefensePanelInput[] = [
        {
          id: 'p1',
          panel_name: 'Panel Alpha',
          venue: 'CS Lab 2',
          is_virtual: false,
          chair_id: 'shared_chair',
          examiner_ids: ['ex_1'],
          time_slots: [
            {
              slot_id: 'slot_a',
              team_id: 'team_a',
              start_time: baseTime,
              end_time: baseTime + hour,
              status: 'cancelled', // Cancelled!
            },
          ],
        },
        {
          id: 'p2',
          panel_name: 'Panel Beta',
          venue: 'CS Lab 2',
          is_virtual: false,
          chair_id: 'shared_chair',
          examiner_ids: ['ex_2'],
          time_slots: [
            {
              slot_id: 'slot_b',
              team_id: 'team_b',
              start_time: baseTime,
              end_time: baseTime + hour,
              status: 'scheduled',
            },
          ],
        },
      ];

      const conflicts = detectConflicts(panels);
      expect(conflicts).toHaveLength(0);
    });

    it('ignores virtual venues when checking venue conflicts', () => {
      const panels: DefensePanelInput[] = [
        {
          id: 'p1',
          panel_name: 'Online Panel 1',
          venue: 'Google Meet Room A',
          is_virtual: true,
          chair_id: 'c1',
          examiner_ids: ['e1'],
          time_slots: [
            {
              slot_id: 's1',
              team_id: 't1',
              start_time: baseTime,
              end_time: baseTime + hour,
              status: 'scheduled',
            },
          ],
        },
        {
          id: 'p2',
          panel_name: 'Online Panel 2',
          venue: 'Google Meet Room A', // Same name, but virtual
          is_virtual: true,
          chair_id: 'c2',
          examiner_ids: ['e2'],
          time_slots: [
            {
              slot_id: 's2',
              team_id: 't2',
              start_time: baseTime,
              end_time: baseTime + hour,
              status: 'scheduled',
            },
          ],
        },
      ];

      const conflicts = detectConflicts(panels);
      expect(conflicts).toHaveLength(0);
    });
  });
});
