# **FINAL YEAR PROJECT MANAGEMENT SYSTEM**

### **System Requirements & Technical Specification Manual — Version 5.2.2 (Google Sign-In + Roster Gating · Review Amendments)**
**Ho Technical University — Department of Computer Science**  
*Technology Stack: Next.js 15 (App Router) · Vercel · Firebase Authentication · Cloud Firestore · Tailwind CSS · TypeScript 5*  
*October 2026*

---

# **1. System Overview**

The **Final Year Project Management System** is a cloud-native, real-time academic platform designed to orchestrate, standardize, and automate the end-to-end final year capstone project lifecycle for the Department of Computer Science at Ho Technical University (HTU).

The system consolidates disparate, manual workflows—student roster onboarding, group formation, proposal review state machines, supervisor workload matching, sequential chapter milestone reviews, digital defense marksheet grading, peer contribution assessments, and official board broadsheet exports—into a cohesive, secure, and reactive web platform.

### **Core Objectives**
- **Eliminate Administrative Overhead:** Replace paper marksheets, manual Excel record-keeping, and scattered email threads with centralized, auditable digital workflows.
- **Serverless & Edge Architecture:** Deliver instantaneous page transitions and reactive state synchronization globally using **Next.js 15 (App Router)** hosted on **Vercel's Global Edge Network** with dedicated Node.js Server Actions for heavy operations.
- **Google Identity + Cohort Gating:** Institutional authentication via Google Workspace (@htu.edu.gh). Students are admitted only if their 10-digit index number appears in the current cohort roster; faculty are admitted only if their email appears in the staff whitelist. Multi-role RBAC is enforced via JWT Custom Claims (roles[], activeRole, registered, profileComplete).
- **Reactive Cloud Data Store:** Provide sub-second response times and real-time live browser synchronization via **Cloud Firestore**, allowing live score streaming during oral defense sessions.
- **Roster-First Onboarding:** Coordinators import student rosters via CSV (filename-detected course track with explicit confirmation). Import writes to a dedicated /rosters collection — no Firebase Auth users are created at import time. Students self-provision their Auth account on first Google sign-in, subject to a roster gate. Faculty are provisioned via a coordinator-maintained staff whitelist.
- **Gated Consultation Privacy:** Restrict access to supervisor personal consultation hours, office locations, and contact details until projects are formally approved and accepted.
- **Mathematical Workload Balancing:** Calculate supervisor allocation match scores based on normalized Jaccard topic keyword overlap, faculty research interests, and bounded active group capacities.
- **Departmental Broadsheet Exports & Grade Integrity:** Output departmental reports and grade broadsheets in **Excel (`.xlsx`)**, **CSV**, and official printable **PDF** formats with immutable post-publication locking and audit-logged amendment workflows.

---

# **2. User Personas & Roles**

The platform employs a dynamic Role-Based Access Control (RBAC) model allowing academic staff to hold multiple active roles (e.g., a lecturer acting as both a Project Supervisor and a Departmental Coordinator), switching active contexts seamlessly via the navigation bar.

```
                  [Institutional Identity (@htu.edu.gh)]
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
    🎓 Student                 👨‍🏫 Supervisor               📋 Coordinator
(Teams, Proposals, Drive   (Topic Review, Chapter       (Student Records & Roster
Reviews, Deliverables,     Feedback, Continuous         Import, Whitelist, Workloads,
Peer Evals, Grade Views)   Assessment, Repo Sign-off)   Rubrics, Defense, Broadsheets)
         │                           │                           │
         └───────────────────────────┼───────────────────────────┘
                                     │
                      ⚖️ Defense Panel Member / 🛡️ Admin
                    (Oral Defense Marksheets / System Auditing)
```

### **2.1 Student (Final Year)**
*Role: Undergraduate student enrolled in a final year capstone project course.*

**Primary Goals**
- Complete one-click Google Sign-In (identity validated against the cohort roster).
- Form or join a project team (4–5 members) using an auto-generated group number (e.g. `BICT26_01`) and a 6-character unique invite code.
- Select and submit 3 ranked project topics detailing title, abstract, problem statement, proposed solution, and tech stack tags.
- Track proposal approval transitions through an explicit state machine and submit versioned revisions if requested.
- View assigned supervisor and, once accepted, access their consultation contact details, office location, and consultation hours.
- Submit chapter review links (Google Drive / OneDrive) for sequential milestone evaluation (Chapters 1 to 5).
- Complete 360° anonymous peer evaluations for teammates across punctuality, technical output, and teamwork.
- Submit final software deliverables (GitHub repo URL, Live Demo link, and Markdown Environment Setup Notes).
- View individual and team grades post-defense and lodge appeals during the open appeal window.

### **2.2 Supervisor (Faculty Lecturer)**
*Role: Academic staff assigned to guide, mentor, and assess student groups.*

**Primary Goals**
- Maintain a staff whitelist entry (added by a coordinator or admin) before first sign-in. Supervisors cannot import student rosters or manage the staff whitelist (D-05).
- Review submitted group topics; approve one topic or request structured revisions with persistent feedback notes.
- Accept or decline group assignments suggested by the coordinator's matching algorithm.
- Review sequential chapter submissions with line-item status (`Approved` or `Revision Needed`) and detailed line feedback.
- Track student team progress against academic calendar milestones.
- Submit continuous assessment evaluations (40% weight) against department rubric criteria.
- Inspect student GitHub code repositories, verify environment setup notes, and sign off on technical deliverables prior to defense.
- Review teammate peer evaluation summaries to detect free-riding and adjust continuous assessment scores.

### **2.3 Defense Panel Member / Examiner (Chair & Member)**
*Role: Faculty member appointed to evaluate oral defense presentations and software demonstrations.*

**Primary Goals**
- **Panel Chair:** Preside over defense sessions, verify panel quorum, initiate session timing, and formally submit composite panel consensus.
- **Panel Examiner:** Review assigned teams' final software deliverables, GitHub repository code, and chapter links prior to defense.
- Access dynamic, real-time digital defense marksheets on any device (tablets, laptops, phones) during oral presentations.
- Grade each team against active panel rubric criteria (final marks are per team); scores stream live to the panel chair and coordinator dashboard.

### **2.4 Final Year Project Coordinator**
*Role: Faculty head overseeing the departmental capstone program.*

**Primary Goals**
- Configure active academic sessions (`2025/2026`), semesters, and course tracks (`BTECH-CS`, `BTECH-ICT`, `HND-CS`, `HND-ICT`).
- Manage the staff whitelist — adding, updating, and deactivating faculty access (coordinators and admins only, D-05).
- Import student rosters via CSV to `/rosters` (filename-detected course with confirmation; no Auth users created at import time). Admins have the same permission; supervisors do not (D-05).
- Create, view, edit, deactivate and delete individual student records, and change a student's programme only through the audited course-change action (D-06).
- Manage unassigned student pool with auto-grouping tools and manual overrides.
- Compute supervisor match scores using the mathematically bounded Jaccard tag similarity and capacity formula, scoped to supervisors whose `programmes[]` include the team's `course_id`.
- Build and activate department defense rubrics with custom criteria, maximum points, and percentage weights (e.g. Supervisor: 40%, Defense Panel: 60%).
- Schedule defense events, allocate physical/virtual venues, compose examination panels (Chair + Examiners), and run automatic conflict detection across faculty schedules.
- Generate and export official department grade broadsheets in CSV, Excel (`.xlsx`), and official PDF formats with signature lines.
- Publish final grades, lock evaluation documents against further modification, and process formal grade amendment requests.

### **2.5 System Administrator**
*Role: IT personnel managing platform security, user permissions, and audit logs.*

**Primary Goals**
- Import student roster CSVs and manage the staff whitelist, with the same permissions as the coordinator (D-05), including student record CRUD (D-06).
- Manage user accounts, role assignments, and permission matrices via Firebase Custom Claims.
- Execute global administrative overrides (e.g. forced group disbanding, emergency deadline extensions, member transfers).
- Monitor immutable system audit trails with action badges, actor metadata, and payload JSON deltas.
- Manage point-in-time recovery (PITR) and scheduled cloud data backups.

---

# **3. Technology Stack & Architectural Specifications**

| **Layer** | **Technology Selected** | **Architectural Purpose** |
| :--- | :--- | :--- |
| **Framework** | **Next.js 15 (App Router)** | Full-stack architecture utilizing React Server Components (RSC) for fast pre-rendered page shells and Server Actions for secure backend operations. |
| **Hosting & CDN** | **Vercel** | Serverless edge execution, global CDN asset delivery, automated branch previews, and zero-configuration HTTPS. |
| **Identity & Auth** | **Firebase Authentication** | Managed cloud identity via Google Workspace OAuth restricted to @htu.edu.gh. JWT Custom Claims encode roles[], activeRole, registered, and profileComplete for edge-safe RBAC. |
| **Database** | **Google Cloud Firestore** | Serverless NoSQL document database providing real-time document listeners (`onSnapshot`), atomic batch writes, and multi-region durability. |
| **Data Security** | **Firestore Security Rules** | Declarative security policies enforced at the database layer (`firestore.rules`) with strict ownership checks matching JWT custom claims. |
| **Styling & Theme** | **Tailwind CSS + `shadcn/ui`** | Modern design system with accessible components, responsive layouts, and a **light-mode-only** HTU blue-and-white theme (no dark mode). |
| **Icons** | **Lucide React** | Consistent, optimized SVG icon system. |
| **Form Validation** | **React Hook Form + Zod** | End-to-end type-safe form validation for CSV imports, topic submissions, and defense grading. |
| **Reporting Engines** | **`exceljs` + `@react-pdf/renderer`** | Pure TypeScript export pipeline generating departmental grade broadsheets, Excel spreadsheets with formulas, and official printable PDF broadsheets with signature lines. |
| **Language** | **TypeScript 5 (Strict)** | Strict compile-time type validation across database models, server actions, and UI state. |

### **3.1 Runtime Split & Execution Boundaries**
To prevent runtime errors and cold-start timeouts:
1. **Edge Runtime:** Used exclusively for lightweight middleware route guards (`middleware.ts`) and static RSC dashboard shells.
2. **Node.js Runtime (`export const runtime = 'nodejs'`):** Used for all Server Actions and Route Handlers utilizing `firebase-admin`, `exceljs`, and `@react-pdf/renderer`.
3. **Execution Timeout Configuration:** Heavy operations like bulk CSV roster imports and broadsheet generation explicitly set `export const maxDuration = 60;` to exceed the standard 10-second serverless timeout.
4. **Client SDK vs. Admin SDK Split:**
   - **Client SDK (`lib/firebase/client.ts`):** Handles user session persistence, Google Sign-In, and real-time reactive UI subscriptions (`onSnapshot`).
   - **Admin SDK (`lib/firebase/admin.ts`):** Initialized as a singleton on `globalThis` to prevent connection leaks, executing privileged operations (custom claim assignment, batch commits) with service account credentials.
