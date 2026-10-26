import * as React from "react";
import Link from "next/link";
import { GraduationCap, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md space-y-6">
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

        {/* Login Card */}
        <Card className="border-border shadow-sm">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-lg font-semibold">
              Institutional Sign In
            </CardTitle>
            <CardDescription className="text-xs">
              Access the Final Year Project Management System using your official university account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Google Sign In Button (disabled in phase 0, wired in 02-01) */}
            <Button
              className="w-full gap-2.5 h-10 font-medium"
              disabled
              aria-label="Sign in with Google (available in phase 2)"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Sign in with Google</span>
            </Button>

            <div className="rounded-lg bg-muted/60 p-3 text-center text-xs text-muted-foreground leading-relaxed">
              Accepting verified <span className="font-semibold text-foreground">@htu.edu.gh</span> credentials only. Roster linkage is enforced automatically.
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-2 border-t border-border pt-4 text-center">
            <p className="text-[11px] text-muted-foreground">
              Temporary dev session is active.
            </p>
            <Button variant="link" size="sm" asChild className="text-xs text-primary h-auto p-0">
              <Link href="/">
                <span>Return to Dashboard</span>
                <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
