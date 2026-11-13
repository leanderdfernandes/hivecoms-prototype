// Canvas sample world (PRD 11.1). Base rows here; each module seeds its own content (seedRes, seedChat, seedBuzz).
// Rows are data: delete one and the screen changes (G1). `img` values are photo keys in images.ts, never icons.
import { DB, days } from './db';
import { seedRes } from './res';
import { seedChat } from './chat';
import { seedBuzz, seedNotes, seedBuzzPoll } from './buzz';

const FIRST = ['Aarav', 'Akash', 'Amit', 'Ankit', 'Arjun', 'Ashwin', 'Dev', 'Dhruv', 'Ganesh', 'Harsh', 'Ishaan', 'Karan', 'Krish', 'Manoj', 'Nikhil', 'Pranav', 'Rahul', 'Rajat', 'Rohit', 'Sahil', 'Sanket', 'Shubham', 'Siddharth', 'Tejas', 'Varun', 'Yash', 'Aditi', 'Ananya', 'Anjali', 'Divya', 'Isha', 'Kavya', 'Kritika', 'Maya', 'Nisha', 'Pallavi', 'Priya', 'Radhika', 'Rashmi', 'Rutuja', 'Sakshi', 'Saloni', 'Shreya', 'Sneha', 'Tanvi', 'Trisha', 'Vaishnavi', 'Zoya'];
const LAST = ['Bhat', 'Borkar', 'Chodankar', 'Dessai', 'Dias', 'Fernandes', 'Gaonkar', 'Gawde', 'Kamat', 'Kulkarni', 'Lotlikar', 'Mandrekar', 'Naik', 'Pai', 'Parab', 'Prabhu', 'Rane', 'Salgaonkar', 'Sawant', 'Shet', 'Sinari', 'Tari', 'Usgaonkar', 'Verlekar'];