5. **Token Forwarding:** Client components invoking Server Actions forward the active Firebase ID token (`await user.getIdToken()`), which the Server Action validates using `adminAuth.verifyIdToken(token)` before performing privileged database mutations.

---

# **4. System Architecture — Serverless Topology**

```mermaid
graph TD
    User([End Users: Students, Lecturers, Coordinators, Panel]) -->|HTTPS / Edge Routing| Vercel[Vercel Global Edge Network]

    subgraph NextJS [Next.js 15 Full-Stack Application]
        Vercel --> RSC[React Server Components<br/>Edge/Node Shells]
        Vercel --> ClientUI[Interactive Client Components<br/>Digital Marksheets, Live Listeners, Forms]
        Vercel --> Actions[Node.js Server Actions & Route Handlers<br/>maxDuration=60, Admin Auth, Broadsheets]
    end

    subgraph FirebaseServices [Google Cloud Firebase Platform]
        ClientUI -->|Direct Client SDK / JWT Auth| FBAuth[Firebase Authentication<br/>Google OAuth + Custom Claims:<br/>roles, activeRole, registered, profileComplete]
        ClientUI -->|onSnapshot / Real-Time Listeners| Firestore[(Cloud Firestore NoSQL)]
        Actions -->|Firebase Admin SDK<br/>Atomic Batch Writes| Firestore
        Actions -->|Custom Claim Assignment & Roster Linking| FBAuth
    end

    subgraph ExternalServices [External Integrations]
        ClientUI -. Chapter Reviews .-> GDrive[Google Drive / OneDrive Links]
        ClientUI -. Code Deliverables .-> GitHub[GitHub / GitLab Repositories]
    end
```

---

# **5. Functional Requirements**

## **FR-01: Google Authentication, Roster Gating & Role-Based Access Control**

| **ID** | **Requirement** | **Priority** |
| :--- | :--- | :--- |
| **FR-01.1** | Users authenticate exclusively via Google Sign-In (Firebase Auth GoogleAuthProvider). Only email addresses ending in `@htu.edu.gh` are accepted. All other domains are rejected before any Firestore lookup. | High |
| **FR-01.2** | System enforces multi-role RBAC via Firebase Auth Custom Claims. Claims schema: `{ roles: string[], activeRole: string, registered: boolean, profileComplete: boolean }`. Allowed roles: `student`, `supervisor`, `coordinator`, `admin`, `panel_member`. | High |
| **FR-01.3** | **Active Role Switching:** Faculty with multiple roles switch active contexts via a navbar dropdown. The action invokes `switch-role.ts` Server Action, which calls `adminAuth.setCustomUserClaims(uid, { ...claims, activeRole })`, returns a fresh ID token, and the client calls `getIdToken(true)` before navigation. The client MUST await the new token before rendering role-scoped UI. | High |
| **FR-01.4** | **Student Roster CSV Import:** Only Coordinators and Admins can bulk-import student rosters via CSV (supervisors, panel members and students are rejected with 403, D-05) (required columns: `index_number`, `full_name`, `contact`). Import writes to `rosters/{academicYearId}/students/{indexNumber}`. The import interface includes filename-based course detection (with explicit UI confirmation), batch-size controls (25, 50, 100), template download, dry-run mode, and summary metrics (`Total`, `Imported`, `Skipped`, `Errors`). NO Firebase Auth users are created at import time — see §5.1 and §5.2. | High |
| **FR-01.5** | **Student Index Format Validation:** Index numbers MUST match the strict regex `^[0-9]{10}$`. Emails are derived deterministically as `${indexNumber}@htu.edu.gh`. Records failing this regex are rejected at import with a per-row error message. | High |
| **FR-01.6** | **First Sign-In Roster Linkage (`complete-signup.ts`):** On first Google Sign-In, the authenticated email is matched against the current cohort roster. If the email matches `^[0-9]{10}@htu\.edu\.gh$`, the index number is extracted and the doc `rosters/{currentYear}/students/{indexNumber}` is read. If found and `user_uid` is null, the Server Action sets `user_uid = request.auth.uid` (write-once), creates `users/{uid}`, and mints claims `{ roles: ['student'], activeRole: 'student', registered: true, profileComplete: true }`. If not found, the user is redirected to `/not-registered` with a coordinator contact message. | High |
| **FR-01.7** | **Faculty Whitelist Gating:** Supervisors, coordinators, panel members, and admins MUST be added to `staff_whitelist/{email}` by a coordinator or admin (never by a supervisor, D-05) before they can access the system. On first Google Sign-In, if the email does not match the student pattern, the Server Action reads `staff_whitelist/{email}`. If found and `is_active` is true, the Server Action creates `users/{uid}` with `profile_complete: false` and mints claims `{ roles: staffDoc.roles, activeRole: staffDoc.roles[0], registered: true, profileComplete: false }`. If not found, the user is redirected to `/not-registered` with a coordinator/HoD contact message. | High |
| **FR-01.8** | **Unregistered Access Handling:** Users whose Google account is not in the roster or staff whitelist see an unclosable `/not-registered` page with: (a) the attempted email, (b) a category-specific error message, (c) a contact email for the coordinator, and (d) a sign-out button. All routes redirect to `/not-registered` while `token.registered == false`. Unregistered users are NOT deleted from Firebase Auth — they remain for audit purposes but cannot reach any authenticated route. | High |
| **FR-01.9** | **Profile Completion Gate (Faculty):** Newly registered faculty have `profileComplete: false`. Middleware redirects them to `/complete-profile` until they set `office_location`, `consultation_hours`, `research_interests[]`, and `max_team_capacity`. Students skip this gate (auto-profileComplete: true). | High |
| **FR-01.10** | **Category Integrity (Cross-Cutting):** A student's `course_id` is authoritatively set from their roster entry at first sign-in. It is immutable thereafter except via the dedicated `change-student-course` Server Action, available to coordinators and admins with a written justification and only while the student is on no active team (D-06). Category integrity is enforced at five points: (1) team join validates joining student's `course_id` matches `team.course_id`; (2) `group_number` prefix is derived from `course_id`; (3) supervisor matching filters candidates to those whose staff `programmes[]` includes the team's `course_id`; (4) broadsheet export groups strictly by `course_id`; (5) defense panel assignment filters examiners by programme match, with coordinator override logged to `audit_logs`. | High |
| **FR-01.11** | **Staff Whitelist Management:** Coordinators and admins can add, edit, and deactivate staff whitelist entries via a UI form. Each entry records `{ email, full_name, roles[], department, programmes[], is_active, added_by_uid, added_at }`. Deactivation sets `is_active: false` and revokes the user's custom claims on their next token refresh (documented as a 1-hour delayed effect in §9). | High |
| **FR-01.12** | **Student Record Management (D-06):** Coordinators and admins can create, read, update, deactivate and delete individual student records (the roster entries) from `/students`; every other role is rejected with 403. **Create:** index number (`^[0-9]{10}$`), full name, contact and programme; the email is always derived and duplicates are rejected. **Read:** searchable list showing status (Active, Inactive, Linked, Pending sign-in) and team. **Update:** full name and contact only; the index number is immutable and the programme changes only through FR-01.10. **Deactivate:** sets `is_active: false` with a written reason, revokes the student's sessions and blocks sign-in; refused while the student is on an active team. **Delete:** permanent, allowed only for a record that has never signed in and is on no team; otherwise refused and Deactivate is offered. Every operation writes an audit log entry with before and after values. | High |

### **5.1 Student Roster Import (Roster-First, No Auth Writes)**

The CSV import writes ONLY to `/rosters` — it never creates Firebase Auth users. This eliminates the need for complex compensating rollback workflows because no Auth user exists yet at import time.

CSV columns (header row required): `index_number`, `full_name`, `contact`. `contact` is a required phone number (after removing spaces and dashes it must match `^\+?[0-9]{7,15}$`) stored on the roster document only (never copied to `users`); it is the source of the `contact` column in the broadsheet CSV (FR-10.1b).

Pipeline:
1. **Filename Course Detection:** The uploaded file's basename is matched against known patterns (case-insensitive, allowing `_`, `-`, or space as separators): `btech_cs` $\rightarrow$ `btech-cs`, `btech_ict` $\rightarrow$ `btech-ict`, `hnd_cs` $\rightarrow$ `hnd-cs`, `hnd_ict` $\rightarrow$ `hnd-ict`. If ambiguous or unmatched, the user is prompted to select the course manually. The detected course is shown in a confirmation step ("We detected this is a BTECH-ICT roster. Confirm or change.") — detection is a hint, not authoritative.
2. **Pre-Validation:** Server-side Zod re-validation of every row (10-digit index regex `^[0-9]{10}$`, non-empty `full_name`, valid `contact`). Duplicate index numbers within the file are flagged. Index numbers already present in `rosters/{currentYear}/students/` are flagged as Skipped (Duplicate).
3. **Dry-Run Mode:** NFR-08 dry-run returns the full validation report without any Firestore writes. The coordinator reviews the report before committing.
4. **Batch Write:** Valid rows are committed in batches of 50 via `db.batch()`, each writing one roster doc. No Auth calls. No compensating logic needed — a failed batch rolls back cleanly at the Firestore level.
5. **Audit:** A single `/audit_logs` entry is written per import: `{ action: 'roster.imported', course_id, filename, total, imported, skipped, errors, imported_by_uid, academic_year_id }`.

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
   - c2) If present and `is_active === false` $\rightarrow$ treat as not registered: 403 "Your student record is inactive. Contact your coordinator." and append `/audit_logs` `{ action: 'signup.blocked_inactive', index_number, email }`. A missing `is_active` field counts as `true` (D-06).
   - d) If present and `user_uid === null` $\rightarrow$ begin Firestore transaction: update roster doc with `{ user_uid: uid, signup_completed_at: serverTimestamp() }`; set `users/{uid}` `{ name, email, role: 'student', roles: ['student'], active_role: 'student', profile: { index_number, course_id, registered: true, profile_complete: true }, created_at, updated_at }`. Commit. Set custom claims `{ roles: ['student'], activeRole: 'student', registered: true, profileComplete: true }`. Return `{ ok: true, activeRole: 'student' }`.
   - e) If present and `user_uid === uid` $\rightarrow$ idempotent success. Return `{ ok: true }`.
   - f) If present and `user_uid` is a DIFFERENT `uid` $\rightarrow$ append `/audit_logs` `{ action: 'identity_conflict', index_number, email, attempted_uid, existing_uid }`. Return 409 "This index is already linked to another account. Contact the coordinator."
