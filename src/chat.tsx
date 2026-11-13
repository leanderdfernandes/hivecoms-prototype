// Chat core (PRD 6.1–6.4, 6.8): chats list, archive, search, new chat, ChatTab (messages + composer + every hold action), thread, file, seen, polls.
import React, { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Linking, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { create } from 'zustand';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c, P, shadow } from './theme';
import { Fab, ActionTile, Badge, Body, BtnP, BtnS, BtnT, Card, Chips, Ck, closeAllSheets, closeSheet, confirmSheet, Empty, Fi, fileIcon, Fo, Grp, Hdr, IB, Li, Ms, openSheet, Pic, Pill, Row, Screen, SearchBar, Sec, SheetBody, SheetRow, SlidePage, swapSheet, Sw, T, Tap, toast, Field, openSchedule, pickDateTime, tomorrow9, nextMonday9, PasteBtn, Seg } from './ui';
import { byId, dayDiff, db, days, firstName, fmtClock, fmtDate, fmtDay, fmtRow, fmtShort, fmtSize, fmtTime, insert, isFaculty, isOffline, meId, memberOf, members, mut, newId, notify, pct, profile, useData, useOffline, where } from './db';
import { back, go, swap } from './nav';
import { ageQueue, chatMessages, chatTitle, division, fireScheduled, flushQueue, markRead, openChat, openDm, otherMember, peopleCount, personLine, PlaceShell, previewOf, retrySend, sendMessage, sysText, threadReplies, unread } from './place';
import { courseFolders, fileFromPhone, markViewed, pickFiles, resourcesIn } from './res';
import { addTodoFromMessage } from './buzz';
import * as ImagePicker from 'expo-image-picker';
import { IMG } from './images';
import { CallBubble, EncryptedNote } from './call';

/* ---------- Lookups ---------- */
const courseOf = (ch: any) => byId('courses', byId('offerings', ch?.offering_id)?.course_id);
const divOf = (ch: any) => division(ch?.division_id);
/** "DAA · Div A" wherever a chat is named in one breath. */
export const chatLabel = (ch: any) => !ch ? '' : ch.kind === 'course' ? `${courseOf(ch)?.short} · ${divOf(ch)?.name}` : ch.kind === 'focus_batch' ? `${courseOf(ch)?.short} · ${ch.name}` : chatTitle(ch);
const audience = (ch: any) => members(ch.id).filter(m => m.role === 'member');
const canModerate = (ch: any) => ['faculty', 'mentor', 'lead', 'admin'].includes(memberOf(ch.id)?.role);
const activePin = (chatId: string) => where('pins', p => p.chat_id === chatId && p.expires_at > Date.now())[0];
const myChats = () => db().chats.filter(ch => memberOf(ch.id));
const lastOf = (chatId: string) => chatMessages(chatId).filter(m => m.sys_style !== 'day').pop();
const fmtWhen = (t: number) => { const n = dayDiff(t); return `${n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : fmtDate(t)}, ${fmtTime(t)}`; };
const named = (id: string) => { const p = profile(id); return id === meId() ? 'You' : p?.full_name; };
const ext = (name = '') => (name.split('.').pop() || '').toUpperCase();
const fileMeta = (f: any) => [f.page_count ? `${f.page_count} ${/presentation|ppt/.test(f.mime) ? 'slides' : f.page_count === 1 ? 'page' : 'pages'}` : null, fmtSize(f.size_bytes || 0), ext(f.name)].filter(Boolean).join(' · ');
const unitOf = (r: any) => (byId('folders', r?.folder_id)?.name || '').match(/^Unit \d+/)?.[0];
const list = (names: string[]) => names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
/** Division chats of this course the faculty also teaches. */
const otherDivs = (ch: any) => ch.kind !== 'course' ? [] : myChats().filter(x => x.kind === 'course' && x.id !== ch.id && x.status === 'active' && courseOf(x)?.id === courseOf(ch)?.id && memberOf(x.id)?.role === 'faculty');

/** List row data for any chat (Chat-V01 option A). */
export function rowInfo(ch: any) {
  const n = peopleCount(ch.id), other = ch.kind === 'dm' ? otherMember(ch.id) : null;
  if (ch.kind === 'course') return { title: ch.name, sub: `${divOf(ch)?.name} · ${n} people` };
  if (ch.kind === 'focus_batch') return { title: `${ch.name} · focus batch`, sub: `${courseOf(ch)?.short} · ${divOf(ch)?.name} · ${ch.status === 'closed' ? 'ended' : `${n} people`}` };
  if (ch.kind === 'class_group') return { title: ch.name, sub: memberOf(ch.id)?.role === 'mentor' ? 'Class group · you’re the class mentor' : 'Class group' };
  if (ch.kind === 'club') return { title: ch.name, sub: `Club · ${n} people` };
  if (ch.kind === 'group') return { title: ch.name, sub: `Group · ${n} people` };
  return { title: other?.full_name, sub: personLine(other) };
}
const chatPic = (ch: any, size = 48) => {
  const other = ch.kind === 'dm' ? otherMember(ch.id) : null;
  return <Pic img={ch.img || other?.img} name={rowInfo(ch).title} size={size} shape={other ? 'round' : 'course'} fac={other?.role === 'faculty'} badge={ch.kind === 'focus_batch' ? 'filter_center_focus' : undefined} />;
};
/** Two lines, WhatsApp-style: name + time, then preview + badge. The division rides muted after course names so two divisions never look alike. */
/** My last message shows its state as a tick (WhatsApp/Telegram), not "You:". */
const Tick = ({ m }: any) => {
  if (m.status === 'waiting') return <Ms n="schedule" s={16} col={c.ink3} />;
  if (m.status === 'failed') return <Ms n="error" s={16} col={c.negative} />;
  const rc = where('message_receipts', r => r.message_id === m.id);
  return <Ms n={rc.length ? 'done_all' : 'check'} s={16} col={rc.length && rc.every(r => r.seen_at) ? c.greenText : c.ink3} />;
};
const CRow = ({ ch, pinned, preview, onPress, sep }: any) => {
  const { title } = rowInfo(ch), last = lastOf(ch.id), u = unread(ch.id);
  const dv = ch.kind === 'course' || ch.kind === 'focus_batch' ? divOf(ch)?.name : null;
  const mineLast = !preview && last && last.kind !== 'system' && last.sender_id === meId() && !last.unsent_at;
  const text = preview ?? (mineLast ? previewOf(last).replace(/^You: /, '') : previewOf(last));
  return (
    <Tap onPress={onPress ?? (() => openChat(ch.id))} label={dv ? `${title}, ${dv}` : title} style={{ flexDirection: 'row', gap: 14, alignItems: 'center', paddingLeft: 16, minHeight: 76 }}>
      {chatPic(ch, 52)}
      {/* Divider starts at the text, like iMessage and Telegram, so avatars read as one clean column. */}
      <View style={{ flex: 1, minWidth: 0, gap: 3, alignSelf: 'stretch', justifyContent: 'center', paddingVertical: 12, paddingRight: 16, borderBottomWidth: sep ? StyleSheet.hairlineWidth : 0, borderBottomColor: c.line }}>
        <Row gap={8} style={{ alignItems: 'baseline' }}>
          {/* The name truncates; the division never does, so long course names still say which division. */}
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <T s={16} lh={21} w="600" n={1} style={{ flexShrink: 1 }}>{title}</T>
            {dv ? <T s={14} lh={21} col={c.ink3} n={1} style={{ flexShrink: 0 }}>{dv}</T> : null}
          </View>
          {last ? <T s={12} lh={16} w={u ? '600' : undefined} col={u ? c.greenText : c.ink3}>{fmtRow(last.sent_at)}</T> : null}
        </Row>
        <Row gap={6}>
          {mineLast ? <Tick m={last} /> : null}
          <T s={14} lh={19} col={u ? c.ink : c.ink3} n={1} style={{ flex: 1 }}>{text}</T>
          {pinned ? <Ms n="keep" s={16} col={c.ink3} /> : null}{u ? <Badge n={u} /> : null}
        </Row>
      </View>
    </Tap>
  );
};

/* ---------- Chats list + archive (Chat-S01, F01, A01, A02) ---------- */
const yearOf = (id: string) => byId('academic_years', id);
const currentYear = () => db().academic_years.find(y => y.is_current);
const YearBar = ({ yearId, parity, onParity, inArchive }: any) => (
  <Row gap={10} style={{ paddingHorizontal: 16, paddingTop: 8 }}>
    <Tap onPress={() => openTerm(yearId, inArchive)} label={yearOf(yearId)?.label} style={{ flex: 1.4, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 14, borderRadius: 999, backgroundColor: c.sunken }}>
      <T s={15} w="600">{yearOf(yearId)?.label}</T><Ms n="expand_more" s={20} col={c.ink2} />
    </Tap>
    <View style={{ flex: 1, flexDirection: 'row', gap: 2, padding: 3, height: 44, borderRadius: 999, backgroundColor: c.sunken }}>
      {['even', 'odd'].map(k => <Tap key={k} onPress={() => onParity(k)} label={k} style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999 }, k === parity ? { backgroundColor: c.surface, boxShadow: '0 1px 2px rgba(16,24,40,.14)' } as any : null]}><T s={13} lh={18} v w={k === parity ? '600' : '500'} col={k === parity ? c.ink : c.ink2}>{k === 'even' ? 'Even' : 'Odd'}</T></Tap>)}
    </View>
  </Row>
);
/** Chat-A02-Term */
function openTerm(yearId: string, inArchive?: boolean) {
  openSheet(() => (
    <SheetBody title="Academic year">
      <Grp style={{ marginHorizontal: 0 }}>
        {[...db().academic_years].sort((a, b) => b.label.localeCompare(a.label)).map(y => {
          const sems = where('terms', t => t.year_id === y.id).map(t => t.semester_no).sort();
          return <Li key={y.id} title={y.label} sub={y.is_current ? 'Now' : `Sem ${list(sems.map(String))}`} right={y.id === yearId ? <Ms n="check" col={c.greenText} /> : null} onPress={() => {
            closeSheet();
            if (y.id === yearId) return;
            if (y.is_current) return back();
            (inArchive ? swap : go)('Chat-A01-Archive', { yearId: y.id, parity: 'even' });
          }} />;
        })}
      </Grp>
    </SheetBody>
  ));
}
/** Title only; search is the bar below it, and Archived lives at the end of the list (one way in, not two). */
const Head = () => (
  <Row style={{ minHeight: 52, paddingHorizontal: 20 }}>
    <T v s={22} lh={28}>Chat</T>
  </Row>
);
/** Focus batch (breakout) lives inside a course chat: pick the class, then the students. */
const newBatch = () => {
  const mine = myChats().filter(ch => ch.kind === 'course' && ch.status === 'active' && memberOf(ch.id)?.role === 'faculty');
  if (mine.length === 1) return go('Chat-F13-NewBreakout', { chatId: mine[0].id });
  openSheet(() => (
    <SheetBody title="Which class?">
      {mine.map(ch => <SheetRow key={ch.id} label={chatTitle(ch)} sub={`${division(ch.division_id)?.name} · ${peopleCount(ch.id)} people`} onPress={() => { closeSheet(); go('Chat-F13-NewBreakout', { chatId: ch.id }); }} />)}
    </SheetBody>
  ));
};
/** WhatsApp pattern: one button to a contact list, with New group at the top of it. */
const startNew = () => go('Chat-X01-NewChat');
const ChatsList = () => {
  useData();
  const off = useOffline(), fac = isFaculty(), [f, setF] = useState('All');
  useEffect(() => flushQueue(), [off]);
  const yr = currentYear()?.id, curParity = where('terms', t => t.year_id === yr && t.starts_on <= Date.now() && t.ends_on >= Date.now())[0]?.parity ?? 'odd';
  const recent = (a: any, b: any) => (lastOf(b.id)?.sent_at || b.created_at || 0) - (lastOf(a.id)?.sent_at || a.created_at || 0);
  const mine = myChats().filter(ch => ch.academic_year_id === yr && (ch.kind !== 'dm' || lastOf(ch.id))).sort(recent);
  const total = mine.reduce((n, ch) => n + unread(ch.id), 0);
  const items = ['All', total ? `Unread ${total}` : 'Unread', 'Clubs', 'Courses'];
  const show = mine.filter(ch => f === 'All' || (f === 'Unread' && unread(ch.id)) || (f === 'Clubs' && ch.kind === 'club') || (f === 'Courses' && (ch.kind === 'course' || ch.kind === 'focus_batch')));
  const rows = (xs: any[]) => xs.map((ch, i) => <CRow key={ch.id} ch={ch} sep={i < xs.length - 1} pinned={!fac && ch.kind === 'class_group'} />);
  let content: any;
  if (!mine.length) content = <Empty icon="forum" title="No chats yet" line="Your class group and course chats show up here when the semester starts." action="Start a chat" onAction={() => go('Chat-X01-NewChat')} />;
  else if (!show.length) content = <Empty icon="forum" title={f === 'Unread' ? 'No unread chats' : `No ${f.toLowerCase()} here`} />;
  else content = <>
    {/* One long list, newest first (WhatsApp). Students keep their class group pinned on top. Past terms live behind Archived. */}
    
    {rows(fac ? show : [...show.filter(ch => ch.kind === 'class_group'), ...show.filter(ch => ch.kind !== 'class_group')])}
    {f === 'All' ? <Tap label="Archived chats" onPress={() => go('Chat-A01-Archive')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, marginTop: 8 }}>
      <Ms n="archive" s={16} col={c.ink3} /><T s={13} lh={18} col={c.ink3}>Archived chats from past semesters</T>
    </Tap> : null}
  </>;
  return (
    <Screen>
      <Head />
      <SearchBar placeholder="Search chats, people, files" onPress={() => go('Chat-S05a-SearchStart')} style={{ marginTop: 2 }} />
      <Chips soft items={items} on={items.find(i => i.startsWith(f)) as string} onPick={x => setF(x.split(' ')[0])} style={{ paddingTop: 12, paddingBottom: 8 }} />
      <Body pad={96}>{content}</Body>
      <Fab overTabs round label="New chat" icon="edit_square" onPress={startNew} />
    </Screen>
  );
};
const Archive = ({ route }: any) => {
  useData();
  const yearId = route.params?.yearId ?? 'y2526', parity = route.params?.parity ?? 'even', y = yearOf(yearId);
  const term = where('terms', t => t.year_id === yearId && t.parity === parity)[0];
  const termOf = (ch: any) => byId('terms', byId('offerings', ch.offering_id)?.term_id);
  const chats = myChats().filter(ch => ch.offering_id && termOf(ch)?.id === term?.id).sort((a, b) => (lastOf(b.id)?.sent_at || 0) - (lastOf(a.id)?.sent_at || 0));
  const courses = chats.filter(ch => ch.kind === 'course'), batches = chats.filter(ch => ch.kind === 'focus_batch');
  const open = (ch: any) => () => go('Chat-S04-Past', { chatId: ch.id });
  const toParity = (p: string) => { if (p === parity) return; if (y?.is_current && p === 'odd') return back(); swap('Chat-A01-Archive', { yearId, parity: p }); };
  return (
    <Screen>
      <Row gap={4} style={{ minHeight: 52, paddingRight: 6, paddingLeft: 6 }}>
        <IB n={P.backIcon} label="Back" onPress={back} /><T v s={22} lh={28} style={{ flex: 1 }}>Archived</T>
        <IB n="search" label="Search chats, people, files" onPress={() => go('Chat-S05a-SearchStart')} />
      </Row>
      <YearBar yearId={yearId} parity={parity} onParity={toParity} inArchive />
      <Body pad={24}>
        {!chats.length ? <Empty icon="inventory_2" title={`No chats in ${term ? `Sem ${term.semester_no}` : `${parity === 'even' ? 'the even' : 'the odd'} term`}`} /> : null}
        {courses.length ? <Sec>{`Courses · Sem ${term?.semester_no} · ended`}</Sec> : null}
        {courses.map(ch => <CRow key={ch.id} ch={ch} onPress={open(ch)} />)}
        {batches.length ? <Sec>Focus batches · ended</Sec> : null}
        {batches.map(ch => <CRow key={ch.id} ch={ch} onPress={open(ch)} />)}
      </Body>
    </Screen>
  );
};