export function seed(): DB {
  const d: DB = {} as DB;
  d.academic_years = [{ id: 'y2627', label: '2026–27', is_current: true }, { id: 'y2526', label: '2025–26', is_current: false }];
  d.terms = [
    { id: 't-odd', year_id: 'y2627', parity: 'odd', semester_no: 5, starts_on: days(-90), ends_on: days(21, 17) },
    { id: 't-even', year_id: 'y2627', parity: 'even', semester_no: 6, starts_on: days(40), ends_on: days(200) },
    { id: 't-past', year_id: 'y2526', parity: 'even', semester_no: 4, starts_on: days(-300), ends_on: days(-162) },
  ];
  d.departments = [{ id: 'd-comp', name: 'Computer Engineering', short: 'Comp' }, { id: 'd-it', name: 'Information Technology', short: 'IT' }, { id: 'd-mech', name: 'Mechanical Engineering', short: 'Mech' }, { id: 'd-ece', name: 'Electronics and Telecom', short: 'ETC' }];
  // by_year: head counts for the Buzz audience picker where we don't generate every person.
  d.programmes = [
    { id: 'pg-comp', department_id: 'd-comp', name: 'Computer Engineering', by_year: { 1: 124, 2: 118, 3: 120, 4: 112 } },
    { id: 'pg-it', department_id: 'd-it', name: 'Information Technology', by_year: { 1: 62, 2: 60, 3: 60, 4: 58 } },
    { id: 'pg-mech', department_id: 'd-mech', name: 'Mechanical Engineering', by_year: { 1: 208, 2: 214, 3: 196, 4: 190 } },
    { id: 'pg-ece', department_id: 'd-ece', name: 'Electronics and Telecom', by_year: { 1: 96, 2: 92, 3: 90, 4: 84 } },
  ];

  const P: any[] = (d.profiles = []);
  const person = (id: string, full_name: string, role: string, x: any = {}) => { const r = { id, role, full_name, has_app: true, push_enabled: true, last_active_at: days(0), ...x }; P.push(r); return r; };
  person('p-hive', 'Hive Support', 'support', { img: 'hive' });
  // Named faculty. Photos on people the canvas names; generated people use initials as drawn on the canvas.
  person('p-anita', 'Anita Naik', 'faculty', { img: 'w0', department_id: 'd-comp' });
  person('p-vikram', 'Vikram Rao', 'faculty', { img: 'm1', department_id: 'd-comp' });
  person('p-prakash', 'Prakash Kamat', 'faculty', { img: 'm2', department_id: 'd-comp' });
  person('p-sanjay', 'Sanjay Rao', 'faculty', { img: 'm3', department_id: 'd-mech' });
  person('p-kiran', 'Kiran Pai', 'faculty', { img: 'm12', department_id: 'd-comp' });
  person('p-suman', 'Suman Bhat', 'faculty', { img: 'w12', department_id: 'd-comp' });

  // Division A, Evening batch, Div 1.
  d.divisions = [
    { id: 'div-a', term_id: 't-odd', programme_id: 'pg-comp', year_of_study: 3, name: 'Div A', class_label: 'TE Comp', mentor_id: 'p-anita' },
    { id: 'div-eve', term_id: 't-odd', programme_id: 'pg-comp', year_of_study: 3, name: 'Evening batch', class_label: 'TE Comp', mentor_id: 'p-prakash' },
    { id: 'div-1', term_id: 't-odd', programme_id: 'pg-it', year_of_study: 3, name: 'Div 1', class_label: 'TE IT', mentor_id: 'p-kiran' },
  ];
  d.division_members = [];
  const named: Record<string, [string, string, string | undefined]> = {
    'p-rohan': ['Rohan Kamat', 'div-a', 'm0'], 'p-neha': ['Neha Prabhu', 'div-a', 'w1'], 'p-aditya': ['Aditya Gawas', 'div-a', 'm4'], 'p-aryan': ['Aryan Kamat', 'div-a', 'm5'], 'p-kevin': ['Kevin Pereira', 'div-a', 'm6'], 'p-pooja': ['Pooja Desai', 'div-a', 'w2'], 'p-riya': ['Riya Sawant', 'div-a', 'w3'], 'p-vishal': ['Vishal Naik', 'div-a', 'm7'], 'p-sameer': ['Sameer Dessai', 'div-a', 'm8'], 'p-joel': ['Joel Pereira', 'div-a', 'm9'], 'p-sara': ["Sara D'Costa", 'div-a', 'w4'], 'p-ayesha': ['Ayesha Shaikh', 'div-a', 'w5'], 'p-meera': ['Meera Naik', 'div-a', 'w6'], 'p-omkar': ['Omkar Parab', 'div-eve', 'm10'], 'p-rahul': ['Rahul Kamat', 'div-a', 'm11'],
  };
  const counts: Record<string, number> = { 'div-a': 62, 'div-eve': 58, 'div-1': 60 };
  const roll: Record<string, number> = { 'div-a': 0, 'div-eve': 0, 'div-1': 0 };
  const label: Record<string, string> = { 'div-a': 'TE Comp', 'div-eve': 'TE Comp', 'div-1': 'TE IT' };
  const add = (id: string, name: string, div: string, img?: string) => {
    const n = ++roll[div];
    person(id, name, 'student', { img, department_id: div === 'div-1' ? 'd-it' : 'd-comp', programme_id: div === 'div-1' ? 'pg-it' : 'pg-comp', year_of_study: 3, class_label: label[div], roll_number: String(n).padStart(2, '0'), it1: 40 + ((n * 7) % 39) });
    d.division_members.push({ division_id: div, student_id: id, batch: n % 2 ? 'B1' : 'B2' });
  };
  for (const [id, [nm, div, img]] of Object.entries(named)) add(id, nm, div, img);
  let g = 0;
  for (const div of Object.keys(counts)) while (roll[div] < counts[div]) { const nm = `${FIRST[g % FIRST.length]} ${LAST[(g * 5 + 3) % LAST.length]}`; add(`s-${div}-${roll[div] + 1}`, nm, div); g++; }
  // Rohan and Neha: batch tags as canvas (B1, B2).
  d.division_members.find(m => m.student_id === 'p-rohan').batch = 'B1'; d.division_members.find(m => m.student_id === 'p-neha').batch = 'B2';
  // IT1 marks so focus batch suggestions return 12 below 40% and 9 at 80%+ (Div A). Rohan is mid.
  const divA = d.division_members.filter(m => m.division_id === 'div-a').map(m => P.find(p => p.id === m.student_id));
  divA.slice(20, 32).forEach((p, i) => (p.it1 = 22 + i * 1.5 | 0)); divA.slice(32, 41).forEach((p, i) => (p.it1 = 80 + i * 2));
  // "Never signed in" and "Can't reach" rows.
  divA.slice(50, 53).forEach(p => (p.has_app = false)); divA.slice(53, 56).forEach(p => (p.push_enabled = false));
  // 2nd-year Mech cohort for reach numbers (214). Others are counted by programmes.by_year.
  for (let i = 1; i <= 214; i++) person(`s-mech-${i}`, `${FIRST[(i * 3) % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`, 'student', { department_id: 'd-mech', programme_id: 'pg-mech', year_of_study: 2, class_label: 'SE Mech', roll_number: String(i).padStart(3, '0'), has_app: i % 41 !== 0, push_enabled: i % 29 !== 0 });

  d.courses = [
    { id: 'c-daa', code: 'CS501', short: 'DAA', name: 'Design and Analysis of Algorithms', img: 'daa' },
    { id: 'c-cn', code: 'CS502', short: 'CN', name: 'Computer Networks', img: 'cn' },
    { id: 'c-os', code: 'CS503', short: 'OS', name: 'Operating Systems', img: 'os' },
    { id: 'c-ds', code: 'CS401', short: 'DS', name: 'Data Structures', img: 'ds' },
    { id: 'c-dbms', code: 'CS402', short: 'DBMS', name: 'Database Management Systems', img: 'dbms' },
    { id: 'c-dm', code: 'CS403', short: 'DM', name: 'Discrete Mathematics', img: 'dm' },
  ];
  d.syllabus_units = ['Basics', 'Divide and conquer', 'Greedy', 'Dynamic programming', 'Backtracking'].map((title, i) => ({ id: `u${i + 1}`, course_id: 'c-daa', number: i + 1, title }));
  d.offerings = [
    { id: 'o-daa-a', course_id: 'c-daa', term_id: 't-odd', division_id: 'div-a', schedule_text: 'Mon, Wed 10 am' },
    { id: 'o-daa-eve', course_id: 'c-daa', term_id: 't-odd', division_id: 'div-eve', schedule_text: 'Tue, Thu 5 pm' },
    { id: 'o-daa-1', course_id: 'c-daa', term_id: 't-odd', division_id: 'div-1', schedule_text: 'Tue, Fri 11 am' },
    { id: 'o-cn-a', course_id: 'c-cn', term_id: 't-odd', division_id: 'div-a', schedule_text: 'Tue, Thu 9 am' },
    { id: 'o-os-a', course_id: 'c-os', term_id: 't-odd', division_id: 'div-a', schedule_text: 'Mon, Fri 2 pm' },
    { id: 'o-ds-past', course_id: 'c-ds', term_id: 't-past', division_id: 'div-a', schedule_text: '' },
    { id: 'o-dbms-past', course_id: 'c-dbms', term_id: 't-past', division_id: 'div-a', schedule_text: '' },
    { id: 'o-dm-past', course_id: 'c-dm', term_id: 't-past', division_id: 'div-a', schedule_text: '' },
  ];
  d.offering_faculty = [
    ...['o-daa-a', 'o-daa-eve', 'o-daa-1'].map(o => ({ offering_id: o, faculty_id: 'p-anita', label: 'Teaches DAA' })),
    { offering_id: 'o-daa-a', faculty_id: 'p-vikram', label: 'Labs' },
    { offering_id: 'o-cn-a', faculty_id: 'p-kiran', label: 'Teaches CN' }, { offering_id: 'o-os-a', faculty_id: 'p-anita', label: 'Teaches OS' }, { offering_id: 'o-os-a', faculty_id: 'p-suman', label: 'Labs' },
    { offering_id: 'o-ds-past', faculty_id: 'p-prakash', label: 'Teaches DS' }, { offering_id: 'o-dbms-past', faculty_id: 'p-suman', label: 'Teaches DBMS' }, { offering_id: 'o-dm-past', faculty_id: 'p-kiran', label: 'Teaches DM' },
  ];
  // Clubs directory (CL-1–8). join: 'open' = instant, 'request' = a lead or the coordinator approves.
  d.clubs = [
    { id: 'club-robo', name: 'Robotics Club', coordinator_id: 'p-sanjay', img: 'robotics', category: 'Tech', join: 'open', about: 'We build robots for Robocon and run hands-on workshops through the year. No experience needed.' },
    { id: 'club-code', name: 'Coding Club', coordinator_id: 'p-anita', img: 'team', category: 'Tech', join: 'request', about: 'Weekly contests, interview prep and a 24-hour hackathon every term.' },
    { id: 'club-music', name: 'Music Club', coordinator_id: 'p-kiran', img: 'icon:music_note', category: 'Arts', join: 'open', about: 'Jam sessions every Friday in the auditorium. Bring an instrument or just your voice.' },
    { id: 'club-photo', name: 'Photography Club', coordinator_id: 'p-suman', img: 'campus2', category: 'Arts', join: 'open', about: 'Photo walks around Goa, editing nights, and the annual campus exhibition.' },
    { id: 'club-drama', name: 'Drama Society', coordinator_id: 'p-vikram', img: 'icon:theater_comedy', category: 'Arts', join: 'request', about: 'Street plays, the annual production and inter-college fests. Auditions happen through join requests.' },
    { id: 'club-foot', name: 'Football Club', coordinator_id: 'p-sanjay', img: 'icon:sports_soccer', category: 'Sports', join: 'request', about: 'Practice on Tuesdays and Thursdays at 5 pm. The college team is picked from the club.' },
    { id: 'club-nss', name: 'NSS', coordinator_id: 'p-prakash', img: 'icon:volunteer_activism', category: 'Service', join: 'open', about: 'Beach clean-ups, blood donation drives and village visits. Counts towards your NSS hours.' },
  ];
  const roboIds = divA.slice(0, 45).map(p => p.id);
  d.club_members = [{ club_id: 'club-robo', user_id: 'p-meera', role: 'lead' }, { club_id: 'club-robo', user_id: 'p-joel', role: 'lead' }, ...roboIds.filter(i => i !== 'p-meera' && i !== 'p-joel').slice(0, 46).map(user_id => ({ club_id: 'club-robo', user_id, role: 'member' }))];
  const codeIds = ['p-rohan', 'p-sara', 'p-neha', 'p-kevin', ...divA.slice(10, 40).map(p => p.id)].filter((x, i, a) => a.indexOf(x) === i);
  d.club_members.push(...codeIds.map(user_id => ({ club_id: 'club-code', user_id, role: user_id === 'p-rohan' || user_id === 'p-sara' ? 'lead' : 'member' })));
  const studs = P.filter(p => p.role === 'student' && p.id !== 'p-rohan').map(p => p.id);
  const newClubs: [string, number, number][] = [['club-music', 3, 34], ['club-photo', 40, 22], ['club-drama', 70, 18], ['club-foot', 95, 26], ['club-nss', 130, 41]];
  newClubs.forEach(([club_id, from, n]) => d.club_members.push(...studs.slice(from, from + n).map((user_id, i) => ({ club_id, user_id, role: i < 2 ? 'lead' : 'member' }))));
  // Two students waiting to get into Coding Club, so Rohan (a lead) has requests to answer.
  d.club_requests = divA.slice(41, 45).map(p => p.id).filter(id => !codeIds.includes(id)).slice(0, 2).map((user_id, i) => ({ id: `cr-seed-${i}`, club_id: 'club-code', user_id, status: 'pending', created_at: days(-i) }));

  /* Chats + members, derived from academic rows (PRD 3 intro). Messages are seeded by seedChat(). */
  d.chats = []; d.chat_members = [];
  const chat = (id: string, x: any, memberIds: string[], rolesOf: (u: string) => string = () => 'member') => {
    d.chats.push({ id, status: 'active', who_can_send: 'everyone', students_can_poll: false, students_can_share_files: true, academic_year_id: 'y2627', created_at: days(-80), ...x });
    memberIds.forEach(user_id => d.chat_members.push({ chat_id: id, user_id, role: rolesOf(user_id), notify: 'every', muted: false, last_read_at: days(-1), joined_at: days(-80), left_at: null }));
  };
  const divIds = (div: string) => d.division_members.filter(m => m.division_id === div).map(m => m.student_id);
  for (const [cid, oid] of [['chat-daa-a', 'o-daa-a'], ['chat-daa-eve', 'o-daa-eve'], ['chat-daa-1', 'o-daa-1'], ['chat-cn-a', 'o-cn-a'], ['chat-os-a', 'o-os-a'], ['chat-ds-past', 'o-ds-past'], ['chat-dbms-past', 'o-dbms-past'], ['chat-dm-past', 'o-dm-past']]) {
    const o = d.offerings.find(x => x.id === oid), crs = d.courses.find(x => x.id === o.course_id), fac = d.offering_faculty.filter(f => f.offering_id === oid).map(f => f.faculty_id);
    const past = o.term_id === 't-past';
    chat(cid, { kind: 'course', offering_id: oid, division_id: o.division_id, name: crs.name, img: crs.img, status: past ? 'read_only' : 'active', academic_year_id: past ? 'y2526' : 'y2627' }, [...fac, ...divIds(o.division_id)], u => (fac.includes(u) ? 'faculty' : 'member'));
  }
  chat('chat-class-a', { kind: 'class_group', division_id: 'div-a', name: 'TE Comp · Div A', img: 'classgroup' }, ['p-anita', 'p-kiran', 'p-suman', ...divIds('div-a')], u => (u === 'p-anita' ? 'mentor' : u.startsWith('p-k') || u === 'p-suman' ? 'faculty' : 'member'));
  chat('chat-robo', { kind: 'club', club_id: 'club-robo', name: 'Robotics Club', img: 'robotics' }, ['p-sanjay', ...d.club_members.filter(m => m.club_id === 'club-robo').map(m => m.user_id)], u => (u === 'p-sanjay' ? 'faculty' : u === 'p-meera' || u === 'p-joel' ? 'lead' : 'member'));
  chat('chat-code', { kind: 'club', club_id: 'club-code', name: 'Coding Club', img: 'team' }, ['p-anita', ...codeIds], u => (u === 'p-anita' ? 'faculty' : u === 'p-rohan' || u === 'p-sara' ? 'lead' : 'member'));
  for (const [club_id] of newClubs) {
    const k = d.clubs.find(x => x.id === club_id), ms = d.club_members.filter(m => m.club_id === club_id);
    chat(`chat-${club_id.slice(5)}`, { kind: 'club', club_id, name: k.name, img: k.img || null }, [k.coordinator_id, ...ms.map(m => m.user_id)], u => (u === k.coordinator_id ? 'faculty' : ms.find(m => m.user_id === u)?.role || 'member'));
  }
  chat('chat-team4', { kind: 'group', name: 'Mini project · Team 4', img: 'team', created_by: 'p-rohan' }, ['p-rohan', 'p-sara', 'p-aditya', 'p-pooja', 'p-kevin', 'p-prakash'], u => (u === 'p-rohan' ? 'admin' : u === 'p-prakash' ? 'faculty' : 'member'));
  // Faculty-created group (CH-4): Anita runs the IEEE paper team.
  chat('chat-paper', { kind: 'group', name: 'IEEE paper team', img: null, created_by: 'p-anita', created_at: days(-12) }, ['p-anita', 'p-vikram', 'p-rohan', 'p-neha', 'p-sara', 'p-aditya'], u => (u === 'p-anita' ? 'admin' : u === 'p-vikram' ? 'faculty' : 'member'));
  const fb = (id: string, name: string, ids: string[], x: any = {}) => chat(id, { kind: 'focus_batch', parent_chat_id: 'chat-daa-a', offering_id: 'o-daa-a', division_id: 'div-a', name, img: 'daa', created_by: 'p-anita', ends_at: days(21, 17), created_at: days(-20), ...x }, ['p-anita', ...ids], u => (u === 'p-anita' ? 'faculty' : 'member'));
  // Practice = 12 students + Anita (13 people) from the below-40% set; Rohan is in it for the student demo.
  fb('chat-practice', 'Practice', ['p-rohan', ...divA.slice(20, 31).map(p => p.id)]);
  fb('chat-challenge', 'Challenge', divA.slice(32, 40).map(p => p.id).concat('p-neha'));
  fb('chat-lab5', 'Lab 5 redo', divA.slice(5, 11).map(p => p.id), { status: 'closed', ends_at: days(-14, 17) });
  chat('chat-dm-rohan-anita', { kind: 'dm', name: null }, ['p-rohan', 'p-anita']);
  chat('chat-dm-anita-omkar', { kind: 'dm', name: null }, ['p-anita', 'p-omkar']);
  chat('chat-dm-rohan-neha', { kind: 'dm', name: null }, ['p-rohan', 'p-neha']);

  // Empty tables all modules read/write. Seeds below fill them.
  for (const t of ['messages', 'message_reactions', 'message_receipts', 'pins', 'polls', 'poll_options', 'poll_votes', 'reports', 'blocks', 'focus_batch_sessions', 'files', 'file_versions', 'file_pages', 'folders', 'resources', 'folder_publications', 'resource_shares', 'resource_views', 'resource_reminders', 'buzz_accounts', 'buzz_account_members', 'buzz_posts', 'buzz_recipients', 'buzz_attachments', 'buzz_seen', 'buzz_comments', 'buzz_reminders', 'todo_items', 'notifications', 'recent_searches']) d[t] = [];
  seedRes(d); seedBuzz(d); seedChat(d); seedBuzzPoll(d); seedNotes(d);
  declutter(d);
  return d;
}

