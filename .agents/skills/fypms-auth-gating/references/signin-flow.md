### **5.2 Sign-In Linkage Flow (`complete-signup.ts`)**

Triggered by the client after successful Google Sign-In, with the fresh ID token forwarded in the Server Action body.

1. `verifyIdToken` $\rightarrow$ `{ uid, email }`.
2. **Domain Gate:** If email does not end with `@htu.edu.gh`, return 403 with "Use your HTU account." Sign out client-side.
3. **Branch on Email Pattern:**
   - a) `email` matches `^[0-9]{10}@htu\.edu\.gh$` $\rightarrow$ **STUDENT PATH** (step 4)
   - b) else $\rightarrow$ **FACULTY PATH** (step 5)
4. **Student Path:**
   - a) Extract `indexNumber = email.localPart`.
   - b) Read `rosters/{currentYear}/students/{indexNumber}`.
   - c) If missing $\rightarrow$ 403 "Not in current final-year cohort. Contact your coordinator." Client redirects to `/not-registered`.
   - d) If present and `user_uid === null` $\rightarrow$ begin Firestore transaction: update roster doc with `{ user_uid: uid, signup_completed_at: serverTimestamp() }`; set `users/{uid}` `{ name, email, role: 'student', roles: ['student'], active_role: 'student', profile: { index_number, course_id, registered: true, profile_complete: true }, created_at, updated_at }`. Commit. Set custom claims `{ roles: ['student'], activeRole: 'student', registered: true, profileComplete: true }`. Return `{ ok: true, activeRole: 'student' }`.
   - e) If present and `user_uid === uid` $\rightarrow$ idempotent success. Return `{ ok: true }`.
   - f) If present and `user_uid` is a DIFFERENT `uid` $\rightarrow$ append `/audit_logs` `{ action: 'identity_conflict', index_number, email, attempted_uid, existing_uid }`. Return 409 "This index is already linked to another account. Contact the coordinator."
5. **Faculty Path:**
   - a) Read `staff_whitelist/{email}`.
   - b) If missing or `is_active === false` $\rightarrow$ 403 "Not a registered supervisor for this semester. Contact your coordinator/HoD." Client redirects to `/not-registered`.
   - c) If present and `is_active === true` $\rightarrow$ Firestore transaction: create or update `users/{uid}` with staff profile fields (`name`, `staff_id`, `department`, `programmes`; phone, office location and consultation hours are stored in `supervisor_contacts/{uid}`, never in `users`) and set `profile_complete: false` (unless already true from prior sign-in). Set custom claims `{ roles: staffDoc.roles, activeRole: staffDoc.roles[0], registered: true, profileComplete: <current> }`. Update `staff_whitelist` doc `{ user_uid: uid }` if not already set (write-once). Return `{ ok: true, activeRole, profileComplete }`.
6. Client calls `getIdToken(true)` to receive fresh claims, then `onAuthStateChanged` routes to `/complete-profile` (faculty, `profileComplete: false`) or dashboard.