/* ---------- Search (Chat-S05a, S05) ---------- */
const Hi = ({ text, q, s = 14, n = 2 }: any) => {
  const i = (text || '').toLowerCase().indexOf(q.toLowerCase());
  if (i < 0 || !q) return <T s={s} lh={19} col={c.ink2} n={n}>{text}</T>;
  return <T s={s} lh={19} col={c.ink2} n={n}>{text.slice(0, i)}<T s={s} lh={19} w="600" col={c.greenText}>{text.slice(i, i + q.length)}</T>{text.slice(i + q.length)}</T>;
};
const Search = ({ route }: any) => {
  useData();
  const [q, setQ] = useState(route.params?.q ?? ''), [f, setF] = useState('Everything');
  const needle = q.trim().toLowerCase(), has = (s?: string) => (s || '').toLowerCase().includes(needle);
  // Every semester you were in, so "that DS file from last sem" is one search away. Past chats open read-only.
  const yr = currentYear()?.id, mine = myChats();
  const isPast = (ch: any) => ch.academic_year_id !== yr || (ch.offering_id && ch.status === 'read_only');
  const openAny = (ch: any, params: any = {}) => (isPast(ch) ? go('Chat-S04-Past', { chatId: ch.id }) : openChat(ch.id, 'Chat', params));
  const recents = where('recent_searches', r => r.user_id === meId()).sort((a, b) => b.created_at - a.created_at).slice(0, 5);
  const dmPeople = mine.filter(ch => ch.kind === 'dm' && !isPast(ch)).map(ch => otherMember(ch.id));
  const recentPeople = [...new Set([...dmPeople, ...db().profiles.filter(p => p.role === 'faculty' && p.id !== meId()).slice(0, 2), profile('p-sara')])].filter(p => p && p.id !== meId()).slice(0, 6);
  const remember = () => { const t = q.trim(); if (t && !recents.some(r => r.query === t)) mut(() => { insert('recent_searches', { user_id: meId(), query: t, created_at: Date.now() }); }); };
  const pick = (fn: () => void) => () => { remember(); fn(); };
  const chats = needle ? mine.filter(ch => has(rowInfo(ch).title) || has(rowInfo(ch).sub)) : [];
  const people = needle ? db().profiles.filter(p => p.id !== meId() && (has(p.full_name) || has(p.roll_number))).sort((a, b) => a.full_name.localeCompare(b.full_name)).slice(0, 12) : [];
  const msgs = needle ? mine.flatMap(ch => chatMessages(ch.id)).filter(m => m.kind !== 'system' && !m.unsent_at && !m.deleted_by && has(m.body)).sort((a, b) => b.sent_at - a.sent_at).slice(0, 15) : [];
  const fileMsgs = mine.flatMap(ch => chatMessages(ch.id)).filter(m => m.resource_id);
  const courseIds = new Set(mine.map(ch => courseOf(ch)?.id).filter(Boolean));
  const inCourses = where('resources', r => !r.removed_at && courseIds.has(byId('folders', r.folder_id)?.course_id));
  const files = needle ? [...new Set([...fileMsgs.map(m => byId('resources', m.resource_id)), ...inCourses])].filter(r => r && !r.removed_at && (has(r.title) || has(byId('files', r.file_id)?.name))).slice(0, 12) : [];
  const see = (k: string) => f === 'Everything' || f === k;
  const none = needle && !chats.length && !people.length && !msgs.length && !files.length;
  const firstCourse = mine.find(ch => ch.kind === 'course' && !isPast(ch));
  return (
    <Screen>
      <Row gap={4} style={{ paddingRight: 8 }}>
        <SearchBar placeholder="Search chats, people, files" value={q} onChange={setQ} autoFocus style={{ flex: 1, marginTop: 6, marginRight: 8 }} />
        <BtnT onPress={back} style={{ marginTop: 6 }}>Cancel</BtnT>
      </Row>
      <Chips soft items={['Everything', 'Chats', 'People', 'Messages', 'Files']} on={f} onPick={setF} style={{ paddingTop: 10 }} />
      <Body pad={24}>
        {!needle ? (
          <>
            {recents.length ? <Sec>Recent searches</Sec> : null}
            {recents.map(r => <Li key={r.query} min={44} left={<Ms n="history" col={c.ink3} />} title={r.query} onPress={() => setQ(r.query)} right={<IB n="close" s={18} label={`Remove ${r.query}`} onPress={() => mut(d => { d.recent_searches.splice(d.recent_searches.indexOf(r), 1); })} />} />)}
            <Sec>Recent people</Sec>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 16, paddingTop: 4 }}>
              {recentPeople.map(p => <Tap key={p.id} onPress={() => openDm(p.id)} label={p.full_name} style={{ width: 64, alignItems: 'center', gap: 6 }}><Pic img={p.img} name={p.full_name} size={48} fac={p.role === 'faculty'} /><T s={12} lh={16} n={2} center>{p.full_name}</T></Tap>)}
            </ScrollView>
          </>
        ) : none ? (
          <Empty icon="search_off" title={`No results for “${q.trim()}”`} line="Nothing in your chats, people or messages, including past semesters." action={firstCourse ? `Search ${courseOf(firstCourse)?.short} files` : undefined} onAction={() => go('Res-S06-Search', { chatId: firstCourse?.id, q: q.trim() })} />
        ) : (
          <>
            <T s={12} lh={17} col={c.ink3} style={{ paddingHorizontal: 16, paddingTop: 10 }}>Searching all your semesters</T>
            {see('Chats') && chats.length ? <Sec>Chats</Sec> : null}
            {see('Chats') ? chats.map(ch => <CRow key={ch.id} ch={ch} onPress={pick(() => openAny(ch))} />) : null}
            {see('People') && people.length ? <Sec>People</Sec> : null}
            {see('People') ? people.map(p => <Li key={p.id} min={60} style={{ paddingHorizontal: 16 }} left={<Pic img={p.img} name={p.full_name} fac={p.role === 'faculty'} />} bold title={p.full_name} sub={`${personLine(p)}${p.roll_number ? ` · Roll ${p.roll_number}` : ''}`} onPress={pick(() => openDm(p.id))} />) : null}
            {see('Messages') && msgs.length ? <Sec>Messages</Sec> : null}
            {see('Messages') ? msgs.map(m => { const ch = byId('chats', m.chat_id); return <Li key={m.id} min={60} style={{ paddingHorizontal: 16 }} left={chatPic(ch)} bold title={rowInfo(ch).title} sub={rowInfo(ch).sub} sub2={<Hi text={`${m.sender_id === meId() ? '' : `${profile(m.sender_id)?.full_name}: `}${m.body}`} q={q.trim()} />} right={<T s={12} col={c.ink3}>{fmtRow(m.sent_at)}</T>} onPress={pick(() => openAny(ch, { messageId: m.id }))} />; }) : null}
            {see('Files') && files.length ? <Sec>Files</Sec> : null}
            {see('Files') ? files.map(r => { const fl = byId('files', r.file_id); return <Li key={r.id} min={60} style={{ paddingHorizontal: 16 }} left={<Fi l n={fileIcon(fl?.mime, r.kind)} />} title={<Hi text={fl?.name || r.title} q={q.trim()} s={15} n={1} />} sub={fl ? fileMeta(fl) : r.link_provider} onPress={pick(() => go('Chat-R01-File', { resourceId: r.id }))} />; }) : null}
          </>
        )}
      </Body>
    </Screen>
  );
};