5. **Faculty Path:**
   - a) Read `staff_whitelist/{email}`.
   - b) If missing or `is_active === false` $\rightarrow$ 403 "Not a registered supervisor for this semester. Contact your coordinator/HoD." Client redirects to `/not-registered`.
   - c) If present and `is_active === true` $\rightarrow$ Firestore transaction: create or update `users/{uid}` with staff profile fields (`name`, `staff_id`, `department`, `programmes`; phone, office location and consultation hours are stored in `supervisor_contacts/{uid}`, never in `users`) and set `profile_complete: false` (unless already true from prior sign-in). Set custom claims `{ roles: staffDoc.roles, activeRole: staffDoc.roles[0], registered: true, profileComplete: <current> }`. Update `staff_whitelist` doc `{ user_uid: uid }` if not already set (write-once). Return `{ ok: true, activeRole, profileComplete }`.
6. Client calls `getIdToken(true)` to receive fresh claims, then `onAuthStateChanged` routes to `/complete-profile` (faculty, `profileComplete: false`) or dashboard.

---

## **FR-02: Group Management & Unassigned Student Pool**

| **ID** | **Requirement** | **Priority** |
| :--- | :--- | :--- |
| **FR-02.1** | Students can create a project team (4–5 members) with the creator designated as Team Leader. | High |
| **FR-02.2** | System auto-generates unique group numbers formatted as `{CourseCode}{YY}_{Sequence:02d}` (e.g. `BICT26_01`, `BCS26_02`). | High |
| **FR-02.3** | Students join groups using a 6-character unique alphanumeric invite code (e.g. `K9X2P4`) generated upon team creation. | High |
| **FR-02.4** | Team Leaders can invite teammates via index number or email; team joining validates membership caps (max 5). | High |
| **FR-02.4a** | **Team Course-Category Integrity:** A student may only create or join teams whose `course_id` matches their own `profile.course_id` (set from their roster entry at first sign-in). Create and join Server Actions MUST validate this inside a Firestore transaction. A mismatch returns 409 "This team belongs to a different programme. You can only join teams in your own course track." | High |
| **FR-02.5** | Students cannot belong to multiple active project groups concurrently in the same academic year. | High |
| **FR-02.5a** | **Group Number Prefix Integrity:** The `group_number` prefix is derived from `team.course_id` (`btech-cs` $\rightarrow$ `BCS`, `btech-ict` $\rightarrow$ `BICT`, `hnd-cs` $\rightarrow$ `HCS`, `hnd-ict` $\rightarrow$ `HICT`). The prefix is never user-supplied and is validated server-side. | High |
| **FR-02.6** | **Coordinator Pool & Auto-Grouping Tool:** Coordinator can view all unassigned students after the formation deadline, run an auto-grouping algorithm (clustering strictly by `course_id`; cross-category merging is disallowed even under auto-grouping, except via explicit admin override per FR-02.7 which logs to `audit_logs`), or manually assign students to existing/new teams. | High |
| **FR-02.7** | **Admin Overrides:** System Admin can override min/max group size limits, execute member transfers, or disband groups at any lifecycle stage with automatic notification. | High |

---

## **FR-03: Topic Selection, State Machine & Versioning**

| **ID** | **Requirement** | **Priority** |
| :--- | :--- | :--- |
| **FR-03.1** | Each group submits 3 ranked project topics (`preference_rank: 1 | 2 | 3`) detailing title, abstract, problem statement, proposed solution, and tech stack tags. | High |
| **FR-03.2** | Topic approval lifecycle follows an explicit state machine: `draft` $\rightarrow$ `submitted` $\rightarrow$ `under_review` $\rightarrow$ `approved` / `rejected` / `revision_requested`. | High |
| **FR-03.3** | **Duplicate Detection:** Automated keyword overlap check alerts teams and supervisors if a submitted topic has high textual similarity with archived past projects. | Medium |
| **FR-03.4** | Supervisors review submitted proposals, leave review notes, and approve exactly one primary topic for execution. | High |
| **FR-03.5** | **Topic Versioning & Resubmission:** Teams whose topics require revision or are rejected can submit updated proposals without corrupting rank uniqueness. Each update increments `version: number`, archives the prior proposal snapshot in subcollection `/topics/{topicId}/history`, and marks the new revision as `is_current: true`. | High |

---

## **FR-04: Supervisor Matching & Contact Information Gating**

| **ID** | **Requirement** | **Priority** |
| :--- | :--- | :--- |
| **FR-04.1** | System calculates a **Supervisor Match Score** combining normalized Jaccard topic keyword overlap, lecturer specialization tags, and bounded capacity quotas. | High |
| **FR-04.2** | Coordinator views ranked supervisor recommendations (top 3) when assigning groups, with manual override support. | High |
| **FR-04.2a** | **Programme-Scoped Candidate Filter:** The matching engine only considers supervisors whose `staff_whitelist.programmes[]` includes the team's `course_id`. A supervisor who does not list the team's programme is not shown as a candidate. Coordinators may manually override with an audit-logged reason. | High |
| **FR-04.3** | Supervisor accepts or declines group assignment within a designated notification window. | High |
| **FR-04.4** | **Gated Contact Details:** Supervisor consultation hours, office location, and direct contact numbers are strictly hidden from students until the supervisor accepts assignment and the topic is approved. | High |

### **4.1 Mathematical Specification for Supervisor Match Score**
Candidate supervisors are first filtered to those whose `programmes[]` contains the team's `course_id`; the Jaccard/capacity formula is then applied only to the filtered candidate set.

Let:
- $T$ = Set of lowercase keyword tags associated with the student team's approved topic.
- $S$ = Set of lowercase research specialization tags configured on the supervisor profile.
- $C_{\text{curr}}$ = Current count of active groups assigned to the supervisor.
- $C_{\text{max}}$ = Configured maximum team capacity for the supervisor ($C_{\text{max}} \ge 1$; defaults to 5 if unset).

1. **Tag Overlap Metric (Jaccard Similarity):**
   $$\text{TagOverlap}(T, S) = \begin{cases} \frac{|T \cap S|}{|T \cup S|}, & \text{if } |T \cup S| > 0 \\ 0, & \text{if } |T \cup S| = 0 \end{cases}$$

2. **Workload Capacity Metric:**
   $$\text{CapacityScore}(C_{\text{curr}}, C_{\text{max}}) = \max\left(0.0, \, 1.0 - \frac{C_{\text{curr}}}{\max(1, C_{\text{max}})}\right)$$
   *(Note: Bounded strictly in $[0.0, 1.0]$. If $C_{\text{curr}} \ge C_{\text{max}}$, the capacity term cleanly evaluates to $0.0$, preventing negative scores).*

3. **Composite Match Score:**
   $$\text{MatchScore} = (\text{TagOverlap} \times 0.7) + (\text{CapacityScore} \times 0.3)$$
   *(Result is strictly bounded between $0.0$ and $1.0$).*

*Note (F-16): with $C_{\text{max}} = 0$ and $C_{\text{curr}} = 0$ the capacity term is $1.0$. The formula is unchanged; the coordinator UI shows an "At capacity" badge whenever $C_{\text{curr}} \ge C_{\text{max}}$.*

---

## **FR-05: Chapter Submission via External Document Links**

| **ID** | **Requirement** | **Priority** |
| :--- | :--- | :--- |
| **FR-05.1** | Students submit 5 sequential chapters by providing shared Google Drive or OneDrive URLs (avoiding heavy server storage). | High |
| **FR-05.2** | Submission history preserves prior version links, revision dates, and supervisor line-item comments using the `chapters` collection. | High |
| **FR-05.3** | Supervisors review external document links and record milestone status as `Approved` or `Revision Needed`. | High |
| **FR-05.4** | Automated notifications alert supervisors of unreviewed chapter submissions approaching calendar milestones. | Medium |

---

## **FR-06: Multi-Evaluator Defense Scoring & Peer Contribution Assessment**

| **ID** | **Requirement** | **Priority** |
| :--- | :--- | :--- |
| **FR-06.1** | **Customizable Rubrics:** Coordinator configures department rubric criteria and sets weighting percentages (e.g. Supervisor Continuous Assessment: 40%, Defense Panel: 60%). | High |
| **FR-06.2** | **Real-Time Digital Marksheet:** Panel members and supervisors access real-time scoring sheets during defense presentations; scores stream live via Firestore `onSnapshot`. Optimistic UI state provides immediate feedback (<100ms) with Firestore reconciliation (~150–500ms on campus Wi-Fi). | High |
| **FR-06.3** | **Live Score Aggregation:** Individual examiner scores are written to separate evaluation documents. The panel chair and coordinator dashboards compute a live composite score in real time. Upon session conclusion, an idempotent Server Action writes the verified aggregate score to the team summary. | High |
| **FR-06.4** | **360° Anonymous Peer Assessment:** Group members submit confidential ratings for teammates across punctuality, technical output, and teamwork (scale 1–10). | High |
| **FR-06.5** | **Peer Score Confidentiality & Free-Rider Detection:** Teammates can never view individual peer ratings submitted by their peers. Only supervisors and coordinators can inspect aggregated peer evaluations to identify free-riders and adjust continuous assessment marks. | High |
| **FR-06.6** | **Team-Level Final Mark (D-02):** Final marks are awarded per team; every member receives the team's composite score. Evaluations are scored at team level (`student_id` is always null in v1). Peer evaluations are advisory input to the supervisor's team continuous assessment and never alter individual marks. | High |

---

## **FR-07: Defense Scheduling, Panel Management & Conflict Detection**

| **ID** | **Requirement** | **Priority** |
| :--- | :--- | :--- |
| **FR-07.1** | Coordinator creates defense events, schedules presentation time slots, and assigns physical or virtual meeting venues. | High |
| **FR-07.2** | Coordinator forms Defense Panels with explicit roles: **Panel Chair** (session lead) and **Examiners** (panel members). | High |
| **FR-07.2a** | **Programme-Scoped Panel Assignment:** When composing defense panels, the system defaults to examiners whose `staff_whitelist.programmes[]` includes the panel's `course_id`. Coordinators may assign cross-programme examiners with an audit-logged justification. | High |
| **FR-07.3** | **Automated Conflict Detection:** System automatically detects and flags scheduling conflicts before finalizing panel allocations: (1) Examiner double-booked in overlapping time slots across different panels, and (2) Physical venue double-booked for identical time slots. | High |
| **FR-07.4** | Panel members receive automated schedule notifications with direct links to candidate team deliverables. | High |

---

## **FR-08: Software Deliverables & Environment Setup Notes**

| **ID** | **Requirement** | **Priority** |
| :--- | :--- | :--- |
| **FR-08.1** | Following defense, groups submit final software deliverables: GitHub/GitLab repository URL, Live Demo URL, and cloud storage manuscript link. | High |
| **FR-08.2** | Groups submit **Environment Setup Notes** (Markdown field covering runtime dependencies, environment variables, test credentials, and seed instructions) for supervisor verification. | High |
| **FR-08.3** | Supervisors test repository environments and record formal sign-off before grades are published. | High |

---

