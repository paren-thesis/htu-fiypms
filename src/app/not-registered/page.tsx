"use client";

import * as React from "react";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { AlertCircle, LogOut, Mail } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

function isStudentEmail(email: string): boolean {
  return /^[0-9]{10}@htu\.edu\.gh$/i.test(email);
}

export default function NotRegisteredPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = React.useState(false);

  const attemptedEmail =
    searchParams.get("email") || user?.email || "account@htu.edu.gh";
  const coordinatorContact =
    process.env.NEXT_PUBLIC_COORDINATOR_EMAIL || "coordinator@htu.edu.gh";

  const isStudent = isStudentEmail(attemptedEmail);
  const reason = searchParams.get("reason") || searchParams.get("code");
  const isInactive = reason === "inactive";

  const categoryMessage = isInactive
    ? "Your student record is inactive. Contact your coordinator."
    : isStudent
    ? "Your 10-digit student index number is not listed in the current final-year cohort roster. Please contact your Department Coordinator to verify your roster onboarding."
    : "Your faculty email is not on the active supervisor whitelist for this academic year. Please contact the Department Coordinator or HoD to verify your whitelist status.";

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.push("/login");
    } catch (err) {
      console.error("Sign out failed:", err);
      router.push("/login");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-lg space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2.5">
          <Image
            src="/logo.svg"
            alt="Ho Technical University Crest"
            width={64}
            height={66}
            priority
            className="h-14 w-14 sm:h-16 sm:w-16 object-contain drop-shadow-xs"
          />
          <div className="space-y-0.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              HTU · FYPMS
            </h1>
            <p className="text-xs text-muted-foreground">
              Ho Technical University — Department of Computer Science
            </p>
          </div>
        </div>

        {/* Not Registered Notice Card */}
        <Card className="border-border shadow-sm">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft text-danger">
              <AlertCircle className="h-5 w-5" aria-hidden="true" />
            </div>
            <CardTitle className="text-lg font-semibold text-foreground">
              Account Not Registered
            </CardTitle>
            <CardDescription className="text-xs">
              Access is restricted to verified cohort students and whitelisted departmental staff.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Attempted Account:</span>
                <span className="font-mono font-medium text-foreground">
                  {attemptedEmail}
                </span>
              </div>
              <p className="text-muted-foreground leading-relaxed pt-1">
                {categoryMessage}
              </p>
            </div>

            <div className="rounded-lg border border-info-soft bg-info-soft/40 p-3 text-xs text-info flex items-start gap-2.5">
              <Mail className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="font-semibold">Need Assistance?</span>
                <p className="mt-0.5 text-muted-foreground">
                  Contact the Department Coordinator at{" "}
                  <a
                    href={`mailto:${coordinatorContact}`}
                    className="font-medium text-foreground underline underline-offset-2"
                  >
                    {coordinatorContact}
                  </a>{" "}
                  to check your enrollment or whitelist records.
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2 border-t border-border pt-4">
            <Button
              variant="outline"
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full gap-2 text-xs"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{signingOut ? "Signing Out..." : "Sign Out & Try Another Account"}</span>
            </Button>
          </CardFooter>
        </Card>

        {/* Institutional Lockup Footer */}
        <div className="flex flex-col items-center justify-center pt-2">
          <Image
            src="/logo-with-text.svg"
            alt="Ho Technical University"
            width={160}
            height={46}
            className="h-7 sm:h-8 w-auto max-w-[180px] object-contain opacity-90"
          />
        </div>
      </div>
    </div>
  );
}