/* ---------- New chat, new group (Chat-X01, X02) ---------- */
const myPeople = () => {
  const divs = isFaculty() ? [...new Set(where('offering_faculty', f => f.faculty_id === meId()).map(f => byId('offerings', f.offering_id)?.division_id))] : where('division_members', m => m.student_id === meId()).map(m => m.division_id);
  const seen = new Set<string>();
  return divs.flatMap(dv => where('division_members', m => m.division_id === dv).map(m => ({ p: profile(m.student_id), dv }))).filter(({ p }) => p && p.id !== meId() && !seen.has(p.id) && seen.add(p.id));
};
const findPeople = (q: string) => {
  const n = q.toLowerCase();
  return db().profiles.filter(p => p.id !== meId() && (p.full_name.toLowerCase().includes(n) || (p.roll_number || '').includes(n) || (byId('departments', p.department_id)?.name || '').toLowerCase().includes(n))).slice(0, 30);
};
const NewChat = () => {
  useData();
  const [q, setQ] = useState('');
  const recent = myChats().filter(ch => ch.kind === 'dm' && lastOf(ch.id)).sort((a, b) => lastOf(b.id).sent_at - lastOf(a.id).sent_at).map(ch => otherMember(ch.id)).filter(Boolean).slice(0, 3);
  const rest = myPeople().filter(({ p }) => !recent.includes(p)).slice(0, 30);
  const row = (p: any, sub?: string) => <Li key={p.id} min={64} style={{ paddingHorizontal: 16 }} left={<Pic img={p.img} name={p.full_name} fac={p.role === 'faculty'} />} bold title={p.full_name} sub={sub ?? personLine(p)} onPress={() => openDm(p.id)} />;
  return (
    <Screen>
      <Hdr title="New chat" />
      <SearchBar placeholder="Name, roll number or department" value={q} onChange={setQ} style={{ marginTop: 2 }} />
      <Body pad={24}>
        {q.trim() ? (
          <>{findPeople(q.trim()).map(p => row(p, `${personLine(p)}${p.roll_number ? ` · Roll ${p.roll_number}` : ''}`))}{!findPeople(q.trim()).length ? <Empty icon="search_off" title={`No results for “${q.trim()}”`} /> : null}</>
        ) : (
          <>
            {isFaculty() ? <Li min={64} style={{ paddingHorizontal: 16, marginTop: 4 }} left={<View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center' }}><Ms n="group_add" s={22} fill col={c.onFill} /></View>} bold title="New group" sub="Students and faculty you pick" onPress={() => go('Chat-X02-NewGroup')} />
              : <T s={12} lh={17} col={c.ink3} style={{ paddingHorizontal: 16, paddingTop: 8 }}>Groups are made by faculty. Ask your teacher if your team needs one.</T>}
            {isFaculty() ? <Li min={64} style={{ paddingHorizontal: 16 }} left={<View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center' }}><Ms n="filter_center_focus" s={22} col={c.onFill} /></View>} bold title="New focus batch" sub="A breakout group inside one of your classes" onPress={newBatch} /> : null}
            {recent.length ? <Sec>Recent</Sec> : null}{recent.map(p => row(p))}
            <Sec>{isFaculty() ? 'Your students' : 'Your classmates'}</Sec>
            {rest.map(({ p }) => row(p, `${p.class_label} · ${division(where('division_members', m => m.student_id === p.id)[0]?.division_id)?.name} · Roll ${p.roll_number}`))}
          </>
        )}
      </Body>
    </Screen>
  );
};
function createGroup(name: string, ids: string[], img: string | null = null) {
  const id = newId('group'), now = Date.now();
  mut(() => {
    insert('chats', { id, kind: 'group', name, img, status: 'active', who_can_send: 'everyone', students_can_poll: false, students_can_share_files: true, academic_year_id: currentYear()?.id, created_by: meId(), created_at: now });
    [meId(), ...ids].forEach(user_id => insert('chat_members', { chat_id: id, user_id, role: user_id === meId() ? 'admin' : 'member', notify: 'every', muted: false, last_read_at: now, joined_at: now, left_at: null }));
    ids.forEach(u => notify(u, 'group_added', { chat_id: id }));
  });
  sendMessage({ chatId: id, kind: 'system', body: `{who} made ${name}` });
  return id;
}
const YEARS = ['FE', 'SE', 'TE', 'BE'];
const divOfStudent = (id: string) => where('division_members', m => m.student_id === id)[0]?.division_id;
/** Last step: photo + name, like WhatsApp's "New group" page. */
const NameGroup = ({ ids }: any) => {
  const [name, setName] = useState(''), [img, setImg] = useState<string | null>(null);
  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1] });
    if (r.canceled) return;
    const uri = r.assets[0].uri; IMG[uri] = { uri }; setImg(uri);
  };
  return (
    <SheetBody title="Almost there" sub={`${ids.length} people and you`}>
      <Row gap={14}>
        <Tap label={img ? 'Change group photo' : 'Add group photo'} onPress={pick} style={{ width: 64, height: 64, borderRadius: 18, overflow: 'hidden', borderWidth: img ? 0 : 1.5, borderColor: c.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
          {img ? <Pic img={img} name={name} size={64} shape="course" /> : <Ms n="add_a_photo" s={24} col={c.greenText} />}
        </Tap>
        <View style={{ flex: 1, gap: 4 }}>
          <Field autoFocus value={name} onChangeText={setName} placeholder="Group name, e.g. Final year project" maxLength={40} />
          <T s={11} lh={15} col={c.ink3}>{img ? 'Tap the photo to change it' : 'Photo is optional. You can change both later.'}</T>
        </View>
      </Row>
      <BtnP disabled={!name.trim()} style={{ marginTop: 16 }} onPress={() => { closeSheet(); openChat(createGroup(name.trim(), ids, img)); }}>Create group</BtnP>
    </SheetBody>
  );
};
/** One filter: tap opens a sheet of options, "All" clears it. */
const FilterChip = ({ label, all, value, options, onPick }: { label: string; all: string; value: string | null; options: [string, string][]; onPick: (v: string | null) => void }) => (
  <Tap label={`${label}: ${value ? options.find(o => o[0] === value)?.[1] : all}`} onPress={() => openSheet(() => (
    <SheetBody title={label}>
      <SheetRow label={all} onPress={() => { onPick(null); closeSheet(); }} right={!value ? <Ms n="check" col={c.greenText} /> : null} />
      {options.map(([v, l]) => <SheetRow key={v} label={l} onPress={() => { onPick(v); closeSheet(); }} right={value === v ? <Ms n="check" col={c.greenText} /> : null} />)}
    </SheetBody>
  ))} style={{ height: 36, paddingLeft: 14, paddingRight: 8, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: value ? c.greenWash : c.surface, borderWidth: 1, borderColor: value ? c.green : c.line }}>
    <T s={13} lh={18} w="500" col={value ? c.greenText : c.ink2} n={1}>{value ? options.find(o => o[0] === value)?.[1] : all}</T>
    <Ms n="expand_more" s={18} col={value ? c.greenText : c.ink3} />
  </Tap>
);
/** Chat-X02-NewGroup. With chatId it adds people to that group instead (same picker, same filters). */
const NewGroup = ({ route }: any) => {
  useData();
  const into = route.params?.chatId ? byId('chats', route.params.chatId) : null;
  const addTo = () => {
    const names = ids.map(u => profile(u)?.full_name);
    mut(() => ids.forEach(user_id => {
      const old = db().chat_members.find(m => m.chat_id === into.id && m.user_id === user_id);
      if (old) old.left_at = null;
      else insert('chat_members', { chat_id: into.id, user_id, role: 'member', notify: 'every', muted: false, last_read_at: Date.now(), joined_at: Date.now(), left_at: null });
      notify(user_id, 'group_added', { chat_id: into.id });
    }));
    sendMessage({ chatId: into.id, kind: 'system', body: `{who} added ${names.length > 3 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} others` : names.join(', ')}` });
    back(); toast(ids.length === 1 ? `${names[0]} added` : `${ids.length} people added`);
  };
  const [who, setWho] = useState('Students'), [q, setQ] = useState(''), [ids, setIds] = useState<string[]>([]);
  const [only, setOnly] = useState(false), [pg, setPg] = useState<string | null>(null), [yr, setYr] = useState<string | null>(null), [dv, setDv] = useState<string | null>(null);
  const same = ids.length && !into ? myChats().find(ch => ch.kind === 'group' && members(ch.id).length === ids.length + 1 && ids.every(u => memberOf(ch.id, u))) : null;
  const n = q.trim().toLowerCase();
  const hit = (p: any) => !n || p.full_name.toLowerCase().includes(n) || (p.roll_number || '').includes(n);
  // Division options follow the programme and year picked before them.
  const divs = where('divisions', d => (!pg || d.programme_id === pg) && (!yr || d.year_of_study === YEARS.indexOf(yr) + 1));
  const pool = only ? ids.map(u => profile(u)).filter(p => p && hit(p)) : who === 'Students'
    ? where('profiles', p => p.role === 'student' && p.id !== meId() && !(into && memberOf(into.id, p.id)) && (!pg || p.programme_id === pg) && (!yr || p.year_of_study === YEARS.indexOf(yr) + 1) && (!dv || divOfStudent(p.id) === dv) && hit(p))
    : where('profiles', p => p.role === 'faculty' && p.id !== meId() && !(into && memberOf(into.id, p.id)) && (!pg || p.department_id === byId('programmes', pg)?.department_id) && hit(p));
  const allOn = pool.length > 0 && pool.every(p => ids.includes(p.id));
  const flip = (id: string) => setIds(xs => { const nx = xs.includes(id) ? xs.filter(x => x !== id) : [...xs, id]; if (!nx.length) setOnly(false); return nx; });
  const flipAll = () => setIds(xs => allOn ? xs.filter(x => !pool.some(p => p.id === x)) : [...new Set([...xs, ...pool.map(p => p.id)])]);
  const line = (p: any) => p.role === 'faculty' ? personLine(p) : [p.class_label, division(divOfStudent(p.id))?.name, p.roll_number && `Roll ${p.roll_number}`].filter(Boolean).join(' · ');
  const setProg = (v: string | null) => { setPg(v); setDv(null); };
  const setYear = (v: string | null) => { setYr(v); setDv(null); };
  return (
    <Screen>
      <Hdr title={into ? `Add to ${into.name}` : 'New group'} sub={ids.length ? `${ids.length} selected` : into ? 'Pick who to add' : 'Pick who’s in it'} />
      <Seg items={['Students', 'Faculty']} on={who} onPick={w => { setWho(w); setDv(null); setYr(null); }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, alignItems: 'center' }}>
        {ids.length ? <Tap label={only ? 'Show everyone' : `Show the ${ids.length} selected`} onPress={() => setOnly(o => !o)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: only ? c.ink : c.surface, borderWidth: 1, borderColor: only ? c.ink : c.line }}><Ms n="check_circle" s={16} col={only ? c.onFill : c.greenText} /><T s={13} lh={18} w="500" col={only ? c.onFill : c.ink2}>{`Selected · ${ids.length}`}</T></Tap> : null}
        {only ? null : <>
        <FilterChip label={who === 'Students' ? 'Programme' : 'Department'} all={who === 'Students' ? 'All programmes' : 'All departments'} value={pg} options={where('programmes', () => true).map(x => [x.id, x.name])} onPick={setProg} />
        {who === 'Students' ? <FilterChip label="Year" all="All years" value={yr} options={YEARS.map(y => [y, y])} onPick={setYear} /> : null}
        {who === 'Students' && divs.length ? <FilterChip label="Division" all="All divisions" value={dv} options={divs.map(d => [d.id, `${d.class_label} · ${d.name}`])} onPick={setDv} /> : null}
        </>}
      </ScrollView>
      <SearchBar placeholder={who === 'Students' ? 'Name or roll number' : 'Name'} value={q} onChange={setQ} style={{ marginTop: 10 }} />
      {same ? (
        <Card style={{ marginHorizontal: 16, marginBottom: 4, padding: 14, gap: 12 }}>
          <Row gap={12}>{chatPic(same, 36)}<View style={{ flex: 1 }}><T s={15} lh={20}>{same.name}</T><T s={12} lh={16} col={c.ink3}>{`Same ${ids.length} people and you`}</T></View></Row>
          <BtnS onPress={() => openChat(same.id)}>{`Open ${same.name}`}</BtnS>
        </Card>
      ) : null}
      <Body pad={ids.length ? 90 : 24}>
        {!pool.length ? <Empty icon="person_search" title="Nobody matches" line="Try fewer filters." /> : only ? null : pg || yr || dv || n ? <Li min={52} style={{ paddingHorizontal: 16 }} left={<Ck sq on={allOn} />} title={allOn ? `All ${pool.length} selected` : `Select all ${pool.length}`} sub="Everyone matching these filters" onPress={flipAll} /> : who === 'Students' ? <T s={12} lh={17} col={c.ink3} style={{ paddingHorizontal: 16, paddingVertical: 8 }}>Filter by programme, year or division to add a whole class at once.</T> : null}
        {pool.slice(0, 150).map(p => <Li key={p.id} min={60} style={{ paddingHorizontal: 16 }} left={<Ck on={ids.includes(p.id)} />} title={<Row gap={12}><Pic img={p.img} name={p.full_name} size={36} fac={p.role === 'faculty'} /><View style={{ flex: 1 }}><T s={15} lh={20} n={1}>{p.full_name}</T><T s={12} lh={16} col={c.ink3} n={1}>{line(p)}</T></View></Row>} onPress={() => flip(p.id)} />)}
        {pool.length > 150 ? <T s={12} lh={17} col={c.ink3} center style={{ padding: 16 }}>{`Showing 150 of ${pool.length}. Filter or search to narrow it down. Select all still adds all ${pool.length}.`}</T> : null}
      </Body>
      {ids.length ? <View style={{ position: 'absolute', left: 16, right: 16, bottom: 28 }}>{into ? <BtnP icon="person_add" onPress={addTo}>{`Add ${ids.length} ${ids.length === 1 ? 'person' : 'people'}`}</BtnP> : <BtnP icon="arrow_forward" onPress={() => openSheet(() => <NameGroup ids={ids} />)}>{`Next · ${ids.length} ${ids.length === 1 ? 'person' : 'people'}`}</BtnP>}</View> : null}
    </Screen>
  );
};

/* ---------- Composer state and sending ---------- */
const useComposer = (rootId?: string, privateId?: string, slide?: any) => {
  const [text, setText] = useState(''), [atts, setAtts] = useState<any[]>([]), [quote, setQuote] = useState<any>(null), [priv, setPriv] = useState<any>(privateId ? byId('messages', privateId) : null), [edit, setEdit] = useState<any>(null), [also, setAlso] = useState(false), [sl, setSl] = useState(slide ?? null);
  const input = useRef<any>(null);
  const clear = () => { setText(''); setAtts([]); setQuote(null); setPriv(null); setEdit(null); setSl(null); };
  return { text, setText, atts, setAtts, quote, setQuote, priv, setPriv, edit, setEdit, also, setAlso, sl, setSl, input, clear, rootId, focus: () => setTimeout(() => input.current?.focus(), 250) };
};
const ensureShare = (rid: string, ch: any) => {
  if (ch.offering_id && !where('resource_shares', s => s.resource_id === rid && s.offering_id === ch.offering_id).length) mut(() => { insert('resource_shares', { resource_id: rid, offering_id: ch.offering_id, shared_at: Date.now(), shared_by: meId() }); });
};
const sendOut = (ch: any, cp: any, targets: any[] = [ch], when?: number) => {
  const body = cp.text.trim();
  if (!body && !cp.atts.length) return;
  if (cp.edit) {
    mut(() => { cp.edit.body = body; cp.edit.edited_at = Date.now(); });
    cp.clear(); return;
  }
  const extra: any = { send_group_id: targets.length > 1 || when ? newId('sg') : undefined, scheduled_for: when, quote_message_id: cp.quote?.id, private_reply_of_id: cp.priv?.id, thread_root_id: cp.rootId, also_sent_to_chat: cp.rootId ? cp.also : undefined, slide_no: cp.sl?.no, slide_title: cp.sl?.title };
  for (const t of targets) {
    if (!cp.atts.length) sendMessage({ chatId: t.id, body, ...extra });
    cp.atts.forEach((a: any, i: number) => {
      const text = i === 0 ? body : '';
      if (a.link) return sendMessage({ chatId: t.id, kind: 'link', body: text, link_url: a.link.url, link_title: a.link.title, link_provider: a.link.provider, ...extra });
      const rid = a.resource_id ?? fileFromPhone(t.id, a.file);
      if (a.resource_id) ensureShare(rid, t);
      sendMessage({ chatId: t.id, kind: 'file', body: text, resource_id: rid, ...extra });
    });
  }
  cp.clear();
};
const removeMsgs = (ids: string[]) => mut(d => { d.messages = d.messages.filter(m => !ids.includes(m.id)); d.message_receipts = d.message_receipts.filter(r => !ids.includes(r.message_id)); });
/** ChatTabs on screen, so Chat-F05R can drop picks into the right composer. */
const composers: Record<string, any> = {};

/* ---------- Sheets: + (F04, S18), send options (F05, F08), scheduled (F23), poll (P01), duplicate (F06), link ---------- */
const Tile = ({ icon, label, onPress }: any) => <ActionTile icon={icon} label={label} onPress={onPress} />;
const addPhone = (ch: any, cp: any, fl: any) => {
  const cid = courseOf(ch)?.id;
  // ponytail: duplicate check by file name within the course; sha256 needs a hashing module or the backend.
  const dup = cid && isFaculty() ? where('resources', r => !r.removed_at && byId('folders', r.folder_id)?.course_id === cid && byId('folders', r.folder_id)?.academic_year_id === ch.academic_year_id && byId('files', r.file_id)?.name === fl.name)[0] : null;
  if (!dup) return cp.setAtts((xs: any[]) => [...xs, { file: fl }]);
  openSheet(() => <Duplicate r={dup} ch={ch} cp={cp} fl={fl} />);
};
const whereItIs = (r: any, ch: any) => {
  const fo = byId('folders', r.folder_id), f = byId('files', r.file_id);
  const shared = where('resource_shares', s => s.resource_id === r.id).map(s => division(byId('offerings', s.offering_id)?.division_id)?.name).filter(Boolean);
  return `In ${courseOf(ch)?.short} resources › ${fo?.name}${r.created_at || f?.created_at ? ` since ${fmtShort(r.created_at || f.created_at)}` : ''}${shared.length ? ` · shared in ${list(shared)}` : ''}`;
};
const Duplicate = ({ r, ch, cp, fl }: any) => (
  <SheetBody title="You already have this">
    <Row gap={12} style={{ marginBottom: 16 }}><Fi n={fileIcon(fl.mime)} /><View style={{ flex: 1 }}><T s={15} lh={20} n={1}>{fl.name}</T><T s={12} lh={16} col={c.ink3}>{whereItIs(r, ch)}</T></View></Row>
    <View style={{ gap: 8 }}>
      <BtnP onPress={() => { closeSheet(); cp.setAtts((xs: any[]) => [...xs, { resource_id: r.id }]); }}>Use the one in Hive</BtnP>
      <BtnS onPress={() => { closeSheet(); go('Res-F08-Replace', { resourceId: r.id, chatId: ch.id }); }}>Upload new version</BtnS>
      <BtnS onPress={() => { closeSheet(); cp.setAtts((xs: any[]) => [...xs, { file: fl }]); }}>Keep both</BtnS>
    </View>
  </SheetBody>
);
const LinkSheet = ({ cp }: any) => {
  const [u, setU] = useState('');
  const add = () => {
    const url = /^https?:\/\//.test(u.trim()) ? u.trim() : `https://${u.trim()}`, provider = url.replace(/^https?:\/\//, '').split('/')[0];
    cp.setAtts((xs: any[]) => [...xs, { link: { url, title: u.trim(), provider } }]); closeSheet();
  };
  return <SheetBody title="Add a link"><Row gap={4}><Field autoFocus value={u} onChangeText={setU} placeholder="Paste a link" autoCapitalize="none" autoCorrect={false} keyboardType="url" style={{ flex: 1 }} /><PasteBtn onPaste={setU} /></Row><BtnP disabled={!u.trim()} style={{ marginTop: 16 }} onPress={add}>Add link</BtnP></SheetBody>;
};
const shareStatus = (r: any, ch: any) => {
  const sh = where('resource_shares', s => s.resource_id === r.id), here = sh.find(s => s.offering_id === ch.offering_id);
  if (here) return { text: `Shared here · ${fmtShort(here.shared_at)}`, green: true };
  return { text: sh.length ? `Not here yet · in ${division(byId('offerings', sh[0].offering_id)?.division_id)?.name}` : 'Not shared yet' };
};
const courseResources = (ch: any) => { const cr = courseOf(ch); return cr ? courseFolders(cr.id, ch.academic_year_id).flatMap((f: any) => resourcesIn(f.id)).filter((r: any) => !r.removed_at && r.kind !== 'link') : []; };
const PlusSheet = ({ ch, cp }: any) => {
  const fac = isFaculty(), cr = courseOf(ch), mod = canModerate(ch);
  const recents = fac && cr ? [...courseResources(ch)].sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, 3) : [];
  const [ids, setIds] = useState<string[]>([]);
  const pick = (src: 'camera' | 'photos' | 'file') => async () => { closeSheet(); (await pickFiles(src)).forEach(p => addPhone(ch, cp, p)); };
  const canPoll = fac ? mod : ch.students_can_poll || mod;
  return (
    <SheetBody title="Add to chat">
      {recents.length ? (
        <>
          <Row style={{ marginTop: 2, alignItems: 'baseline' }}><T s={13} lh={18} w="600" col={c.ink2} style={{ flex: 1 }}>{`Your ${cr.short} resources`}</T><BtnT style={{ minHeight: 32 }} onPress={() => { closeSheet(); go('Chat-F05R-Resources', { chatId: ch.id }); }}>Browse all</BtnT></Row>
          {recents.map(r => {
            const f = byId('files', r.file_id), s = shareStatus(r, ch), on = ids.includes(r.id);
            return <Tap key={r.id} label={f?.name} onPress={() => setIds(on ? ids.filter(x => x !== r.id) : [...ids, r.id])} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8 }}><Ck sq on={on} /><Fi n={fileIcon(f?.mime)} /><View style={{ flex: 1 }}><T s={15} lh={20} n={1}>{f?.name}</T><T s={12} lh={16} n={1} col={s.green ? c.greenText : c.ink3}>{s.text}</T></View></Tap>;
          })}
        </>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: recents.length ? 8 : 0, paddingTop: recents.length ? 8 : 0, borderTopWidth: recents.length ? 1 : 0, borderTopColor: c.line }}>
        <Tile icon="photo_camera" label="Camera" onPress={pick('camera')} />
        <Tile icon="photo_library" label="Photos" onPress={pick('photos')} />
        <Tile icon="description" label="File" onPress={pick('file')} />
        <Tile icon="document_scanner" label="Scan" onPress={pick('camera')} />
        <Tile icon="add_to_drive" label="Drive" onPress={pick('file')} />
        <Tile icon="link" label="Link" onPress={() => swapSheet(() => <LinkSheet cp={cp} />)} />
        {canPoll ? <Tile icon="ballot" label="Poll" onPress={() => swapSheet(() => <PollSheet ch={ch} />)} /> : null}
        {fac && ch.kind === 'course' ? <Tile icon="filter_center_focus" label="Focus batch" onPress={() => { closeSheet(); go('Chat-F13-NewBreakout', { chatId: ch.id }); }} /> : null}
      </View>
      {ids.length ? <BtnP style={{ marginTop: 12 }} onPress={() => { closeSheet(); cp.setAtts((xs: any[]) => [...xs, ...ids.map(resource_id => ({ resource_id }))]); }}>{`Add ${ids.length} file${ids.length > 1 ? 's' : ''}`}</BtnP> : null}
    </SheetBody>
  );
};
const QuoteBox = ({ head, text }: any) => (
  <View style={{ padding: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: c.sunken, marginBottom: 6 }}>
    <T s={12} lh={17} w="600" col={c.greenText}>{head}</T>
    <T s={13} lh={18} col={c.ink2} n={2}>{text}</T>
  </View>
);
const OtherDivs = ({ ch, cp }: any) => {
  const others = otherDivs(ch), cr = courseOf(ch);
  const extras = myChats().filter(x => x.status === 'active' && x.id !== ch.id && !others.includes(x) && x.kind !== 'dm' && (isFaculty() ? memberOf(x.id)?.role !== 'member' : true) && courseOf(x)?.id !== cr?.id);
  const [on, setOn] = useState<string[]>([]), [when, setWhen] = useState('now'), [picked, setPicked] = useState<number | null>(null), [more, setMore] = useState(false);
  const chosen = [ch, ...[...others, ...extras].filter(x => on.includes(x.id))];
  const n = chosen.length, names = chosen.map(x => (x.kind === 'course' && courseOf(x)?.id === cr?.id) ? divOf(x)?.name : chatLabel(x));
  const t = when === 'tom' ? tomorrow9() : when === 'mon' ? nextMonday9() : picked;
  const cta = when === 'now' ? `Send to ${list(names)}` : `Schedule for ${n} chat${n > 1 ? 's' : ''}${t ? ` · ${fmtWhen(t)}` : ''}`;
  const flip = (id: string) => setOn(xs => xs.includes(id) ? xs.filter(x => x !== id) : [...xs, id]);
  const row = (x: any, sub: string, title: string) => <Tap key={x.id} label={title} onPress={() => flip(x.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8 }}>{chatPic(x, 36)}<View style={{ flex: 1 }}><T s={15} lh={20} n={1}>{title}</T><T s={12} lh={16} col={c.ink3} n={1}>{sub}</T></View><Ck on={on.includes(x.id)} /></Tap>;
  const go2 = () => { closeAllSheets(); sendOut(ch, cp, chosen, when === 'now' ? undefined : (t as number)); toast(when === 'now' ? `Sent to ${list(names)}` : `Scheduled · ${fmtWhen(t as number)}`); };
  return (
    <SheetBody title="Send to other divisions">
      <QuoteBox head={`From ${chatLabel(ch)}`} text={[cp.text.trim(), cp.atts.length ? `${cp.atts.length} file${cp.atts.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')} />
      <T s={13} lh={18} w="600" col={c.ink2} style={{ marginTop: 10, marginBottom: 2 }}>{`Other ${cr?.short} divisions`}</T>
      {others.map(x => row(x, `${divOf(x)?.class_label} · ${peopleCount(x.id)}`, divOf(x)?.name))}
      <Row gap={12} style={{ minHeight: 52, paddingVertical: 8 }}>{chatPic(ch, 36)}<View style={{ flex: 1 }}><T s={15} lh={20}>{divOf(ch)?.name}</T><T s={12} lh={16} col={c.ink3}>This chat · included</T></View><Ck on /></Row>
      {more ? extras.map(x => row(x, rowInfo(x).sub, rowInfo(x).title)) : extras.length ? <BtnT icon="add" onPress={() => setMore(true)}>Add a chat from another course</BtnT> : null}
      <T s={13} lh={18} w="600" col={c.ink2} style={{ marginTop: 10, marginBottom: 8 }}>When</T>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {[['now', 'Now'], ['tom', 'Tomorrow, 9 am'], ['mon', 'Next Monday, 9 am'], ['pick', picked ? fmtWhen(picked) : 'Pick date and time']].map(([k, label]) => (
          <Tap key={k} label={label} onPress={() => { if (k === 'pick') pickDateTime(picked || tomorrow9(), v => { setPicked(v); setWhen('pick'); }); else setWhen(k); }} style={{ height: 32, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: when === k ? c.greenWash : c.sunken }}><T s={13} lh={18} w={when === k ? '600' : '500'} col={when === k ? c.greenText : c.ink2}>{label}</T></Tap>
        ))}
      </Row>
      <BtnP disabled={when !== 'now' && !t} style={{ marginTop: 16 }} onPress={go2}>{cta}</BtnP>
    </SheetBody>
  );
};
function openSendOptions(ch: any, cp: any) {
  const sched = (t: number) => { closeAllSheets(); sendOut(ch, cp, [ch], t); toast(`Scheduled · ${fmtWhen(t)}`); };
  openSheet(() => (
    <SheetBody>
      {otherDivs(ch).length ? <SheetRow label="Send to other divisions" right={<Ms n="forward_to_inbox" col={c.ink2} />} onPress={() => swapSheet(() => <OtherDivs ch={ch} cp={cp} />)} /> : null}
      <SheetRow label="Schedule" right={<Ms n="schedule_send" col={c.ink2} />} onPress={() => { closeSheet(); openSchedule({ onPick: sched }); }} />
      <SheetRow label="Send now" right={<Ms n="send" col={c.ink2} />} onPress={() => { closeSheet(); sendOut(ch, cp); }} />
    </SheetBody>
  ));
}
const scheduledIn = (chatId: string) => where('messages', m => m.chat_id === chatId && m.scheduled_for && m.sender_id === meId()).sort((a, b) => a.scheduled_for - b.scheduled_for);
const groupRows = (m: any) => m.send_group_id ? where('messages', x => x.send_group_id === m.send_group_id && x.scheduled_for) : [m];
const ScheduledSheet = ({ chatId }: any) => {
  useData();
  const [editing, setEditing] = useState<any>(null), [val, setVal] = useState('');
  const rows = scheduledIn(chatId);
  useEffect(() => { if (!rows.length) closeSheet(); }, [rows.length]);
  if (!rows.length) return <SheetBody title="Nothing scheduled" />;
  return (
    <SheetBody title={`${rows.length} scheduled message${rows.length > 1 ? 's' : ''}`}>
      {rows.map(m => {
        const grp = groupRows(m), r = byId('resources', m.resource_id), names = grp.map(x => { const ch = byId('chats', x.chat_id); return ch.kind === 'course' ? divOf(ch)?.name : chatLabel(ch); });
        if (editing === m.id) return (
          <View key={m.id} style={{ gap: 8, marginBottom: 12 }}>
            <Field multiline value={val} onChangeText={setVal} style={{ paddingVertical: 10 }} />
            <Row gap={8}><Pill onPress={() => { mut(() => grp.forEach(x => { x.body = val; })); setEditing(null); }}>Save changes</Pill><Pill onPress={() => setEditing(null)}>Cancel</Pill></Row>
          </View>
        );
        return (
          <View key={m.id} style={{ gap: 2, marginBottom: 14 }}>
            <T s={12} lh={16} col={c.ink3}>{`${fmtWhen(m.scheduled_for)} · ${list(names)}`}</T>
            <T s={15} lh={20}>{m.body}</T>
            {r ? <T s={12} lh={16} col={c.ink3}>{byId('files', r.file_id)?.name}</T> : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8, paddingHorizontal: 2 }}>
              <Pill onPress={() => { setVal(m.body); setEditing(m.id); }}>Edit</Pill>
              <Pill onPress={() => openSchedule({ title: 'Change time', value: m.scheduled_for, onPick: t => mut(() => grp.forEach(x => { x.scheduled_for = t; x.sent_at = t; })) })}>Change time</Pill>
              <Pill onPress={() => { grp.forEach(fireScheduled); toast('Sent'); }}>Send now</Pill>
              <Pill onPress={() => { const copy = grp.map(x => ({ ...x })); removeMsgs(grp.map(x => x.id)); toast('Scheduled message deleted', () => mut(d => { d.messages.push(...copy); })); }}>Delete</Pill>
            </ScrollView>
          </View>
        );
      })}
    </SheetBody>
  );
};
const PollSheet = ({ ch }: any) => {
  const [q, setQ] = useState(''), [opts, setOpts] = useState(['', '']), [multi, setMulti] = useState(false), [names, setNames] = useState(false);
  const clean = opts.map(o => o.trim()).filter(Boolean);
  const send = () => {
    const id = newId('poll');
    mut(() => { insert('polls', { id, question: q.trim(), multi_answer: multi, names_visible: names, closed_at: null }); clean.forEach((text, sort) => insert('poll_options', { id: newId('po'), poll_id: id, text, sort })); });
    const mid = sendMessage({ chatId: ch.id, kind: 'poll', poll_id: id });
    mut(() => { byId('polls', id).message_id = mid; });
    closeSheet();
  };
  return (
    <SheetBody title="New poll">
      <T s={13} lh={18} w="600" col={c.ink2} style={{ marginBottom: 8 }}>Question</T>
      <Field value={q} onChangeText={setQ} placeholder="Ask something" />
      <T s={13} lh={18} w="600" col={c.ink2} style={{ marginTop: 16, marginBottom: 8 }}>Options</T>
      <View style={{ gap: 8 }}>
        {opts.map((o, i) => <View key={i}><Field value={o} onChangeText={v => setOpts(opts.map((x, j) => j === i ? v : x))} placeholder={`Option ${i + 1}`} style={{ paddingRight: 44 }} />{opts.length > 2 ? <IB n="close" s={18} label="Remove option" onPress={() => setOpts(opts.filter((_, j) => j !== i))} style={{ position: 'absolute', right: 2, top: 2 }} /> : null}</View>)}
      </View>
      <BtnT icon="add" onPress={() => setOpts([...opts, ''])}>Add option</BtnT>
      <Row gap={12} style={{ minHeight: 48 }}><T s={15} style={{ flex: 1 }}>Allow more than one answer</T><Sw on={multi} onChange={setMulti} label="Allow more than one answer" /></Row>
      <Row gap={12} style={{ minHeight: 48 }}><T s={15} style={{ flex: 1 }}>Students see who voted</T><Sw on={names} onChange={setNames} label="Students see who voted" /></Row>
      <BtnP disabled={!q.trim() || clean.length < 2} style={{ marginTop: 12 }} onPress={send}>Send poll</BtnP>
    </SheetBody>
  );
};

/* ---------- Hold sheets (F09, F09b, S20, S02 hold) and what they open (F19, F20, F21, F24, F27, emoji) ---------- */
const toggleRx = (mid: string, emoji: string) => mut(d => {
  const i = d.message_reactions.findIndex(r => r.message_id === mid && r.user_id === meId() && r.emoji === emoji);
  if (i >= 0) d.message_reactions.splice(i, 1); else d.message_reactions.push({ message_id: mid, user_id: meId(), emoji });
});
const snippet = (m: any) => m.body || byId('resources', m.resource_id)?.title || (m.kind === 'poll' ? byId('polls', m.poll_id)?.question : m.kind === 'buzz_card' ? byId('buzz_posts', m.buzz_post_id)?.title : m.link_title) || '';
const EMOJI = ['👍', '❤️', '😂', '😮', '🙏', '👏', '🔥', '🎉', '😊', '😢', '😅', '🤔', '💯', '✅', '🙌', '😎', '🥳', '😍', '👀', '💡', '📌', '📚', '✏️', '⏰'];
const EmojiSheet = ({ m }: any) => (
  <SheetBody title="More reactions">
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {EMOJI.map(e => <Tap key={e} label={e} onPress={() => { closeSheet(); toggleRx(m.id, e); }} style={{ width: '16.66%', height: 52, alignItems: 'center', justifyContent: 'center' }}><T s={26} lh={32}>{e}</T></Tap>)}
    </View>
  </SheetBody>
);
const Choice = ({ on, label, onPress }: any) => <Tap label={label} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}><Ck on={on} /><T s={15} lh={20} style={{ flex: 1 }}>{label}</T></Tap>;
const REASONS = ['Harassment or bullying', 'Personal information shared', 'Inappropriate content', 'Spam', 'Something else'];
const ReportSheet = ({ m, ch }: any) => {
  const [why, setWhy] = useState<string | null>(null), who = profile(m.sender_id);
  const send = () => {
    const before = chatMessages(ch.id).filter(x => x.sent_at <= m.sent_at && x.id !== m.id).slice(-5).map(x => x.id);
    mut(d => { d.reports.push({ id: newId('rep'), message_id: m.id, reporter_id: meId(), reason: why, context_ids: before, status: 'open', created_at: Date.now() }); m.hidden_for = [...(m.hidden_for || []), meId()]; });
    closeSheet(); toast('Report sent to your college admin');
  };
  return (
    <SheetBody title="Report message">
      <QuoteBox head={`${who?.full_name} · ${chatLabel(ch)}`} text={snippet(m)} />
      <T s={13} lh={18} w="600" col={c.ink2} style={{ marginTop: 10, marginBottom: 4 }}>Why are you reporting this?</T>
      {REASONS.map(r => <Choice key={r} on={why === r} label={r} onPress={() => setWhy(r)} />)}
      <T s={12} lh={17} col={c.ink3} style={{ marginTop: 8 }}>{`This message and the 5 before it go to your college admin. ${firstName(m.sender_id)} isn’t told who reported it.`}</T>
      <BtnP disabled={!why} style={{ marginTop: 16 }} onPress={send}>Send report</BtnP>
    </SheetBody>
  );
};
const PinSheet = ({ m, ch }: any) => {
  const OPTS: [string, number][] = [['24 hours', 1], ['7 days', 7], ['30 days', 30]];
  const [v, setV] = useState(7), who = m.sender_id === meId() ? 'You' : profile(m.sender_id)?.full_name;
  const pin = () => {
    mut(d => { d.pins = d.pins.filter(p => p.chat_id !== ch.id); d.pins.push({ id: newId('pin'), chat_id: ch.id, message_id: m.id, pinned_by: meId(), expires_at: Date.now() + v * 864e5 }); });
    sendMessage({ chatId: ch.id, kind: 'system', body: '{who} pinned a message', me_suffix: ` for ${OPTS.find(o => o[1] === v)?.[0]}` });
    closeSheet();
  };
  return (
    <SheetBody title="Pin message">
      <QuoteBox head={`${who} · ${chatLabel(ch)}`} text={snippet(m)} />
      <T s={13} lh={18} w="600" col={c.ink2} style={{ marginTop: 10, marginBottom: 4 }}>Keep it pinned for</T>
      {OPTS.map(([label, n]) => <Tap key={n} label={label} onPress={() => setV(n)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}><T s={15} lh={20} style={{ flex: 1 }}>{label}</T>{v === n ? <Ms n="check" col={c.greenText} /> : null}</Tap>)}
      <T s={12} lh={17} col={c.ink3} style={{ marginTop: 8 }}>{`Everyone in ${divOf(ch)?.name || chatTitle(ch)} sees it at the top of the chat. Hold it to unpin any time.`}</T>
      <BtnP style={{ marginTop: 16 }} onPress={pin}>Pin message</BtnP>
    </SheetBody>
  );
};
const ForwardSheet = ({ m, from }: any) => {
  const [q, setQ] = useState(''), [ids, setIds] = useState<string[]>([]);
  const n = q.trim().toLowerCase();
  const chats = myChats().filter(ch => ch.status === 'active' && ch.id !== from?.id).sort((a, b) => (lastOf(b.id)?.sent_at || 0) - (lastOf(a.id)?.sent_at || 0)).filter(ch => !n || rowInfo(ch).title?.toLowerCase().includes(n) || rowInfo(ch).sub?.toLowerCase().includes(n)).slice(0, n ? 20 : 6);
  const send = () => {
    const out = ids.map(chatId => sendMessage({ chatId, kind: m.kind, body: m.body, resource_id: m.resource_id, buzz_post_id: m.buzz_post_id, poll_id: m.poll_id, link_url: m.link_url, link_title: m.link_title, link_provider: m.link_provider, forwarded_from_id: m.id }));
    closeSheet(); toast(`Forwarded to ${ids.length} chat${ids.length > 1 ? 's' : ''}`, () => removeMsgs(out));
  };
  return (
    <SheetBody title="Forward">
      <QuoteBox head={m.sender_id ? `${named(m.sender_id)}${from ? ` · ${chatLabel(from)}` : ''}` : 'File'} text={snippet(m)} />
      <SearchBar placeholder="Search chats and people" value={q} onChange={setQ} style={{ marginHorizontal: 0, marginTop: 6 }} />
      {n ? null : <T s={13} lh={18} w="600" col={c.ink2} style={{ marginTop: 12 }}>Recent</T>}
      {chats.map(ch => { const on = ids.includes(ch.id), info = rowInfo(ch); return <Tap key={ch.id} label={info.title} onPress={() => setIds(on ? ids.filter(x => x !== ch.id) : [...ids, ch.id])} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8 }}>{chatPic(ch, 36)}<View style={{ flex: 1 }}><T s={15} lh={20} n={1}>{info.title}</T><T s={12} lh={16} col={c.ink3} n={1}>{info.sub}</T></View><Ck on={on} /></Tap>; })}
      <T s={12} lh={17} col={c.ink3} style={{ marginTop: 8 }}>It arrives marked Forwarded.</T>
      <BtnP disabled={!ids.length} style={{ marginTop: 12 }} onPress={send}>{ids.length ? `Forward to ${ids.length} chat${ids.length > 1 ? 's' : ''}` : 'Pick chats'}</BtnP>
    </SheetBody>
  );
};
export const openForward = (m: any, from?: any) => openSheet(() => <ForwardSheet m={m} from={from} />);
/** Leaving a chat: a phone file leaves Shared in chat; files from Resources stay (8.3). */
const dropChatFile = (m: any) => { const r = byId('resources', m.resource_id); if (r?.source === 'chat') r.removed_at = Date.now(); };
function askUnsend(m: any, ch: any) {
  const fileish = m.kind === 'file' || isFaculty();
  confirmSheet({
    title: 'Unsend this message?',
    body: fileish ? `It’s removed from every phone in ${chatLabel(ch)}, and leaves Shared in chat. Files added from your Resources stay there.` : `It’s removed for everyone in ${chatLabel(ch)}.`,
    action: isFaculty() ? 'Unsend for everyone' : 'Unsend',
    onConfirm: () => mut(() => { m.unsent_at = Date.now(); dropChatFile(m); }),
  });
}
function askDelete(m: any, ch: any) {
  const first = firstName(m.sender_id);
  confirmSheet({
    title: 'Delete for everyone?',
    body: `${first}’s message is deleted from every phone in ${chatLabel(ch)}. ${first} gets a notification. This can’t be undone.`,
    action: 'Delete for everyone',
    onConfirm: () => mut(() => { m.deleted_by = meId(); dropChatFile(m); notify(m.sender_id, 'message_deleted', { message_id: m.id, chat_id: ch.id }); }),
  });
}
const useTodoToast = create<{ on: number }>(() => ({ on: 0 }));
let todoT: any;
const showTodoToast = () => { clearTimeout(todoT); useTodoToast.setState({ on: Date.now() }); todoT = setTimeout(() => useTodoToast.setState({ on: 0 }), 5000); };
/** Chat-F26-AddedTodo: same pill as the toast, with its own action. */
const TodoToast = ({ bottom = 74 }: any) => {
  const on = useTodoToast(s => s.on);
  if (!on) return null;
  return (
    <View accessibilityRole="alert" style={{ position: 'absolute', left: 16, right: 16, bottom, minHeight: 48, borderRadius: 999, backgroundColor: c.inverse, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 6, boxShadow: shadow.overlay } as any}>
      <Ms n="check_circle" s={20} col={c.toastUndo} /><T s={14} lh={19} col="#ffffff" style={{ flex: 1, paddingVertical: 12 }}>Added to To do</T>
      <Tap label="Open To do" onPress={() => { useTodoToast.setState({ on: 0 }); go(isFaculty() ? 'FacultyTodo' : 'StudentPost'); }} style={{ height: 40, paddingHorizontal: 14, justifyContent: 'center' }}><T v s={14} lh={19} col={c.toastUndo}>Open To do</T></Tap>
    </View>
  );
};
const HoldSheet = ({ m, ch, cp, inThread }: any) => {
  useData();
  const mine = m.sender_id === meId(), fac = isFaculty(), ro = ch.status !== 'active' || !cp, pinned = activePin(ch.id)?.message_id === m.id;
  const act = (fn: () => void) => () => { closeSheet(); fn(); };
  const reply = () => { cp.setPriv(null); cp.setEdit(null); cp.setQuote(m); cp.focus(); };
  const thread = () => go('Chat-S03-Thread', { chatId: ch.id, rootId: m.thread_root_id || m.id });
  const todo = () => { addTodoFromMessage(m.id); showTodoToast(); };
  const copy = async () => { await Clipboard.setStringAsync(snippet(m)); toast('Copied'); };
  const edit = () => { cp.setQuote(null); cp.setPriv(null); cp.setEdit(m); cp.setText(m.body || ''); cp.focus(); };
  const canTodo = fac || !mine, canEdit = mine && !ro && !m.forwarded_from_id && ['text', 'file', 'link'].includes(m.kind);
  const unpin = () => mut(d => { d.pins = d.pins.filter(p => p.chat_id !== ch.id); });
  const pinRow = fac && !inThread && !ro && ch.kind !== 'dm' ? (pinned ? <SheetRow icon="keep_off" label="Unpin" onPress={act(unpin)} /> : <SheetRow icon="keep" label="Pin" onPress={() => swapSheet(() => <PinSheet m={m} ch={ch} />)} />) : null;
  const fwdRow = fac ? <SheetRow icon="forward" label="Forward" onPress={() => swapSheet(() => <ForwardSheet m={m} from={ch} />)} /> : null;
  const copyRow = <SheetRow icon="content_copy" label="Copy" onPress={act(copy)} />;
  const tile = (icon: string, label: string, onPress: () => void) => <Tap key={label} label={label} onPress={act(onPress)} style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 16, backgroundColor: c.sunken }}><Ms n={icon} /><T v s={13} lh={16} center>{label}</T></Tap>;
  return (
    <SheetBody>
      <T s={12} lh={17} col={c.ink3} n={2} style={{ marginTop: 2 }}>{`${named(m.sender_id)} · ${snippet(m)}`}</T>
      {ro ? null : (
        <Row gap={6} style={{ marginTop: 12 }}>
          {EMOJI.slice(0, 5).map(e => <Tap key={e} label={`React ${e}`} onPress={act(() => toggleRx(m.id, e))} style={{ height: 44, flex: 1, borderRadius: 999, backgroundColor: c.surface, boxShadow: shadow.card, alignItems: 'center', justifyContent: 'center' } as any}><T s={20} lh={26}>{e}</T></Tap>)}
          <Tap label="More reactions" onPress={() => swapSheet(() => <EmojiSheet m={m} />)} style={{ height: 44, flex: 1, borderRadius: 999, backgroundColor: c.surface, boxShadow: shadow.card, alignItems: 'center', justifyContent: 'center' } as any}><Ms n="add_reaction" /></Tap>
        </Row>
      )}
      <Row gap={8} style={{ marginTop: 12, alignItems: 'stretch' }}>
        {ro ? null : tile('reply', 'Reply', reply)}
        {ro || inThread ? null : tile('forum', 'Reply in thread', thread)}
        {canTodo ? tile('checklist', 'Add to To do', todo) : null}
      </Row>
      <View style={{ marginTop: 6 }}>
        {!mine && !ro ? <SheetRow icon="3p" label="Reply privately" onPress={act(() => openDm(m.sender_id, { privateReplyOf: m.id }))} /> : null}
        {canEdit ? <SheetRow icon="edit" label="Edit" onPress={act(edit)} /> : null}
        {mine && fac ? <SheetRow icon="visibility" label="Seen by" onPress={act(() => go('Chat-F11-Info', { messageId: m.id }))} /> : null}
        {mine ? <>{pinRow}{fwdRow}</> : <>{fwdRow}{pinRow}</>}
        {copyRow}
        {!mine ? <SheetRow icon="flag" label="Report" onPress={() => swapSheet(() => <ReportSheet m={m} ch={ch} />)} /> : null}
        {!mine && canModerate(ch) ? <SheetRow icon="delete" label="Delete for everyone" neg onPress={act(() => askDelete(m, ch))} /> : null}
        {mine && !ro ? <SheetRow icon="undo" label="Unsend" onPress={act(() => askUnsend(m, ch))} /> : null}
      </View>
    </SheetBody>
  );
};
const openHold = (m: any, ch: any, cp: any, inThread?: boolean) => openSheet(() => <HoldSheet m={m} ch={ch} cp={cp} inThread={inThread} />);

/* ---------- Message parts ---------- */
const saved = new Set<string>(); // ponytail: downloads tracked per session; the real app checks the file on disk.
const useDownload = (r: any, f: any) => {
  const [st, setSt] = useState(saved.has(r?.id) ? 'done' : 'idle'), t = useRef<any>(null);
  useEffect(() => () => clearTimeout(t.current), []);
  const start = () => {
    if (isOffline()) return toast(`Couldn't download ${f?.name} · Retry`);
    setSt('busy');
    t.current = setTimeout(() => { saved.add(r.id); setSt('done'); markViewed(r.id, 'downloaded'); }, 1400);
  };
  return { st, start, cancel: () => { clearTimeout(t.current); setSt('idle'); } };
};
const DlBtn = ({ r, f }: any) => {
  const { st, start, cancel } = useDownload(r, f);
  if (st === 'done') return <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><Ms n="download_done" s={20} col={c.greenText} /></View>;
  return <Tap label={st === 'busy' ? 'Downloading. Cancel' : `Download, ${fmtSize(f.size_bytes || 0)}`} onPress={st === 'busy' ? cancel : start} style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: st === 'busy' ? c.green : c.inkOff, alignItems: 'center', justifyContent: 'center' }}><Ms n={st === 'busy' ? 'close' : 'arrow_downward'} s={18} col={c.ink2} /></Tap>;
};
const firstPage = (f: any) => where('file_pages', p => p.file_id === f.id).sort((a, b) => a.page_no - b.page_no)[0];
const FilePreview = ({ r, f, big, page }: any) => {
  if (/image/.test(f.mime || '') && f.uri) return <Image source={{ uri: f.uri }} accessibilityIgnoresInvertColors style={{ width: '100%', height: big ? 300 : 160, borderRadius: big ? 8 : 16 }} resizeMode="cover" />;
  const p = page ?? firstPage(f), title = p?.title || r?.title || (f.name || '').replace(/\.[^.]+$/, ''), slides = /presentation|ppt/.test(f.mime || '');
  return <SlidePage doc={!slides} big={big} unit={slides ? unitOf(r) : undefined} title={title} page={p?.page_no ?? 1} total={f.page_count} lines={(p?.text || '').split('\n').filter(Boolean).slice(0, big ? 6 : 2)} style={big ? undefined : { borderRadius: 16 }} />;
};
const FileCard = ({ m, mine, onLong }: any) => {
  const r = byId('resources', m.resource_id), f = byId('files', r?.file_id);
  if (!r || r.removed_at || !f) return <Row gap={6} style={{ paddingVertical: 2 }}><Ms n="description" s={16} col={c.ink3} /><T s={14} lh={21} col={c.ink3} style={{ fontStyle: 'italic' }}>File removed</T></Row>;
  const open = () => go('Chat-R01-File', { messageId: m.id, resourceId: r.id });
  return (
    <View style={{ width: 256 }}>
      <Tap onPress={open} onLong={onLong} label={`Open ${r.title || f.name}`}><FilePreview r={r} f={f} /></Tap>
      <Row gap={10} style={{ paddingTop: 8, paddingBottom: 2, paddingHorizontal: 8 }}>
        <Tap onPress={open} onLong={onLong} label={f.name} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Fi n={fileIcon(f.mime)} />
          <View style={{ flex: 1, minWidth: 0 }}><T s={14} lh={19} w="500" n={1}>{f.name}</T><T s={12} lh={16} col={c.ink3} n={1}>{fileMeta(f)}</T></View>
        </Tap>
        {mine ? null : <DlBtn r={r} f={f} />}
      </Row>
    </View>
  );
};
const FolderCard = ({ m, onLong }: any) => {
  const fo = byId('folders', m.folder_id), n = fo ? resourcesIn(fo.id).length : 0;
  if (!fo) return <T s={14} lh={21} col={c.ink3} style={{ fontStyle: 'italic' }}>Folder removed</T>;
  return <Tap label={fo.name} onLong={onLong} onPress={() => go(isFaculty() ? 'Res-F02-Folder' : 'Res-S02-Folder', { folderId: fo.id, chatId: m.chat_id })} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 44, marginVertical: 4, minWidth: 220 }}><Fo /><View style={{ flex: 1, minWidth: 0 }}><T s={14} lh={19} w="500" n={1}>{fo.name}</T><T s={12} lh={16} col={c.ink3}>{`${n} file${n === 1 ? '' : 's'}`}</T></View></Tap>;
};
const LinkCard = ({ m, onLong }: any) => (
  <Tap label={m.link_title} onLong={onLong} onPress={() => m.link_url && Linking.openURL(m.link_url).catch(() => toast(`Couldn't open ${m.link_provider}`))} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 44, marginVertical: 4, minWidth: 220 }}>
    <Fi n="link" /><View style={{ flex: 1, minWidth: 0 }}><T s={14} lh={19} w="500" n={1}>{m.link_title || m.link_url}</T><T s={12} lh={16} col={c.ink3} n={1}>{m.link_provider}</T></View>
  </Tap>
);
const BuzzCard = ({ m, onLong }: any) => {
  const p = byId('buzz_posts', m.buzz_post_id), acct = byId('buzz_accounts', p?.account_id);
  if (!p) return <T s={14} lh={21} col={c.ink3} style={{ fontStyle: 'italic' }}>Post removed</T>;
  const n = where('buzz_attachments', a => a.post_id === p.id).length;
  const a0 = where('buzz_attachments', a => a.post_id === p.id)[0];
  const detail = [p.due_at ? `Due ${fmtDate(p.due_at)}` : null, p.event_place, n ? `${n} ${a0?.kind === 'link' ? 'link' : a0?.kind === 'photo' ? 'photo' : 'file'}${n > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ');
  return (
    <Tap label={p.title} onLong={onLong} onPress={() => go(isFaculty() ? 'FacultyPost' : 'StudentPost', { postId: p.id })} style={{ minWidth: 230, paddingVertical: 2 }}>
      <Row gap={4}><Ms n="campaign" s={16} col={c.greenText} /><T s={12} lh={16} col={c.ink3}>{`Buzz · ${acct?.name ?? ''}`}</T></Row>
      <T v s={15} lh={20} style={{ marginTop: 2 }}>{p.title}</T>
      {detail ? <T s={13} lh={18} col={c.ink2} style={{ marginTop: 2 }}>{detail}</T> : null}
    </Tap>
  );
};
const PollCard = ({ m, ch }: any) => {
  const p = byId('polls', m.poll_id);
  if (!p) return null;
  const mine = m.sender_id === meId(), opts = where('poll_options', o => o.poll_id === p.id).sort((a, b) => a.sort - b.sort), votes = where('poll_votes', v => v.poll_id === p.id);
  const myVotes = votes.filter(v => v.user_id === meId()), voted = myVotes.length > 0, tot = new Set(votes.map(v => v.user_id)).size;
  const closed = !!p.closed_at, open = !closed && ch.status === 'active';
  const seeBars = voted || mine || closed;
  const vote = (o: any) => mut(d => {
    const had = d.poll_votes.findIndex(v => v.poll_id === p.id && v.option_id === o.id && v.user_id === meId());
    if (!p.multi_answer) d.poll_votes = d.poll_votes.filter(v => !(v.poll_id === p.id && v.user_id === meId()));
    if (had >= 0 && p.multi_answer) d.poll_votes.splice(had, 1);
    if (had < 0) d.poll_votes.push({ poll_id: p.id, option_id: o.id, user_id: meId() });
  });
  const foot = closed ? `Poll closed · ${tot} votes` : mine ? `${tot} of ${audience(ch).length} voted` : `${voted ? `${tot} votes` : 'Tap an option to vote'}${p.names_visible ? '' : ` · names visible to ${profile(m.sender_id)?.full_name}`}`;
  return (
    <View style={{ width: 256, paddingVertical: 2 }}>
      <Row gap={4}><Ms n="ballot" s={16} col={c.greenText} /><T s={12} lh={16} col={c.ink3}>{`Poll · ${p.multi_answer ? 'pick any' : 'pick one'}`}</T></Row>
      <T v s={15} lh={20} style={{ marginTop: 2 }}>{p.question}</T>
      {opts.map(o => {
        const n = votes.filter(v => v.option_id === o.id).length, on = myVotes.some(v => v.option_id === o.id), w = tot ? (n / tot) * 100 : 0;
        return (
          <Tap key={o.id} label={`${o.text}, ${n} votes`} disabled={!open} onPress={() => mine ? go('Chat-P03-PollResults', { messageId: m.id }) : vote(o)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 12, overflow: 'hidden', backgroundColor: mine ? c.surface : c.sunken, marginTop: 6 }}>
            {seeBars ? <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${w}%`, backgroundColor: mine ? c.greenWash : c.greenZone }} /> : null}
            {mine ? null : <Ck on={on} />}
            <T s={14} lh={19} style={{ flex: 1 }}>{o.text}</T><T v s={13} lh={18} col={c.ink2}>{n}</T>
          </Tap>
        );
      })}
      {mine || p.names_visible
        ? <Tap label="Poll votes" onPress={() => go('Chat-P03-PollResults', { messageId: m.id })} style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', minHeight: 24 }}><T s={12} lh={16} w="600" col={c.greenText}>{foot}</T><Ms n="chevron_right" s={16} col={c.greenText} /></Tap>
        : <T s={12} lh={16} col={c.ink3} style={{ marginTop: 6 }}>{foot}</T>}
    </View>
  );
};
/** Reply-privately card: the source message riding along (S09Q, F10). */
const QCard = ({ src, onPress, style }: any) => {
  if (!src) return null;
  const ch = byId('chats', src.chat_id), r = byId('resources', src.resource_id), f = byId('files', r?.file_id);
  const gone = src.unsent_at || src.deleted_by;
  return (
    <Tap label="Open the original message" onPress={onPress} disabled={!onPress} style={[{ padding: 8, paddingLeft: 12, borderRadius: 12, backgroundColor: c.sunken, overflow: 'hidden', minWidth: 220, marginBottom: 6, borderLeftWidth: 4, borderLeftColor: c.green }, style]}>
      <T s={13} lh={18} w="600" col={c.greenText} n={1}>{named(src.sender_id)}<T s={13} lh={18} w="500" col={c.ink3}>{` · ${chatLabel(ch)}`}</T></T>
      {f && !gone ? <Row gap={4}><Ms n={fileIcon(f.mime)} s={16} col={c.ink2} /><T s={13} lh={18} col={c.ink2} n={1} style={{ flexShrink: 1 }}>{f.name}</T></Row> : null}
      <T s={13} lh={18} col={c.ink2} n={2}>{gone ? 'Message removed' : src.body}</T>
    </Tap>
  );
};
const MsgBody = ({ m, ch, mine, media, meta, onLong, onJump }: any) => {
  const quoted = m.quote_message_id ? byId('messages', m.quote_message_id) : null;
  const src = m.private_reply_of_id ? byId('messages', m.private_reply_of_id) : null;
  const text = m.body && !(m.kind === 'resource_folder' && m.body === byId('folders', m.folder_id)?.name) ? m.body : null;
  const inset = media ? { paddingHorizontal: 8 } : null; // media bubbles hug the preview; words keep their margin
  const head = m.forwarded_from_id || src || quoted || m.slide_no;
  return (
    <>
      {head ? <View style={[inset, media ? { paddingTop: 4 } : null]}>
        {m.forwarded_from_id ? <Row gap={4} style={{ marginBottom: 4 }}><Ms n="forward" s={14} col={c.ink3} /><T s={12} lh={16} col={c.ink3}>Forwarded</T></Row> : null}
        {src ? <Row gap={4} style={{ marginBottom: 4 }}><Ms n="lock" s={14} col={c.ink3} /><T s={12} lh={16} col={c.ink3}>{mine ? 'You replied privately' : src.sender_id === meId() ? 'Replied privately to your message' : 'Replied privately'}</T></Row> : null}
        {src ? <QCard src={src} onPress={() => openChat(src.chat_id, 'Chat', { messageId: src.id })} /> : null}
        {quoted ? <Tap label="Go to the quoted message" onPress={() => onJump?.(quoted.id)}><QuoteBox head={named(quoted.sender_id)} text={quoted.unsent_at || quoted.deleted_by ? 'Message removed' : snippet(quoted)} /></Tap> : null}
        {m.slide_no ? <QuoteBox head={`Slide ${m.slide_no}`} text={m.slide_title} /> : null}
      </View> : null}
      {m.kind === 'file' ? <FileCard m={m} mine={mine} onLong={onLong} /> : null}
      {m.kind === 'link' ? <LinkCard m={m} onLong={onLong} /> : null}
      {m.kind === 'resource_folder' ? <FolderCard m={m} onLong={onLong} /> : null}
      {m.kind === 'buzz_card' ? <BuzzCard m={m} onLong={onLong} /> : null}
      {m.kind === 'poll' ? <PollCard m={m} ch={ch} /> : null}
      {/* Time rides inside the bubble: beside short text, wrapped to the bottom-right under long text. */}
      {text || meta ? (
        <View style={[{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: 10, marginTop: text && m.kind !== 'text' ? 6 : 0 }, inset, media ? { paddingBottom: 4 } : null]}>
          {text ? <T s={15} lh={21} style={{ flexShrink: 1 }}>{text}</T> : null}
          {meta ? <View style={{ marginLeft: 'auto', marginBottom: 2, marginTop: text ? 0 : 6 }}>{meta}</View> : null}
        </View>
      ) : null}
    </>
  );
};
/** Reaction pills tuck over the bubble's bottom edge, cut out with a page-coloured ring. */
const Reactions = ({ m, ro }: any) => {
  const rx = where('message_reactions', r => r.message_id === m.id);
  if (!rx.length) return null;
  const groups = [...new Set(rx.map(r => r.emoji))];
  return (
    <Row gap={4} style={{ marginTop: -8, paddingHorizontal: 10, flexWrap: 'wrap' }}>
      {groups.map(e => { const n = rx.filter(r => r.emoji === e).length, mine = rx.some(r => r.emoji === e && r.user_id === meId()); return <Tap key={e} label={`${e} ${n}`} disabled={ro} onPress={() => toggleRx(m.id, e)} style={{ height: 26, paddingHorizontal: 8, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: mine ? c.greenWash : c.surface, borderWidth: 2, borderColor: c.page }}><T s={12} lh={16} w={mine ? '600' : undefined} col={mine ? c.greenText : c.ink2}>{`${e} ${n}`}</T></Tap>; })}
    </Row>
  );
};
const ThreadPill = ({ m }: any) => {
  const rs = threadReplies(m.id);
  if (!rs.length) return null;
  const whom = [...new Set(rs.map(r => r.sender_id))].slice(0, 2), last = rs[rs.length - 1];
  return (
    <Tap label={`${rs.length} replies`} onPress={() => go('Chat-S03-Thread', { chatId: m.chat_id, rootId: m.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, marginHorizontal: 8, minHeight: 28 }}>
      <Row>{whom.map((u, i) => <Pic key={u} img={profile(u)?.img} name={profile(u)?.full_name} size={20} style={i ? { marginLeft: -6 } : null} />)}</Row>
      <T s={13} lh={18} w="600" col={c.greenText}>{`${rs.length} ${rs.length === 1 ? 'reply' : 'replies'}`}{last.client_id ? <T s={13} lh={18} col={c.ink3}>{` · last ${fmtClock(last.sent_at)}`}</T> : null}</T>
    </Tap>
  );
};
const Meta = ({ m, ch, mine, pinned }: any) => {
  if (m.status === 'waiting') return <Row gap={4}><Ms n="schedule" s={15} col={c.ink3} /><T s={11} lh={14} col={c.ink3}>Waiting to send</T></Row>;
  if (m.status === 'failed') return <Tap label="Couldn't send. Retry" onPress={() => retrySend(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 24 }}><Ms n="error" s={15} col={c.negative} /><T s={11} lh={14} w="600" col={c.negative}>Couldn’t send · Retry</T></Tap>;
  const rc = mine ? where('message_receipts', r => r.message_id === m.id) : [], seen = rc.filter(r => r.seen_at);
  const time = `${m.edited_at ? 'Edited · ' : ''}${fmtClock(m.sent_at)}`;
  let st: any = null;
  if (mine && ch.kind === 'dm') st = seen.length ? <><T s={11} lh={14} col={c.ink3}>·</T><T s={11} lh={14} w="600" col={c.greenText}>{`Seen ${fmtClock(seen[0].seen_at)}`}</T></> : <Ms n="done_all" s={15} col={c.ink3} />;
  else if (mine && isFaculty()) st = <><T s={11} lh={14} col={c.ink3}>·</T><Tap label={`Seen ${seen.length}`} onPress={() => go('Chat-F11-Info', { messageId: m.id })}><T s={11} lh={14} w="600" col={c.greenText}>{`Seen ${seen.length}`}</T></Tap></>;
  else if (mine) st = seen.length ? <><Ms n="done_all" s={15} col={c.greenText} /><T s={11} lh={14} w="600" col={c.greenText}>Seen</T></> : rc.length ? <><Ms n="done_all" s={15} col={c.ink3} /><T s={11} lh={14} col={c.ink3}>Delivered</T></> : <><Ms n="check" s={15} col={c.ink3} /><T s={11} lh={14} col={c.ink3}>Sent</T></>;
  return <Row gap={4}>{pinned ? <Ms n="keep" s={14} col={c.ink3} /> : null}<T s={11} lh={14} col={c.ink3}>{time}</T>{st}</Row>;
};
const Day = ({ children }: any) => <View style={{ alignSelf: 'center', backgroundColor: c.sunken, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 }}><T s={12} lh={16} w="500" col={c.ink3}>{children}</T></View>;
const Sys = ({ children, icon }: any) => <Row gap={4} style={{ alignSelf: 'center', justifyContent: 'center', maxWidth: 300 }}>{icon ? <Ms n={icon} s={14} col={c.ink3} /> : null}<T s={12} lh={17} col={c.ink3} center style={{ flexShrink: 1 }}>{children}</T></Row>;
const Gone = ({ m, mine }: any) => (
  <Row gap={6}>
    <Ms n={m.unsent_at ? 'undo' : 'block'} s={16} col={c.ink3} />
    <T s={14} lh={21} col={c.ink3} style={{ fontStyle: 'italic' }}>{m.unsent_at ? (mine ? 'You unsent a message' : 'Message unsent') : `Deleted by ${m.deleted_by === meId() ? 'you' : profile(m.deleted_by)?.full_name}`}</T>
  </Row>
);
/** Same sender, same day, within 5 minutes: one run. Runs sit tight; the time shows once, at the end. */
const joins = (a: any, b: any) => !!a && !!b && a.kind !== 'system' && b.kind !== 'system' && a.sender_id === b.sender_id && fmtDay(a.sent_at) === fmtDay(b.sent_at) && b.sent_at - a.sent_at < 5 * 60e3;
const AV = 28, AV_GAP = 8; // avatar column for other people's messages
const Msg = ({ m, ch, first = true, last = true, cp, flash, onJump }: any) => {
  if (m.kind === 'system') return m.sys_style === 'day' ? <Day>{m.body}</Day> : <Sys>{sysText(m)}</Sys>;
  const mine = m.sender_id === meId(), who = profile(m.sender_id), fac = who?.role === 'faculty', gone = !!(m.unsent_at || m.deleted_by);
  const hold = gone ? undefined : () => openHold(m, ch, cp);
  const ro = ch.status !== 'active', pinned = activePin(ch.id)?.message_id === m.id;
  const meta = last || pinned || m.edited_at || m.status === 'waiting' || m.status === 'failed' ? <Meta m={m} ch={ch} mine={mine} pinned={pinned} /> : null;
  const r = byId('resources', m.resource_id), media = m.kind === 'file' && !gone && r && !r.removed_at && byId('files', r.file_id);
  const R = 20, side = mine ? 'Right' : 'Left';
  const bub = (
    <Tap onLong={hold} style={{ backgroundColor: flash ? c.greenWash : mine ? c.greenZone : c.surface, borderRadius: R, [`borderTop${side}Radius`]: first ? R : 6, [`borderBottom${side}Radius`]: 6, padding: media ? 4 : 0, paddingVertical: media ? 4 : 8, paddingHorizontal: media ? 4 : 12, ...(media ? { width: 264 } : {}), ...(mine ? {} : { boxShadow: shadow.card }) } as any}>
      {gone || m.kind === 'call' ? <>{gone ? <Gone m={m} mine={mine} /> : <CallBubble m={m} mine={mine} />}{meta ? <View style={{ alignSelf: 'flex-end', marginTop: 2 }}>{meta}</View> : null}</>
        : <MsgBody m={m} ch={ch} mine={mine} media={media} meta={meta} onLong={hold} onJump={onJump} />}
    </Tap>
  );
  const under = <>{gone ? null : <Reactions m={m} ro={ro} />}{m.thread_root_id ? null : <ThreadPill m={m} />}</>;
  if (mine) return <View style={{ alignSelf: 'flex-end', maxWidth: '80%', alignItems: 'flex-end' }}>{bub}{under}</View>;
  return (
    <View style={{ alignSelf: 'flex-start', maxWidth: '86%' }}>
      {first ? <Row gap={6} style={{ marginBottom: 4, marginLeft: AV + AV_GAP + 12 }}><T s={12} lh={16} w="600" col={fac ? c.greenText : c.ink2}>{who?.full_name}</T>{fac && !isFaculty() ? <View style={{ backgroundColor: c.greenWash, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 }}><T s={10} lh={14} w="600" col={c.greenText}>Faculty</T></View> : null}</Row> : null}
      <Row gap={AV_GAP} style={{ alignItems: 'flex-end' }}>
        {last ? <Pic img={who?.img} name={who?.full_name} size={AV} fac={fac} /> : <View style={{ width: AV }} />}
        <View style={{ flexShrink: 1, alignItems: 'flex-start' }}>{bub}</View>
      </Row>
      <View style={{ marginLeft: AV + AV_GAP, alignItems: 'flex-start' }}>{under}</View>
    </View>
  );
};

/* ---------- Composer ---------- */
const AttChip = ({ a, ch, onRemove }: any) => {
  const r = a.resource_id ? byId('resources', a.resource_id) : null, f = r ? byId('files', r.file_id) : a.file;
  const name = a.link ? a.link.title : f?.name, sub = a.link ? a.link.provider : r ? `From ${courseOf(ch)?.short ?? chatLabel(ch)} resources` : fmtSize(f?.size || 0);
  return <Row gap={10} style={{ marginBottom: 6, padding: 6, paddingRight: 2, borderRadius: 12, backgroundColor: c.surface, boxShadow: shadow.card } as any}><Fi n={a.link ? 'link' : fileIcon(f?.mime)} /><View style={{ flex: 1, minWidth: 0 }}><T s={14} lh={19} w="500" n={1}>{name}</T><T s={12} lh={16} col={c.ink3} n={1}>{sub}</T></View><IB n="close" s={18} label={`Remove ${name}`} onPress={onRemove} /></Row>;
};
const Composer = ({ ch, cp, placeholder = 'Message', onSent }: any) => {
  const i = useSafeAreaInsets(), fac = isFaculty(), ready = !!(cp.text.trim() || cp.atts.length);
  const send = () => { sendOut(ch, cp); onSent?.(); };
  const canAttach = fac || ch.students_can_share_files !== false;
  const cancelBar = (label: string, icon: string, onX: () => void) => <Row gap={6} style={{ marginBottom: 6 }}><Ms n={icon} s={16} col={c.ink3} /><T s={13} lh={18} col={c.ink2} n={1} style={{ flex: 1 }}>{label}</T><IB n="close" s={18} label="Cancel" onPress={onX} style={{ width: 32, height: 32 }} /></Row>;
  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: Math.max(i.bottom, 8), backgroundColor: c.page, borderTopWidth: 1, borderTopColor: c.line }}>
      {cp.priv ? <>{cancelBar(`Replying privately to ${profile(cp.priv.sender_id)?.full_name}`, 'lock', () => cp.setPriv(null))}<QCard src={cp.priv} /></> : null}
      {cp.quote ? <>{cancelBar('Replying', 'reply', () => cp.setQuote(null))}<QuoteBox head={named(cp.quote.sender_id)} text={snippet(cp.quote)} /></> : null}
      {cp.sl ? <>{cancelBar('Asking about a slide', 'slideshow', () => cp.setSl(null))}<QuoteBox head={`Slide ${cp.sl.no}`} text={cp.sl.title} /></> : null}
      {cp.edit ? cancelBar('Editing your message', 'edit', () => cp.clear()) : null}
      {cp.atts.map((a: any, idx: number) => <AttChip key={idx} a={a} ch={ch} onRemove={() => cp.setAtts(cp.atts.filter((_: any, j: number) => j !== idx))} />)}
      {cp.rootId ? <Row gap={12} style={{ minHeight: 40 }}><T s={13} lh={18} col={c.ink2} style={{ flex: 1 }}>Also send to chat</T><Sw on={cp.also} onChange={cp.setAlso} label="Also send to chat" /></Row> : null}
      <Row gap={8} style={{ alignItems: 'flex-end' }}>
        {canAttach && !cp.edit ? <Tap label="Add photos, files, resources and more" onPress={() => openSheet(() => <PlusSheet ch={ch} cp={cp} />)} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.sunken, alignItems: 'center', justifyContent: 'center' }}><Ms n="add" /></Tap> : null}
        <View style={{ flex: 1, minHeight: 42, borderRadius: 21, backgroundColor: c.surface, boxShadow: shadow.card, paddingLeft: 16, paddingRight: ready ? 50 : 16, justifyContent: 'center' } as any}>
          <TextInput ref={cp.input} multiline value={cp.text} onChangeText={cp.setText} placeholder={placeholder} placeholderTextColor={c.ink3} accessibilityLabel={placeholder} style={{ fontSize: 15, color: c.ink, fontFamily: 'Poppins_400Regular', maxHeight: 110, paddingVertical: 10, paddingTop: 10 }} />
          {ready ? <Tap label={fac ? 'Send. Hold for more options' : 'Send'} onPress={send} onLong={fac && !cp.edit ? () => openSendOptions(ch, cp) : undefined} style={{ position: 'absolute', right: 4, bottom: 4, width: 34, height: 34, borderRadius: 17, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center', boxShadow: shadow.button } as any}><Ms n={cp.edit ? 'check' : 'send'} s={18} col={c.onFill} /></Tap> : null}
        </View>
      </Row>
    </View>
  );
};
const LockLine = ({ children }: any) => { const i = useSafeAreaInsets(); return <Row gap={6} style={{ justifyContent: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(i.bottom, 12), backgroundColor: c.page }}><Ms n="lock" s={16} col={c.ink3} /><T s={13} lh={18} col={c.ink2}>{children}</T></Row>; };

/* ---------- ChatTab: the message list + composer for every kind of chat ---------- */
export const SearchChatBar = ({ chatId }: { chatId: string }) => <SearchBar placeholder="Search this chat" onPress={() => go('Chat-F29-SearchChat', { chatId })} />;

export const ChatTab = ({ chatId, stem, searchRow, banners, privateReplyOf, messageId, readOnly, footer }: { chatId: string; stem?: string; searchRow?: any; banners?: any; privateReplyOf?: string; messageId?: string; readOnly?: boolean; footer?: any }) => {
  useData();
  const off = useOffline(), route: any = useRoute(), i = useSafeAreaInsets();
  const ch = byId('chats', chatId), msgs = chatMessages(chatId);
  const target = messageId ?? route.params?.messageId;
  const cp = useComposer(undefined, privateReplyOf ?? route.params?.privateReplyOf);
  const sv = useRef<any>(null), ys = useRef<Record<string, number>>({}), jumped = useRef(false), seenCount = useRef(0), [flash, setFlash] = useState<string | null>(null);
  composers[chatId] = cp;
  useEffect(() => { markRead(chatId); }, [chatId, msgs.length]);
  useEffect(() => { flushQueue(); if (!off) return; const t = setInterval(ageQueue, 5000); return () => clearInterval(t); }, [off]);
  const jump = (id: string) => {
    const m = byId('messages', id), to = m?.thread_root_id && !m.also_sent_to_chat ? m.thread_root_id : id;
    if (ys.current[to] == null) return;
    sv.current?.scrollTo({ y: Math.max(0, ys.current[to] - 70), animated: true });
    setFlash(to); setTimeout(() => setFlash(null), 1600);
  };
  if (!ch) return null;
  const pin = activePin(chatId), pinMsg = pin ? byId('messages', pin.message_id) : null, pinRes = byId('files', byId('resources', pinMsg?.resource_id)?.file_id);
  const sched = scheduledIn(chatId), blocked = ch.kind === 'dm' && where('blocks', b => (b.blocker_id === meId() && b.blocked_id === otherMember(chatId)?.id) || (b.blocked_id === meId() && b.blocker_id === otherMember(chatId)?.id)).length > 0;
  const closed = ch.status !== 'active', student = !isFaculty() && !canModerate(ch), facOnly = ch.who_can_send === 'faculty' && student;
  const other = ch.kind === 'dm' ? otherMember(chatId) : null;
  const term = byId('terms', byId('offerings', ch.offering_id)?.term_id);
  const facPeer = members(chatId).map(m => profile(m.user_id)).find(p => p?.role === 'faculty');
  let bottom: any = null;
  if (footer !== undefined) bottom = footer;
  else if (ch.status === 'read_only') bottom = <View style={{ height: Math.max(i.bottom, 12) }} />;
  else if (closed) bottom = <LockLine>Read-only · no one can send messages</LockLine>;
  else if (blocked || readOnly) bottom = <View style={{ height: Math.max(i.bottom, 12) }} />;
  else if (facOnly) bottom = <LockLine>Only faculty can send messages</LockLine>;
  else bottom = <Composer ch={ch} cp={cp} onSent={() => setTimeout(() => sv.current?.scrollToEnd({ animated: true }), 60)} />;
  let lastDay = '';
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      {searchRow && searchRow !== true ? searchRow : null}
      {pinMsg ? (
        <Row style={{ minHeight: 44, paddingLeft: 16, paddingRight: 4, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: c.surface }}>
          <Tap label={`Pinned: ${snippet(pinMsg)}. Jump to it`} onPress={() => jump(pinMsg.id)} style={{ flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ms n="keep" s={18} fill col={c.honey} />{pinRes ? <Ms n={fileIcon(pinRes.mime)} s={18} col={c.ink2} /> : null}
            <T s={14} lh={19} n={1} style={{ flex: 1 }}>{snippet(pinMsg)}</T>
          </Tap>
          {canModerate(ch) ? <IB n="close" s={18} col={c.ink3} label="Unpin message" onPress={() => { const old = pin; mut(d => { d.pins = d.pins.filter(p => p.id !== old.id); }); toast('Message unpinned', () => mut(d => { d.pins.push(old); })); }} /> : null}
        </Row>
      ) : null}
      {banners}
      {off ? <Row gap={10} style={{ marginHorizontal: 12, marginTop: 6, padding: 8, paddingLeft: 12, borderRadius: 14, backgroundColor: c.cautionBg }}><Ms n="cloud_off" s={20} col={c.caution} /><T s={13} lh={18} style={{ flex: 1 }}>No connection. Messages send when you’re back online.</T></Row> : null}
      <ScrollView ref={sv} style={{ flex: 1 }} onLayout={() => { if (jumped.current && !target) sv.current?.scrollToEnd({ animated: false }); }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, flexGrow: msgs.length ? undefined : 1 }}
        onContentSizeChange={() => {
          if (!jumped.current) { jumped.current = true; if (target) setTimeout(() => jump(target), 80); else sv.current?.scrollToEnd({ animated: false }); }
          else if (msgs.length > seenCount.current) sv.current?.scrollToEnd({ animated: true });
          seenCount.current = msgs.length;
        }}>
        {!msgs.length && ch.kind === 'course' ? <Empty icon="forum" title="No messages yet" line={`Messages here reach all ${audience(ch).length} students in ${divOf(ch)?.name}.`} /> : null}
        {!msgs.length && ch.kind !== 'course' && !other ? <Empty icon="forum" title="No messages yet" /> : null}
        {other && other.role !== 'support' ? <EncryptedNote chatId={chatId} /> : null}
        {msgs.map((m, idx) => {
          const dk = fmtDay(m.sent_at), head = m.sys_style !== 'day' && dk !== lastDay;
          if (m.sys_style !== 'day') lastDay = dk;
          const first = !joins(msgs[idx - 1], m), last = !joins(m, msgs[idx + 1]);
          // Rhythm: 3 inside a run, 16 between speakers, 24 before a new day.
          const top = idx === 0 && !other ? 0 : head || m.sys_style === 'day' ? 24 : first ? 16 : 3;
          return <View key={m.id} onLayout={e => { ys.current[m.id] = e.nativeEvent.layout.y; }} style={{ marginTop: top }}>{head ? <View style={{ marginBottom: 16 }}><Day>{dk}</Day></View> : null}<Msg m={m} ch={ch} first={first} last={last} cp={cp} flash={flash === m.id} onJump={jump} /></View>;
        })}
        {ch.status === 'read_only' ? (
          <View style={{ gap: 12, marginTop: 24 }}>
            <Sys>{`Sem ${term?.semester_no} ended on ${fmtShort(term?.ends_on)}. This chat is read-only now, but you can still read it and download files.`}</Sys>
            {student && facPeer ? <BtnS icon="chat_bubble" onPress={() => openDm(facPeer.id)}>{`Message ${facPeer.full_name}`}</BtnS> : null}
          </View>
        ) : null}
      </ScrollView>
      {sched.length ? (
        <Tap label="Scheduled messages" onPress={() => openSheet(() => <ScheduledSheet chatId={chatId} />)} style={{ alignSelf: 'center', height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: c.surface, boxShadow: shadow.card, flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 } as any}>
          <Ms n="schedule_send" s={18} col={c.greenText} /><T v s={13} lh={18}>{`${sched.length} scheduled · ${fmtWhen(sched[0].scheduled_for)}`}</T><T v s={13} lh={18} col={c.greenText}>View</T>
        </Tap>
      ) : null}
      {bottom}
      <TodoToast />
    </KeyboardAvoidingView>
  );
};

/* ---------- Course chat, past chat, aliases ---------- */
const CourseChat = ({ route }: any) => {
  useData();
  const chatId = route.params?.chatId ?? byId('messages', route.params?.messageId)?.chat_id ?? db().chats.find(x => x.kind === 'course' && memberOf(x.id))?.id;
  const ch = byId('chats', chatId);
  return <Screen><PlaceShell chatId={chatId} tab="Chat" stem={route.name}><ChatTab chatId={chatId} stem={route.name} searchRow /></PlaceShell></Screen>;
};
const PastChat = ({ route }: any) => {
  useData();
  const chatId = route.params?.chatId, ch = byId('chats', chatId), term = byId('terms', byId('offerings', ch?.offering_id)?.term_id);
  if (!ch) return null;
  const title = courseOf(ch)?.name;
  return (
    <Screen>
      <Hdr title={title} sub={`${divOf(ch)?.name} · ${ch.kind === 'focus_batch' ? ch.name : `Sem ${term?.semester_no}`} · ended`} pic={<Pic img={ch.img} name={title} size={36} shape="course" badge={ch.kind === 'focus_batch' ? 'filter_center_focus' : undefined} />}
        right={<IB n="settings" label="Chat settings" onPress={() => go(isFaculty() ? 'Chat-F22-Settings' : 'Chat-S10-Settings', { chatId })} />} />
      <ChatTab chatId={chatId} stem={route.name} />
    </Screen>
  );
};
/** Chat-S09Q-ReplyPrivately: a state of the DM. The DM screens handle privateReplyOf themselves; this is the direct route. */
const ReplyPrivately = ({ route }: any) => {
  useData();
  const chatId = route.params?.chatId;
  return <Screen><PlaceShell chatId={chatId} tab="Chat" stem={route.name}><ChatTab chatId={chatId} stem={route.name} searchRow privateReplyOf={route.params?.privateReplyOf} banners={<Sys icon="lock">{`Only you and ${otherMember(chatId)?.full_name} can read this`}</Sys>} /></PlaceShell></Screen>;
};

/* ---------- Thread (S03) ---------- */
const ThreadRow = ({ m, ch, cp, root }: any) => {
  const who = profile(m.sender_id), fac = who?.role === 'faculty', mine = m.sender_id === meId(), gone = !!(m.unsent_at || m.deleted_by);
  const hold = gone ? undefined : () => openHold(m, ch, cp, true);
  return (
    <Tap onLong={hold} style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
      <Pic img={who?.img} name={who?.full_name} size={36} fac={fac} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Row gap={6}><T s={14} lh={19} w="600" col={fac ? c.greenText : c.ink} n={1} style={{ flexShrink: 1 }}>{who?.full_name}</T><T s={12} lh={16} col={c.ink3}>{`${m.edited_at ? 'Edited · ' : ''}${fmtClock(m.sent_at)}`}</T></Row>
        {gone ? <Gone m={m} mine={mine} /> : <MsgBody m={m} ch={ch} mine={mine} onLong={hold} />}
        {m.status === 'waiting' || m.status === 'failed' ? <Meta m={m} ch={ch} mine={mine} /> : null}
        {gone ? null : <Reactions m={m} ro={ch.status !== 'active'} />}
        {root}
      </View>
    </Tap>
  );
};
const Thread = ({ route }: any) => {
  useData();
  const { chatId, rootId, slideQuote } = route.params || {};
  const ch = byId('chats', chatId), m = byId('messages', rootId), cp = useComposer(rootId, undefined, slideQuote), sv = useRef<any>(null);
  if (!ch || !m) return <Screen><Hdr title="Thread" /><Empty icon="forum" title="This thread is gone" /></Screen>;
  const rs = threadReplies(rootId), sub = ch.kind === 'course' ? `${ch.name} · ${divOf(ch)?.name}` : rowInfo(ch).title;
  return (
    <Screen>
      <Hdr title="Thread" sub={sub} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView ref={sv} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 8 }}>
          <ThreadRow m={m} ch={ch} cp={ch.status === 'active' ? cp : null} />
          <T s={13} lh={18} w="600" col={c.ink2} style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6, marginLeft: 46 }}>{`${rs.length} ${rs.length === 1 ? 'reply' : 'replies'}`}</T>
          <View style={{ height: 1, backgroundColor: c.line, marginHorizontal: 16 }} />
          {rs.map(r => <ThreadRow key={r.id} m={r} ch={ch} cp={ch.status === 'active' ? cp : null} />)}
        </ScrollView>
        {ch.status === 'active' ? <Composer ch={ch} cp={cp} placeholder="Reply" onSent={() => setTimeout(() => sv.current?.scrollToEnd({ animated: true }), 60)} /> : <LockLine>Read-only · no one can send messages</LockLine>}
        <TodoToast bottom={80} />
      </KeyboardAvoidingView>
    </Screen>
  );
};

