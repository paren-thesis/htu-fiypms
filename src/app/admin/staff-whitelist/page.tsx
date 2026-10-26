import * as React from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/common/PageHeader";
import { StaffWhitelistTable } from "@/components/auth/StaffWhitelistTable";
import { listStaffWhitelist } from "@/lib/models/staff-whitelist/repo";

export const metadata: Metadata = {
  title: "Staff Whitelist · FYPMS",
  description:
    "Manage authorized faculty whitelist, supervision tracks, and institutional access roles.",
};

export const dynamic = "force-dynamic";

export default async function StaffWhitelistPage() {
  const staffMembers = await listStaffWhitelist();

  const staffKey = staffMembers
    .map((s) => `${s.email}:${s.is_active ? '1' : '0'}:${s.roles.join(',')}`)
    .join('|');

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Staff Whitelist Management"
        description="Maintain departmental faculty members, configure superviseable programme tracks, and assign institutional roles."
      />

      <StaffWhitelistTable key={staffKey} initialStaff={staffMembers} />
    </div>
  );
}
