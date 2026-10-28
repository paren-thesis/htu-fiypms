import { describe, it, expect } from 'vitest';
import {
  createArchivedProjectSchema,
  archiveProjectsInputSchema,
  searchArchivedProjectsInputSchema,
} from './schema';

describe('ArchivedProject Zod Schemas', () => {
  it('validates a complete createArchivedProjectSchema payload', () => {
    const parsed = createArchivedProjectSchema.safeParse({
      title: 'Smart Campus Energy Monitor',
      abstract: 'Monitoring campus electricity usage with IoT sensors.',
      keywords: ['iot', 'esp32', 'firebase'],
      search_tokens: ['smart', 'campus', 'energy', 'monitor', 'iot', 'esp32', 'firebase'],
      academic_year_id: '2025-2026',
      course_id: 'btech-cs',
      group_number: 'BCS26_01',
      github_repository_url: 'https://github.com/htu/smart-energy',
      manuscript_url: 'https://drive.google.com/file/d/12345/view',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown fields due to .strict()', () => {
    const parsed = archiveProjectsInputSchema.safeParse({
      academic_year_id: '2025-2026',
      extra_field: 'not-allowed',
    });
    expect(parsed.success).toBe(false);
  });

  it('validates searchArchivedProjectsInputSchema', () => {
    const parsed = searchArchivedProjectsInputSchema.safeParse({
      query: 'firebase iot',
      course_id: 'btech-cs',
      academic_year_id: '2025-2026',
      limit: 12,
    });
    expect(parsed.success).toBe(true);
  });
});

