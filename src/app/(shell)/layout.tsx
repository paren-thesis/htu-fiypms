import * as React from "react";
import { AppSidebar } from "@/components/navbar/AppSidebar";
import { TopNav } from "@/components/navbar/TopNav";

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Left Sidebar (Desktop & Tablet) */}
      <React.Suspense
        fallback={
          <aside className="hidden md:flex w-16 lg:w-64 border-r border-border bg-card" />
        }
      >
        <AppSidebar />
      </React.Suspense>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Slim Navigation Bar */}
        <React.Suspense
          fallback={<header className="h-14 border-b border-border bg-card" />}
        >
          <TopNav />
        </React.Suspense>

        {/* Page Content Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