/* ---------- File (R01) ---------- */
const FileScreen = ({ route }: any) => {
  useData();
  const { messageId, resourceId } = route.params || {};
  const m = messageId ? byId('messages', messageId) : null, r = byId('resources', resourceId ?? m?.resource_id), f = byId('files', r?.file_id);
  const ch = byId('chats', m?.chat_id ?? r?.chat_id), fo = byId('folders', r?.folder_id), cr = byId('courses', fo?.course_id) ?? courseOf(ch);
  const { st, start, cancel } = useDownload(r, f);
  useEffect(() => {
    if (!r || r.removed_at) return;
    markViewed(r.id, 'opened');
    const rc = m ? where('message_receipts', x => x.message_id === m.id && x.user_id === meId() && !x.seen_at)[0] : null;
    if (rc) mut(() => { rc.seen_at = Date.now(); });
  }, [r?.id]);
  if (!r || r.removed_at || !f) return <Screen><Hdr title="File" /><Empty icon="description" title="File removed" line="This file isn’t on Hive any more." /></Screen>;
  const pages = where('file_pages', p => p.file_id === f.id).sort((a, b) => a.page_no - b.page_no);
  const shown = pages.length ? pages.slice(0, 12) : [null];
  const sender = m ? profile(m.sender_id)?.full_name : profile(r.added_by)?.full_name;
  const sub = [sender, ch ? chatLabel(ch) : cr?.short, fmtShort(m?.sent_at ?? r.created_at ?? Date.now())].filter(Boolean).join(' · ');
  const loc = fo ? `${cr?.short} resources › ${fo.name}` : null;
  const chatForFolder = ch?.id ?? db().chats.find(x => x.kind === 'course' && memberOf(x.id) && courseOf(x)?.id === fo?.course_id)?.id;
  return (
    <Screen>
      <Hdr title={f.name} sub={sub} right={isFaculty() ? <IB n="forward" label="Forward" onPress={() => openForward(m ?? { kind: 'file', resource_id: r.id, body: '' }, ch)} /> : null} />
      <Body pad={16} style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
        {shown.map((p, i) => <FilePreview key={p?.page_no ?? i} r={r} f={f} big page={p ?? undefined} />)}
        <Row gap={4} style={{ flexWrap: 'wrap' }}>
          <T s={12} lh={16} col={c.ink3}>{`${fileMeta(f).split(' · ').slice(0, f.page_count ? 2 : 1).join(' · ')}${loc ? ' ·' : ''}`}</T>
          {loc ? <Tap label={loc} onPress={() => go(isFaculty() ? 'Res-F02-Folder' : 'Res-S02-Folder', { folderId: fo.id, chatId: chatForFolder })}><T s={12} lh={16} w="600" col={c.greenText}>{loc}</T></Tap> : null}
        </Row>
        {st === 'idle' ? <BtnS icon="download" onPress={start}>{`Download · ${fmtSize(f.size_bytes || 0)}`}</BtnS> : st === 'busy' ? <BtnS icon="close" onPress={cancel}>Downloading · Cancel</BtnS> : <BtnS icon="download_done">Saved to your phone</BtnS>}
      </Body>
    </Screen>
  );
};

