import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
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

        {/* Login Card */}
        <Card className="border-border shadow-sm">
          <CardHeader className="space-y-1 text-center pb-2">
            <CardTitle className="text-lg font-semibold">
              Institutional Sign In
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <GoogleSignInButton />

            <div className="rounded-lg bg-muted/60 p-3 text-center text-xs text-muted-foreground leading-relaxed">
              Only verified <span className="font-semibold text-foreground">@htu.edu.gh</span> accounts are permitted.
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
