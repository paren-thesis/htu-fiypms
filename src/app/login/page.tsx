import * as React from "react";
import Link from "next/link";
import { GraduationCap, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

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
            <GoogleSignInButton />

            <div className="rounded-lg bg-muted/60 p-3 text-center text-xs text-muted-foreground leading-relaxed">
              Accepting verified <span className="font-semibold text-foreground">@htu.edu.gh</span> credentials only. Roster linkage is enforced automatically.
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-2 border-t border-border pt-4 text-center">
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