/* ---------- Add from resources (F05R) ---------- */
const AddFromResources = ({ route }: any) => {
  useData();
  const chatId = route.params?.chatId, ch = byId('chats', chatId), cr = courseOf(ch);
  const [open, setOpen] = useState<string | null>(null), [ids, setIds] = useState<string[]>([]), [q, setQ] = useState('');
  const folders = cr ? courseFolders(cr.id, ch.academic_year_id) : [];
  const fLabel = (f: any) => f.unit_id && !f.name.includes('·') ? `${f.name} · ${byId('syllabus_units', f.unit_id)?.title}` : f.name;
  const res = (f: any) => resourcesIn(f.id).filter((r: any) => !r.removed_at && r.kind !== 'link' && r.added_by_role !== 'student');
  const flip = (id: string) => setIds(xs => xs.includes(id) ? xs.filter(x => x !== id) : [...xs, id]);
  const fileRow = (r: any) => { const fl = byId('files', r.file_id); return <Li key={r.id} style={{ paddingLeft: 32 }} left={<Fi n={fileIcon(fl?.mime)} />} title={fl?.name || r.title} sub={shareStatus(r, ch).text} right={<Ck sq on={ids.includes(r.id)} />} onPress={() => flip(r.id)} />; };
  const needle = q.trim().toLowerCase();
  const matches = needle ? courseResources(ch).filter((r: any) => (r.title || '').toLowerCase().includes(needle) || (byId('files', r.file_id)?.name || '').toLowerCase().includes(needle)) : [];
  const block = (label: string, xs: any[], icon = 'folder') => xs.length ? (
    <View key={label}>
      <Sec>{label}</Sec>
      <Grp>
        {xs.map(f => { const n = res(f).length, on = open === f.id; return (
          <View key={f.id}>
            <Li left={<Fo n={f.kind === 'shared_in_chat' ? 'forum' : f.kind === 'focus_batch' ? 'filter_center_focus' : on ? 'folder_open' : icon} mut={!n || f.kind === 'shared_in_chat'} />} title={fLabel(f)} right={<Row gap={2}><T s={13} col={c.ink3}>{n}</T>{n ? <Ms n={on ? 'expand_less' : 'expand_more'} s={20} col={c.ink3} /> : null}</Row>} onPress={n ? () => setOpen(on ? null : f.id) : undefined} />
            {on ? res(f).map(fileRow) : null}
          </View>
        ); })}
      </Grp>
    </View>
  ) : null;
  return (
    <Screen>
      <Hdr title={`${cr?.short} resources`} sub={`Add to ${divOf(ch)?.name} chat`} />
      <SearchBar placeholder={`Search ${cr?.short} files`} value={q} onChange={setQ} style={{ marginTop: 2 }} />
      <Body pad={ids.length ? 84 : 24}>
        {needle ? (matches.length ? <Grp style={{ marginTop: 12 }}>{matches.map(fileRow)}</Grp> : <Empty icon="search_off" title={`No results for “${q.trim()}”`} />) : (
          <>
            {block('Syllabus', folders.filter((f: any) => f.kind === 'unit'))}
            {block('Focus batches', folders.filter((f: any) => f.kind === 'focus_batch'))}
            {block('Your folders', folders.filter((f: any) => f.kind === 'custom' || f.kind === 'shared_in_chat'))}
          </>
        )}
      </Body>
      {ids.length ? <View style={{ position: 'absolute', left: 16, right: 16, bottom: 28 }}><BtnP onPress={() => { composers[chatId]?.setAtts((xs: any[]) => [...xs, ...ids.map(resource_id => ({ resource_id }))]); back(); }}>{`Add ${ids.length} file${ids.length > 1 ? 's' : ''}`}</BtnP></View> : null}
    </Screen>
  );
};

