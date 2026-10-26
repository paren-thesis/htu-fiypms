// Source: FYPMS spec v5.2 §8.1.
import type {} from "firebase-admin/firestore";

export interface UserDocument {
  uid: string;
  name: string;
  email: string;
  role: "student" | "supervisor" | "coordinator" | "admin" | "panel_member"; // Primary display role
  roles: string[]; // All authorized roles: e.g. ['supervisor', 'coordinator', 'panel_member']
  active_role: string; // Current active context: e.g. 'coordinator'
  profile: {
    index_number?: string; // e.g. "0323809921" (Students)
    staff_id?: string; // e.g. "SUP-001" (Faculty)
    course_id?: string; // References /courses/{courseId}
    programmes?: string[]; // Superviseable tracks for faculty (e.g. ["btech-ict", "hnd-ict"])
    registered: boolean;
    profile_complete: boolean; // false for new faculty, true for students
    // phone, office_location, consultation_hours live in supervisor_contacts/{uid} (gated, see F-03)
    research_interests?: string[]; // e.g. ["ai/ml", "cybersecurity", "cloud"]
    max_team_capacity?: number; // e.g. 5 teams
    current_team_count?: number; // Active assigned teams count
  };
  created_at: FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.Timestamp;
}

export interface SupervisorContactDocument {
  supervisor_id: string; // doc id = supervisor uid
  phone?: string;
  office_location: string;
  consultation_hours: string;
  updated_at: FirebaseFirestore.Timestamp;
}

// supervisor_contacts/{supervisorId}/grants/{studentId}: existence = student may read the contact doc
export interface SupervisorContactGrant {
  student_id: string; // doc id = student uid
  team_id: string;
  granted_at: FirebaseFirestore.Timestamp;
}

// invite_codes/{code}: server-only lookup, created with tx.create so codes are unique
export interface InviteCodeDocument {
  code: string; // 6-character uppercase alphanumeric (e.g. "K9X2P4"), excludes 0 O 1 I
  team_id: string;
  created_at: FirebaseFirestore.Timestamp;
}

// teams/{teamId}/private/invite: display copy for team members and coordinators
export interface TeamInviteDocument {
  code: string;
}

// academic_years/{yearId}/counters/{courseId}: server-only, incremented inside the team-creation transaction
export interface CounterDocument {
  next_sequence: number;
}

export interface RosterStudentDocument {
  index_number: string; // 10 digits: e.g. "0323080281"
  full_name: string;
  contact: string; // phone number from CSV (D-04); roster-only, exported in the broadsheet CSV
  email: string; // derived: `${index_number}@htu.edu.gh`
  course_id: string; // "btech-ict" | "btech-cs" | "hnd-ict" | "hnd-cs"
  imported_by_uid: string;
  imported_at: FirebaseFirestore.Timestamp;
  import_batch_id: string; // groups rows from a single CSV upload
  user_uid: string | null; // write-once, set on first successful signup
  signup_completed_at: FirebaseFirestore.Timestamp | null;
}

export interface StaffWhitelistDocument {
  email: string; // doc ID, e.g. "kklu@htu.edu.gh"
  full_name: string;
  roles: string[]; // e.g. ["supervisor"] or ["supervisor", "coordinator"]
  department: string; // e.g. "Computer Science"
  programmes: string[]; // e.g. ["btech-ict", "hnd-ict"] — superviseable tracks
  phone?: string;
  is_active: boolean;
  added_by_uid: string;
  added_at: FirebaseFirestore.Timestamp;
  user_uid: string | null; // linked after first sign-in
  last_signin_at?: FirebaseFirestore.Timestamp;
}

export interface CourseDocument {
  id: string; // e.g. "btech-cs"
  code: string; // e.g. "BTECH-CS", "BTECH-ICT", "HND-CS", "HND-ICT"
  name: string; // e.g. "BTech Computer Science"
  department: string; // e.g. "Computer Science"
}

