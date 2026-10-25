import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, GraduationCap } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center p-6 sm:p-12">
      <div className="w-full max-w-xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              HTU · FYPMS
            </h1>
            <p className="text-sm text-muted-foreground">
              Ho Technical University — Computer Science
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Final Year Project Management System</CardTitle>
            <CardDescription>
              Orchestrating student rosters, group formation, proposals, supervision, defenses, and departmental broadsheets.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="w-full sm:w-auto">
                <Link href="/dev/ui">
                  View Component Kit <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