/* ---------- Seen by (F11) ---------- */
const SeenBy = ({ route }: any) => {
  useData();
  const m = byId('messages', route.params?.messageId), ch = byId('chats', m?.chat_id);
  const [q, setQ] = useState(''), [allA, setAllA] = useState(false), [allB, setAllB] = useState(false);
  if (!m || !ch) return <Screen><Hdr title="Seen by" /></Screen>;
  const rc = where('message_receipts', r => r.message_id === m.id).map(r => ({ ...r, p: profile(r.user_id) })).filter(r => r.p && (!q.trim() || r.p.full_name.toLowerCase().includes(q.trim().toLowerCase())));
  const whole = where('message_receipts', r => r.message_id === m.id);
  const seen = rc.filter(r => r.seen_at).sort((a, b) => b.seen_at - a.seen_at), not = rc.filter(r => !r.seen_at);
  const row = (r: any, end: string) => <Li key={r.user_id} left={<Pic img={r.p.img} name={r.p.full_name} size={36} fac={r.p.role === 'faculty'} />} title={r.p.full_name} right={<T s={13} col={c.ink3}>{end}</T>} onPress={() => openDm(r.user_id)} />;
  const moreRow = (n: number, on: boolean, fn: (v: boolean) => void) => !on && n > 2 ? <Li key="more" title={`See all ${n}`} onPress={() => fn(true)} chevron /> : null;
  return (
    <Screen>
      <Hdr title="Seen by" sub={ch.kind === 'course' ? `${chatLabel(ch)} · ${peopleCount(ch.id)} people` : rowInfo(ch).title} />
      <Body pad={24}>
        <View style={{ alignSelf: 'flex-end', marginHorizontal: 12, marginTop: 8, maxWidth: '86%', backgroundColor: c.greenZone, borderRadius: 18, borderBottomRightRadius: 6, paddingVertical: 8, paddingHorizontal: 12 }}><MsgBody m={m} ch={ch} mine /></View>
        <T s={11} lh={14} col={c.ink3} style={{ alignSelf: 'flex-end', marginHorizontal: 12, marginTop: 3 }}>{fmtClock(m.sent_at)}</T>
        <T v s={22} lh={28} style={{ paddingHorizontal: 16, paddingTop: 10 }}>{`${pct(whole.filter(r => r.seen_at).length, whole.length)}% seen`}</T>
        <SearchBar placeholder="Search students" value={q} onChange={setQ} />
        {seen.length ? <Sec>{`Seen by ${seen.length}`}</Sec> : null}
        {seen.length ? <Grp>{(allA ? seen : seen.slice(0, 2)).map(r => row(r, `${fmtDay(r.seen_at)}, ${fmtClock(r.seen_at)}`))}{moreRow(seen.length, allA, setAllA)}</Grp> : null}
        {not.length ? <Sec>{`Not seen yet ${not.length}`}</Sec> : null}
        {not.length ? <Grp>{(allB ? not : not.slice(0, 2)).map(r => row(r, `Delivered ${fmtClock(r.delivered_at)}`))}{moreRow(not.length, allB, setAllB)}</Grp> : null}
      </Body>
    </Screen>
  );
};