## **FR-09: Communication & Real-Time Notifications**

| **ID** | **Requirement** | **Priority** |
| :--- | :--- | :--- |
| **FR-09.1** | In-app notification center for all activity events (topic approval, feedback, defense schedule updates) backed by the `/notifications` collection. | High |
| **FR-09.2** | Real-time toast alerts notify active users instantly of incoming milestone reviews and approvals. | High |
| **FR-09.3** | **Deferred (D-03):** Transactional email is out of scope for v1; no email provider is integrated. All milestone alerts (assignment acceptance, defense call-up) are delivered through the in-app notification centre (FR-09.1) and toasts (FR-09.2). Revisit when an email provider is chosen. | Deferred |

---

## **FR-10: Department Broadsheets, Grade Locking & Immutability**

| **ID** | **Requirement** | **Priority** |
| :--- | :--- | :--- |
| **FR-10.1** | **Multi-Format Broadsheet Exports:** Coordinator can export official Department Broadsheets in **Excel (`.xlsx`)** with HTU styling and formulas, registrar-compatible flat **CSV**, and official printable **PDF** broadsheets with signature lines for the Head of Department and Dean. | High |
| **FR-10.1a** | **Category-Segregated Broadsheet Export:** Department broadsheets are grouped by `course_id` (BTECH-CS / BTECH-ICT / HND-CS / HND-ICT), with separate signature blocks per programme. Cross-programme contamination is impossible because `course_id` is authoritative on `users/{uid}.profile` and rosters. | High |
| **FR-10.1b** | **Broadsheet Content (D-02, D-04):** Each team's composite appears against every member. The **CSV export** columns are `index_number`, `full_name`, `contact`, then `group_number`, `supervisor_score`, `panel_average_score`, `composite_final_score`, `is_locked`, one row per student. `contact` comes from the roster record and is exported in the CSV only (not in the Excel or PDF broadsheets). No grade classification column is produced until thresholds are defined. | High |
| **FR-10.2** | **Grade Immutability:** Once the Coordinator marks grades as published, Firestore security rules permanently lock all `/evaluations` records for that academic session against writes, updates, or deletions. | High |
| **FR-10.3** | **Grade Amendment Workflow:** Any post-publication grade amendment requires a formal written petition submitted to the Coordinator, who must execute the change via a dedicated administrative Server Action that logs the old score, new score, justification, and timestamp to `/audit_logs`. | High |
| **FR-10.4** | **Student Grade Appeal Window:** Students have a 7-calendar-day window following publication to lodge a digital grade appeal inquiry through their dashboard. | Medium |

---

## **FR-11: Project Archive & Searchable Repository**

| **ID** | **Requirement** | **Priority** |
| :--- | :--- | :--- |
| **FR-11.1** | Approved and completed projects automatically transition into a permanent, searchable **Project Archive**. | Medium |
| **FR-11.2** | Archive records store project title, abstract, keywords, academic year, course track, GitHub repository link, and final manuscript drive URL. | Medium |
| **FR-11.3** | Junior students can search past project abstracts and keywords to research prior work and prevent topic duplication. | Medium |

---

# **6. Non-Functional Requirements**

| **ID** | **Category** | **Requirement Specification** |
| :--- | :--- | :--- |
| **NFR-01** | **Performance & Latency** | Pre-rendered RSC shells load under 400ms globally via Vercel CDN. Digital marksheets implement optimistic UI updates (<100ms) with background Firestore synchronization under 500ms on standard campus Wi-Fi. |
| **NFR-02** | **Security & Token Integrity** | Firestore Security Rules enforce ownership and JWT Custom Claim validation (roles[], activeRole, registered, profileComplete). Sign-in identity is established via Google OAuth and validated against /rosters (students) or /staff_whitelist (faculty) inside a Firestore transaction in complete-signup.ts. Unregistered accounts are denied all authenticated routes. Server Actions execute adminAuth.verifyIdToken(token) before any privileged mutation. Identity-linkage conflicts are logged to /audit_logs. |
| **NFR-03** | **Scalability** | Cloud Firestore architecture scales seamlessly to accommodate concurrent evaluation scoring across 1,000+ active students and defense examiners during peak defense periods. |
| **NFR-04** | **Data Integrity & Batch Operations** | Batch transactions (50 records per commit) used in student roster onboarding and grade aggregation to ensure atomic commits and prevent partial document writes. |
| **NFR-05** | **Auditability** | Every grade submission, topic state transition, roster import, role switch, and identity conflict is permanently recorded in an immutable, append-only `/audit_logs` collection. |
| **NFR-06** | **Responsive UX** | Accessible UI built with Tailwind CSS and `shadcn/ui`, enabling defense panel examiners to comfortably grade on mobile phones, iPads/tablets, or laptops. |
| **NFR-07** | **Disaster Recovery & Backups** | Cloud Firestore configured with daily automated exports to Google Cloud Storage (GCS) and Point-in-Time Recovery (PITR) enabled for 7-day granular rollbacks. |
| **NFR-08** | **Environment Isolation** | Separate staging and production Firebase environments with a dedicated CSV roster dry-run validation mode before live database insertion. |
| **NFR-09** | **Claim Propagation Delay** | Custom claims propagate within 1 hour (Firebase ID token lifetime). Removal of a user from the roster or deactivation of a staff whitelist entry takes effect within 1 hour or on the user's next token refresh. Coordinators requiring immediate revocation must use the admin 'Force Revoke Session' action, which calls adminAuth.revokeRefreshTokens(uid) and forces the user to re-authenticate and re-pass the roster/whitelist gate. |

---

# **7. Key Workflows**

```mermaid
sequenceDiagram
    autonumber
    actor Sup as Supervisor / Faculty
    actor Leader as Team Leader
    actor Member as Team Member
    actor Coordinator as Department Coordinator
    actor Panel as Defense Panel (Chair + Examiners)

    %% Phase 1: Onboarding
    rect rgb(240, 245, 255)
    Note over Sup,Coordinator: Phase 1: Roster Import, Faculty Whitelist & Sign-In Gating
    Coordinator->>Coordinator: Import student roster CSV (filename-detected course, dry-run)
    Coordinator->>Coordinator: Import commits to /rosters/{year}/students/ (NO Auth users)
    Coordinator->>Coordinator: Add faculty to /staff_whitelist (email, roles, programmes)
    Leader->>Leader: Click "Continue with Google"
    Leader->>Coordinator: complete-signup.ts matches email to roster entry
    Coordinator->>Leader: user_uid linked, custom claims minted, dashboard unlocked
    Sup->>Sup: First sign-in (whitelist gate) → /complete-profile (if new)
    Member->>Leader: Join Team using Invite Code (category-validated)
    end

    %% Phase 2: Topics & Matching
    rect rgb(245, 255, 240)
    Note over Leader,Sup: Phase 2: Topic Selection & Workload Matching
    Leader->>Coordinator: Submit 3 Ranked Topics (Version 1, draft -> submitted)
    Coordinator->>Coordinator: Run Matching Engine (Jaccard Tag Overlap * 0.7 + Capacity * 0.3)
    Coordinator->>Sup: Assign Team to Candidate Supervisor
    Sup-->>Coordinator: Accept Group Assignment
    Sup->>Leader: Approve Topic (Status -> 'approved')
    Note over Leader,Sup: Supervisor consultation hours & office location unlocked
    end

    %% Phase 3: Chapters & Deliverables
    rect rgb(255, 250, 240)
    Note over Leader,Sup: Phase 3: Chapter Milestones & Deliverables
    Leader->>Sup: Submit Chapters 1–5 external Drive URLs sequentially
    Sup->>Leader: Review & mark chapters 'Approved' or 'Revision Needed'
    Leader->>Sup: Submit GitHub Repo URL & Markdown Environment Setup Notes
    Sup->>Sup: Verify Repository & Sign off for Defense
    end

    %% Phase 4: Defense & Scoring
    rect rgb(255, 240, 245)
    Note over Coordinator,Panel: Phase 4: Defense Event & Real-Time Scoring
    Coordinator->>Coordinator: Run Defense Scheduling & Conflict Detection (Venues & Examiners)
    Coordinator->>Panel: Compose Panels (Chair + Examiners) & Publish Schedule
    Leader->>Member: Conduct Oral Defense & Live System Demonstration
    Panel->>Panel: Enter Criteria Scores on Real-Time Digital Marksheet (Firestore onSnapshot)
    Sup->>Sup: Submit Continuous Assessment Score (40%)
    Member->>Member: Submit Confidential Anonymous Peer Evaluation (1-10 Scale)
    end

    %% Phase 5: Broadsheets & Archival
    rect rgb(245, 240, 255)
    Note over Coordinator: Phase 5: Broadsheet Compilation & Archival
    Coordinator->>Coordinator: Aggregate Composite Final Grades
    Coordinator->>Coordinator: Export Official Broadsheet (Excel .xlsx, CSV, Printable PDF)
    Coordinator->>Leader: Publish Grades -> Lock Evaluations Against Edits
    Note over Leader,Coordinator: 7-day Appeal Window Opened -> Project Archived
    end
```

---

# **8. Cloud Firestore Data Schema**

The database schema is structured into 18 top-level collections (plus subcollections) optimized for fast indexing, real-time listeners, and atomic batch updates:

```
firestore-root/
├── users/                         # User accounts & academic profiles
├── rosters/                       # Per-year student rosters (import target)
│   └── {yearId}/students/         # One doc per student, keyed by index number
├── staff_whitelist/               # Pre-approved faculty (keyed by @htu.edu.gh email)
├── courses/                       # Degree & Diploma programs (BTECH-CS, etc.)
├── academic_years/                # Academic calendar sessions & milestone dates
│   └── counters/                  # Group-number sequence per course (server-only)
├── teams/                         # Capstone project groups
│   ├── members/                   # Subcollection of team members
│   └── private/                   # Invite code (team members only)
├── topics/                        # Project topic proposals & review states
│   └── history/                   # Subcollection of past topic revisions
├── supervisions/                  # Supervisor allocations & capacity records
├── chapters/                      # Chapter 1–5 external review links & feedback
├── rubrics/                       # Department grading rubrics & criteria
├── defense_panels/                # Defense examination panels, venues & time slots
├── evaluations/                   # Supervisor & panel member scores
├── peer_evaluations/              # Teammate 360° confidential peer assessments
├── software_deliverables/         # GitHub repositories & environment setup notes
├── supervisor_contacts/           # Gated consultation details (+ /grants/{studentUid})
├── invite_codes/                  # Server-only lookup: code → team_id
├── notifications/                 # In-app notification messages
└── audit_logs/                    # Immutable system audit trail
```

---

### **8.1 Document Interfaces & Specifications**