/** Demo world, trimmed: one extra DAA division (enough to show sharing to several) and one live focus batch.
 * Runs after every module seed so their rows can stay as written; this drops the extras and everything hanging off them. */
function declutter(d: any) {
  const chats = new Set(['chat-daa-1', 'chat-challenge', 'chat-lab5']), offs = new Set(['o-daa-1']);
  const msgs = new Set(d.messages.filter((m: any) => chats.has(m.chat_id)).map((m: any) => m.id));
  const folders = new Set(d.folders.filter((f: any) => chats.has(f.chat_id)).map((f: any) => f.id));
  const res = new Set(d.resources.filter((r: any) => folders.has(r.folder_id)).map((r: any) => r.id));
  const keep = (t: string, f: (r: any) => boolean) => { if (d[t]) d[t] = d[t].filter(f); };
  keep('chats', x => !chats.has(x.id));
  keep('chat_members', x => !chats.has(x.chat_id));
  keep('messages', x => !msgs.has(x.id));
  ['message_reactions', 'message_receipts', 'pins'].forEach(t => keep(t, x => !msgs.has(x.message_id) && !chats.has(x.chat_id)));
  keep('focus_batch_sessions', x => !chats.has(x.chat_id));
  keep('folders', x => !folders.has(x.id));
  keep('resources', x => !res.has(x.id));
  keep('offerings', x => !offs.has(x.id));
  ['offering_faculty', 'resource_shares', 'folder_publications'].forEach(t => keep(t, x => !offs.has(x.offering_id)));
  keep('resource_views', x => !res.has(x.resource_id));
  keep('notifications', x => !chats.has(x.chat_id) && !msgs.has(x.message_id));
  keep('todo_items', x => !msgs.has(x.message_id));
}