/* ---------- Poll votes (P03) ---------- */
const PollResults = ({ route }: any) => {
  useData();
  const m = byId('messages', route.params?.messageId), p = byId('polls', m?.poll_id), ch = byId('chats', m?.chat_id);
  const [openId, setOpenId] = useState<string | null>(null);
  if (!p || !ch) return <Screen><Hdr title="Poll votes" /></Screen>;
  const opts = where('poll_options', o => o.poll_id === p.id).sort((a, b) => a.sort - b.sort), votes = where('poll_votes', v => v.poll_id === p.id);
  const aud = audience(ch), voters = new Set(votes.map(v => v.user_id)), notYet = aud.filter(a => !voters.has(a.user_id));
  const owner = m.sender_id === meId();
  const namesOf = (ids: string[], all: boolean) => { const ns = ids.map(u => profile(u)?.full_name); return all || ns.length <= 3 ? ns.join(', ') : `${ns.slice(0, ns.length >= 20 ? 3 : 2).join(', ')} and ${ns.length - (ns.length >= 20 ? 3 : 2)} more`; };
  const names = (x: any) => { const ids = votes.filter(v => v.option_id === x.id).map(v => v.user_id); return { n: ids.length, text: ids.length ? namesOf(ids, openId === x.id) : 'No votes yet' }; };
  return (
    <Screen>
      <Hdr title="Poll votes" sub={`${chatLabel(ch)} · ${peopleCount(ch.id)} people`} />
      <Body pad={24}>
        <T v s={18} lh={24} style={{ paddingHorizontal: 16, paddingTop: 10 }}>{p.question}</T>
        <T s={14} lh={20} col={c.ink2} style={{ paddingHorizontal: 16, paddingTop: 4 }}><T v s={14} lh={20}>{`${voters.size} of ${aud.length}`}</T>{' voted'}{p.closed_at ? ' · Poll closed' : ''}</T>
        <View style={{ gap: 10, marginTop: 12 }}>
          {opts.map(o => { const { n, text } = names(o); return (
            <Grp key={o.id}><Li min={60} title={<Row gap={8}><T s={15} lh={20} style={{ flex: 1 }}>{o.text}</T><T v s={15} lh={20}>{n}</T></Row>} sub={<T s={12} lh={16} col={c.ink3} n={openId === o.id ? undefined : 2}>{text}</T>} onPress={() => setOpenId(openId === o.id ? null : o.id)} /></Grp>
          ); })}
          <Grp>
            <Li title={<Row gap={8}><T s={15} lh={20} style={{ flex: 1 }}>Not voted yet</T><T v s={15} lh={20}>{notYet.length}</T></Row>} sub={openId === 'not' ? <T s={12} lh={16} col={c.ink3}>{notYet.map(a => profile(a.user_id)?.full_name).join(', ')}</T> : undefined} right={<Ms n={openId === 'not' ? 'expand_less' : 'chevron_right'} col={c.ink3} />} onPress={() => setOpenId(openId === 'not' ? null : 'not')} />
          </Grp>
        </View>
        {owner && !p.closed_at ? <BtnS style={{ marginHorizontal: 16, marginTop: 16 }} onPress={() => { mut(() => { p.closed_at = Date.now(); }); toast('Poll closed', () => mut(() => { p.closed_at = null; })); }}>Close poll</BtnS> : null}
      </Body>
    </Screen>
  );
};

/* ---------- Registry ---------- */
export const roots = { faculty: ChatsList, student: ChatsList };
export const screens: any = {
  'Chat-S01-Chats': ChatsList, 'Chat-F01-Chats': ChatsList, 'Chat-A01-Archive': Archive, 'Chat-S04-Past': PastChat,
  'Chat-S05a-SearchStart': Search, 'Chat-S05-Search': Search, 'Chat-X01-NewChat': NewChat, 'Chat-X02-NewGroup': NewGroup,
  'Chat-S02-Course': CourseChat, 'Chat-F02-Course': CourseChat, 'Chat-P02-PollVote': CourseChat, 'Chat-F25-Pinned': CourseChat, 'Chat-F26-AddedTodo': CourseChat,
  'Chat-S03-Thread': Thread, 'Chat-R01-File': FileScreen, 'Chat-F05R-Resources': AddFromResources, 'Chat-F11-Info': SeenBy, 'Chat-P03-PollResults': PollResults,
  'Chat-S09Q-ReplyPrivately': ReplyPrivately,
};

