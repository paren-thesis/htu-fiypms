import * as React from "react";
import Link from "next/link";
import { AlertCircle, LogOut, Mail, GraduationCap } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function NotRegisteredPage() {
  const attemptedEmail = "user@htu.edu.gh";
  const coordinatorContact = "coordinator.cs@htu.edu.gh";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-lg space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <GraduationCap className="h-7 w-7" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
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
              Access is restricted to active cohort students and whitelisted departmental faculty.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Attempted Account:</span>
                <span className="font-mono font-medium text-foreground">{attemptedEmail}</span>
              </div>
              <p className="text-muted-foreground leading-relaxed pt-1">
                Your institutional email was authenticated, but no matching student roster or active staff record was found in the current academic year registry.
              </p>
            </div>

            <div className="rounded-lg border border-info-soft bg-info-soft/40 p-3 text-xs text-info flex items-start gap-2.5">
              <Mail className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="font-semibold">Need Assistance?</span>
                <p className="mt-0.5 text-muted-foreground">
                  Contact the Final Year Project Coordinator at{" "}
                  <a
                    href={`mailto:${coordinatorContact}`}
                    className="font-medium text-foreground underline underline-offset-2"
                  >
                    {coordinatorContact}
                  </a>{" "}
                  to verify your cohort roster entry.
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2 border-t border-border pt-4">
            <Button variant="outline" asChild className="w-full gap-2 text-xs">
              <Link href="/login">
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sign Out & Try Another Account</span>
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