#### **Collection: `users/{uid}`**
```typescript
interface UserDocument {
  uid: string;
  name: string;
  email: string;
  role: 'student' | 'supervisor' | 'coordinator' | 'admin' | 'panel_member'; // Primary display role
  roles: string[];                  // All authorized roles: e.g. ['supervisor', 'coordinator', 'panel_member']
  active_role: string;              // Current active context: e.g. 'coordinator'
  profile: {
    index_number?: string;          // e.g. "0323809921" (Students)
    staff_id?: string;              // e.g. "SUP-001" (Faculty)
    course_id?: string;             // References /courses/{courseId}
    programmes?: string[];          // Superviseable tracks for faculty (e.g. ["btech-ict", "hnd-ict"])
    registered: boolean;
    profile_complete: boolean;      // false for new faculty, true for students
    // phone, office_location, consultation_hours live in supervisor_contacts/{uid} (gated, see F-03)
    research_interests?: string[];  // e.g. ["ai/ml", "cybersecurity", "cloud"]
    max_team_capacity?: number;     // e.g. 5 teams
    current_team_count?: number;    // Active assigned teams count
  };
  created_at: FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.Timestamp;
}
```

#### **Collection: `supervisor_contacts/{supervisorId}` (+ `grants/{studentId}`)**
```typescript
interface SupervisorContactDocument {
  supervisor_id: string;            // doc id = supervisor uid
  phone?: string;
  office_location: string;
  consultation_hours: string;
  updated_at: FirebaseFirestore.Timestamp;
}

// supervisor_contacts/{supervisorId}/grants/{studentId}: existence = student may read the contact doc
interface SupervisorContactGrant {
  student_id: string;               // doc id = student uid
  team_id: string;
  granted_at: FirebaseFirestore.Timestamp;
}

// invite_codes/{code}: server-only lookup, created with tx.create so codes are unique
interface InviteCodeDocument {
  code: string;                     // 6-character uppercase alphanumeric (e.g. "K9X2P4"), excludes 0 O 1 I
  team_id: string;
  created_at: FirebaseFirestore.Timestamp;
}

// teams/{teamId}/private/invite: display copy for team members and coordinators
interface TeamInviteDocument {
  code: string;
}

// academic_years/{yearId}/counters/{courseId}: server-only, incremented inside the team-creation transaction
interface CounterDocument {
  next_sequence: number;
}
```

#### **Collection: `rosters/{yearId}/students/{indexNumber}`**
```typescript
interface RosterStudentDocument {
  index_number: string;             // 10 digits: e.g. "0323080281"
  full_name: string;
  contact: string;                  // phone number from CSV (D-04); roster-only, exported in the broadsheet CSV
  email: string;                    // derived: `${index_number}@htu.edu.gh`
  course_id: string;                // "btech-ict" | "btech-cs" | "hnd-ict" | "hnd-cs"
  imported_by_uid: string;
  imported_at: FirebaseFirestore.Timestamp;
  import_batch_id: string;          // groups rows from a single CSV upload
  user_uid: string | null;          // write-once, set on first successful signup
  signup_completed_at: FirebaseFirestore.Timestamp | null;
  is_active: boolean;               // D-06: default true; false = deactivated (a missing value counts as true)
  updated_at?: FirebaseFirestore.Timestamp;
  updated_by?: string;              // uid of the coordinator/admin who last edited the record
  deactivated_at?: FirebaseFirestore.Timestamp;
  deactivated_by?: string;
  deactivation_reason?: string;
}
```

#### **Collection: `staff_whitelist/{email}`**
```typescript
interface StaffWhitelistDocument {
  email: string;                    // doc ID, e.g. "kklu@htu.edu.gh"
  full_name: string;
  roles: string[];                  // e.g. ["supervisor"] or ["supervisor", "coordinator"]
  department: string;               // e.g. "Computer Science"
  programmes: string[];             // e.g. ["btech-ict", "hnd-ict"] — superviseable tracks
  phone?: string;
  is_active: boolean;
  added_by_uid: string;
  added_at: FirebaseFirestore.Timestamp;
  user_uid: string | null;          // linked after first sign-in
  last_signin_at?: FirebaseFirestore.Timestamp;
}
```

#### **Collection: `courses/{courseId}`**
```typescript
interface CourseDocument {
  id: string;                       // e.g. "btech-cs"
  code: string;                     // e.g. "BTECH-CS", "BTECH-ICT", "HND-CS", "HND-ICT"
  name: string;                     // e.g. "BTech Computer Science"
  department: string;               // e.g. "Computer Science"
}
```

#### **Collection: `academic_years/{yearId}`**
```typescript
interface AcademicYearDocument {
  id: string;                       // e.g. "2025-2026"
  code: string;                     // e.g. "2025/2026"
  semester: 1 | 2;
  is_active: boolean;
  deadlines: {
    roster_import_deadline: FirebaseFirestore.Timestamp;
    team_formation_deadline: FirebaseFirestore.Timestamp;
    topic_submission_deadline: FirebaseFirestore.Timestamp;
    chapters_deadline: FirebaseFirestore.Timestamp;
    defense_start_date: FirebaseFirestore.Timestamp;
    defense_end_date: FirebaseFirestore.Timestamp;
    grade_appeal_deadline?: FirebaseFirestore.Timestamp;
  };
  grades_published: boolean;
  created_at: FirebaseFirestore.Timestamp;
}
```

#### **Collection: `teams/{teamId}`**
```typescript
interface TeamDocument {
  id: string;
  name: string;
  group_number: string;             // Formatted: "{CourseCode}{YY}_{Sequence}" -> "BICT26_01"
  // invite code is NOT stored on this document (F-06): see invite_codes/{code} and teams/{teamId}/private/invite
  course_id: string;                // MUST match every member's profile.course_id
  academic_year_id: string;
  leader_id: string;                // References users/{uid}
  member_ids: string[];             // Array of student UIDs for indexing
  member_count: number;
  max_members: number;              // Standard: 5
  status: 'formation' | 'topic_pending' | 'topic_approved' | 'defense_ready' | 'completed' | 'disbanded';
  assigned_supervisor_id?: string;
  approved_topic_id?: string;
  scores_summary?: {
    supervisor_score: number;       // Weighted 40%
    panel_average_score: number;    // Weighted 60%
    composite_final_score: number;  // 0 - 100
    grade_classification?: string;  // DEFERRED (D-02): no thresholds defined yet; leave unset. Final mark is per team.
    is_locked: boolean;
  };
  created_at: FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.Timestamp;
}
```

#### **Collection: `topics/{topicId}`**
```typescript
interface TopicDocument {
  id: string;
  team_id: string;
  title: string;
  abstract: string;
  problem_statement: string;
  proposed_solution: string;
  tech_stack: string[];             // e.g. ["next.js", "firebase", "typescript"]
  preference_rank: 1 | 2 | 3;
  version: number;                  // Incremented on resubmission
  is_current: boolean;              // True for the active proposal revision
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'revision_requested';
  reviewed_by_user_id?: string;
  review_notes?: string;
  submitted_at: FirebaseFirestore.Timestamp;
  reviewed_at?: FirebaseFirestore.Timestamp;
}
```

#### **Collection: `supervisions/{supervisionId}`**
```typescript
interface SupervisionDocument {
  id: string;
  supervisor_id: string;           // References users/{uid}
  academic_year_id: string;
  max_capacity: number;             // Default 5
  current_assigned_count: number;
  assigned_team_ids: string[];
  status: 'available' | 'at_capacity';
  updated_at: FirebaseFirestore.Timestamp;
}
```

#### **Collection: `chapters/{chapterId}`**
```typescript
interface ChapterFeedback {
  id: string;
  author_id: string;
  content: string;
  created_at: FirebaseFirestore.Timestamp;
}

interface ChapterDocument {
  id: string;
  team_id: string;
  chapter_number: 1 | 2 | 3 | 4 | 5;
  title: string;                    // e.g. "Chapter 1: Introduction"
  document_url: string;             // External Google Drive / OneDrive link
  version: number;
  status: 'pending' | 'approved' | 'revision_needed';
  feedback: ChapterFeedback[];
  submitted_at: FirebaseFirestore.Timestamp;
  reviewed_at?: FirebaseFirestore.Timestamp;
}
```

#### **Collection: `defense_panels/{panelId}`**
```typescript
interface DefenseTimeSlot {
  slot_id: string;
  team_id: string;
  start_time: FirebaseFirestore.Timestamp;
  end_time: FirebaseFirestore.Timestamp;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
}

interface DefensePanelDocument {
  id: string;
  academic_year_id: string;
  course_id: string;
  panel_name: string;               // e.g. "Panel A - Software Systems"
  venue: string;                    // e.g. "CS Lab 2" or "Virtual - Google Meet"
  is_virtual: boolean;
  virtual_meeting_url?: string;
  chair_id: string;                 // References users/{uid} (Panel Chair)
  examiner_ids: string[];           // Array of faculty UIDs
  time_slots: DefenseTimeSlot[];
  created_at: FirebaseFirestore.Timestamp;
}
```

#### **Collection: `rubrics/{rubricId}`**
```typescript
interface RubricCriterion {
  id: string;
  title: string;
  description: string;
  max_points: number;
  category: 'oral_defense' | 'system_demo' | 'technical_architecture';
}

interface RubricDocument {
  id: string;
  title: string;
  max_score: number;
  supervisor_weight_pct: number;    // e.g. 40
  panel_weight_pct: number;         // e.g. 60
  is_active: boolean;
  criteria: RubricCriterion[];
  created_at: FirebaseFirestore.Timestamp;
}
```

#### **Collection: `evaluations/{evaluationId}`**
```typescript
interface EvaluationDocument {
  id: string;
  team_id: string;
  student_id?: string | null;       // Reserved for future individual scoring. v1 (D-02): always null/omitted
  evaluator_id: string;             // References users/{uid}
  evaluator_role: 'supervisor' | 'panel_chair' | 'panel_member';
  rubric_id: string;
  scores: {
    [criterionId: string]: number;  // Line-item scores
  };
  total_score: number;
  comments: string;
  is_published: boolean;            // Locked when true
  created_at: FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.Timestamp;
}
```

#### **Collection: `peer_evaluations/{peerEvalId}`**
```typescript
interface PeerEvaluationDocument {
  id: string;
  team_id: string;
  evaluator_id: string;             // Student UID submitting rating (confidential)
  evaluatee_id: string;             // Teammate UID being rated
  punctuality_score: number;        // 1 to 10
  technical_contribution_score: number;
  teamwork_score: number;
  average_score: number;            // Computed average (1.0 to 10.0)
  comments: string;
  submitted_at: FirebaseFirestore.Timestamp;
}
```

#### **Collection: `software_deliverables/{teamId}`**
```typescript
interface SoftwareDeliverableDocument {
  team_id: string;
  github_repository_url: string;
  live_demo_url?: string;
  google_drive_url?: string;
  environment_setup_notes: string;  // Markdown setup instructions & credentials
  submitted_by_user_id: string;
  approved_by_supervisor_at?: FirebaseFirestore.Timestamp;
  supervisor_signoff_notes?: string;
  submitted_at: FirebaseFirestore.Timestamp;
}
```

