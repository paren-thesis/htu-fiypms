import * as React from "react";
import Link from "next/link";
import { UserCheck, ArrowRight, GraduationCap } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function CompleteProfilePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-xl space-y-6">
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

        {/* Complete Profile Card */}
        <Card className="border-border shadow-sm">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              <CardTitle className="text-lg font-semibold text-foreground">
                Faculty Profile Setup
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Complete your faculty profile with office location, consultation hours, and research tags to activate supervisor matching.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center text-xs space-y-2">
              <p className="font-semibold text-foreground">
                Profile Form Wiring (Phase 2 / 02-01)
              </p>
              <p className="text-muted-foreground max-w-md mx-auto">
                Faculty profile completion form with research domain tags, maximum team capacity, and office consultation hours will be connected to Firestore in Phase 2.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t border-border pt-4">
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link href="/login">Sign Out</Link>
            </Button>
            <Button size="sm" asChild className="gap-1.5 text-xs">
              <Link href="/">
                <span>Continue to Dashboard</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
