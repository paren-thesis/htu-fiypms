import { existsSync, readFileSync } from 'node:fs';

// 1. Stub 'server-only'
try {
  const serverOnlyPath = require.resolve('server-only');
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  } as unknown as NodeModule;
} catch {
  // Ignore
}

// 2. Load environment variables (.env.local takes precedence, then .env)
const envFile = existsSync('.env.local') ? '.env.local' : existsSync('.env') ? '.env' : null;
if (envFile) {
  const envContent = readFileSync(envFile, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    const key = match?.[1]?.trim();
    const rawVal = match?.[2]?.trim();
    if (key && rawVal !== undefined) {
      let value = rawVal;
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

// 3. Ensure live Cloud Firestore is targeted
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = 'false';
process.env.NEXT_PUBLIC_USE_EMULATORS = 'false';
process.env.FIREBASE_ADMIN_PROJECT_ID = 'htu-fiypms';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'htu-fiypms';

async function main() {
  const { adminDb } = await import('../src/lib/firebase/admin');
  const { Timestamp } = await import('firebase-admin/firestore');

  const email = 'bfrimpong@htu.edu.gh';
  const fullName = 'Bill Kissi Frimpong';
  const phone = '0543061951';
  const roles = ['coordinator', 'supervisor'];
  const department = 'Computer Science';
  const programmes = ['btech-cs', 'btech-ict', 'hnd-cs', 'hnd-ict'];

  console.log(`Adding lecturer ${email} to staff_whitelist...`);

  const staffRef = adminDb.collection('staff_whitelist').doc(email);
  const existing = await staffRef.get();

  await staffRef.set(
    {
      email,
      full_name: fullName,
      phone,
      roles,
      department,
      programmes,
      is_active: true,
      added_by_uid: 'manual_script',
      added_at: existing.exists ? existing.data()?.added_at || Timestamp.now() : Timestamp.now(),
      user_uid: existing.exists ? existing.data()?.user_uid || null : null,
    },
    { merge: true }
  );

  console.log(' Successfully added/updated lecturer in staff_whitelist!');
  console.log(`- Email: ${email}`);
  console.log(`- Name: ${fullName}`);
  console.log(`- Roles: ${roles.join(', ')}`);
  console.log(`- Programmes: ${programmes.join(', ')}`);
  console.log('\nWhen he signs in with Google using bfrimpong@htu.edu.gh, his account will automatically link with full Coordinator & Supervisor privileges.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to add lecturer:', err);
  process.exit(1);
});