export interface AcademicYearDocument {
  id: string; // e.g. "2025-2026"
  code: string; // e.g. "2025/2026"
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

export interface TeamDocument {
  id: string;
  name: string;
  group_number: string; // Formatted: "{CourseCode}{YY}_{Sequence}" -> "BICT26_01"
  // invite code is NOT stored on this document (F-06): see invite_codes/{code} and teams/{teamId}/private/invite
  course_id: string; // MUST match every member's profile.course_id
  academic_year_id: string;
  leader_id: string; // References users/{uid}
  member_ids: string[]; // Array of student UIDs for indexing
  member_count: number;
  max_members: number; // Standard: 5
  status:
    | "formation"
    | "topic_pending"
    | "topic_approved"
    | "defense_ready"
    | "completed"
    | "disbanded";
  assigned_supervisor_id?: string;
  approved_topic_id?: string;
  scores_summary?: {
    supervisor_score: number; // Weighted 40%
    panel_average_score: number; // Weighted 60%
    composite_final_score: number; // 0 - 100
    grade_classification?: string; // DEFERRED (D-02): no thresholds defined yet; leave unset. Final mark is per team.
    is_locked: boolean;
  };
  created_at: FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.Timestamp;
}

export interface TopicDocument {
  id: string;
  team_id: string;
  title: string;
  abstract: string;
  problem_statement: string;
  proposed_solution: string;
  tech_stack: string[]; // e.g. ["next.js", "firebase", "typescript"]
  preference_rank: 1 | 2 | 3;
  version: number; // Incremented on resubmission
  is_current: boolean; // True for the active proposal revision
  status:
    | "draft"
    | "submitted"
    | "under_review"
    | "approved"
    | "rejected"
    | "revision_requested";
  reviewed_by_user_id?: string;
  review_notes?: string;
  submitted_at: FirebaseFirestore.Timestamp;
  reviewed_at?: FirebaseFirestore.Timestamp;
}

export interface SupervisionDocument {
  id: string;
  supervisor_id: string; // References users/{uid}
  academic_year_id: string;
  max_capacity: number; // Default 5
  current_assigned_count: number;
  assigned_team_ids: string[];
  status: "available" | "at_capacity";
  updated_at: FirebaseFirestore.Timestamp;
}

export interface ChapterFeedback {
  id: string;
  author_id: string;
  content: string;
  created_at: FirebaseFirestore.Timestamp;
}

export interface ChapterDocument {
  id: string;
  team_id: string;
  chapter_number: 1 | 2 | 3 | 4 | 5;
  title: string; // e.g. "Chapter 1: Introduction"
  document_url: string; // External Google Drive / OneDrive link
  version: number;
  status: "pending" | "approved" | "revision_needed";
  feedback: ChapterFeedback[];
  submitted_at: FirebaseFirestore.Timestamp;
  reviewed_at?: FirebaseFirestore.Timestamp;
}

export interface DefenseTimeSlot {
  slot_id: string;
  team_id: string;
  start_time: FirebaseFirestore.Timestamp;
  end_time: FirebaseFirestore.Timestamp;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
}

export interface DefensePanelDocument {
  id: string;
  academic_year_id: string;
  course_id: string;
  panel_name: string; // e.g. "Panel A - Software Systems"
  venue: string; // e.g. "CS Lab 2" or "Virtual - Google Meet"
  is_virtual: boolean;
  virtual_meeting_url?: string;
  chair_id: string; // References users/{uid} (Panel Chair)
  examiner_ids: string[]; // Array of faculty UIDs
  time_slots: DefenseTimeSlot[];
  created_at: FirebaseFirestore.Timestamp;
}

export interface RubricCriterion {
  id: string;
  title: string;
  description: string;
  max_points: number;
  category: "oral_defense" | "system_demo" | "technical_architecture";
}

export interface RubricDocument {
  id: string;
  title: string;
  max_score: number;
  supervisor_weight_pct: number; // e.g. 40
  panel_weight_pct: number; // e.g. 60
  is_active: boolean;
  criteria: RubricCriterion[];
  created_at: FirebaseFirestore.Timestamp;
}

export interface EvaluationDocument {
  id: string;
  team_id: string;
  student_id?: string | null; // Reserved for future individual scoring. v1 (D-02): always null/omitted
  evaluator_id: string; // References users/{uid}
  evaluator_role: "supervisor" | "panel_chair" | "panel_member";
  rubric_id: string;
  scores: {
    [criterionId: string]: number; // Line-item scores
  };
  total_score: number;
  comments: string;
  is_published: boolean; // Locked when true
  created_at: FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.Timestamp;
}

export interface PeerEvaluationDocument {
  id: string;
  team_id: string;
  evaluator_id: string; // Student UID submitting rating (confidential)
  evaluatee_id: string; // Teammate UID being rated
  punctuality_score: number; // 1 to 10
  technical_contribution_score: number;
  teamwork_score: number;
  average_score: number; // Computed average (1.0 to 10.0)
  comments: string;
  submitted_at: FirebaseFirestore.Timestamp;
}

export interface SoftwareDeliverableDocument {
  team_id: string;
  github_repository_url: string;
  live_demo_url?: string;
  google_drive_url?: string;
  environment_setup_notes: string; // Markdown setup instructions & credentials
  submitted_by_user_id: string;
  approved_by_supervisor_at?: FirebaseFirestore.Timestamp;
  supervisor_signoff_notes?: string;
  submitted_at: FirebaseFirestore.Timestamp;
}

export interface NotificationDocument {
  id: string;
  user_id: string; // Recipient UID
  title: string;
  body: string;
  type: "topic_status" | "chapter_review" | "defense_schedule" | "grade_published";
  target_url?: string;
  is_read: boolean;
  created_at: FirebaseFirestore.Timestamp;
}

export interface AuditLogDocument {
  id: string;
  actor_id: string;
  actor_name: string;
  actor_email: string;
  actor_role: string;
  action:
    | "roster.imported"
    | "staff.whitelist_added"
    | "staff.whitelist_deactivated"
    | "student.signup_completed"
    | "faculty.signup_completed"
    | "identity_conflict"
    | "profile.completed"
    | "user.role_switched"
    | "topic.approved"
    | "topic.revision_requested"
    | "grade.submitted"
    | "grade.amended"
    | "team.created"
    | "defense.scheduled";
  target_type: string;
  target_id: string;
  description: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  timestamp: FirebaseFirestore.Timestamp;
}
