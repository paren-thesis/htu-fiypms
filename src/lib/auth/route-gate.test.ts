import { describe, it, expect } from 'vitest';
import { decideRoute } from './route-gate';
import type { EdgeUserClaims } from './verify-token-edge';

describe('Route Gate Logic (decideRoute)', () => {
  const studentClaims: EdgeUserClaims = {
    uid: 'student-1',
    email: '0323809921@htu.edu.gh',
    email_verified: true,
    roles: ['student'],
    activeRole: 'student',
    registered: true,
    profileComplete: true,
  };

  const supervisorClaims: EdgeUserClaims = {
    uid: 'sup-1',
    email: 'sup@htu.edu.gh',
    email_verified: true,
    roles: ['supervisor'],
    activeRole: 'supervisor',
    registered: true,
    profileComplete: true,
  };

  const coordinatorClaims: EdgeUserClaims = {
    uid: 'coord-1',
    email: 'coord@htu.edu.gh',
    email_verified: true,
    roles: ['coordinator'],
    activeRole: 'coordinator',
    registered: true,
    profileComplete: true,
  };

  const panelMemberClaims: EdgeUserClaims = {
    uid: 'panel-1',
    email: 'panel@htu.edu.gh',
    email_verified: true,
    roles: ['panel_member'],
    activeRole: 'panel_member',
    registered: true,
    profileComplete: true,
  };

  const adminClaims: EdgeUserClaims = {
    uid: 'admin-1',
    email: 'admin@htu.edu.gh',
    email_verified: true,
    roles: ['admin'],
    activeRole: 'admin',
    registered: true,
    profileComplete: true,
  };

  describe('Public paths & static assets', () => {
    it('allows /api/session without token', () => {
      expect(decideRoute(null, '/api/session')).toBe('allow');
    });

    it('allows static assets and _next resources without token', () => {
      expect(decideRoute(null, '/_next/static/chunk.js')).toBe('allow');
      expect(decideRoute(null, '/logo.svg')).toBe('allow');
      expect(decideRoute(null, '/favicon.ico')).toBe('allow');
    });

    it('allows /login when unauthenticated', () => {
      expect(decideRoute(null, '/login')).toBe('allow');
    });

    it('handles /dev/login conditional access based on environment', () => {
      const env = process.env as Record<string, string | undefined>;
      const origEnv = env.NODE_ENV;
      const origEmulator = env.FIREBASE_AUTH_EMULATOR_HOST;

      try {
        // Condition: emulator host set + not production -> allowed
        env.NODE_ENV = 'development';
        env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
        expect(decideRoute(null, '/dev/login')).toBe('allow');

        // Condition: production build -> redirected to /login
        env.NODE_ENV = 'production';
        expect(decideRoute(null, '/dev/login')).toEqual({ redirect: '/login' });

        // Condition: not production but missing emulator host -> redirected to /login
        env.NODE_ENV = 'development';
        delete env.FIREBASE_AUTH_EMULATOR_HOST;
        expect(decideRoute(null, '/dev/login')).toEqual({ redirect: '/login' });
      } finally {
        env.NODE_ENV = origEnv;
        if (origEmulator !== undefined) {
          env.FIREBASE_AUTH_EMULATOR_HOST = origEmulator;
        } else {
          delete env.FIREBASE_AUTH_EMULATOR_HOST;
        }
      }
    });
  });

  describe('Unauthenticated redirects', () => {
    it('redirects unauthenticated users to /login from any protected route', () => {
      expect(decideRoute(null, '/')).toEqual({ redirect: '/login' });
      expect(decideRoute(null, '/my-team')).toEqual({ redirect: '/login' });
      expect(decideRoute(null, '/students')).toEqual({ redirect: '/login' });
      expect(decideRoute(null, '/not-registered')).toEqual({ redirect: '/login' });
    });
  });

  describe('Unregistered access handling (FR-01.8)', () => {
    const unregisteredClaims: EdgeUserClaims = {
      uid: 'unreg-1',
      email: 'unreg@htu.edu.gh',
      email_verified: true,
      roles: ['student'],
      activeRole: 'student',
      registered: false,
      profileComplete: false,
    };

    it('allows /not-registered when registered is false', () => {
      expect(decideRoute(unregisteredClaims, '/not-registered')).toBe('allow');
    });

    it('locks unregistered users to /not-registered from any other route', () => {
      expect(decideRoute(unregisteredClaims, '/')).toEqual({ redirect: '/not-registered' });
      expect(decideRoute(unregisteredClaims, '/login')).toEqual({ redirect: '/not-registered' });
      expect(decideRoute(unregisteredClaims, '/my-team')).toEqual({ redirect: '/not-registered' });
      expect(decideRoute(unregisteredClaims, '/students')).toEqual({ redirect: '/not-registered' });
    });

    it('redirects registered users away from /not-registered to dashboard', () => {
      expect(decideRoute(studentClaims, '/not-registered')).toEqual({ redirect: '/' });
      expect(decideRoute(supervisorClaims, '/not-registered')).toEqual({ redirect: '/' });
    });
  });

  describe('Profile completion gate for faculty (FR-01.9)', () => {
    const incompleteFacultyClaims: EdgeUserClaims = {
      uid: 'faculty-new-1',
      email: 'newfaculty@htu.edu.gh',
      email_verified: true,
      roles: ['supervisor'],
      activeRole: 'supervisor',
      registered: true,
      profileComplete: false,
    };

    const incompleteStudentClaims: EdgeUserClaims = {
      uid: 'student-new-1',
      email: 'studentnew@htu.edu.gh',
      email_verified: true,
      roles: ['student'],
      activeRole: 'student',
      registered: true,
      profileComplete: false,
    };

    it('redirects incomplete faculty to /complete-profile', () => {
      expect(decideRoute(incompleteFacultyClaims, '/')).toEqual({ redirect: '/complete-profile' });
      expect(decideRoute(incompleteFacultyClaims, '/my-team')).toEqual({ redirect: '/complete-profile' });
    });

    it('allows incomplete faculty on /complete-profile', () => {
      expect(decideRoute(incompleteFacultyClaims, '/complete-profile')).toBe('allow');
    });

    it('students skip profile completion gate per FR-01.9', () => {
      expect(decideRoute(incompleteStudentClaims, '/')).toBe('allow');
      expect(decideRoute(incompleteStudentClaims, '/my-team')).toBe('allow');
    });

    it('redirects complete faculty away from /complete-profile to /', () => {
      expect(decideRoute(supervisorClaims, '/complete-profile')).toEqual({ redirect: '/' });
    });
  });

  describe('Role-based access control (Spec D-05 and nav permissions)', () => {
    it('redirects supervisor away from /students and /admin/staff-whitelist', () => {
      expect(decideRoute(supervisorClaims, '/students')).toEqual({ redirect: '/' });
      expect(decideRoute(supervisorClaims, '/admin/staff-whitelist')).toEqual({ redirect: '/' });
    });

    it('allows coordinator and admin on /students and /admin/staff-whitelist', () => {
      expect(decideRoute(coordinatorClaims, '/students')).toBe('allow');
      expect(decideRoute(coordinatorClaims, '/admin/staff-whitelist')).toBe('allow');
      expect(decideRoute(adminClaims, '/students')).toBe('allow');
      expect(decideRoute(adminClaims, '/admin/staff-whitelist')).toBe('allow');
    });

    it('allows coordinator and admin on /rubrics, /reports, and /audit-logs', () => {
      expect(decideRoute(coordinatorClaims, '/rubrics')).toBe('allow');
      expect(decideRoute(coordinatorClaims, '/reports')).toBe('allow');
      expect(decideRoute(coordinatorClaims, '/audit-logs')).toBe('allow');
      expect(decideRoute(adminClaims, '/rubrics')).toBe('allow');
      expect(decideRoute(adminClaims, '/reports')).toBe('allow');
      expect(decideRoute(adminClaims, '/audit-logs')).toBe('allow');
    });

    it('redirects student and supervisor away from /rubrics, /reports, and /audit-logs', () => {
      expect(decideRoute(studentClaims, '/rubrics')).toEqual({ redirect: '/' });
      expect(decideRoute(studentClaims, '/reports')).toEqual({ redirect: '/' });
      expect(decideRoute(studentClaims, '/audit-logs')).toEqual({ redirect: '/' });

      expect(decideRoute(supervisorClaims, '/rubrics')).toEqual({ redirect: '/' });
      expect(decideRoute(supervisorClaims, '/reports')).toEqual({ redirect: '/' });
      expect(decideRoute(supervisorClaims, '/audit-logs')).toEqual({ redirect: '/' });
    });

    it('only admin can access /admin/users', () => {
      expect(decideRoute(adminClaims, '/admin/users')).toBe('allow');
      expect(decideRoute(coordinatorClaims, '/admin/users')).toEqual({ redirect: '/' });
      expect(decideRoute(supervisorClaims, '/admin/users')).toEqual({ redirect: '/' });
      expect(decideRoute(studentClaims, '/admin/users')).toEqual({ redirect: '/' });
    });

    it('allows supervisor, coordinator, panel_member and admin on /defense', () => {
      expect(decideRoute(supervisorClaims, '/defense')).toBe('allow');
      expect(decideRoute(coordinatorClaims, '/defense')).toBe('allow');
      expect(decideRoute(panelMemberClaims, '/defense')).toBe('allow');
      expect(decideRoute(adminClaims, '/defense')).toBe('allow');
    });

    it('redirects student away from /defense', () => {
      expect(decideRoute(studentClaims, '/defense')).toEqual({ redirect: '/' });
    });

    it('allows student on /peer-evaluation', () => {
      expect(decideRoute(studentClaims, '/peer-evaluation')).toBe('allow');
    });

    it('allows all roles on common routes (/, /archive, /notifications)', () => {
      for (const claims of [
        studentClaims,
        supervisorClaims,
        coordinatorClaims,
        panelMemberClaims,
        adminClaims,
      ]) {
        expect(decideRoute(claims, '/')).toBe('allow');
        expect(decideRoute(claims, '/archive')).toBe('allow');
        expect(decideRoute(claims, '/notifications')).toBe('allow');
      }
    });
  });
});
