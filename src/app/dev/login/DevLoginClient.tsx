'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { toast } from 'sonner';
import {
  GraduationCap,
  LogIn,
  Search,
  ShieldAlert,
  UserCheck,
  Users,
  Loader2,
  Building,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface DevStaffUser {
  uid: string;
  name: string;
  email: string;
  roles: string[];
  department: string;
  programmes: string[];
}

export interface DevStudentUser {
  uid: string;
  name: string;
  email: string;
  index_number: string;
  course_id: string;
  group_number: string;
}

interface DevLoginClientProps {
  staff: DevStaffUser[];
  students: DevStudentUser[];
}

export function DevLoginClient({ staff, students }: DevLoginClientProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [customTarget, setCustomTarget] = React.useState('');
  const [loggingInUid, setLoggingInUid] = React.useState<string | null>(null);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredStaff = React.useMemo(() => {
    if (!normalizedSearch) return staff;
    return staff.filter(
      (s) =>
        s.name.toLowerCase().includes(normalizedSearch) ||
        s.email.toLowerCase().includes(normalizedSearch) ||
        s.roles.some((r) => r.toLowerCase().includes(normalizedSearch)) ||
        s.department.toLowerCase().includes(normalizedSearch)
    );
  }, [staff, normalizedSearch]);

  const filteredStudents = React.useMemo(() => {
    if (!normalizedSearch) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(normalizedSearch) ||
        s.email.toLowerCase().includes(normalizedSearch) ||
        s.index_number.includes(normalizedSearch) ||
        s.course_id.toLowerCase().includes(normalizedSearch) ||
        s.group_number.toLowerCase().includes(normalizedSearch)
    );
  }, [students, normalizedSearch]);

  const handleSignIn = async (uid: string, name: string) => {
    if (loggingInUid) return;
    setLoggingInUid(uid);

    try {
      // 1. Request custom token from dev API
      const tokenRes = await fetch('/api/dev/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uid.includes('@') ? { email: uid } : { uid }),
      });

      if (!tokenRes.ok) {
        const errData = await tokenRes.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to generate custom token (${tokenRes.status})`);
      }

      const { customToken } = await tokenRes.json();

      // 2. Client SDK signs in with custom token
      const userCredential = await signInWithCustomToken(auth, customToken);
      const tokenResult = await userCredential.user.getIdTokenResult(true);
      const idToken = tokenResult.token;

      // 3. Ensure __session cookie is synced before navigating
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      toast.success(`Signed in as ${name}`);
      if (tokenResult.claims.registered === false) {
        router.push('/not-registered');
      } else if (tokenResult.claims.profileComplete === false) {
        router.push('/complete-profile');
      } else {
        router.push('/');
      }
      router.refresh();
    } catch (err: unknown) {
      console.error('Dev login failed:', err);
      toast.error(err instanceof Error ? err.message : 'Dev login failed');
      setLoggingInUid(null);
    }
  };

  const getRoleBadgeVariant = (role: string): 'default' | 'secondary' | 'outline' => {
    switch (role) {
      case 'coordinator':
        return 'default';
      case 'admin':
        return 'secondary';
      case 'supervisor':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Brand & Mode Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <GraduationCap className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                HTU · FYPMS Dev Login
              </h1>
              <p className="text-xs text-muted-foreground">
                Firebase Emulator Testing Portal — One-Click Fixture Sign In
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-primary">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>Emulator Mode (Disabled in production builds)</span>
          </div>
        </div>

        {/* Search Bar & Custom Emulator Target */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between" data-testid="dev-login-panel">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Filter by name, email, index, course, or group..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11 rounded-lg"
            />
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (customTarget.trim()) {
                void handleSignIn(customTarget.trim(), customTarget.trim());
              }
            }}
          >
            <Input
              type="text"
              data-testid="dev-login-input"
              placeholder="Custom UID or email..."
              value={customTarget}
              onChange={(e) => setCustomTarget(e.target.value)}
              className="h-11 w-56 rounded-lg text-xs font-mono"
            />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              data-testid="dev-login-submit"
              disabled={!customTarget.trim() || loggingInUid !== null}
              className="h-11 px-4 text-xs font-medium"
            >
              Sign In
            </Button>
          </form>
        </div>

        {/* User Categories */}
        <Tabs defaultValue="staff" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2 h-11 p-1 bg-muted rounded-lg">
            <TabsTrigger
              value="staff"
              className="text-xs sm:text-sm font-medium flex items-center justify-center gap-2 h-9 rounded-md"
            >
              <UserCheck className="h-4 w-4" />
              <span>Staff & Faculty ({filteredStaff.length})</span>
            </TabsTrigger>
            <TabsTrigger
              value="students"
              className="text-xs sm:text-sm font-medium flex items-center justify-center gap-2 h-9 rounded-md"
            >
              <Users className="h-4 w-4" />
              <span>Students ({filteredStudents.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* Staff Tab */}
          <TabsContent value="staff" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredStaff.map((user) => {
                const isLoggingIn = loggingInUid === user.uid;
                return (
                  <Card
                    key={user.uid}
                    className="border-border hover:border-primary/50 transition-colors shadow-sm flex flex-col justify-between"
                  >
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-sm font-bold text-foreground">
                            {user.name}
                          </CardTitle>
                          <CardDescription className="text-xs text-muted-foreground truncate font-mono">
                            {user.email}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {user.roles.map((role) => (
                          <Badge
                            key={role}
                            variant={getRoleBadgeVariant(role)}
                            className="capitalize text-[10px] px-1.5 py-0"
                          >
                            {role.replace('_', ' ')}
                          </Badge>
                        ))}
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 pt-2 space-y-3">
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Building className="h-3.5 w-3.5 text-muted-foreground/70" />
                        <span>{user.department}</span>
                      </div>

                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        disabled={loggingInUid !== null}
                        onClick={() => handleSignIn(user.uid, user.name)}
                        className="w-full min-h-[44px] rounded-lg font-medium text-xs flex items-center justify-center gap-1.5"
                      >
                        {isLoggingIn ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Signing in...</span>
                          </>
                        ) : (
                          <>
                            <LogIn className="h-4 w-4" />
                            <span>Sign in as {user.roles[0]}</span>
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {filteredStaff.length === 0 && (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No staff users matching &quot;{search}&quot;.
              </div>
            )}
          </TabsContent>

          {/* Students Tab */}
          <TabsContent value="students" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredStudents.map((user) => {
                const isLoggingIn = loggingInUid === user.uid;
                return (
                  <Card
                    key={user.uid}
                    className="border-border hover:border-primary/50 transition-colors shadow-sm flex flex-col justify-between"
                  >
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-sm font-bold text-foreground">
                            {user.name}
                          </CardTitle>
                          <CardDescription className="text-xs text-muted-foreground truncate font-mono">
                            {user.email}
                          </CardDescription>
                        </div>
                        <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
                          {user.group_number}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                          {user.index_number}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] uppercase px-1.5 py-0">
                          {user.course_id}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loggingInUid !== null}
                        onClick={() => handleSignIn(user.uid, user.name)}
                        className="w-full min-h-[44px] rounded-lg font-medium text-xs flex items-center justify-center gap-1.5 hover:bg-primary hover:text-primary-foreground"
                      >
                        {isLoggingIn ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Signing in...</span>
                          </>
                        ) : (
                          <>
                            <LogIn className="h-4 w-4" />
                            <span>Sign in as Student</span>
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {filteredStudents.length === 0 && (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No students matching &quot;{search}&quot;.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
