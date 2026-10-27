import { notFound } from 'next/navigation';
import { fx, studentEmail, studentUid, staffUid } from '../../../../fixtures';
import { DevLoginClient } from './DevLoginClient';

export default function DevLoginPage() {
  if (
    process.env.NODE_ENV === 'production' ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST
  ) {
    notFound();
  }

  const staff = fx.staff.map((s) => ({
    uid: staffUid(s.email),
    name: s.full_name,
    email: s.email,
    roles: s.roles,
    department: s.department,
    programmes: s.programmes,
  }));

  const students = fx.students.map((st) => ({
    uid: studentUid(st.index_number),
    name: st.full_name,
    email: studentEmail(st.index_number),
    index_number: st.index_number,
    course_id: st.course_id,
    group_number: st.group_number,
  }));

  return <DevLoginClient staff={staff} students={students} />;
}