#### **Collection: `notifications/{notificationId}`**
```typescript
interface NotificationDocument {
  id: string;
  user_id: string;                  // Recipient UID
  title: string;
  body: string;
  type: 'topic_status' | 'chapter_review' | 'defense_schedule' | 'grade_published';
  target_url?: string;
  is_read: boolean;
  created_at: FirebaseFirestore.Timestamp;
}
```

#### **Collection: `audit_logs/{logId}`**
```typescript
interface AuditLogDocument {
  id: string;
  actor_id: string;
  actor_name: string;
  actor_email: string;
  actor_role: string;
  action: 
    | 'roster.imported'
    | 'staff.whitelist_added'
    | 'staff.whitelist_deactivated'
    | 'student.signup_completed'
    | 'faculty.signup_completed'
    | 'identity_conflict'
    | 'profile.completed'
    | 'user.role_switched'
    | 'topic.approved' 
    | 'topic.revision_requested'
    | 'grade.submitted' 
    | 'grade.amended'
    | 'team.created'
    | 'defense.scheduled';
  target_type: string;
  target_id: string;
  description: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  timestamp: FirebaseFirestore.Timestamp;
}
```

---

# **9. Declarative Firestore Security Rules**

*Revised in v5.2 (see §13, findings F-01 to F-14 and F-17). Server Actions use the Admin SDK and bypass these rules, so collections that carry state-machine or integrity logic deny client writes here as defense in depth.*

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ==========================================
    // Helper Functions
    // ==========================================
    function isSignedIn() {
      return request.auth != null;
    }

    // Any Google account can obtain a Firebase Auth token, so "signed in" is NOT enough.
    // isMember() = registered via roster/whitelist AND an @htu.edu.gh verified email.
    function isMember() {
      return isSignedIn()
        && request.auth.token.registered == true
        && request.auth.token.email_verified == true
        && request.auth.token.email.matches('.*@htu\\.edu\\.gh');
    }

    function isOwner(uid) {
      return isMember() && request.auth.uid == uid;
    }

    function hasActiveRole(role) {
      return isMember() && request.auth.token.activeRole == role;
    }

    function hasAnyRole(rolesList) {
      return isMember() && (
        request.auth.token.activeRole in rolesList ||
        request.auth.token.roles.hasAny(rolesList)
      );
    }

    function teamData(teamId) {
      return get(/databases/$(database)/documents/teams/$(teamId)).data;
    }

    function isTeamMember(teamId) {
      return isMember() && request.auth.uid in teamData(teamId).member_ids;
    }

    function isAssignedSupervisor(teamId) {
      return isMember() && request.auth.uid == teamData(teamId).assigned_supervisor_id;
    }

    // Principle: collections that carry state-machine or integrity logic are written ONLY
    // by Server Actions (Admin SDK bypasses rules). Rules deny the matching client writes
    // as defense in depth. Client writes remain only where live UX requires them
    // (evaluations, peer_evaluations, notifications read-flag, defense_panels, rubrics, courses).

    // ==========================================
    // 0. Rosters, Staff Whitelist, Invite Codes (server-managed)
    // ==========================================
    match /rosters/{yearId}/students/{indexNumber} {
      allow read: if isMember() && (
        resource.data.user_uid == request.auth.uid ||
        hasAnyRole(['coordinator', 'admin'])
      );
      allow create, update, delete: if false;   // import-rosters.ts / manage-student.ts / change-student-course.ts / complete-signup.ts only
      allow create, update, delete: if false;   // manage-student.ts          # Server Action: student create/update/deactivate/reactivate/delete (coordinator/admin only)
      allow create, update, delete: if false;   // change-student-course.ts   # Server Action: audited programme change (coordinator/admin only)
    }

    match /staff_whitelist/{email} {
      allow read: if hasAnyRole(['coordinator', 'admin']);
      allow create, update, delete: if false;   // manage-staff-whitelist.ts only
    }

    match /invite_codes/{code} {
      allow read, write: if false;              // server-only lookup: code -> team_id
    }

    // ==========================================
    // 1. Users (profile edits go through update-profile.ts)
    // ==========================================
    match /users/{userId} {
      allow read: if isMember();
      allow create, update, delete: if false;
    }

    // Gated consultation details. A student can read only after a server-written grant exists.
    match /supervisor_contacts/{supervisorId} {
      allow read: if isOwner(supervisorId)
        || hasAnyRole(['coordinator', 'admin'])
        || (isMember() && exists(/databases/$(database)/documents/supervisor_contacts/$(supervisorId)/grants/$(request.auth.uid)));
      allow write: if false;

      match /grants/{studentId} {
        allow read: if isOwner(studentId) || isOwner(supervisorId) || hasAnyRole(['coordinator', 'admin']);
        allow write: if false;
      }
    }

    // ==========================================
    // 2. Courses & Academic Years
    // ==========================================
    match /courses/{courseId} {
      allow read: if isMember();
      allow write: if hasAnyRole(['coordinator', 'admin']);
    }

    match /academic_years/{yearId} {
      allow read: if isMember();
      allow create: if hasAnyRole(['coordinator', 'admin']) && request.resource.data.grades_published == false;
      // grades_published may only be flipped by publish-grades.ts (Admin SDK)
      allow update: if hasAnyRole(['coordinator', 'admin'])
        && request.resource.data.grades_published == resource.data.grades_published;
      allow delete: if false;

      match /counters/{counterId} {
        allow read, write: if false;            // group-number sequence, server-only
      }
    }

    // ==========================================
    // 3. Teams (create/join/assign/score via Server Actions)
    // ==========================================
    match /teams/{teamId} {
      allow read: if isMember();
      allow create, delete: if false;
      // Leader may rename the team only.
      allow update: if isMember()
        && resource.data.leader_id == request.auth.uid
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['name', 'updated_at']);

      match /members/{memberId} {
        allow read: if isMember();
        allow write: if false;
      }

      // Holds the invite code. Visible only to the team and coordinators.
      match /private/{docId} {
        allow read: if isTeamMember(teamId) || hasAnyRole(['coordinator', 'admin']);
        allow write: if false;
      }
    }

    // ==========================================
    // 4. Topics (state machine enforced in Server Actions)
    // ==========================================
    match /topics/{topicId} {
      allow read: if isMember();
      allow write: if false;

      match /history/{historyId} {
        allow read: if isMember();
        allow write: if false;
      }
    }

    // ==========================================
    // 5. Supervisions
    // ==========================================
    match /supervisions/{supervisionId} {
      allow read: if isMember();
      allow write: if false;
    }

    // ==========================================
    // 6. Chapters (sequential rule + versioning in Server Actions)
    // ==========================================
    match /chapters/{chapterId} {
      allow read: if isMember();
      allow write: if false;
    }

    // ==========================================
    // 7. Defense Panels
    // ==========================================
    match /defense_panels/{panelId} {
      allow read: if isMember();
      allow write: if hasAnyRole(['coordinator', 'admin']);
    }

    // ==========================================
    // 8. Rubrics
    // ==========================================
    match /rubrics/{rubricId} {
      allow read: if isMember();
      allow write: if hasAnyRole(['coordinator', 'admin']);
    }

    // ==========================================
    // 9. Evaluations (live marksheet; team-level scoring only in v1)
    // ==========================================
    match /evaluations/{evalId} {
      // Evaluators and staff always; students only after publication, for their own team.
      allow read: if isMember() && (
        resource.data.evaluator_id == request.auth.uid ||
        hasAnyRole(['supervisor', 'panel_member', 'coordinator', 'admin']) ||
        (resource.data.is_published == true && isTeamMember(resource.data.team_id))
      );

      // Deterministic id enforces one document per evaluator per team: {teamId}__{evaluatorId}__team
      allow create: if hasAnyRole(['supervisor', 'panel_member', 'coordinator', 'admin'])
        && request.resource.data.evaluator_id == request.auth.uid
        && request.resource.data.is_published == false
        && (!('student_id' in request.resource.data) || request.resource.data.student_id == null)
        && evalId == request.resource.data.team_id + '__' + request.auth.uid + '__team';

      // Evaluators edit their own unpublished sheet; they can never publish it themselves.
      allow update: if isMember()
        && resource.data.is_published == false
        && resource.data.evaluator_id == request.auth.uid
        && request.resource.data.is_published == false
        && request.resource.data.evaluator_id == resource.data.evaluator_id
        && request.resource.data.team_id == resource.data.team_id;

      allow delete: if hasAnyRole(['admin']) && resource.data.is_published == false;
      // Publishing and post-publication amendments: Admin SDK only (publish-grades.ts, amend-grade.ts).
    }

    // ==========================================
    // 10. Peer Evaluations (strict anonymity, immutable)
    // ==========================================
    match /peer_evaluations/{peerEvalId} {
      allow read: if isMember() && (
        resource.data.evaluator_id == request.auth.uid ||
        hasAnyRole(['supervisor', 'coordinator', 'admin'])
      );

      // id = {teamId}__{evaluatorId}__{evaluateeId}: one rating per pair; no self-rating; 1-10 scale
      allow create: if isMember()
        && request.resource.data.evaluator_id == request.auth.uid
        && isTeamMember(request.resource.data.team_id)
        && request.resource.data.evaluatee_id != request.auth.uid
        && request.resource.data.evaluatee_id in teamData(request.resource.data.team_id).member_ids
        && peerEvalId == request.resource.data.team_id + '__' + request.auth.uid + '__' + request.resource.data.evaluatee_id
        && request.resource.data.punctuality_score >= 1 && request.resource.data.punctuality_score <= 10
        && request.resource.data.technical_contribution_score >= 1 && request.resource.data.technical_contribution_score <= 10
        && request.resource.data.teamwork_score >= 1 && request.resource.data.teamwork_score <= 10;

      allow update, delete: if false;
    }

    // ==========================================
    // 11. Software Deliverables (doc id = teamId)
    // ==========================================
    match /software_deliverables/{teamId} {
      allow read: if isMember();

      allow create: if isTeamMember(teamId)
        && !('approved_by_supervisor_at' in request.resource.data);

      allow update: if isMember() && (
        // Team edits links/notes but cannot touch sign-off fields
        (isTeamMember(teamId)
          && !request.resource.data.diff(resource.data).affectedKeys()
               .hasAny(['approved_by_supervisor_at', 'supervisor_signoff_notes']))
        // Assigned supervisor can only sign off
        || (isAssignedSupervisor(teamId)
          && request.resource.data.diff(resource.data).affectedKeys()
               .hasOnly(['approved_by_supervisor_at', 'supervisor_signoff_notes']))
        || hasAnyRole(['coordinator', 'admin'])
      );

      allow delete: if hasAnyRole(['coordinator', 'admin']);
    }

    // ==========================================
    // 12. Notifications (written by Server Actions only)
    // ==========================================
    match /notifications/{notifId} {
      allow read: if isMember() && resource.data.user_id == request.auth.uid;
      allow update: if isMember() && resource.data.user_id == request.auth.uid
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['is_read']);
      allow create: if false;
      allow delete: if isMember() && resource.data.user_id == request.auth.uid;
    }

    // ==========================================
    // 13. Audit Logs (immutable, append-only via Admin SDK)
    // ==========================================
    match /audit_logs/{logId} {
      allow read: if hasAnyRole(['coordinator', 'admin']);
      allow create, update, delete: if false;
    }
  }
}
```

---

# **10. Mandatory Composite Query Indexes (`firestore.indexes.json`)**

```json
{
  "indexes": [
    {
      "collectionGroup": "teams",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "academic_year_id", "order": "ASCENDING" },
        { "fieldPath": "course_id", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "topics",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "team_id", "order": "ASCENDING" },
        { "fieldPath": "preference_rank", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "topics",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "team_id", "order": "ASCENDING" },
        { "fieldPath": "is_current", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "evaluations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "team_id", "order": "ASCENDING" },
        { "fieldPath": "evaluator_role", "order": "ASCENDING" },
        { "fieldPath": "created_at", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "chapters",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "team_id", "order": "ASCENDING" },
        { "fieldPath": "chapter_number", "order": "ASCENDING" },
        { "fieldPath": "version", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "defense_panels",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "academic_year_id", "order": "ASCENDING" },
        { "fieldPath": "examiner_ids", "arrayConfig": "CONTAINS" }
      ]
    },
    {
      "collectionGroup": "audit_logs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "actor_id", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "peer_evaluations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "team_id", "order": "ASCENDING" },
        { "fieldPath": "evaluatee_id", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

---

# **11. Project Directory Architecture (Next.js 15 App Router)**

```
├── src/
│   ├── app/
│   │   ├── layout.tsx                     # Global Root Layout & Auth Provider
│   │   ├── page.tsx                       # Overview / Dashboard Landing
│   │   ├── login/
│   │   │   └── page.tsx                   # Institutional Google Sign-In Screen
│   │   ├── not-registered/
│   │   │   └── page.tsx                   # Unclosable gate for unregistered users
│   │   ├── complete-profile/
│   │   │   └── page.tsx                   # Faculty profile completion (post-signup)
│   │   ├── my-team/
│   │   │   └── page.tsx                   # Team Formation & Invite Codes
│   │   ├── proposals/
│   │   │   └── page.tsx                   # Topic Proposals & Versioning State Machine
│   │   ├── supervision/
│   │   │   └── page.tsx                   # Supervisor Onboarding & Workload Matching
│   │   ├── chapters/
│   │   │   └── page.tsx                   # Chapter 1–5 Sequential Document Reviews
│   │   ├── defense/
│   │   │   ├── page.tsx                   # Defense Panel Schedule Overview & Conflict Alerts
│   │   │   └── [panelId]/
│   │   │       └── page.tsx               # Real-Time Digital Marksheet (Live Listeners)
│   │   ├── rubrics/
│   │   │   └── page.tsx                   # Rubric Builder & Weightings
│   │   ├── reports/
│   │   │   └── page.tsx                   # Broadsheet Exporters (XLSX, CSV, Printable PDF)
│   │   ├── students/
│   │   │   └── page.tsx                   # Roster import + unassigned pool (coordinator/admin only)
│   │   ├── peer-evaluation/
│   │   │   └── page.tsx                   # Confidential 360° peer ratings (FR-06.4)
│   │   ├── deliverables/
│   │   │   └── page.tsx                   # Repo/demo links, setup notes, supervisor sign-off (FR-08)
│   │   ├── grades/
│   │   │   └── page.tsx                   # Published team grade + appeal window (FR-10.4)
│   │   ├── archive/
│   │   │   └── page.tsx                   # Searchable project archive (FR-11)
│   │   ├── notifications/
│   │   │   └── page.tsx                   # Notification center (FR-09.1)
│   │   ├── api/
│   │   │   └── session/
│   │   │       └── route.ts               # Stores/refreshes httpOnly __session ID-token cookie (F-11)
│   │   ├── admin/
│   │   │   ├── staff-whitelist/
│   │   │   │   └── page.tsx               # Coordinator/admin staff whitelist CRUD
│   │   │   └── users/
│   │   │       └── page.tsx               # Admin: roles, force-revoke session, overrides
│   │   ├── audit-logs/
│   │   │   └── page.tsx                   # Security Audit Trail Viewer
│   │   └── actions/
│   │       ├── complete-signup.ts         # Server Action: Google sign-in → roster/whitelist linkage
│   │       ├── import-rosters.ts          # Server Action: CSV → /rosters batch write (coordinator/admin only)
│   │       ├── manage-staff-whitelist.ts  # Server Action: Add/edit/deactivate staff
│   │       ├── switch-role.ts             # Server Action: Active Role Context Claim Switching
│   │       ├── update-profile.ts          # Server Action: Faculty/student profile edits (field allow-list)
│   │       ├── create-team.ts             # Server Action: Team + invite code + group number (transaction)
│   │       ├── join-team.ts               # Server Action: Join by code, category check (transaction)
│   │       ├── submit-topic.ts            # Server Action: Topic create/resubmit, versioning
│   │       ├── review-topic.ts            # Server Action: Supervisor review transitions
│   │       ├── submit-chapter.ts          # Server Action: Sequential chapter link submission
│   │       ├── review-chapter.ts          # Server Action: Chapter status + feedback
│   │       ├── publish-grades.ts          # Server Action: Publish + lock evaluations
│   │       ├── amend-grade.ts             # Server Action: Audit-logged post-publication amendment
│   │       ├── matching-engine.ts         # Server Action: Bounded Jaccard Supervisor Matching
│   │       ├── aggregate-defense.ts       # Server Action: Defense Score Compilation & Locking
│   │       └── generate-broadsheet.ts     # Server Action: Broadsheet Compilation (Node.js runtime)
│   ├── components/
│   │   ├── auth/
│   │   │   ├── GoogleSignInButton.tsx     # Wraps signInWithPopup
│   │   │   ├── NotRegisteredScreen.tsx    # Reusable error screen component
│   │   │   └── CompleteProfileForm.tsx    # Faculty profile form
│   │   ├── navbar/
│   │   │   └── RoleSwitcherDropdown.tsx   # Active Role Switching Dropdown
│   │   ├── students/
│   │   │   └── RosterImportModal.tsx      # New import UI (filename detection, dry-run)
│   │   ├── defense/
│   │   │   ├── DigitalMarksheet.tsx       # Live Real-Time Examiner Scoring Form
│   │   │   └── ConflictAlertBadge.tsx     # Double-Booking & Overlap Visual Warning
│   │   └── ui/                            # Shadcn UI primitives (Button, Dialog, Card, etc.)
│   ├── context/
│   │   └── AuthContext.tsx                # Firebase Auth & Custom Claims Provider
│   ├── lib/
│   │   ├── firebase/
│   │   │   ├── client.ts                  # Firebase Client SDK Singleton (Browser listeners)
│   │   │   └── admin.ts                   # Firebase Admin SDK Singleton on globalThis (Node.js)
│   │   ├── auth/
│   │   │   └── verify-token-edge.ts       # jose verification of Firebase ID token (Edge-safe)
│   │   ├── export/
│   │   │   ├── excel.ts                   # ExcelJS Broadsheet Formatter with Formulas
│   │   │   └── pdf.ts                     # React-PDF Document Generator with Signature Lines
│   │   └── matching/
│   │       └── jaccard.ts                 # Pure Math: Tag overlap and capacity calculation
│   ├── types/
│   │   └── firestore.ts                   # Strongly-typed Firestore Interfaces
│   └── middleware.ts                      # Edge Role-Based Route Guards
├── firestore.rules                        # Declarative Security Rules
├── firestore.indexes.json                 # Composite Query Indexes
├── tailwind.config.ts                     # Design Tokens & Palette
├── tsconfig.json                          # TypeScript Strict Settings
└── package.json                           # Dependencies & Scripts
```

### **11.1 Middleware Guard Logic (`middleware.ts`)**
```typescript
// middleware.ts (Edge Runtime — NO Firestore reads, NO firebase-admin)
// Token source: httpOnly `__session` cookie written by /api/session. Signature verified with `jose`
// against Google's securetoken JWKS (iss https://securetoken.google.com/<projectId>, aud <projectId>).
// Middleware is a UX guard only; Firestore rules and Server Actions are the enforcement layer.
// Gate sequence:
//   1. No token                → redirect /login
//   2. token.registered false  → redirect /not-registered
//   3. token.profileComplete false AND token.activeRole != 'student'
//                              → redirect /complete-profile
//   4. Otherwise: pass through; role-scoped pages handle their own checks
//
// The three claim reads are edge-safe (JWT only). Roster/whitelist lookups 
// happen in complete-signup.ts Server Action (Node runtime), not in middleware.
```

---

# **12. Quality Assurance & Testing Strategy**

To guarantee institutional reliability and satisfy external reviewers, the platform mandates three tiers of testing:

### **12.1 Unit & Schema Validation (Vitest + Zod)**
- **Schema Validation:** Unit tests for all Zod schemas verifying CSV row parsing, 10-digit index format validation regex (`^[0-9]{10}$`), and deterministic email derivation.
- **Index-Number Regex and Email Derivation:** 10-digit enforcement, rejection of 9-digit and mixed-character indices, correct email construction.
- **Mathematical Formulations:** Unit tests for the Supervisor Matching Engine verifying:
  - Exact Jaccard similarity output with empty sets, disjoint sets, and identical tag sets.
  - Correct clamping to $0.0$ when $C_{\text{curr}} \ge C_{\text{max}}$.
  - Proper handling of $C_{\text{max}} = 0$ edge case without division-by-zero errors.

### **12.2 Integration Testing with Firebase Local Emulator Suite**
- Local testing using `@firebase/rules-unit-testing` against the Firestore and Auth emulators:
  - Unregistered student (Google account not in roster) is redirected to `/not-registered` and cannot access any authenticated route.
  - Index number already linked to a different Firebase uid returns 409 and writes an `identity_conflict` audit log.
  - Faculty not in `staff_whitelist` is redirected to `/not-registered`; deactivated (`is_active: false`) faculty is rejected on next sign-in.
  - A roster entry's `user_uid` is write-once: a second sign-in by the same Google account is idempotent; a sign-in by a different account is rejected.
  - Category integrity: a BTECH-ICT student attempting to join a BTECH-CS team is rejected with 409; a BTECH-CS team's `group_number` prefix is BCS.
  - Cross-programme supervisor is not shown as a matching candidate for a team whose `course_id` is not in the supervisor's `programmes[]`.
  - Verify that unauthorized students cannot write to `/teams` or edit topics belonging to other groups.
  - Verify that raw `/peer_evaluations` cannot be read by evaluated teammates.
  - Verify that `/evaluations` reject writes once `is_published: true`, and that an evaluator cannot set `is_published` themselves.
  - A signed-in Google account with `registered: false` (e.g. `@gmail.com`) is denied every read (F-01).
  - A student cannot read `supervisor_contacts/{id}` until a grant exists, and cannot change their own `profile.course_id` (F-02, F-03).
  - A student cannot read another team's invite code, and `invite_codes` is unreadable from clients (F-06).
  - Students cannot read `/evaluations` before `is_published`; peer ratings reject self-rating, non-teammates, duplicates and scores outside 1 to 10 (F-04, F-09).
  - Roster CSV rows missing or with an invalid `contact` are rejected with a per-row error (D-04).
  - A supervisor calling `import-rosters` or `manage-staff-whitelist` receives 403; the roster import controls, `/students` and the staff whitelist page are hidden from supervisors (D-05).
  - A supervisor, panel member or student calling `manage-student` or `change-student-course` receives 403; the Add student button and row actions are hidden from them (D-06).
  - `deleteStudent` is refused (409) for a linked student or one on an active team; `deactivateStudent` is refused for a student on an active team; `change-student-course` needs a justification and no active team; an inactive roster entry cannot complete signup (D-06).

### **12.3 End-to-End System Testing (Playwright)**
- **Authentication & Onboarding Flow:**
  - Google OAuth (mocked in test via Firebase Auth emulator's custom-token path) $\rightarrow$ `complete-signup.ts` $\rightarrow$ dashboard for a valid roster student.
  - Google OAuth with an email not in any roster $\rightarrow$ `/not-registered` page $\rightarrow$ sign-out, no route access.
  - Faculty sign-in with whitelist entry $\rightarrow$ `/complete-profile` $\rightarrow$ after submit, dashboard with supervisor-scoped nav.
  - Role-switch from supervisor $\rightarrow$ coordinator (multi-role faculty) refreshes token and enables coordinator routes.
- **Real-Time Digital Marksheet Sync:** Multi-browser session testing: 3 simultaneous examiner windows inputting criterion marks while the coordinator dashboard verifies live score streaming and aggregate calculation.
- **Category Integrity:** Automated test confirming that joining a group with an mismatched `course_id` triggers a 409 conflict and prevents group membership mutation.


---

# **13. Specification Review Findings & Resolutions (v5.2)**

A security and consistency review of v5.1 found the issues below. Each one has been **resolved in the body of this document** (location in the last column). Treat this table as the audit trail; the body is the source of truth.

| **ID** | **Severity** | **Problem in v5.1** | **Resolution in v5.2** | **Applied in** |
| :--- | :--- | :--- | :--- | :--- |
| **F-01** | Critical | Rules gated reads on `isSignedIn()`. Any Google account (e.g. `@gmail.com`) receives a Firebase Auth token on sign-in, even if `complete-signup.ts` later rejects it, so unregistered users could read `users`, `teams`, `topics` and more directly via the client SDK. | New `isMember()` helper: requires `registered == true`, `email_verified == true` and an `@htu.edu.gh` email. Used by every rule. | §9 |
| **F-02** | High | `users/{uid}` was owner-writable, so a student could change `profile.course_id` (breaking FR-01.10 category integrity and the team-create rule) or other profile fields. | All client writes to `users` denied. Profile edits go through `update-profile.ts` (Admin SDK) with a field allow-list. | §9, §11 |
| **F-03** | High | `users` was readable by every signed-in user, so `office_location`, `consultation_hours` and phone numbers were not actually gated (FR-04.4). | Gated details moved to `supervisor_contacts/{uid}`. Students read it only if `supervisor_contacts/{uid}/grants/{studentUid}` exists; grants are written by Server Actions when a topic is approved and when a member joins an approved team, and removed on removal or disband. | §8, §9 |
| **F-04** | High | `evaluations` readable by all signed-in users, so students could read scores before publication. | Reads limited to the evaluator and staff; team members only after `is_published == true`. | §9 |
| **F-05** | High | Teams: client-side create bypassed the transactional category check (FR-02.4a); leaders and assigned supervisors could edit any field (`scores_summary`, `assigned_supervisor_id`, `member_ids`). | Create, delete and membership changes are Server Action only. Leader may rename the team only. | §9 |
| **F-06** | High | `invite_code` lived on a team document readable by everyone, so any student could read any code and join any team. | Code stored in server-only `invite_codes/{code}` (lookup and uniqueness) and `teams/{id}/private/invite` (readable by team members and coordinators). | §8, §9 |
| **F-07** | High | Chapters and topics: team members could write `status` directly (e.g. set `approved`); supervisors could write any field; sequential-chapter and versioning rules were unenforceable in rules. | Client writes to `topics`, `chapters`, `supervisions` denied. State machine, versioning and sequencing live in Server Actions. | §9 |
| **F-08** | Medium | An evaluator could set `is_published: true` on their own evaluation; evaluation ids were free-form, allowing duplicate sheets per evaluator. | Evaluators cannot change `is_published`. Deterministic id `{teamId}__{evaluatorId}__team` enforced on create. Publishing and amendments are Admin SDK only. | §9 |
| **F-09** | Medium | `peer_evaluations` create did not check that the evaluatee is a teammate, allowed self-rating and duplicate ratings, and did not enforce the 1 to 10 range. | All four enforced in the create rule; id `{teamId}__{evaluatorId}__{evaluateeId}`. | §9 |
| **F-10** | Medium | `rosters` and `staff_whitelist` were client-writable by coordinators, so `user_uid` (documented as write-once) could be forged; `staff_whitelist` was readable by all users (emails and phones). | Both are Admin SDK only. `staff_whitelist` readable by coordinator and admin. | §9 |
| **F-11** | Medium | `middleware.ts` runs on the Edge, where `firebase-admin` is unavailable, and the spec did not say how the token reaches middleware or how its signature is verified. | ID token stored in an httpOnly `__session` cookie by `/api/session`; middleware verifies the signature with `jose` against Google's securetoken JWKS (issuer `https://securetoken.google.com/<projectId>`, audience `<projectId>`). Middleware remains a UX guard only; rules and Server Actions enforce. | §11, §11.1 |
| **F-12** | Medium | `software_deliverables`: any supervisor could sign off any team, and team members could self sign-off. | Team members cannot touch sign-off fields; only the assigned supervisor can write them. | §9 |
| **F-13** | Medium | `academic_years.grades_published` could be flipped from the client by a coordinator, bypassing locking and audit. | Rule forbids changing it from the client; `publish-grades.ts` (Admin SDK) is the only writer. | §9 |
| **F-14** | Medium | Group-number sequence (`BICT26_01`) had no concurrency-safe counter, so simultaneous team creation could duplicate numbers. | Counter doc `academic_years/{yearId}/counters/{courseId}` incremented in the team-creation transaction. | §8, §9 |
| **F-15** | Low | Directory tree had no pages for FR-06.4 (peer evaluation), FR-08 (deliverables), FR-09 (notifications), FR-10.4 (grades and appeals), FR-11 (archive), student roster import / pool, or admin user management; several Server Actions were referenced but not listed. | Routes and actions added. | §11 |
| **F-16** | Low | Matching formula quirk: with `C_max = 0` and `C_curr = 0` the capacity term evaluates to 1.0, rating a zero-capacity supervisor as fully available. | Formula left unchanged (it matches the specified unit tests). The UI shows an "At capacity" badge whenever `C_curr >= C_max`. | §4.1 note |
| **F-17** | Low | Rules referenced `request.auth.token.role`, a claim that is never minted (claims carry `roles` and `activeRole`). | Removed. | §9 |

## **13.1 Product Decisions (v5.2)**

| **ID** | **Decision** |
| :--- | :--- |
| **D-01** | **Brand and theme:** HTU brand colours are blue and white. The UI is light mode only; no dark theme or theme toggle. |
| **D-02** | **Grading granularity:** The final mark is awarded **per team**. Every member receives the team's composite score. There is no grade classification (First Class, Pass, and so on) until thresholds are defined; `grade_classification` stays unset. Individual scoring (`student_id`) is reserved for a future version. Peer evaluations are advisory evidence for the supervisor's team-level continuous assessment and never change individual marks. |
| **D-03** | **Email deferred:** Resend is removed from v5.2 scope. No email provider is integrated; FR-09.3 is deferred and notifications are in-app only. |
| **D-04** | **CSV columns:** The roster import CSV is `index_number`, `full_name`, `contact` (required phone number, stored on the roster document only). The broadsheet CSV exports `index_number`, `full_name`, `contact` followed by the team's scores (FR-10.1b). |
| **D-05** | **Roster and whitelist permissions:** Only coordinators and admins may import student roster CSVs and manage the staff whitelist. Supervisors have neither permission. This supersedes the FR-01.4 wording in v5.1 and v5.2, which allowed supervisors to import. |
| **D-06** | **Student record CRUD:** Coordinators and admins can create, read, update, deactivate and delete individual student records (FR-01.12). Defaults: index number immutable; full name and contact editable; programme changes only through `change-student-course` (justification, no active team); delete only for never-signed-in students on no team, otherwise deactivate; every operation audited. Adds `is_active` and audit fields to the roster document. |

## **13.2 Open Items**

- Grade classification thresholds are deferred (D-02).
- Whether supervisors may view their students' `contact` values is undecided; if yes, add a Server Action that returns contacts for the supervisor's own assigned teams only.
- Email provider and sending domain are undecided (D-03); FR-09.3 stays deferred.

---

# **14. Change Log**

| **Version** | **Changes** |
| :--- | :--- |
| **5.2.2** | Student record CRUD for coordinators and admins (D-06, FR-01.12): roster document gains `is_active` and audit fields, sign-in flow step 4c2, FR-01.10 course change opened to coordinators, personas, diagram, directory tree and rules comment, new test cases in §12.2. |
| **5.2.1** | Roster import and staff whitelist management restricted to coordinators and admins (D-05). Updated personas, FR-01.4, FR-01.7, architecture diagram, directory-tree comments and a 403 test case in §12.2. |
| **5.2** | Added §13 review findings and decisions. Rewrote §9 Firestore rules (F-01 to F-14, F-17). Added collections `supervisor_contacts` (+`grants`), `invite_codes`, `teams/{id}/private`, `academic_years/{id}/counters` (§8). Added `contact` to roster schema and CSV (D-04). Team-level final mark and optional `grade_classification` (D-02). Email deferred (D-03). Light-mode only, HTU blue and white (D-01). Expanded directory tree and Server Actions (§11). Added FR-06.6 and FR-10.1b. Added rules tests to §12.2. |
| 5.1 | Google Sign-In and roster gating. |
