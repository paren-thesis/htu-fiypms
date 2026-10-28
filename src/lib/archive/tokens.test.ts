import { describe, it, expect } from 'vitest';
import {
  buildSearchTokens,
  buildKeywords,
  tokenizeSearchQuery,
  MAX_SEARCH_TOKENS,
} from './tokens';

describe('Archive Search Tokenization & Keywords (FR-11, A5)', () => {
  describe('buildSearchTokens', () => {
    it('lowercases, strips stopwords, and includes tech_stack + title + abstract tokens', () => {
      const tokens = buildSearchTokens(
        'A Smart Campus Attendance System Using RFID and IoT',
        'This project implements an automated attendance tracking application on the cloud with real-time alerts.',
        ['Next.js', 'Firebase', 'ESP32']
      );

      // Includes normalized tech stack items and compound sub-tokens
      expect(tokens).toContain('next.js');
      expect(tokens).toContain('next');
      expect(tokens).toContain('js');
      expect(tokens).toContain('firebase');
      expect(tokens).toContain('esp32');

      // Includes title & abstract terms
      expect(tokens).toContain('smart');
      expect(tokens).toContain('campus');
      expect(tokens).toContain('attendance');
      expect(tokens).toContain('rfid');
      expect(tokens).toContain('iot');
      expect(tokens).toContain('automated');
      expect(tokens).toContain('cloud');

      // Excludes stopwords
      expect(tokens).not.toContain('a');
      expect(tokens).not.toContain('the');
      expect(tokens).not.toContain('and');
      expect(tokens).not.toContain('using');
      expect(tokens).not.toContain('system');
      expect(tokens).not.toContain('application');
      expect(tokens).not.toContain('this');
      expect(tokens).not.toContain('project');
    });

    it('deduplicates tokens and caps output at 40 unique tokens', () => {
      const longAbstract = Array.from(
        { length: 60 },
        (_, i) => `uniquedomainterm${i + 1} extra${i + 1}`
      ).join(' ');

      const tokens = buildSearchTokens(
        'Distributed Blockchain Ledger for Supply Chain',
        longAbstract,
        ['Solidity', 'Ethereum', 'React', 'TypeScript']
      );

      expect(tokens.length).toBe(MAX_SEARCH_TOKENS);
      expect(new Set(tokens).size).toBe(tokens.length);
      // Tech stack and title tokens prioritized first
      expect(tokens).toContain('solidity');
      expect(tokens).toContain('ethereum');
      expect(tokens).toContain('distributed');
      expect(tokens).toContain('blockchain');
    });
  });

  describe('buildKeywords', () => {
    it('combines normalized tech_stack with top domain terms from title and abstract', () => {
      const keywords = buildKeywords(
        'Precision Agriculture Soil Moisture Monitoring',
        'Soil moisture monitoring and irrigation control for greenhouse agriculture.',
        ['Arduino', 'MQTT', 'React']
      );

      expect(keywords.slice(0, 3)).toEqual(['arduino', 'mqtt', 'react']);
      expect(keywords).toContain('soil');
      expect(keywords).toContain('moisture');
      expect(keywords).toContain('agriculture');
      expect(keywords).toContain('monitoring');
      expect(new Set(keywords).size).toBe(keywords.length);
    });
  });

  describe('tokenizeSearchQuery', () => {
    it('extracts up to 10 non-stopword search tokens from user query', () => {
      const queryTokens = tokenizeSearchQuery(
        'How to build a Smart IoT system with Next.js and Firebase'
      );

      expect(queryTokens).toContain('smart');
      expect(queryTokens).toContain('iot');
      expect(queryTokens).toContain('next.js');
      expect(queryTokens).toContain('firebase');
      expect(queryTokens).not.toContain('with');
      expect(queryTokens).not.toContain('and');
      expect(queryTokens.length).toBeLessThanOrEqual(10);
    });
  });
});

