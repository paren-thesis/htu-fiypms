import { describe, it, expect } from 'vitest';
import {
  tokenizeText,
  computeTopicSimilarity,
  findSimilarTopics,
  type ApprovedTopicCandidate,
} from './similar';

describe('Topic Similarity Detection (FR-03.5)', () => {
  describe('tokenizeText', () => {
    it('removes punctuation, lowercases, and excludes stopwords', () => {
      const text = 'A Smart Campus Attendance System using IoT & RFID on Cloud';
      const tokens = tokenizeText(text);
      expect(tokens.has('smart')).toBe(true);
      expect(tokens.has('campus')).toBe(true);
      expect(tokens.has('attendance')).toBe(true);
      expect(tokens.has('iot')).toBe(true);
      expect(tokens.has('rfid')).toBe(true);
      expect(tokens.has('cloud')).toBe(true);

      // Stopwords excluded
      expect(tokens.has('a')).toBe(false);
      expect(tokens.has('system')).toBe(false);
      expect(tokens.has('using')).toBe(false);
      expect(tokens.has('on')).toBe(false);
    });
  });

  describe('computeTopicSimilarity', () => {
    it('returns 1.0 for virtually identical topics', () => {
      const topicA = {
        title: 'Smart Campus Attendance System',
        tech_stack: ['Next.js', 'Firebase', 'RFID'],
      };
      const topicB = {
        title: 'Smart Campus Attendance Platform',
        tech_stack: ['firebase', 'next.js', 'rfid'],
      };
      const score = computeTopicSimilarity(topicA, topicB);
      expect(score).toBe(1.0);
    });

    it('returns low score for unrelated topics', () => {
      const topicA = {
        title: 'Blockchain Land Registry System',
        tech_stack: ['Solidity', 'Ethereum'],
      };
      const topicB = {
        title: 'E-commerce Recommendation Engine',
        tech_stack: ['Python', 'Django'],
      };
      const score = computeTopicSimilarity(topicA, topicB);
      expect(score).toBe(0.0);
    });
  });

  describe('findSimilarTopics', () => {
    const historicalApproved: ApprovedTopicCandidate[] = [
      {
        id: 'topic-old-1',
        title: 'Automated Hospital Bed Allocation System',
        tech_stack: ['React', 'Node.js', 'MongoDB'],
      },
      {
        id: 'topic-old-2',
        title: 'Smart Energy Monitoring System using IoT',
        tech_stack: ['Arduino', 'ESP32', 'Firebase'],
      },
      {
        id: 'topic-old-3',
        title: 'Intelligent IoT Energy Monitoring Platform',
        tech_stack: ['ESP32', 'Arduino', 'Firebase', 'MQTT'],
      },
    ];

    it('flags topics with score >= 0.6 threshold', () => {
      const candidate = {
        title: 'Smart IoT Energy Monitoring',
        tech_stack: ['Arduino', 'ESP32', 'Firebase'],
      };

      const warnings = findSimilarTopics(candidate, historicalApproved, 0.6);
      expect(warnings.length).toBeGreaterThanOrEqual(1);

      const firstWarning = warnings[0]!;
      expect(firstWarning.topic_id).toMatch(/topic-old-(2|3)/);
      expect(firstWarning.score).toBeGreaterThanOrEqual(0.6);
    });

    it('returns empty warnings when no topic exceeds threshold', () => {
      const candidate = {
        title: 'Autonomous Drone Delivery Navigation in Urban Environments',
        tech_stack: ['ROS', 'Python', 'OpenCV'],
      };

      const warnings = findSimilarTopics(candidate, historicalApproved, 0.6);
      expect(warnings).toEqual([]);
    });
  });
});
