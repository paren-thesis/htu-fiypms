import { describe, it, expect } from 'vitest';
import {
  isValidRepoUrl,
  isValidHttpsUrl,
  validateDeliverable,
  deliverableSchema,
} from './validate';

describe('Deliverable Validation (pure)', () => {
  describe('isValidRepoUrl', () => {
    it('accepts valid GitHub repository URLs', () => {
      expect(isValidRepoUrl('https://github.com/htu-cs/fypms')).toBe(true);
      expect(isValidRepoUrl('https://www.github.com/owner/repository-name')).toBe(true);
      expect(isValidRepoUrl('https://github.com/org/repo/tree/main')).toBe(true);
    });

    it('accepts valid GitLab repository URLs', () => {
      expect(isValidRepoUrl('https://gitlab.com/university/capstone-project')).toBe(true);
      expect(isValidRepoUrl('https://www.gitlab.com/user/project')).toBe(true);
    });

    it('rejects unsupported domains or malformed URLs', () => {
      expect(isValidRepoUrl('https://bitbucket.org/owner/repo')).toBe(false);
      expect(isValidRepoUrl('https://example.com/owner/repo')).toBe(false);
      expect(isValidRepoUrl('not-a-url')).toBe(false);
      expect(isValidRepoUrl('')).toBe(false);
      expect(isValidRepoUrl('https://github.com')).toBe(false);
      expect(isValidRepoUrl('https://github.com/')).toBe(false);
      expect(isValidRepoUrl('https://github.com/just-an-owner')).toBe(false);
    });
  });

  describe('isValidHttpsUrl', () => {
    it('accepts empty/undefined optional URLs', () => {
      expect(isValidHttpsUrl(undefined)).toBe(true);
      expect(isValidHttpsUrl('')).toBe(true);
      expect(isValidHttpsUrl('   ')).toBe(true);
    });

    it('accepts valid HTTPS URLs', () => {
      expect(isValidHttpsUrl('https://drive.google.com/file/d/xyz')).toBe(true);
      expect(isValidHttpsUrl('https://demo.vercel.app')).toBe(true);
    });

    it('rejects insecure HTTP or malformed URLs', () => {
      expect(isValidHttpsUrl('http://insecure-demo.com')).toBe(false);
      expect(isValidHttpsUrl('ftp://example.com')).toBe(false);
      expect(isValidHttpsUrl('random-text')).toBe(false);
    });
  });

  describe('validateDeliverable function', () => {
    it('passes for complete valid input', () => {
      const res = validateDeliverable({
        github_repository_url: 'https://github.com/htu-dept/final-year-system',
        live_demo_url: 'https://fypms.htu.edu.gh',
        google_drive_url: 'https://drive.google.com/file/d/12345/view',
        environment_setup_notes: '# Setup Instructions\nRun `npm install` and configure .env.',
      });
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
    });

    it('passes when optional URLs are omitted', () => {
      const res = validateDeliverable({
        github_repository_url: 'https://gitlab.com/team/project',
        environment_setup_notes: 'Basic setup notes',
      });
      expect(res.isValid).toBe(true);
    });

    it('rejects notes exceeding 20000 characters', () => {
      const longNotes = 'a'.repeat(20001);
      const res = validateDeliverable({
        github_repository_url: 'https://github.com/team/project',
        environment_setup_notes: longNotes,
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.environment_setup_notes).toContain('cannot exceed 20,000 characters');
    });

    it('rejects empty environment setup notes', () => {
      const res = validateDeliverable({
        github_repository_url: 'https://github.com/team/project',
        environment_setup_notes: '   ',
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.environment_setup_notes).toBeDefined();
    });
  });

  describe('deliverableSchema Zod parsing', () => {
    it('parses valid input properly', () => {
      const parsed = deliverableSchema.parse({
        github_repository_url: 'https://github.com/team/repo',
        live_demo_url: 'https://demo.htu.edu.gh',
        environment_setup_notes: 'Instructions here',
      });
      expect(parsed.github_repository_url).toBe('https://github.com/team/repo');
    });

    it('throws error for invalid repo url', () => {
      expect(() =>
        deliverableSchema.parse({
          github_repository_url: 'https://sourceforge.net/p/project',
          environment_setup_notes: 'Instructions',
        })
      ).toThrow();
    });
  });
});
