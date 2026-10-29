import * as React from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/common/PageHeader";
import { StaffWhitelistTable } from "@/components/auth/StaffWhitelistTable";
import { listStaffWhitelist } from "@/lib/models/staff-whitelist/repo";
import { serializeForClient } from "@/lib/serialize";

export const metadata: Metadata = {
  title: "Staff Whitelist · FYPMS",
  description:
    "Manage authorized faculty whitelist, supervision tracks, and institutional access roles.",
};

export default async function StaffWhitelistPage() {
  await connection();
  const rawStaff = await listStaffWhitelist();
  const staffMembers = serializeForClient(rawStaff);

  const staffKey = staffMembers
    .map((s) => `${s.email}:${s.is_active ? "1" : "0"}:${s.roles.join(",")}`)
    .join("|");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Allowlist"
        description="Manage staff access, assign roles, and configure supervised tracks."
      />

      <StaffWhitelistTable key={staffKey} initialStaff={staffMembers} />
    </div>
  );
}
