import { describe, it, expect } from 'vitest';
import {
  autoGroup,
  calculateGroupSizes,
  type AutoGroupStudent,
} from './auto-group';

function createMockStudents(
  count: number,
  courseId: string = 'btech-cs',
  indexOffset: number = 1
): AutoGroupStudent[] {
  return Array.from({ length: count }, (_, i) => {
    const num = indexOffset + i;
    const indexNumber = `032308${String(num).padStart(4, '0')}`;
    return {
      uid: `std-uid-${courseId}-${num}`,
      index_number: indexNumber,
      full_name: `Student ${courseId.toUpperCase()} ${num}`,
      course_id: courseId,
      email: `student${num}@htu.edu.gh`,
    };
  });
}

describe('Auto-Grouping Algorithm: Sizing and Distribution (FR-02.6)', () => {
  it('n = 3: below minimum group size -> 0 groups, 3 leftovers', () => {
    const { sizes, leftoverCount } = calculateGroupSizes(3);
    expect(sizes).toEqual([]);
    expect(leftoverCount).toBe(3);

    const students = createMockStudents(3);
    const result = autoGroup(students);
    expect(result.groups).toHaveLength(0);
    expect(result.leftovers).toHaveLength(3);
    expect(result.summary.totalAssigned).toBe(0);
    expect(result.summary.totalLeftovers).toBe(3);
  });

  it('n = 4: exact minimum group size -> 1 group of 4, 0 leftovers', () => {
    const { sizes, leftoverCount } = calculateGroupSizes(4);
    expect(sizes).toEqual([4]);
    expect(leftoverCount).toBe(0);

    const students = createMockStudents(4);
    const result = autoGroup(students);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.group_size).toBe(4);
    expect(result.leftovers).toHaveLength(0);
    expect(result.groups[0]!.leader_uid).toBe(students[0]!.uid);
  });

  it('n = 5: maximum single group size -> 1 group of 5, 0 leftovers', () => {
    const { sizes, leftoverCount } = calculateGroupSizes(5);
    expect(sizes).toEqual([5]);
    expect(leftoverCount).toBe(0);

    const students = createMockStudents(5);
    const result = autoGroup(students);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.group_size).toBe(5);
    expect(result.leftovers).toHaveLength(0);
  });

  it('n = 9: optimal two groups -> sizes 5 and 4, 0 leftovers', () => {
    const { sizes, leftoverCount } = calculateGroupSizes(9);
    expect(sizes).toEqual([5, 4]);
    expect(leftoverCount).toBe(0);

    const students = createMockStudents(9);
    const result = autoGroup(students);
    expect(result.groups).toHaveLength(2);
    expect(result.groups.map((g) => g.group_size).sort()).toEqual([4, 5]);
    expect(result.leftovers).toHaveLength(0);
  });

  it('n = 11: two groups of 5 -> 1 leftover (3 groups would require at least 12)', () => {
    const { sizes, leftoverCount } = calculateGroupSizes(11);
    expect(sizes).toEqual([5, 5]);
    expect(leftoverCount).toBe(1);

    const students = createMockStudents(11);
    const result = autoGroup(students);
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]!.group_size).toBe(5);
    expect(result.groups[1]!.group_size).toBe(5);
    expect(result.leftovers).toHaveLength(1);
    expect(result.leftovers[0]!.index_number).toBe(students[10]!.index_number);
  });

  it('n = 12: three groups of 4 -> sizes 4, 4, 4, 0 leftovers', () => {
    const { sizes, leftoverCount } = calculateGroupSizes(12);
    expect(sizes).toEqual([4, 4, 4]);
    expect(leftoverCount).toBe(0);

    const students = createMockStudents(12);
    const result = autoGroup(students);
    expect(result.groups).toHaveLength(3);
    expect(result.groups.every((g) => g.group_size === 4)).toBe(true);
    expect(result.leftovers).toHaveLength(0);
  });

  it('n = 13: three groups distributed as 5, 4, 4 -> 0 leftovers', () => {
    const { sizes, leftoverCount } = calculateGroupSizes(13);
    expect(sizes).toEqual([5, 4, 4]);
    expect(leftoverCount).toBe(0);

    const students = createMockStudents(13);
    const result = autoGroup(students);
    expect(result.groups).toHaveLength(3);
    expect(result.groups.map((g) => g.group_size).sort()).toEqual([4, 4, 5]);
    expect(result.leftovers).toHaveLength(0);
  });

  it('n = 17: four groups distributed as 5, 4, 4, 4 -> 0 leftovers', () => {
    const { sizes, leftoverCount } = calculateGroupSizes(17);
    expect(sizes).toEqual([5, 4, 4, 4]);
    expect(leftoverCount).toBe(0);

    const students = createMockStudents(17);
    const result = autoGroup(students);
    expect(result.groups).toHaveLength(4);
    expect(result.groups.map((g) => g.group_size).sort()).toEqual([4, 4, 4, 5]);
    expect(result.leftovers).toHaveLength(0);
  });
});

describe('Auto-Grouping: Course Category Integrity & Determinism', () => {
  it('strictly isolates course tracks and never merges students across categories', () => {
    // 5 students from btech-cs, 4 from btech-ict, 3 from hnd-cs
    const bcsStudents = createMockStudents(5, 'btech-cs', 1);
    const bictStudents = createMockStudents(4, 'btech-ict', 10);
    const hcsStudents = createMockStudents(3, 'hnd-cs', 20);

    // Mix them up randomly before autoGroup
    const allMixed = [...bictStudents, ...hcsStudents, ...bcsStudents].reverse();

    const result = autoGroup(allMixed);

    // Should produce: 1 btech-cs group (5), 1 btech-ict group (4), 0 hnd-cs groups (3 leftovers)
    expect(result.groups).toHaveLength(2);

    const bcsGroup = result.groups.find((g) => g.course_id === 'btech-cs');
    expect(bcsGroup).toBeDefined();
    expect(bcsGroup!.group_size).toBe(5);
    expect(bcsGroup!.members.every((m) => m.course_id === 'btech-cs')).toBe(true);

    const bictGroup = result.groups.find((g) => g.course_id === 'btech-ict');
    expect(bictGroup).toBeDefined();
    expect(bictGroup!.group_size).toBe(4);
    expect(bictGroup!.members.every((m) => m.course_id === 'btech-ict')).toBe(true);

    // Leftovers must belong to hnd-cs
    expect(result.leftovers).toHaveLength(3);
    expect(result.leftovers.every((m) => m.course_id === 'hnd-cs')).toBe(true);
  });

  it('assigns the leader as the first student by index number within each group', () => {
    // Pass students in reverse index order
    const students = createMockStudents(5, 'btech-cs', 10).reverse();
    const result = autoGroup(students);

    expect(result.groups).toHaveLength(1);
    const group = result.groups[0]!;

    // Lowest index is 0323080010
    expect(group.leader_uid).toBe('std-uid-btech-cs-10');
    expect(group.members[0]!.index_number).toBe('0323080010');
  });
});