/* ---------- Seed (PRD 11.1 Chat). Runs after seedRes and seedBuzz; db() isn't ready, so rows go on d directly. ---------- */
export function seedChat(d: any) {
  const off = new Date().getHours() < 10 ? -1 : 0; // the canvas's "today" runs to 9:42 am; before 10 it plays as yesterday so nothing is in the future.
  const at = (dd: number, h: number, m = 0) => days(dd + off, h, m);
  const prof = (id: string) => d.profiles.find((p: any) => p.id === id);
  const chatRow = (id: string) => d.chats.find((x: any) => x.id === id);
  const mem = (id: string) => d.chat_members.filter((m: any) => m.chat_id === id);
  const mrow = (cid: string, u: string) => d.chat_members.find((m: any) => m.chat_id === cid && m.user_id === u);
  const now = Date.now();
  const nextThu = (w = 0, h = 16) => { const x = new Date(); x.setDate(x.getDate() + ((4 - x.getDay() + 7) % 7 || 7) + w * 7); x.setHours(h, 0, 0, 0); return x.getTime(); };

  // Canvas people the base seed places differently.
  const rahul = prof('p-rahul'); rahul.role = 'faculty'; delete rahul.class_label; d.division_members = d.division_members.filter((m: any) => m.student_id !== 'p-rahul'); // faculty now, not on the roster
  mrow('chat-class-a', 'p-rahul').role = 'faculty';
  const t4f = mrow('chat-team4', 'p-prakash'); t4f.user_id = 'p-rahul'; t4f.role = 'admin'; mrow('chat-team4', 'p-rohan').role = 'member'; chatRow('chat-team4').created_by = 'p-rahul'; // groups are faculty-made (CH-4)
  const swapFac = (o: string, cid: string, from: string, to: string, label: string) => { const f = d.offering_faculty.find((x: any) => x.offering_id === o && x.faculty_id === from); f.faculty_id = to; f.label = label; mrow(cid, from).user_id = to; };
  swapFac('o-ds-past', 'chat-ds-past', 'p-prakash', 'p-anita', 'Teaches DS');
  swapFac('o-dbms-past', 'chat-dbms-past', 'p-suman', 'p-vikram', 'Teaches DBMS');
  prof('s-div-1-1').full_name = 'Siddhi Naik';
  // Practice as drawn: Aditya, Kevin and Pooja are in it. Challenge is 9 with Anita. Robotics reaches 48.
  const prac = mem('chat-practice').filter((m: any) => m.user_id.startsWith('s-'));
  ['p-aditya', 'p-kevin', 'p-pooja'].forEach((u, i) => { prac[i].user_id = u; });
  const chal = mem('chat-challenge').find((m: any) => m.user_id.startsWith('s-')); d.chat_members.splice(d.chat_members.indexOf(chal), 1);
  chatRow('chat-challenge').ends_at = days(11, 17);
  ['s-div-a-46', 's-div-a-47'].forEach(u => { d.club_members.push({ club_id: 'club-robo', user_id: u, role: 'member' }); d.chat_members.push({ chat_id: 'chat-robo', user_id: u, role: 'member', notify: 'every', muted: false, joined_at: days(-80), left_at: null }); });
  // Years the term picker lists.
  d.academic_years.push({ id: 'y2425', label: '2024–25', is_current: false });
  d.terms.push({ id: 't-past3', year_id: 'y2526', parity: 'odd', semester_no: 3, starts_on: days(-420), ends_on: days(-310) }, { id: 't-2425o', year_id: 'y2425', parity: 'odd', semester_no: 1, starts_on: days(-790), ends_on: days(-680) }, { id: 't-2425e', year_id: 'y2425', parity: 'even', semester_no: 2, starts_on: days(-650), ends_on: days(-530) });
  // Ended focus batch in the archive: Data Structures · Revision, 14 people.
  const divA = d.division_members.filter((m: any) => m.division_id === 'div-a').map((m: any) => m.student_id);
  d.chats.push({ id: 'chat-ds-rev', kind: 'focus_batch', parent_chat_id: 'chat-ds-past', offering_id: 'o-ds-past', division_id: 'div-a', name: 'Revision', img: 'ds', status: 'closed', who_can_send: 'everyone', students_can_poll: false, students_can_share_files: true, academic_year_id: 'y2526', created_by: 'p-anita', created_at: days(-240), ends_at: days(-200) });
  ['p-anita', 'p-rohan', ...divA.slice(20, 32)].forEach(user_id => d.chat_members.push({ chat_id: 'chat-ds-rev', user_id, role: user_id === 'p-anita' ? 'faculty' : 'member', notify: 'every', muted: false, joined_at: days(-240), left_at: null }));

  d.chat_members.forEach((m: any) => { m.last_read_at = now; });

  /* Files that live only in chats. Reuses a Resources row when one has the same name. */
  const fileRes = (name: string, mime: string, size_bytes: number, page_count: number, uploaded_by: string, title: string, lines: string[], folder_id: string | null, chat_id: string, created_at: number) => {
    const have = d.files.find((f: any) => f.name === name);
    if (have) return d.resources.find((r: any) => r.file_id === have.id)?.id;
    const id = `f-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, rid = `res-${id.slice(2)}`;
    d.files.push({ id, name, mime, size_bytes, page_count, uploaded_by, created_at });
    d.file_pages.push({ file_id: id, page_no: 1, title, text: lines.join('\n') });
    d.resources.push({ id: rid, folder_id, chat_id, kind: 'file', file_id: id, title: title, added_by: uploaded_by, added_by_role: prof(uploaded_by)?.role, source: 'chat', created_at, updated_at: created_at });
    return rid;
  };
  const PDF = 'application/pdf', DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  /* Messages. Receipts are written for demo users' own messages, which is where Seen shows. */
  let n = 0;
  const DEMO = ['p-anita', 'p-rohan', 'p-neha'];
  const M = (id: string | null, chat_id: string, sender_id: string, sent_at: number, body: string, x: any = {}) => {
    const { seen, seenIds, ...rest } = x;
    const row = { id: id || `m-s${++n}`, chat_id, sender_id, kind: 'text', body, sent_at, status: 'sent', ...rest };
    d.messages.push(row);
    if (DEMO.includes(sender_id) && row.kind !== 'system' && !row.thread_root_id && !row.scheduled_for) {
      const isFac = prof(sender_id).role === 'faculty', dm = chatRow(chat_id)?.kind === 'dm';
      const who = mem(chat_id).filter((m: any) => m.user_id !== sender_id && (dm || !isFac || m.role === 'member')).map((m: any) => m.user_id);
      const order = seenIds ? [...seenIds, ...who.filter((u: string) => !seenIds.includes(u))] : who;
      const k = seen ?? order.length;
      order.forEach((u: string, i: number) => d.message_receipts.push({ message_id: row.id, user_id: u, delivered_at: sent_at, seen_at: i < k ? Math.min(now, sent_at + 45e3 + (seenIds ? 0 : i * 2e3)) : null }));
    }
    return row;
  };
  const Sys2 = (chat_id: string, sender_id: string, sent_at: number, body: string, x: any = {}) => M(null, chat_id, sender_id, sent_at, body, { kind: 'system', ...x });

  /* DAA · Div A */
  const pool = divA.filter((u: string) => !['p-rohan', 'p-rahul'].includes(u));
  const pollId = 'poll-extra', thu = fmtDate(nextThu()), fri = fmtDate(nextThu() + 864e5), sat = fmtDate(nextThu() + 2 * 864e5);
  d.polls.push({ id: pollId, message_id: 'msg-poll', question: 'Which day works for the extra session?', multi_answer: false, names_visible: false, closed_at: null });
  const pollOpts = [[`${thu}, 4 pm`, 22, ['p-aditya', 'p-neha', 'p-kevin']], [`${fri}, 4 pm`, 13, ['p-pooja', 'p-riya']], [`${sat}, 10 am`, 6, ['p-aryan', 'p-vishal']]] as any[];
  const namedVoters = pollOpts.flatMap(o => o[2]);
  let vi = 0, rest = pool.filter((u: string) => !namedVoters.includes(u));
  pollOpts.forEach((o, sort) => {
    const id = `po-${sort}`;
    d.poll_options.push({ id, poll_id: pollId, text: o[0], sort });
    const ids = [...o[2], ...rest.slice(vi, vi + o[1] - o[2].length)]; vi += o[1] - o[2].length;
    ids.forEach((user_id: string) => d.poll_votes.push({ poll_id: pollId, option_id: id, user_id }));
  });
  M('msg-poll', 'chat-daa-a', 'p-anita', at(-1, 10, 5), '', { kind: 'poll', poll_id: pollId });
  M(null, 'chat-daa-a', 'p-kevin', at(-1, 10, 12), 'Thursday works for most of us ma’am');
  M('msg-rohan-it2', 'chat-daa-a', 'p-rohan', at(0, 9, 2), 'Ma’am, is IT2 till slide 49 or the whole unit?', { seen: 40 });
  M(null, 'chat-daa-a', 'p-anita', at(0, 9, 5), 'Till slide 49. Unit 3 is not in IT2.', { thread_root_id: 'msg-rohan-it2' });
  M(null, 'chat-daa-a', 'p-neha', at(0, 9, 14), 'Does that include the examples on 47–49?', { thread_root_id: 'msg-rohan-it2' });
  M(null, 'chat-daa-a', 'p-anita', at(0, 9, 20), 'Yes, include them.', { thread_root_id: 'msg-rohan-it2' });
  const SLIDES = 'Unit 3 slides for tomorrow. Read 1–20 before class.', sent = at(0, 9, 12);
  const others46 = divA.filter((u: string) => !['p-neha', 'p-rohan', 'p-aditya', 'p-pooja'].includes(u)).slice(0, 46);
  M('msg-slides', 'chat-daa-a', 'p-anita', sent, SLIDES, { kind: 'file', resource_id: 'res-greedy', send_group_id: 'sg-slides', seen: 48, seenIds: [...others46, 'p-rohan', 'p-neha'] });
  d.message_receipts.forEach((r: any) => { if (r.message_id !== 'msg-slides' || !r.seen_at) return; r.seen_at = Math.min(now, sent + (r.user_id === 'p-neha' ? 2 : 1) * 60e3 - (others46.includes(r.user_id) ? 20e3 : 0)); });
  Sys2('chat-daa-a', 'p-anita', at(0, 9, 13), '{who} pinned a message', { me_suffix: ' for 7 days' });
  d.pins.push({ id: 'pin-slides', chat_id: 'chat-daa-a', message_id: 'msg-slides', pinned_by: 'p-anita', expires_at: days(7) });
  M('msg-rohan-thanks', 'chat-daa-a', 'p-rohan', at(0, 9, 30), 'Thank you ma’am', { seen: 12 });
  M('msg-kevin-thanks', 'chat-daa-a', 'p-kevin', at(0, 9, 31), 'Thank you ma’am');
  const rx = (message_id: string, emoji: string, count: number, withRohan = false) => {
    const ids = [...(withRohan ? ['p-rohan'] : []), ...pool.slice(3, 3 + count - (withRohan ? 1 : 0))];
    ids.forEach(user_id => d.message_reactions.push({ message_id, user_id, emoji }));
  };
  rx('msg-rohan-it2', '🙏', 6, true); rx('msg-slides', '👍', 14); rx('msg-slides', '❤️', 21, true);
  ['msg-sched-a', 'msg-sched-eve'].forEach((id, i) => M(id, i ? 'chat-daa-eve' : 'chat-daa-a', 'p-anita', days(1, 8), SLIDES, { kind: 'file', resource_id: 'res-greedy', scheduled_for: days(1, 8), send_group_id: 'sg-sched', client_id: id }));

  /* DAA · Evening batch and Div 1 */
  M('msg-slides-eve', 'chat-daa-eve', 'p-anita', at(-1, 17), SLIDES, { kind: 'file', resource_id: 'res-greedy', send_group_id: 'sg-slides-eve', seen: 41 });
  M(null, 'chat-daa-eve', 's-div-eve-2', at(0, 9, 14), 'Ma’am, will the slides be covered in Tuesday’s class?');
  M(null, 'chat-daa-eve', 's-div-eve-3', at(0, 9, 17), 'Same doubt ma’am');
  M(null, 'chat-daa-eve', 'p-omkar', at(0, 9, 20), 'Ma’am, is the lab open today?');
  M(null, 'chat-daa-1', 'p-anita', at(-2, 11), 'Extra lab slot on Monday is confirmed.');
  M(null, 'chat-daa-1', 's-div-1-1', at(-2, 11, 30), 'Thank you ma’am');

  /* CN, OS */
  M(null, 'chat-cn-a', 'p-kiran', at(-2, 9, 10), 'Lab 6 is due this Friday. Attach the output in this chat.');
  M(null, 'chat-cn-a', 'p-rohan', at(-2, 9, 20), 'Thank you sir');
  M(null, 'chat-cn-a', 'p-neha', at(-1, 15, 30), 'Lab 6 output attached');
  M(null, 'chat-os-a', 'p-suman', at(-3, 14, 5), 'OS quiz moves to Friday, 2 pm.');
  M(null, 'chat-os-a', 'p-kevin', at(-3, 14, 20), 'Noted ma’am');

  /* Past course chats */
  const dsNotes = fileRes('DS revision, all units.pdf', PDF, 1.2e6, 18, 'p-anita', 'DS revision, all units', ['Data Structures · Units 1–5'], null, 'chat-ds-past', days(-181, 16, 2));
  M(null, 'chat-ds-past', 'p-anita', days(-190, 10), 'ESE timetable is out. Check the notice board.');
  M(null, 'chat-ds-past', 'p-anita', days(-181, 16, 2), 'Final revision notes. All the best for the ESE.', { kind: 'file', resource_id: dsNotes });
  M(null, 'chat-ds-past', 'p-rohan', days(-181, 16, 10), 'Thank you ma’am');
  M(null, 'chat-dbms-past', 'p-neha', days(-185, 11), 'Sir, is normalisation in the ESE?');
  M(null, 'chat-dbms-past', 'p-vikram', days(-185, 11, 20), 'ESE portion is all 5 units');
  M(null, 'chat-dm-past', 'p-kiran', days(-187, 9, 30), 'Slides for the last unit are up.');
  M(null, 'chat-dm-past', 'p-rohan', days(-187, 9, 45), 'Thank you sir');
  M(null, 'chat-ds-rev', 'p-anita', days(-221, 12), 'All the best for IT2');

  /* Class group */
  Sys2('chat-class-a', 'p-anita', days(-85, 9), 'Sem 5 · Aug 2026', { sys_style: 'day' });
  M(null, 'chat-class-a', 'p-rohan', at(-2, 18, 10), 'Ask Naik ma’am if IT2 covers Unit 3');
  M(null, 'chat-class-a', 'p-rohan', at(0, 9, 38), 'Anyone has the TCS form link?');
  M(null, 'chat-class-a', 'p-sara', at(0, 9, 40), 'Here, registration closes Fri', { kind: 'link', link_url: 'https://nextstep.tcs.com', link_title: 'TCS NextStep registration', link_provider: 'nextstep.tcs.com' });
  M(null, 'chat-class-a', 'p-rahul', at(0, 9, 41), 'Also on Buzz. Final years only.', { kind: 'buzz_card', buzz_post_id: 'post-tcs' });
  M(null, 'chat-class-a', 'p-rohan', at(0, 9, 42), 'Thank you sir', { seen: 30 });

  /* Club, group */
  M(null, 'chat-code', 'p-anita', at(-3, 17, 5), 'Weekly contest this Saturday, 10 am in Lab 3. Two hours, five problems.');
  M(null, 'chat-code', 'p-sara', at(-3, 17, 20), 'Uploaded the DP sheet to Resources.');
  M(null, 'chat-code', 'p-kevin', at(-1, 19, 2), 'Is it individual or teams of two?');
  M(null, 'chat-code', 'p-rohan', at(-1, 19, 10), 'Individual this week. Teams for the hackathon.');
  M(null, 'chat-code', 'p-anita', at(0, 8, 15), 'Hackathon details are on Buzz.', { kind: 'buzz_card', buzz_post_id: 'post-code-hack' });
  M(null, 'chat-robo', 'p-sara', at(-2, 15, 12), 'Meet at 4 pm in Lab 2. Bring your laptops.');
  M(null, 'chat-robo', 'p-kevin', at(-2, 15, 20), 'Is the line-follower kit ready?');
  M(null, 'chat-robo', 'p-rohan', at(-2, 15, 24), 'Coming at 4', { seen: 18 });
  const schem = fileRes('Schematic v3.pdf', PDF, 1.8e6, 2, 'p-sara', 'Schematic v3', ['Line-follower · power board'], null, 'chat-team4', at(0, 8, 47));
  M(null, 'chat-team4', 'p-sara', at(0, 8, 47), 'Pushed the circuit schematic', { kind: 'file', resource_id: schem });
  M(null, 'chat-team4', 'p-kevin', at(0, 8, 55), SLIDES, { kind: 'file', resource_id: 'res-greedy', forwarded_from_id: 'msg-slides' });
  M(null, 'chat-team4', 'p-rahul', at(0, 9, 2), 'Looks good. Add the power section before Friday.');
  M(null, 'chat-team4', 'p-rohan', at(0, 9, 5), 'On it');

  Sys2('chat-paper', 'p-anita', at(-12, 11, 0), '{who} made IEEE paper team');
  M(null, 'chat-paper', 'p-anita', at(-2, 16, 30), 'Abstract is due to the conference on the 25th. Send me your sections by Friday.');
  M(null, 'chat-paper', 'p-neha', at(-2, 16, 41), 'Related work is done. Sharing tonight.');
  M(null, 'chat-paper', 'p-vikram', at(-1, 10, 5), 'I can review the results section on Thursday.');
  M(null, 'chat-paper', 'p-rohan', at(0, 8, 50), 'Experiments section draft is up.');

  /* DMs */
  const prop = fileRes('Mini project proposal.pdf', PDF, 840e3, 6, 'p-rohan', 'Mini project proposal', ['Team 4 · TE Comp'], null, 'chat-dm-rohan-anita', at(-1, 14, 10));
  M(null, 'chat-dm-rohan-anita', 'p-rohan', at(-1, 14, 10), 'Ma’am, can I meet you about the mini project?', { kind: 'file', resource_id: prop, edited_at: at(-1, 14, 11) });
  M(null, 'chat-dm-rohan-anita', 'p-anita', at(-1, 14, 18), 'Sure, come by after 3 pm');
  M(null, 'chat-dm-anita-omkar', 'p-omkar', at(0, 8, 31), 'Can I submit the lab write-up tomorrow, ma’am? I was at the hospital today.', { private_reply_of_id: 'msg-slides-eve' });
  M(null, 'chat-dm-anita-omkar', 'p-anita', at(0, 8, 40), 'Yes, by 5 pm tomorrow. Hope you’re okay.');
  M(null, 'chat-dm-rohan-neha', 'p-neha', at(-1, 20, 15), 'Did you get the Unit 3 slides?');
  M(null, 'chat-dm-rohan-neha', 'p-rohan', at(-1, 20, 22), 'Yes, they’re in the DAA chat');

  /* Focus batches */
  const made = (id: string, name: string, on: number, end: number, parent = 'DAA · Div A') => Sys2(id, 'p-anita', on, `{who} made ${name} from ${parent} on ${fmtDate(on)}. It ends ${fmtDate(end)}, the end of the semester.`);
  const practiceEnds = chatRow('chat-practice').ends_at;
  made('chat-practice', 'Practice', at(-3, 15, 50), practiceEnds);
  const qset = fileRes('Unit 3 question set.docx', DOCX, 86e3, 4, 'p-anita', 'Unit 3 question set', ['DAA · Practice before IT2', '1. Fractional knapsack by ratio', '2. Activity selection', '3. Huffman codes for 6 symbols'], 'fld-practice', 'chat-practice', at(-1, 16, 5));
  M(null, 'chat-practice', 'p-anita', at(-1, 16, 5), 'Unit 3 practice before IT2. Bring your attempts at Q1–Q4.', { kind: 'file', resource_id: qset, seen: 11 });
  M(null, 'chat-practice', 'p-pooja', at(-1, 16, 20), 'Which room, ma’am?');
  M(null, 'chat-practice', 'p-anita', at(-1, 16, 22), 'Room 204, Thursdays at 4 pm. It’s in your Schedule.', { seen: 12 });
  made('chat-challenge', 'Challenge', at(-6, 11), chatRow('chat-challenge').ends_at);
  M(null, 'chat-challenge', 'p-anita', at(-1, 12), 'Challenge set 2 is up. Try the last two without notes.', { seen: 7 });
  const labEnd = chatRow('chat-lab5').ends_at;
  M(null, 'chat-lab5', 'p-anita', days(-30, 10), 'Redo slots are in Lab 3 this week.');
  M(null, 'chat-lab5', 'p-pooja', days(-29, 11), 'Thank you ma’am, this helped a lot');
  Sys2('chat-lab5', 'p-anita', labEnd, `Lab 5 redo ended on ${fmtDate(labEnd)}. All ${mem('chat-lab5').length} people can still read it and download files.`);
  const session = (chat_id: string, starts_at: number, topic: string, attended_count: number | null = null, room = 'Room 204') => d.focus_batch_sessions.push({ id: `sess-${d.focus_batch_sessions.length + 1}`, chat_id, starts_at, ends_at: starts_at + 36e5, room, topic, repeat_rule: 'weekly', attended_count });
  session('chat-practice', nextThu(-1), 'Unit 3 · warm-up', 11);
  session('chat-practice', nextThu(), 'Unit 3 · Q1–Q4');
  session('chat-practice', nextThu(1), 'Unit 3 · Q5–Q8');
  session('chat-practice', nextThu(2), 'Revision before the ESE');
  session('chat-challenge', nextThu(-1, 17), 'Greedy proofs', 8, 'Room 310');
  session('chat-challenge', nextThu(0, 17), 'Set 2 walkthrough', null, 'Room 310');
  session('chat-lab5', days(-30, 16), 'Lab 5 redo', 6, 'Lab 3');

  /* Unread badges as the canvas: Anita 2 + 3 = 5; Rohan 2 + 1 = 3. */
  mrow('chat-daa-a', 'p-anita').last_read_at = at(0, 9, 25);
  mrow('chat-daa-eve', 'p-anita').last_read_at = at(0, 9, 10);
  mrow('chat-daa-a', 'p-rohan').last_read_at = at(0, 9, 10);
  mrow('chat-class-a', 'p-rohan').last_read_at = at(0, 9, 40);

  /* Saved messages and recent searches */
  d.todo_items.push({ id: 'todo-msg-anita', user_id: 'p-anita', source: 'message', message_id: 'msg-rohan-it2', state: 'open', saved_at: at(0, 9, 3) }, { id: 'todo-msg-rohan', user_id: 'p-rohan', source: 'message', message_id: 'msg-slides', state: 'open', saved_at: at(0, 9, 13) });
  ['p-anita', 'p-rohan'].forEach(user_id => ['naik', 'IT2 question bank', 'lab 6'].forEach((query, i) => d.recent_searches.push({ user_id, query, created_at: days(-1 - i) })));
}
