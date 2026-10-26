import * as React from "react";
import { FileSpreadsheet, Download } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Broadsheets"
        description="Compile and export departmental broadsheets to Excel (with formulas), CSV, and printable PDF."
        action={
          <Button size="sm" className="gap-1.5" disabled>
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>Export Broadsheet</span>
          </Button>
        }
      />

      <EmptyState
        icon={<FileSpreadsheet className="h-6 w-6 text-primary" aria-hidden="true" />}
        title="No Broadsheets Compiled"
        description="Broadsheet reports are generated grouped by programme track (BTech Computer Science) once grades are submitted."
        action={
          <Button size="sm" variant="outline" disabled>
            Generate Preview
          </Button>
        }
      />
    </div>
  );
}
