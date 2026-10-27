import './setup-env';
import { adminDb } from '../src/lib/firebase/admin';
import { getCurrentAcademicYear } from '../src/lib/models/academic-year/repo';
import { ensureSupervisionDoc } from '../src/lib/models/supervision';
import type { StaffWhitelistDocument } from '../src/types/firestore';

export async function runBackfillSupervisions(targetYearId?: string): Promise<number> {
  let yearId = targetYearId;
  if (!yearId) {
    const currentYear = await getCurrentAcademicYear();
    if (!currentYear) {
      console.error('No active academic year found for supervision backfill.');
      return 0;
    }
    yearId = currentYear.id;
  }

  console.log(`Backfilling supervisions for academic year: ${yearId}`);

  // Query all active supervisors from staff_whitelist
  const staffSnap = await adminDb.collection('staff_whitelist').get();
  const staffDocs = staffSnap.docs.map((d) => d.data() as StaffWhitelistDocument);
  const supervisorStaff = staffDocs.filter(
    (s) => s.is_active && Array.isArray(s.roles) && s.roles.includes('supervisor')
  );

  let processedCount = 0;

  for (const staff of supervisorStaff) {
    let uid = staff.user_uid;
    if (!uid) {
      // Try to find user doc by email
      const userQuery = await adminDb
        .collection('users')
        .where('email', '==', staff.email.toLowerCase())
        .limit(1)
        .get();
      if (!userQuery.empty && userQuery.docs[0]) {
        uid = userQuery.docs[0].id;
      }
    }

    if (!uid) {
      console.log(`  [skip] Staff ${staff.email} has no linked user account.`);
      continue;
    }

    const doc = await ensureSupervisionDoc(uid, yearId);
    console.log(`  [supervision] Ensured doc ${doc.id} (capacity: ${doc.max_capacity})`);
    processedCount++;
  }

  console.log(`Supervision backfill complete. Processed ${processedCount} supervisors.`);
  return processedCount;
}

if (require.main === module) {
  const targetYear = process.argv[2];
  runBackfillSupervisions(targetYear)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Supervision backfill failed:', err);
      process.exit(1);
    });
}
