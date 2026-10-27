/**
 * Auto-Grouping Algorithm (Spec FR-02.6, F-06, F-14)
 * Pure, deterministic clustering by course track with size distribution [min, max] (default: 4-5).
 */

export interface AutoGroupStudent {
  uid: string;
  index_number: string;
  full_name: string;
  course_id: string;
  email?: string;
}

export interface AutoGroupOptions {
  min?: number;
  max?: number;
}

export interface GeneratedGroup {
  course_id: string;
  name: string;
  leader_uid: string;
  member_uids: string[];
  members: AutoGroupStudent[];
  group_size: number;
}

export interface AutoGroupResult {
  groups: GeneratedGroup[];
  leftovers: AutoGroupStudent[];
  groupsByCourse: Record<string, GeneratedGroup[]>;
  leftoversByCourse: Record<string, AutoGroupStudent[]>;
  summary: {
    totalStudents: number;
    totalAssigned: number;
    totalLeftovers: number;
    totalGroups: number;
  };
}

/**
 * Calculates optimal group sizes for `n` students given min (default 4) and max (default 5).
 * Chooses the largest g such that min * g <= n and distributes sizes as evenly as possible up to max.
 * Returns array of group sizes and the number of leftovers.
 */
export function calculateGroupSizes(
  n: number,
  min: number = 4,
  max: number = 5
): { sizes: number[]; leftoverCount: number } {
  if (n < min) {
    return { sizes: [], leftoverCount: n };
  }

  // Choose the largest g such that min * g <= n
  const g = Math.floor(n / min);
  const maxAssignable = Math.min(n, g * max);
  const leftoverCount = n - maxAssignable;

  // Distribute maxAssignable as evenly as possible across g groups
  const base = Math.floor(maxAssignable / g);
  const remainder = maxAssignable % g;

  const sizes: number[] = [];
  for (let i = 0; i < g; i++) {
    // Distribute remainder by giving 1 extra to the first `remainder` groups
    sizes.push(i < remainder ? base + 1 : base);
  }

  return { sizes, leftoverCount };
}

/**
 * Partitions students of a single course into groups of size 4-5.
 * Strictly deterministic ordering by index_number. Leader = first by index number.
 */
function autoGroupSingleCourse(
  courseId: string,
  students: AutoGroupStudent[],
  options?: AutoGroupOptions
): { groups: GeneratedGroup[]; leftovers: AutoGroupStudent[] } {
  const min = options?.min ?? 4;
  const max = options?.max ?? 5;

  // 1. Sort deterministically by index_number ascending
  const sorted = [...students].sort((a, b) =>
    a.index_number.localeCompare(b.index_number)
  );

  const { sizes, leftoverCount } = calculateGroupSizes(sorted.length, min, max);

  const groups: GeneratedGroup[] = [];
  let cursor = 0;

  for (let i = 0; i < sizes.length; i++) {
    const groupSize = sizes[i]!;
    const groupMembers = sorted.slice(cursor, cursor + groupSize);
    cursor += groupSize;

    const leader = groupMembers[0]!;
    const paddedIndex = String(i + 1).padStart(2, '0');

    groups.push({
      course_id: courseId,
      name: `Auto Group ${courseId.toUpperCase()} ${paddedIndex}`,
      leader_uid: leader.uid,
      member_uids: groupMembers.map((m) => m.uid),
      members: groupMembers,
      group_size: groupMembers.length,
    });
  }

  // Trailing students that cannot fit into groups of 4-5 are leftovers
  const leftovers = sorted.slice(sorted.length - leftoverCount);

  return { groups, leftovers };
}

/**
 * Pure auto-grouping function:
 * 1. Clusters strictly by course_id (cross-category merging is never permitted).
 * 2. Within each course, forms the maximum number of valid groups of 4-5 members.
 * 3. Assigns the first member by index number as Team Leader.
 * 4. Trailing students that cannot fit are returned as leftovers.
 */
export function autoGroup(
  students: AutoGroupStudent[],
  options?: AutoGroupOptions
): AutoGroupResult {
  // Group students by normalized course_id
  const byCourse: Record<string, AutoGroupStudent[]> = {};

  for (const student of students) {
    const courseId = student.course_id.toLowerCase().trim();
    if (!byCourse[courseId]) {
      byCourse[courseId] = [];
    }
    byCourse[courseId].push(student);
  }

  const allGroups: GeneratedGroup[] = [];
  const allLeftovers: AutoGroupStudent[] = [];
  const groupsByCourse: Record<string, GeneratedGroup[]> = {};
  const leftoversByCourse: Record<string, AutoGroupStudent[]> = {};

  // Sort course tracks for deterministic output
  const courseKeys = Object.keys(byCourse).sort();

  for (const courseId of courseKeys) {
    const courseStudents = byCourse[courseId]!;
    const { groups, leftovers } = autoGroupSingleCourse(
      courseId,
      courseStudents,
      options
    );

    groupsByCourse[courseId] = groups;
    leftoversByCourse[courseId] = leftovers;

    allGroups.push(...groups);
    allLeftovers.push(...leftovers);
  }

  const totalAssigned = allGroups.reduce((acc, g) => acc + g.group_size, 0);

  return {
    groups: allGroups,
    leftovers: allLeftovers,
    groupsByCourse,
    leftoversByCourse,
    summary: {
      totalStudents: students.length,
      totalAssigned,
      totalLeftovers: allLeftovers.length,
      totalGroups: allGroups.length,
    },
  };
}
