// Chat places (PRD 6.5–6.7): people, settings, in-chat search, focus batches, class group, club, group, DM.
import React, { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { StackActions } from '@react-navigation/native';
import RNDateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { BtnP, BtnS, BtnT, Body, Badge, Chips, ChatRow, Ck, Empty, Fi, Field, Fo, Grp, Hdr, IB, Li, Ms, Pic, Pill, Row, Screen, SearchBar, Sec, Seg, SheetBody, SheetRow, Sw, T, Tag, Tap, closeSheet, confirmSheet, fileIcon, openSheet, toast, useBottom } from './ui';
import { c, P } from './theme';
import { IMG } from './images';
import { byId, days, dayDiff, db, divisionStudents, firstName, fmtDate, fmtDay, fmtRow, fmtShort, fmtSize, fmtTime, insert, isFaculty, isOffline, meId, memberOf, members, mut, newId, profile, useData, where } from './db';
import { back, go, goTab, navRef, swap } from './nav';
import { chatMessages, chatTitle, division, openChat, openDm, otherMember, peopleCount, PlaceShell, previewOf, sendMessage, canApprove, answerClubRequest } from './place';
import { ChatTab } from './chat';
import { BuzzFeed } from './buzz';
import { courseFolders, markViewed, resourcesIn } from './res';

/* ---------- Small helpers ---------- */
const courseOf = (ch: any) => byId('courses', byId('offerings', ch.offering_id)?.course_id);
const place = (ch: any) => `${courseOf(ch)?.short} · ${division(ch.division_id)?.name}`;
const termEnd = (ch: any) => byId('terms', division(ch.division_id)?.term_id)?.ends_on ?? ch.ends_at;
const dayLow = (t: number) => { const s = fmtDay(t); return s === 'Today' || s === 'Yesterday' ? s.toLowerCase() : s; };
const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = (t: number) => WEEK[new Date(t).getDay()];
const range = (a: number, b: number) => { const x = fmtTime(a), y = fmtTime(b); return x.slice(-2) === y.slice(-2) ? `${x.slice(0, -3)}–${y}` : `${x}–${y}`; };
const isBlocked = (a: string, b: string) => where('blocks', x => x.blocker_id === a && x.blocked_id === b).length > 0;

const Sys = ({ icon = 'lock', children }: any) => (
  <Row gap={4} style={{ alignSelf: 'center', justifyContent: 'center', maxWidth: 300, paddingTop: 16, paddingBottom: 4, paddingHorizontal: 12 }}>
    <Ms n={icon} s={14} col={c.ink3} /><T s={12} lh={17} col={c.ink3} center style={{ flexShrink: 1 }}>{children}</T>
  </Row>
);
const Lbl = ({ children }: any) => <T s={13} lh={18} w="600" col={c.ink2} style={{ marginTop: 16, marginBottom: 8 }}>{children}</T>;

/** Native date or time picker: Android dialog, iOS spinner in a sheet. */
const IosPick = ({ mode, value, min, max, onPick }: any) => {
  const [v, setV] = useState(new Date(value));
  return (
    <SheetBody title={mode === 'date' ? 'Pick a date' : 'Pick a time'}>
      <RNDateTimePicker mode={mode} display="spinner" value={v} minimumDate={min ? new Date(min) : undefined} maximumDate={max ? new Date(max) : undefined} onValueChange={(_, d) => setV(d)} />
      <BtnP style={{ marginTop: 12 }} onPress={() => { closeSheet(); onPick(v.getTime()); }}>Save</BtnP>
    </SheetBody>
  );
};
const pick = (mode: 'date' | 'time', value: number, onPick: (t: number) => void, min?: number, max?: number) => {
  if (P.android) return DateTimePickerAndroid.open({ mode, value: new Date(value), minimumDate: min ? new Date(min) : undefined, maximumDate: max ? new Date(max) : undefined, onValueChange: (_, d) => onPick(d.getTime()) });
  openSheet(() => <IosPick mode={mode} value={value} min={min} max={max} onPick={onPick} />);
};

/* ---------- Settings pieces ---------- */
const Hero = ({ img, name, shape = 'course', sub, onEdit, onCam, badge }: any) => (
  <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 18, paddingHorizontal: 24 }}>
    <View>
      <View style={{ width: 96, height: 96, borderRadius: shape === 'course' ? 28 : 48, overflow: 'hidden' }}><Pic img={img} name={name} size={96} shape={shape} /></View>
      {badge || onCam ? (
        <Tap disabled={!onCam} onPress={onCam} label={onCam ? 'Change picture' : 'Focus batch'} style={{ position: 'absolute', right: -5, bottom: -5, width: 32, height: 32, borderRadius: 16, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 2px ${c.page}` } as any}>
          <Ms n={onCam ? 'photo_camera' : badge} s={18} col={c.ink2} />
        </Tap>
      ) : null}
    </View>
    <Row gap={2} style={{ marginTop: 14, maxWidth: '100%' }}>
      <T v s={22} lh={28} center n={2} style={{ flexShrink: 1 }}>{name}</T>
      {onEdit ? <IB n="edit" s={18} label="Rename" onPress={onEdit} col={c.ink2} /> : null}
    </Row>
    <T s={14} lh={20} col={c.ink2} center style={{ marginTop: 2 }}>{sub}</T>
  </View>
);
const NotifySheet = ({ chatId }: any) => {
  useData(); const m = memberOf(chatId);
  const set = (v: string) => { mut(() => { if (m) m.notify = v; }); closeSheet(); };
  return (
    <SheetBody title="Notifications">
      <SheetRow icon="notifications" label="Every message" onPress={() => set('every')} right={m?.notify !== 'off' ? <Ms n="check" col={c.greenText} /> : null} />
      <SheetRow icon="notifications_off" label="Off" onPress={() => set('off')} right={m?.notify === 'off' ? <Ms n="check" col={c.greenText} /> : null} />
    </SheetBody>
  );
};
const NotifyRow = ({ chatId }: any) => (
  <Li left={<Ms n="notifications" col={c.ink2} />} title="Notifications" chevron onPress={() => openSheet(() => <NotifySheet chatId={chatId} />)}
    right={<T s={14} lh={20} col={c.ink3}>{memberOf(chatId)?.notify === 'off' ? 'Off' : 'Every message'}</T>} />
);
const leave = (ch: any) => confirmSheet({
  title: `Leave ${ch.name}?`, body: "You can't read it after you leave.", action: 'Leave',
  onConfirm: () => {
    sendMessage({ chatId: ch.id, kind: 'system', body: `${profile(meId())?.full_name} left` });
    mut(() => { const m = memberOf(ch.id); if (m) m.left_at = Date.now(); });
    navRef.dispatch(StackActions.popToTop()); goTab('Chat');
  },
});
/** Faculty-created groups never expire; the creator archives them (read-only, still searchable). */
const archiveGroup = (ch: any) => confirmSheet({
  title: `Archive ${ch.name}?`, body: 'Members can still read it and find it in search. No one can post until you unarchive it.', action: 'Archive group', neg: false,
  onConfirm: () => { sendMessage({ chatId: ch.id, kind: 'system', body: '{who} archived the group' }); mut(() => { ch.status = 'archived'; }); toast('Group archived', () => mut(() => { ch.status = 'active'; })); },
});
/** Creator removes someone from a faculty-created group. */
const removeMember = (ch: any, p: any) => confirmSheet({
  title: `Remove ${p.full_name}?`, body: `They can't read ${ch.name} after this.`, action: 'Remove',
  onConfirm: () => {
    mut(() => { const m = memberOf(ch.id, p.id); if (m) m.left_at = Date.now(); });
    sendMessage({ chatId: ch.id, kind: 'system', body: `{who} removed ${p.full_name}` });
    toast(`${p.full_name} removed`);
  },
});
const NameSheet = ({ ch, max, note }: any) => {
  const [v, setV] = useState(ch.name || '');
  const save = () => {
    const old = ch.name, nm = v.trim(); if (!nm) return;
    mut(() => { ch.name = nm; }); closeSheet();
    toast('Name changed', () => mut(() => { ch.name = old; }));
  };
  return (
    <SheetBody title="Name">
      <Field accessibilityLabel="Name" autoFocus value={v} onChangeText={setV} maxLength={max} />
      <T s={12} lh={17} col={c.ink3} style={{ textAlign: 'right', marginTop: 4 }}>{v.length} / {max}</T>
      <T s={12} lh={17} col={c.ink3}>{note}</T>
      <Row gap={8} style={{ marginTop: 16 }}>
        <BtnS style={{ flex: 1 }} onPress={closeSheet}>Cancel</BtnS>
        <BtnP style={{ flex: 1 }} disabled={!v.trim()} onPress={save}>Save</BtnP>
      </Row>
    </SheetBody>
  );
};
const rename = (ch: any) => openSheet(() => ch.kind === 'group'
  ? <NameSheet ch={ch} max={40} note="Everyone in the group sees the new name." />
  : <NameSheet ch={ch} max={30} note={`All ${peopleCount(ch.id)} people see the new name.`} />);

/** Chat-F22-Settings, S10, S11, S12: one screen, faculty controls and Leave by role and kind. */
const Settings = ({ route }: any) => {
  useData();
  const ch = byId('chats', route.params?.chatId); if (!ch) return null;
  const fac = route.name === 'Chat-F22-Settings', n = peopleCount(ch.id), set = (k: string, v: any) => mut(() => { ch[k] = v; });
  const sub = ch.kind === 'course' ? `${division(ch.division_id)?.name} · ${n} people` : ch.kind === 'club' ? `Club · ${n} people` : `Class group · ${n} people`;
  const foot = fac ? 'Your college sets the name and picture' : ch.kind === 'course' ? `Only people in ${place(ch)} can read this chat` : ch.kind === 'club' ? 'Only club members can read it' : `Only people in ${ch.name} can read it`;
  return (
    <Screen>
      <Hdr title="Chat settings" />
      <Body>
        <Hero img={ch.img} name={ch.name} sub={sub} />
        {fac ? <>
          <Sec>Chat</Sec>
          <Grp>
            <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12 }}>
              <T s={15} lh={20}>Who can send messages</T>
              <Seg style={{ marginHorizontal: 0, marginTop: 8 }} items={['Everyone', 'Only faculty']} on={ch.who_can_send === 'faculty' ? 'Only faculty' : 'Everyone'} onPick={x => set('who_can_send', x === 'Everyone' ? 'everyone' : 'faculty')} />
            </View>
            <Li title="Students can make polls" right={<Sw label="Students can make polls" on={!!ch.students_can_poll} onChange={v => set('students_can_poll', v)} />} />
            <Li title="Students can share files" right={<Sw label="Students can share files" on={!!ch.students_can_share_files} onChange={v => set('students_can_share_files', v)} />} />
          </Grp>
          <View style={{ height: 12 }} />
        </> : null}
        <Grp>
          <NotifyRow chatId={ch.id} />
          {ch.kind === 'club' ? <Li left={<Ms n="logout" col={c.negative} />} title="Leave club" titleCol={c.negative} onPress={() => leave(ch)} /> : null}
        </Grp>
        <Sys>{foot}</Sys>
      </Body>
    </Screen>
  );
};

/* ---------- People ---------- */
const people = (chatId: string, f: (p: any, m: any) => boolean = () => true) => members(chatId).map(m => ({ m, p: profile(m.user_id) })).filter(x => x.p && f(x.p, x.m));
const byRoll = (a: any, b: any) => (a.p.roll_number || '').localeCompare(b.p.roll_number || '') || a.p.full_name.localeCompare(b.p.full_name);
const meFirst = (list: any[]) => [...list].sort((a, b) => Number(b.p.id === meId()) - Number(a.p.id === meId()));
const matches = (p: any, q: string) => !q || p.full_name.toLowerCase().includes(q.toLowerCase()) || (p.roll_number || '').startsWith(q);

const PRow = ({ p, sub, tag, green, you, bubble, onRemove }: any) => {
  const mine = p.id === meId();
  return (
    <Li min={56} left={<Pic img={p.img} name={p.full_name} size={36} fac={p.role === 'faculty'} />} title={mine ? (you ? 'You' : `${p.full_name} (you)`) : p.full_name} sub={sub}
      onPress={mine ? undefined : () => openDm(p.id)}
      right={tag || (bubble && !mine) || (onRemove && !mine) ? <Row gap={4}>{tag ? <Tag green={green}>{tag}</Tag> : null}{bubble && !mine && !onRemove ? <Ms n="chat_bubble" s={20} col={c.ink3} /> : null}{onRemove && !mine ? <IB n="person_remove" s={20} col={c.ink3} label={`Remove ${p.full_name}`} onPress={onRemove} style={{ width: 40, height: 40 }} /> : null}</Row> : null} />
  );
};
/** A people section. See all expands in place (10.1). Search shows every match. */
const PSection = ({ title, label, rows, limit, more, q, right }: any) => {
  const [open, setOpen] = useState(false);
  const hits = rows.filter((r: any) => matches(r.p, q));
  if (!hits.length) return null;
  const show = open || q || !limit ? hits : hits.slice(0, limit);
  return (
    <>
      <Sec right={right}>{label ?? `${title} · ${hits.length}`}</Sec>
      <Grp>
        {show.map((r: any) => <PRow key={r.p.id} {...r} />)}
        {show.length < hits.length ? <Li title={more ?? `See all ${hits.length}`} titleCol={c.greenText} onPress={() => setOpen(true)} /> : null}
      </Grp>
    </>
  );
};
const PeopleBody = ({ ph = 'Search people', sections, foot, head }: any) => {
  const [q, setQ] = useState(''), s = q.trim();
  const none = s && !sections.some((x: any) => x.rows.some((r: any) => matches(r.p, s)));
  return (
    <>
      <SearchBar placeholder={ph} value={q} onChange={setQ} />
      <Body>
        {head}
        {none ? <Empty icon="search" title={`No results for “${s}”`} /> : sections.map((x: any) => <PSection key={x.title ?? x.label} q={s} {...x} />)}
        {foot ? <Sys>{foot}</Sys> : null}
      </Body>
    </>
  );
};
/** Add members. Re-adding someone who left clears left_at. */
const AddPeople = ({ ch, title, pool }: any) => {
  useData();
  const [sel, setSel] = useState<string[]>([]), [q, setQ] = useState('');
  const list = pool().filter((p: any) => !memberOf(ch.id, p.id) && matches(p, q.trim()));
  const add = () => {
    const names = sel.map(id => profile(id)?.full_name).join(', ');
    mut(() => sel.forEach(user_id => {
      const old = (db().chat_members || []).find(m => m.chat_id === ch.id && m.user_id === user_id);
      if (old) old.left_at = null;
      else insert('chat_members', { chat_id: ch.id, user_id, role: 'member', notify: 'every', muted: false, last_read_at: Date.now(), joined_at: Date.now(), left_at: null });
    }));
    sendMessage({ chatId: ch.id, kind: 'system', body: `${profile(meId())?.full_name} added ${names}` });
    closeSheet(); toast(sel.length === 1 ? `${names} added` : `${sel.length} people added`);
  };
  return (
    <SheetBody title={title}>
      <SearchBar placeholder="Search by name or roll number" value={q} onChange={setQ} style={{ marginHorizontal: 0, marginTop: 0, marginBottom: 8 }} />
      {list.length ? list.map((p: any) => (
        <SheetRow key={p.id} label={p.full_name} sub={p.roll_number ? `Roll ${p.roll_number}` : p.class_label} right={<Ck sq on={sel.includes(p.id)} />}
          onPress={() => setSel(s => s.includes(p.id) ? s.filter(x => x !== p.id) : [...s, p.id])} />
      )) : <Empty icon="group" title="No one to add" />}
      <BtnP style={{ marginTop: 12 }} disabled={!sel.length} onPress={add}>{sel.length === 1 ? 'Add 1 person' : `Add ${sel.length} people`}</BtnP>
    </SheetBody>
  );
};

/** Chat-F28-People (faculty), Chat-S13-CoursePeople (student). */
const CoursePeople = ({ route }: any) => {
  useData();
  const id = route.params?.chatId, ch = byId('chats', id); if (!ch) return null;
  const fac = isFaculty();
  const label = (uid: string) => where('offering_faculty', f => f.offering_id === ch.offering_id && f.faculty_id === uid)[0]?.label;
  const batch = (uid: string) => where('division_members', m => m.division_id === ch.division_id && m.student_id === uid)[0]?.batch;
  const facs = people(id, p => p.role === 'faculty').map(x => ({ p: x.p, sub: label(x.p.id), you: fac, bubble: !fac }));
  const studs = people(id, p => p.role !== 'faculty').sort(byRoll).map(x => fac ? { p: x.p, sub: `Roll ${x.p.roll_number}` } : { p: x.p, tag: batch(x.p.id) });
  return (
    <Screen>
      <PlaceShell chatId={id} tab="People" stem={route.name}>
        <PeopleBody ph={fac ? 'Search by name or roll number' : 'Search people'} foot={fac ? `Only people in ${place(ch)} can read this chat` : null}
          sections={[{ title: 'Faculty', rows: facs }, { title: 'Students', rows: fac ? studs : meFirst(studs), limit: fac ? 4 : 5 }]} />
      </PlaceShell>
    </Screen>
  );
};
/** Chat-S07-Info: class group people. */
const ClassPeople = ({ route }: any) => {
  useData();
  const id = route.params?.chatId, ch = byId('chats', id); if (!ch) return null;
  const teaches = (uid: string) => where('offering_faculty', f => f.faculty_id === uid && byId('offerings', f.offering_id)?.division_id === ch.division_id && f.label?.startsWith('Teaches'))[0]?.label;
  const facs = people(id, p => p.role === 'faculty').sort((a, b) => Number(b.m.role === 'mentor') - Number(a.m.role === 'mentor')).map(x => ({ p: x.p, sub: x.m.role === 'mentor' ? 'Class mentor' : teaches(x.p.id), bubble: true }));
  const studs = meFirst(people(id, p => p.role !== 'faculty').sort(byRoll)).map(x => ({ p: x.p, sub: `Roll ${x.p.roll_number}` }));
  return (
    <Screen>
      <PlaceShell chatId={id} tab="People" stem={route.name}>
        <PeopleBody foot="Only people in this class group can read it" sections={[{ title: 'Faculty', rows: facs, limit: 2, more: 'See all faculty' }, { title: 'Students', rows: studs, limit: 3 }]} />
      </PlaceShell>
    </Screen>
  );
};
/** Chat-S16-ClubPeople */
const ClubPeople = ({ route }: any) => {
  useData();
  const id = route.params?.chatId, ch = byId('chats', id); if (!ch) return null;
  const row = (x: any) => ({ p: x.p, sub: x.p.class_label });
  const asks = canApprove(ch.club_id) ? where('club_requests', r => r.club_id === ch.club_id && r.status === 'pending') : [];
  const head = asks.length ? <>
    <Sec>{`Asked to join · ${asks.length}`}</Sec>
    {asks.map(r => { const u = profile(r.user_id); return (
      <Li key={r.id} min={60} style={{ paddingHorizontal: 16 }} left={<Pic size={36} img={u?.img} name={u?.full_name} />} title={u?.full_name} sub={u?.class_label} onPress={() => go('Profile', { userId: r.user_id })}
        right={<Row gap={8}>
          <IB n="close" s={20} col={c.ink2} label={`Decline ${u?.full_name}`} onPress={() => answerClubRequest(r, false)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.sunken }} />
          <IB n="check" s={20} col={c.onFill} label={`Approve ${u?.full_name}`} onPress={() => answerClubRequest(r, true)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.green }} />
        </Row>} />
    ); })}
  </> : null;
  return (
    <Screen>
      <PlaceShell chatId={id} tab="People" stem={route.name}>
        <PeopleBody head={head} sections={[
          { title: 'Faculty coordinator', rows: people(id, p => p.role === 'faculty').map(x => ({ p: x.p, sub: byId('departments', x.p.department_id)?.name, bubble: true })) },
          { title: 'Student leads', rows: people(id, (_, m) => m.role === 'lead').map(x => ({ ...row(x), tag: 'Lead', green: true })) },
          { title: 'Members', rows: meFirst(people(id, (p, m) => m.role === 'member' && p.role !== 'faculty').sort(byRoll)).map(row), limit: 3 },
        ]} />
      </PlaceShell>
    </Screen>
  );
};
/** Chat-X07-GroupPeople */
const GroupPeople = ({ route }: any) => {
  useData();
  const id = route.params?.chatId, ch = byId('chats', id); if (!ch) return null;
  const me = profile(meId()), admin = memberOf(id)?.role === 'admin';
  const rows = meFirst(people(id)).map(x => ({ p: x.p, sub: x.p.role === 'faculty' ? 'Faculty' : x.p.class_label, tag: ch.created_by === x.p.id ? 'Made the group' : undefined, bubble: x.p.role === 'faculty', onRemove: admin && ch.status === 'active' ? () => removeMember(ch, x.p) : undefined }));
  return (
    <Screen>
      <PlaceShell chatId={id} tab="People" stem={route.name}>
        <PeopleBody head={admin && ch.status === 'active' ? (
          <Grp style={{ marginTop: 12 }}>
            <Li left={<View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.sunken, alignItems: 'center', justifyContent: 'center' }}><Ms n="person_add" s={20} col={c.ink2} /></View>} title="Add people"
              onPress={() => go('Chat-X02-NewGroup', { chatId: id })} />
          </Grp>
        ) : null} sections={[{ label: `${rows.length} people`, rows }]} />
      </PlaceShell>
    </Screen>
  );
};
/** Chat-F15P-BreakoutPeople. IT1 marks are faculty-only. */
const BatchPeople = ({ route }: any) => {
  useData();
  const id = route.params?.chatId, ch = byId('chats', id); if (!ch) return null;
  const fac = isFaculty(), dv = division(ch.division_id), n = peopleCount(id);
  const facs = people(id, p => p.role === 'faculty').map(x => ({ p: x.p, sub: ch.created_by === x.p.id ? 'Made this focus batch' : 'Faculty', you: fac, bubble: !fac }));
  const studs = people(id, p => p.role !== 'faculty').sort(byRoll).map(x => ({ p: x.p, sub: fac && x.p.it1 != null ? `Roll ${x.p.roll_number} · IT1 ${x.p.it1}%` : `Roll ${x.p.roll_number}` }));
  const add = fac && ch.status !== 'closed' ? <BtnT icon="person_add" onPress={() => openSheet(() => <AddPeople ch={ch} title={`Add from ${dv?.name}`} pool={() => divisionStudents(ch.division_id)} />)}>{`Add from ${dv?.name}`}</BtnT> : null;
  return (
    <Screen>
      <PlaceShell chatId={id} tab="People" stem={route.name}>
        <PeopleBody ph="Search by name or roll number" foot={`Only these ${n} people can read ${ch.name}`} sections={[{ title: 'Faculty', rows: facs }, { title: 'Students', rows: fac ? studs : meFirst(studs), limit: 3, right: add }]} />
      </PlaceShell>
    </Screen>
  );
};

/* ---------- In-chat search ---------- */
const SearchChat = ({ route }: any) => {
  useData();
  const id = route.params?.chatId, ch = byId('chats', id);
  const [q, setQ] = useState(route.params?.q || ''), [on, setOn] = useState('All');
  if (!ch) return null;
  const s = q.trim().toLowerCase(), has = (x?: string) => (x || '').toLowerCase().includes(s);
  const scope = ch.kind === 'course' ? place(ch) : chatTitle(ch);
  const msgs = !s ? [] : (db().messages || []).filter(m => m.chat_id === id && !m.scheduled_for && !m.unsent_at && !m.deleted_by && m.kind !== 'system' && !(m.hidden_for || []).includes(meId()) && has(m.body)).sort((a, b) => b.sent_at - a.sent_at);
  const files = !s ? [] : shared(id).filter(i => i.kind === 'file').flatMap(i => {
    const unit = /presentation|ppt/.test(i.file?.mime || '') ? 'Slide' : 'Page';
    const pages = where('file_pages', p => p.file_id === i.file?.id && (has(p.title) || has(p.text))).map(p => ({ ...i, key: `${i.key}-${p.page_no}`, line: `${unit} ${p.page_no}${p.title ? ` · ${p.title}` : ''}`, page: p.page_no }));
    return pages.length ? pages : has(i.title) ? [{ ...i, line: i.file ? fmtSize(i.file.size_bytes) : '' }] : [];
  });
  const showM = on !== 'Files', showF = on !== 'Messages';
  return (
    <Screen>
      <Row gap={10} style={{ paddingLeft: 16, paddingRight: 12, paddingTop: 8 }}>
        <SearchBar autoFocus placeholder={`Search ${scope} chat`} value={q} onChange={setQ} style={{ flex: 1, marginHorizontal: 0, marginTop: 0 }} />
        <BtnT onPress={back}>Cancel</BtnT>
      </Row>
      <T s={12} lh={16} col={c.ink3} style={{ paddingHorizontal: 16, paddingTop: 8 }}>{`In ${scope} chat · ${byId('academic_years', ch.academic_year_id)?.label}`}</T>
      {s ? <Chips items={[`All · ${msgs.length + files.length}`, `Messages · ${msgs.length}`, `Files · ${files.length}`]} on={on} onPick={x => setOn(x.split(' ·')[0])} /> : null}
      <Body>
        {s && (msgs.length + files.length) === 0 ? <Empty icon="search" title="No results in this chat" action="Search all chats" onAction={() => go('Chat-S05-Search', { q })} /> : null}
        {s && (msgs.length + files.length) > 0 ? <>
          <View style={{ height: 8 }} />
          {showM ? msgs.map(m => {
            const p = profile(m.sender_id);
            return <Li key={m.id} min={60} left={<Pic img={p?.img} name={p?.full_name} size={36} fac={p?.role === 'faculty'} />}
              title={<T s={12} lh={16} col={c.ink3} n={1}>{`${p?.full_name}${m.thread_root_id ? ' · in a thread' : ''} · ${fmtDay(m.sent_at)}`}</T>} sub={<T s={14} lh={19} n={2}>{m.body}</T>}
              onPress={() => m.thread_root_id ? go('Chat-S03-Thread', { chatId: id, rootId: m.thread_root_id, messageId: m.id }) : openChat(id, 'Chat', { messageId: m.id })} />;
          }) : null}
          {showF ? files.map((i: any) => (
            <Li key={i.key} min={60} left={<Fi l n={fileIcon(i.file?.mime)} />} title={i.title} sub={i.line}
              onPress={() => i.page ? go('Res-S03-Viewer', { resourceId: i.resourceId, page: i.page, chatId: id }) : openItem(i)} />
          )) : null}
          <BtnT style={{ alignSelf: 'center', marginTop: 8 }} onPress={() => go('Chat-S05-Search', { q })}>Search all chats</BtnT>
        </> : null}
      </Body>
    </Screen>
  );
};

/* ---------- Files and links in a chat ---------- */
const resItem = (r: any, by: string, at: number, key: string) => {
  const file = r.file_id ? byId('files', r.file_id) : null, link = r.kind === 'link';
  return { key, kind: link ? 'link' : 'file', resourceId: r.id, file, url: r.url, provider: r.link_provider, title: link ? (r.link_title || r.title || r.url) : (file?.name || r.title), by, at };
};
/** Every file and link sent in this chat (DM, group, "Shared in chat"). */
const shared = (chatId: string): any[] => chatMessages(chatId).filter(m => (m.kind === 'file' || m.kind === 'link') && !m.unsent_at && !m.deleted_by).flatMap(m => {
  const r = m.resource_id ? byId('resources', m.resource_id) : null;
  if (r) return r.removed_at ? [] : [resItem(r, m.sender_id, m.sent_at, m.id)];
  return m.kind === 'link' ? [{ key: m.id, kind: 'link', url: m.link_url || m.body, provider: m.link_provider, title: m.link_title || m.body, by: m.sender_id, at: m.sent_at }] : [];
}).reverse();
const chatFolders = (chatId: string) => where('folders', f => f.chat_id === chatId && f.kind !== 'shared_in_chat');
const folderItems = (chatId: string) => chatFolders(chatId).flatMap(f => resourcesIn(f.id).filter((r: any) => !r.removed_at).map((r: any) => ({ ...resItem(r, r.added_by, r.created_at, r.id), folder: f }))).sort((a, b) => b.at - a.at);
/** Folder files plus files sent in chat, one row per resource. */
const inChat = (chatId: string) => { const ids = new Set<string>(); return [...folderItems(chatId), ...shared(chatId)].filter((i: any) => !i.resourceId || (!ids.has(i.resourceId) && ids.add(i.resourceId))).sort((a, b) => b.at - a.at); };
const openItem = (i: any) => i.kind === 'link' ? Linking.openURL(i.url).catch(() => toast("Couldn't open link")) : i.resourceId ? go('Chat-R01-File', { resourceId: i.resourceId }) : toast('File removed');
const openFolder = (f: any) => go(isFaculty() ? 'Res-F02-Folder' : 'Res-S02-Folder', { folderId: f.id, chatId: f.chat_id });
const who = (id: string) => id === meId() ? 'You' : profile(id)?.full_name;
const downloaded = (i: any) => where('resource_views', v => v.resource_id === i.resourceId && v.user_id === meId() && v.downloaded_at).length > 0;
const download = (i: any) => {
  if (isOffline()) return toast(`Couldn't download ${i.title} · Retry`);
  if (!isFaculty()) return markViewed(i.resourceId, 'downloaded');
  mut(() => {
    const v = where('resource_views', x => x.resource_id === i.resourceId && x.user_id === meId())[0];
    if (v) v.downloaded_at = Date.now(); else insert('resource_views', { resource_id: i.resourceId, user_id: meId(), opened_at: null, downloaded_at: Date.now() });
  });
};
const DlRight = ({ i }: any) => i.kind === 'link' ? <Ms n="open_in_new" s={20} col={c.ink3} />
  : !i.resourceId ? null
  : downloaded(i) ? <Ms n="download_done" s={20} col={c.greenText} />
  : <IB n="download" label={`Download ${i.title}`} onPress={() => download(i)} col={c.ink2} />;

/** Chips All · Files · Links plus live search. dm adds size or domain and download state per row. */
const SharedList = ({ chatId, dm, items }: any) => {
  const [q, setQ] = useState(''), [on, setOn] = useState('All');
  const rows: any[] = items ?? shared(chatId);
  const s = q.trim().toLowerCase(), all = rows.filter(i => i.title?.toLowerCase().includes(s));
  const files = all.filter(i => i.kind === 'file'), links = all.filter(i => i.kind === 'link'), list = on === 'Files' ? files : on === 'Links' ? links : all;
  if (!rows.length) return <Empty icon="folder_open" title="No files yet" line="Files and links you share here show up here." />;
  return (
    <>
      <SearchBar placeholder="Search files and links" value={q} onChange={setQ} />
      <Chips items={[`All · ${all.length}`, `Files · ${files.length}`, `Links · ${links.length}`]} on={on} onPick={x => setOn(x.split(' ·')[0])} />
      <Body>
        {list.length ? <View style={{ height: 8 }} /> : <Empty icon="search" title={`No results for “${q.trim()}”`} />}
        {list.map(i => {
          const meta = i.kind === 'link' ? (i.provider || (i.url || '').replace(/^https?:\/\//, '').split('/')[0]) : i.file ? fmtSize(i.file.size_bytes) : '';
          const sub = dm ? [who(i.by), dayLow(i.at), meta].filter(Boolean).join(' · ') : `${who(i.by)} · ${i.kind === 'link' ? meta : dayLow(i.at)}`;
          return <Li key={i.key} min={60} left={<Fi l={!dm} n={fileIcon(i.file?.mime, i.kind)} />} title={i.title} sub={sub} onPress={() => openItem(i)} right={dm ? <DlRight i={i} /> : null} />;
        })}
      </Body>
    </>
  );
};
const DmResources = ({ route }: any) => { useData(); const id = route.params?.chatId; return <Screen><PlaceShell chatId={id} tab="Resources" stem={route.name}><SharedList chatId={id} dm /></PlaceShell></Screen>; };
const GroupResources = ({ route }: any) => { useData(); const id = route.params?.chatId; return <Screen><PlaceShell chatId={id} tab="Resources" stem={route.name}><SharedList chatId={id} /></PlaceShell></Screen>; };
/** "Shared in chat" row, and (title + all) the file search for class groups and clubs, which Res-S06-Search can't scope because they have no course. */
const SharedInChat = ({ route }: any) => { useData(); const { title, all } = route.params || {}, ch = byId('chats', route.params?.chatId); return ch ? <Screen><Hdr title={title ?? 'Shared in chat'} sub={chatTitle(ch)} /><SharedList chatId={ch.id} items={all ? inChat(ch.id) : undefined} /></Screen> : null; };

const SharedRow = ({ chatId }: any) => (
  <Li min={60} left={<Fo n="forum" mut />} title="Shared in chat" chevron right={<T s={14} lh={20} col={c.ink3}>{shared(chatId).length}</T>} onPress={() => go('Chat-SharedInChat', { chatId })} />
);
/** Chat-S14-ClassResources */
const ClassResources = ({ route }: any) => {
  useData();
  const id = route.params?.chatId, ch = byId('chats', id); if (!ch) return null;
  const dv = division(ch.division_id), mentor = members(id).find(m => m.role === 'mentor')?.user_id ?? dv?.mentor_id;
  const fromMentor = inChat(id).filter((i: any) => i.by === mentor && i.resourceId);
  const courses = where('offerings', o => o.division_id === ch.division_id && o.term_id === dv?.term_id).map(o => {
    const chat = (db().chats || []).find(x => x.kind === 'course' && x.offering_id === o.id);
    const fresh = courseFolders(o.course_id, ch.academic_year_id).flatMap((f: any) => where('folder_publications', x => x.folder_id === f.id && x.offering_id === o.id && x.published).length ? resourcesIn(f.id) : [])
      .filter((r: any) => !r.removed_at && r.created_at > days(-7) && !where('resource_views', v => v.resource_id === r.id && v.user_id === meId()).length).length;
    return { o, chat, course: byId('courses', o.course_id), fresh };
  }).filter(x => x.chat && x.course);
  return (
    <Screen>
      <PlaceShell chatId={id} tab="Resources" stem={route.name}>
        <SearchBar placeholder={`Search ${dv?.name} files`} onPress={() => go('Chat-SharedInChat', { chatId: id, all: true, title: `${dv?.name} files` })} />
        <Body>
          {fromMentor.length ? <>
            <Sec>From your class mentor</Sec>
            <Grp>{fromMentor.map((i: any) => <Li key={i.key} min={60} left={<Fi l n={fileIcon(i.file?.mime, i.kind)} />} title={i.title} sub={dayDiff(i.at) >= -1 ? `New · ${dayLow(i.at)}` : fmtShort(i.at)} onPress={() => openItem(i)} />)}</Grp>
          </> : null}
          <Sec>Your courses</Sec>
          <Grp>
            {courses.map(x => <Li key={x.o.id} min={60} left={<Pic img={x.course.img} name={x.course.short} size={40} shape="course" />} title={x.course.name} chevron right={x.fresh ? <Badge label={`${x.fresh} new`} /> : null} onPress={() => openChat(x.chat.id, 'Resources')} />)}
            <SharedRow chatId={id} />
          </Grp>
        </Body>
      </PlaceShell>
    </Screen>
  );
};
/** Chat-S15-ClubResources */
const ClubResources = ({ route }: any) => {
  useData();
  const id = route.params?.chatId, ch = byId('chats', id); if (!ch) return null;
  const folders = chatFolders(id), recent = folderItems(id).slice(0, 5), hasShared = shared(id).length > 0;
  return (
    <Screen>
      <PlaceShell chatId={id} tab="Resources" stem={route.name}>
        {!folders.length && !hasShared ? <Empty icon="folder_open" title="No files yet" line="Club files and links show up here." /> : <>
          <SearchBar placeholder="Search club files" onPress={() => go('Chat-SharedInChat', { chatId: id, all: true, title: 'Club files' })} />
          <Body>
            <Sec>Folders</Sec>
            <Grp>
              {folders.map(f => <Li key={f.id} min={60} left={<Fo n={f.icon || 'folder'} />} title={f.name} chevron right={<T s={14} lh={20} col={c.ink3}>{resourcesIn(f.id).length}</T>} onPress={() => openFolder(f)} />)}
              <SharedRow chatId={id} />
            </Grp>
            {recent.length ? <>
              <Sec>Recent</Sec>
              <Grp>{recent.map((i: any) => <Li key={i.key} min={60} left={<Fi l n={fileIcon(i.file?.mime, i.kind)} />} title={i.title} sub={i.kind === 'link' ? `${i.folder.name} · ${i.provider ?? ''}` : `${i.folder.name} · ${who(i.by)} · ${fmtDay(i.at)}`} onPress={() => openItem(i)} />)}</Grp>
            </> : null}
          </Body>
        </>}
      </PlaceShell>
    </Screen>
  );
};
/** Chat-F15R-BreakoutResources: "Shared here" and the division's published course folders (read-only). */
const BatchResources = ({ route }: any) => {
  useData();
  const id = route.params?.chatId, ch = byId('chats', id);
  const [on, setOn] = useState('Shared here');
  if (!ch) return null;
  const crs = courseOf(ch), here = inChat(id);
  const folders = courseFolders(crs?.id, ch.academic_year_id).filter((f: any) => (f.kind === 'unit' || f.kind === 'custom') && where('folder_publications', x => x.folder_id === f.id && x.offering_id === ch.offering_id && x.published).length);
  const showHere = on === 'Shared here', students = people(id, p => p.role !== 'faculty').length;
  return (
    <Screen>
      <PlaceShell chatId={id} tab="Resources" stem={route.name}>
        <SearchBar placeholder={`Search ${ch.name} files`} onPress={() => go('Res-S06-Search', { chatId: id })} />
        <Chips items={[`Shared here · ${here.length}`, `All ${crs?.short} resources`]} on={on} onPick={x => setOn(x.split(' ·')[0])} />
        <Body>
          {showHere ? (here.length ? <>
            <View style={{ height: 8 }} />
            {here.map((i: any) => <Li key={i.key} min={60} left={<Fi n={fileIcon(i.file?.mime, i.kind)} />} title={i.title} sub={`Shared here ${dayLow(i.at)}`} right={<DlRight i={i} />} onPress={() => openItem(i)} />)}
          </> : <Empty icon="folder_open" title="No files yet" line={`Only these ${students} students see files you add here.`} />) : null}
          {folders.length ? <>
            <Sec>{`${crs?.short} folders`}</Sec>
            <Grp>{folders.map((f: any) => <Li key={f.id} left={<Ms n="folder" col={c.ink2} />} title={f.name} chevron right={<T s={14} lh={20} col={c.ink3}>{resourcesIn(f.id).length}</T>} onPress={() => go('Res-S02-Folder', { folderId: f.id, chatId: ch.parent_chat_id })} />)}</Grp>
          </> : null}
        </Body>
      </PlaceShell>
    </Screen>
  );
};

/* ---------- Chat tabs ---------- */
/** Every Chat tab that isn't a course: class group, club, group, focus batch (open or ended), DM. */
const ChatPlace = ({ route }: any) => {
  useData();
  const { chatId, privateReplyOf, messageId } = route.params || {};
  const ch = byId('chats', chatId); if (!ch) return null;
  const other = ch.kind === 'dm' ? otherMember(chatId) : null;
  const blocked = !!other && (isBlocked(meId(), other.id) || isBlocked(other.id, meId()));
  const ended = ch.status === 'closed';
  const banner = ended && isFaculty() ? (
      <Row gap={8} style={{ paddingHorizontal: 16, paddingTop: 10, justifyContent: 'space-between' }}>
        <T s={13} lh={18} col={c.ink2} style={{ flex: 1 }}>{`${ch.name} ended on ${fmtDate(ch.ended_at || ch.ends_at)}`}</T>
        <Pill icon="refresh" onPress={() => reopen(ch)}>Reopen</Pill>
      </Row>
    ) : null;
  return (
    <Screen>
      <PlaceShell chatId={chatId} tab="Chat" stem={route.name}>
        <ChatTab chatId={chatId} stem={route.name} privateReplyOf={privateReplyOf} messageId={messageId} banners={banner} readOnly={ch.status !== 'active' || blocked} />
      </PlaceShell>
    </Screen>
  );
};
/** Chat-S08P-ClubPosts */
const ClubPosts = ({ route }: any) => {
  useData();
  const id = route.params?.chatId, ch = byId('chats', id); if (!ch) return null;
  const account = (db().buzz_accounts || []).find(a => a.club_id === ch.club_id)?.id ?? 'acc-robo';
  return <Screen><PlaceShell chatId={id} tab="Posts" stem={route.name}><BuzzFeed accountId={account} /></PlaceShell></Screen>;
};

/* ---------- Focus batches ---------- */
const batchEnd = (ch: any) => ch.ended_at || ch.ends_at;
const sessionsOf = (chatId: string) => where('focus_batch_sessions', s => s.chat_id === chatId).sort((a, b) => a.starts_at - b.starts_at);
const nextSession = (chatId: string) => sessionsOf(chatId).find(s => s.ends_at > Date.now());
const shortDay = (t: number) => fmtDate(t).split(' ')[0];

// ponytail: no cron. A batch ends only by Close now; seed end dates are weeks out and the 2-day reminder is skipped. Add a sweep on app open if a test needs date-driven endings.
const closeBatch = (ch: any) => {
  const n = peopleCount(ch.id), now = Date.now();
  mut(() => { ch.status = 'closed'; ch.ended_at = now; });
  sendMessage({ chatId: ch.id, kind: 'system', body: `${ch.name} ended on ${fmtDate(now)}. All ${n} people can still read it and download files.` });
  back(); swap('Chat-F15X-BreakoutEnded', { chatId: ch.id });
};
const reopen = (ch: any, pop?: boolean) => {
  const te = termEnd(ch);
  if (te <= days(1)) return toast(`Pick a date before ${fmtDate(te)}`);
  pick('date', Math.min(days(7), te), t => {
    const at = new Date(t).setHours(17, 0, 0, 0);
    mut(() => { ch.status = 'active'; ch.ends_at = at; ch.ended_at = null; });
    sendMessage({ chatId: ch.id, kind: 'system', body: `${ch.name} is open again. It ends ${fmtDate(at)}.` });
    if (pop) back();
    swap('Chat-F15-Breakout', { chatId: ch.id });
  }, days(1), te);
};

/** Chat-F12-Breakouts */
const Breakouts = ({ route }: any) => {
  useData();
  const id = route.params?.chatId, parent = byId('chats', id); if (!parent) return null;
  const all = where('chats', x => x.kind === 'focus_batch' && x.parent_chat_id === id);
  const open = all.filter(x => x.status !== 'closed'), ended = all.filter(x => x.status === 'closed');
  const row = (b: any) => {
    const last = chatMessages(b.id).slice(-1)[0], nx = nextSession(b.id), n = peopleCount(b.id), done = b.status === 'closed';
    return <ChatRow key={b.id} title={b.name} time={fmtRow(last?.sent_at ?? b.created_at)} onPress={() => openChat(b.id)}
      pic={<Pic img={b.img} name={b.name} size={52} shape="course" badge="filter_center_focus" />}
      sub={done ? `${n} people · ended ${fmtShort(batchEnd(b))}` : `${n} people · ends ${fmtDate(b.ends_at)}`}
      preview={!done && nx ? `Next session ${shortDay(nx.starts_at)} ${fmtTime(nx.starts_at)}${nx.room ? ` · ${nx.room}` : ''}` : previewOf(last)} />;
  };
  return (
    <Screen>
      <Hdr title="Focus batches" sub={place(parent)} right={<BtnT icon="add" style={{ paddingRight: 12 }} onPress={() => go('Chat-F13-NewBreakout', { chatId: id })}>New</BtnT>} />
      <Body>
        {!all.length ? <Empty icon="filter_center_focus" title="No focus batches yet" line="Make one for students who need extra help or a challenge." action="New" onAction={() => go('Chat-F13-NewBreakout', { chatId: id })} /> : null}
        {open.length ? <><Sec>{`Open · ${open.length}`}</Sec>{open.map(row)}</> : null}
        {ended.length ? <><Sec>{`Ended · ${ended.length}`}</Sec>{ended.map(row)}</> : null}
      </Body>
    </Screen>
  );
};
/** Chat-F13-NewBreakout */
const NewBreakout = ({ route }: any) => {
  useData();
  const bottom = useBottom();
  const parent = byId('chats', route.params?.chatId);
  const [name, setName] = useState(''), [end, setEnd] = useState('End of sem'), [picked, setPicked] = useState<number | null>(null), [sel, setSel] = useState<string[]>([]), [q, setQ] = useState(''), [mode, setMode] = useState<'low' | 'high' | 'pick' | null>(null);
  if (!parent) return null;
  const dv = division(parent.division_id), te = termEnd(parent), sem = byId('terms', dv?.term_id)?.semester_no;
  const students = divisionStudents(parent.division_id).filter(s => s.id).sort((a, b) => (a.roll_number || '').localeCompare(b.roll_number || ''));
  const low = students.filter(s => s.it1 < 40).map(s => s.id), high = students.filter(s => s.it1 >= 80).map(s => s.id);
  // One way in: a suggested group (untick anyone you want to leave out) or pick students yourself. Never the whole class.
  const pool = mode === 'low' ? students.filter(s => low.includes(s.id)) : mode === 'high' ? students.filter(s => high.includes(s.id)) : students;
  const list = pool.filter(s => matches(s, q.trim()));
  const choose = (m: 'low' | 'high' | 'pick') => { setMode(m); setQ(''); setSel(m === 'low' ? low : m === 'high' ? high : []); if (['', 'Practice', 'Challenge'].includes(name.trim())) setName(m === 'low' ? 'Practice' : m === 'high' ? 'Challenge' : ''); };
  // No duplicates: an open batch in this class with the same name or exactly the same students is offered instead.
  const open = where('chats', x => x.kind === 'focus_batch' && x.parent_chat_id === parent.id && x.status === 'active');
  const studentsOf = (id: string) => where('chat_members', m => m.chat_id === id && !m.left_at && m.user_id !== meId() && profile(m.user_id)?.role === 'student').map(m => m.user_id);
  const same = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));
  const dupName = name.trim() ? open.find(x => x.name.toLowerCase() === name.trim().toLowerCase()) : null;
  const dupPeople = sel.length ? open.find(x => same(studentsOf(x.id), sel)) : null;
  const dup = dupPeople || dupName;
  const endAt = end === 'End of sem' ? te : end === '1 week' ? Math.min(te, days(7, 17)) : end === '2 weeks' ? Math.min(te, days(14, 17)) : picked;
  const note = end === 'End of sem' ? `Ends ${fmtDate(te)}, the last day of Sem ${sem}. You can close it earlier.` : endAt ? `Ends ${fmtDate(endAt)}. You can close it earlier.` : `Pick a date before ${fmtDate(te)}.`;
  const onEnd = (x: string) => { setEnd(x); if (x === 'Pick date') pick('date', picked ?? days(1), t => setPicked(new Date(t).setHours(17, 0, 0, 0)), days(1), te); };
  const create = () => {
    const nm = name.trim(), now = Date.now();
    if (!endAt || endAt <= now || endAt > te) return toast(`Pick a date before ${fmtDate(te)}`);
    const id = newId('chat');
    mut(() => {
      insert('chats', { id, kind: 'focus_batch', parent_chat_id: parent.id, offering_id: parent.offering_id, division_id: parent.division_id, name: nm, img: parent.img, created_by: meId(), ends_at: endAt, status: 'active', who_can_send: 'everyone', students_can_poll: false, students_can_share_files: true, academic_year_id: parent.academic_year_id, created_at: now });
      [meId(), ...sel].forEach(user_id => insert('chat_members', { chat_id: id, user_id, role: user_id === meId() ? 'faculty' : 'member', notify: 'every', muted: false, last_read_at: now, joined_at: now, left_at: null }));
    });
    sendMessage({ chatId: id, kind: 'system', body: `You made ${nm} from ${place(parent)} on ${fmtShort(now)}. It ends ${fmtDate(endAt)}${endAt === te ? ', the end of the semester' : ''}.` });
    swap('Chat-F15-Breakout', { chatId: id });
  };
  const Opt = ({ m, icon, label, sub }: any) => {
    const on = mode === m;
    return (
      <Tap label={label} onPress={() => choose(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: on ? 2 : 1, borderColor: on ? c.green : c.line, backgroundColor: on ? c.mint : 'transparent' }}>
        <Ms n={icon} s={22} col={c.greenText} />
        <View style={{ flex: 1 }}><T s={15} lh={20} w="500">{label}</T><T s={12} lh={16} col={c.ink3}>{sub}</T></View>
        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.green : c.inkOff, alignItems: 'center', justifyContent: 'center' }}>{on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.green }} /> : null}</View>
      </Tap>
    );
  };
  return (
    <Screen>
      <Hdr title="New focus batch" sub={place(parent)} />
      <Body>
        <View style={{ paddingHorizontal: 16 }}>
          <Lbl>Name</Lbl>
          <Field accessibilityLabel="Name" placeholder="Practice, Challenge, Project…" value={name} onChangeText={setName} maxLength={30} />
          <Lbl>Ends</Lbl>
        </View>
        <Chips style={{ paddingTop: 0 }} items={['End of sem', '1 week', '2 weeks', 'Pick date']} on={end} onPick={onEnd} />
        <T s={12} lh={17} col={c.ink3} style={{ paddingHorizontal: 16, marginTop: 8 }}>{note}</T>
        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          <Lbl>Who’s in it</Lbl>
          {low.length ? <Opt m="low" icon="trending_down" label="Scored below 40% in IT1" sub={`${low.length} students · suggested`} /> : null}
          {high.length ? <Opt m="high" icon="trending_up" label="Scored 80% or more in IT1" sub={`${high.length} students · suggested`} /> : null}
          <Opt m="pick" icon="checklist" label="Pick students" sub={`Choose from ${dv?.name}`} />
        </View>
        {mode ? <>
        <View style={{ paddingHorizontal: 16 }}><Lbl>{mode === 'pick' ? `${sel.length} selected` : `${sel.length} of ${pool.length} · untick anyone to leave them out`}</Lbl></View>
        {mode === 'pick' ? <SearchBar placeholder={`Search ${dv?.name}`} value={q} onChange={setQ} style={{ marginBottom: 10 }} /> : null}
        <Grp>
          {list.map(s => <Li key={s.id} left={<Ck sq on={sel.includes(s.id)} />} title={s.full_name} right={<T s={14} lh={20} col={c.ink3}>{s.roll_number}</T>} onPress={() => setSel(x => x.includes(s.id) ? x.filter(i => i !== s.id) : [...x, s.id])} />)}
        </Grp>
        </> : null}
      </Body>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(16, bottom + 8), gap: 8 }}>
        {dup ? (
          <Row gap={10} style={{ padding: 12, borderRadius: 14, backgroundColor: c.cautionBg }}>
            <Ms n="info" s={20} col={c.caution} />
            <T s={13} lh={18} style={{ flex: 1 }}>{dupPeople ? `${dupPeople.name} is already open with these ${sel.length} students.` : `${dupName.name} is already open in ${dv?.name}. Pick another name.`}</T>
            <BtnT onPress={() => swap('Chat-F15-Breakout', { chatId: dup.id })}>Open</BtnT>
          </Row>
        ) : null}
        <BtnP disabled={!sel.length || !name.trim() || !!dup} onPress={create}>{sel.length ? `Create focus batch · ${sel.length}` : 'Create focus batch'}</BtnP>
      </View>
    </Screen>
  );
};

const Drop = ({ label, onPress, value }: any) => (
  <Tap label={label} onPress={onPress} style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: 12, backgroundColor: c.sunken, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
    <T s={15} lh={20}>{value}</T><Ms n="expand_more" col={c.ink3} />
  </Tap>
);
/** Chat-F14-Session (sheet). Repeats writes one row per week up to the batch end. */
const SessionSheet = ({ ch }: any) => {
  const prev = sessionsOf(ch.id).slice(-1)[0];
  const [date, setDate] = useState(days(1)), [from, setFrom] = useState(days(1, 16)), [to, setTo] = useState(days(1, 17)), [room, setRoom] = useState(prev?.room || ''), [rep, setRep] = useState(false);
  const every = `Every ${weekday(date)} until it ends`;
  const at = (clock: number) => { const d = new Date(date), k = new Date(clock); d.setHours(k.getHours(), k.getMinutes(), 0, 0); return d.getTime(); };
  const add = () => {
    const a = at(from), b = at(to), week = 7 * 24 * 3600e3;
    if (b <= a) return toast('Ends must be after it starts');
    const rows: any[] = [];
    for (let i = 0; i === 0 || (rep && a + i * week <= ch.ends_at); i++) rows.push({ id: newId('fs'), chat_id: ch.id, starts_at: a + i * week, ends_at: b + i * week, room: room.trim(), topic: '', repeat_rule: rep ? 'weekly' : null, attended_count: null });
    mut(() => rows.forEach(r => insert('focus_batch_sessions', r)));
    closeSheet();
    toast(rows.length > 1 ? `${rows.length} sessions added` : 'Session added', () => mut(d => { d.focus_batch_sessions = d.focus_batch_sessions.filter(s => !rows.includes(s)); }));
  };
  return (
    <SheetBody title="Add session">
      <T s={13} lh={18} w="600" col={c.ink2} style={{ marginBottom: 8 }}>Date</T>
      <Drop label="Date" value={fmtDate(date)} onPress={() => pick('date', date, setDate, days(0), ch.ends_at)} />
      <Lbl>Starts</Lbl>
      <Drop label="Starts" value={fmtTime(from)} onPress={() => pick('time', from, setFrom)} />
      <Lbl>Ends</Lbl>
      <Drop label="Ends" value={fmtTime(to)} onPress={() => pick('time', to, setTo)} />
      <Lbl>Room</Lbl>
      <Field accessibilityLabel="Room" placeholder="Room" value={room} onChangeText={setRoom} />
      <Lbl>Repeats</Lbl>
      <Drop label="Repeats" value={rep ? every : 'Does not repeat'} onPress={() => openSheet(() => (
        <SheetBody title="Repeats">
          <SheetRow label="Does not repeat" onPress={() => { setRep(false); closeSheet(); }} />
          <SheetRow label={every} onPress={() => { setRep(true); closeSheet(); }} />
        </SheetBody>
      ))} />
      <BtnP style={{ marginTop: 20 }} onPress={add}>Add session</BtnP>
    </SheetBody>
  );
};
/** Chat-F15S-BreakoutSchedule. The student view of sessions is Not part of flow (10.2). */
const BatchSchedule = ({ route }: any) => {
  useData();
  const id = route.params?.chatId, ch = byId('chats', id); if (!ch) return null;
  if (!isFaculty()) return <Screen><PlaceShell chatId={id} tab="Schedule" stem={route.name}><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><T s={15} col={c.ink2}>Not part of flow</T></View></PlaceShell></Screen>;
  const n = peopleCount(id), all = sessionsOf(id), now = Date.now();
  const up = all.filter(s => s.ends_at > now), done = all.filter(s => s.ends_at <= now).reverse();
  const addOpen = () => openSheet(() => <SessionSheet ch={ch} />);
  const canAdd = ch.status !== 'closed';
  const rep = up.find(s => s.repeat_rule);
  const day = (t: number) => <View style={{ width: 36, alignItems: 'center' }}><T s={12} lh={16} col={c.ink3}>{shortDay(t)}</T><T v s={17} lh={22}>{new Date(t).getDate()}</T></View>;
  return (
    <Screen>
      <PlaceShell chatId={id} tab="Schedule" stem={route.name}>
        <Body>
          {!all.length ? <Empty icon="event" title="No sessions yet" line={`Sessions you add show in all ${n} people's Schedule.`} action={canAdd ? 'Add session' : undefined} onAction={addOpen} /> : <>
            <Sec right={canAdd ? <BtnT icon="add" onPress={addOpen}>Add session</BtnT> : null}>{rep ? `Every ${weekday(rep.starts_at)} · until ${fmtDate(ch.ends_at)}` : `Until ${fmtDate(ch.ends_at)}`}</Sec>
            {up.length ? <Grp>
              {up.map((s, i) => <Li key={s.id} min={60} left={day(s.starts_at)} sub={s.topic || undefined}
                title={<Row gap={8}><T s={15} lh={20} n={1} style={{ flexShrink: 1 }}>{`${range(s.starts_at, s.ends_at)}${s.room ? ` · ${s.room}` : ''}`}</T>{i === 0 ? <Tag green>Next</Tag> : null}</Row>} />)}
            </Grp> : null}
            {done.length ? <>
              <Sec>Done</Sec>
              <Grp>{done.map(s => <Li key={s.id} min={60} left={day(s.starts_at)} title={`${range(s.starts_at, s.ends_at)}${s.room ? ` · ${s.room}` : ''}`} sub={s.attended_count != null ? `${s.attended_count} of ${n} attended` : s.topic || undefined} />)}</Grp>
            </> : null}
            <Sys icon="event">{`These show in all ${n} people’s Schedule`}</Sys>
          </>}
        </Body>
      </PlaceShell>
    </Screen>
  );
};
/** Chat-F16-BreakoutInfo (Chat-F16N-Rename opens the name sheet over it). Students get Notifications only. */
const BatchInfo = ({ route }: any) => {
  useData();
  const ch = byId('chats', route.params?.chatId), fac = isFaculty();
  useEffect(() => { if (route.name === 'Chat-F16N-Rename' && ch) rename(ch); }, []);
  if (!ch) return null;
  const n = peopleCount(ch.id), closed = ch.status === 'closed', te = termEnd(ch), isSem = dayDiff(ch.ends_at) === dayDiff(te);
  const change = () => pick('date', ch.ends_at, t => {
    const old = ch.ends_at, at = new Date(t).setHours(17, 0, 0, 0);
    mut(() => { ch.ends_at = at; });
    toast(`Ends ${fmtDate(at)}`, () => mut(() => { ch.ends_at = old; }));
  }, days(1), te);
  const close = () => confirmSheet({ title: `Close ${ch.name} now?`, body: `It was set to end on ${fmtDate(ch.ends_at)}. All ${n} people can still read it, but no one can send messages. You can reopen it.`, action: `Close ${ch.name}`, onConfirm: () => closeBatch(ch) });
  return (
    <Screen>
      <Hdr title="Chat settings" />
      <Body>
        <Hero img={ch.img} name={ch.name} badge="filter_center_focus" sub={`Focus batch · ${place(ch)}`} onEdit={fac ? () => rename(ch) : undefined} />
        <Grp>
          <Li left={<Ms n="event_available" col={c.ink2} />} title={closed ? `Ended ${fmtDate(batchEnd(ch))}` : `Ends ${fmtDate(ch.ends_at)}`} sub={!closed && isSem ? 'End of the semester' : undefined} right={fac && !closed ? <BtnT onPress={change}>Change</BtnT> : null} />
          <NotifyRow chatId={ch.id} />
          {fac ? (closed
            ? <Li left={<Ms n="refresh" col={c.greenText} />} title={`Reopen ${ch.name}`} titleCol={c.greenText} onPress={() => reopen(ch, true)} />
            : <Li left={<Ms n="block" col={c.negative} />} title={`Close ${ch.name} now`} titleCol={c.negative} onPress={close} />) : null}
        </Grp>
        <Sys>{`Only these ${n} people can read ${ch.name}`}</Sys>
      </Body>
    </Screen>
  );
};

/* ---------- Group settings ---------- */
/** Chat-X03-GroupInfo (Chat-X04-EditGroup opens the name sheet over it). */
const GroupInfo = ({ route }: any) => {
  useData();
  const ch = byId('chats', route.params?.chatId), admin = ch && memberOf(ch.id)?.role === 'admin';
  useEffect(() => { if (route.name === 'Chat-X04-EditGroup' && ch && admin) rename(ch); }, []);
  if (!ch) return null;
  const n = peopleCount(ch.id);
  const cam = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1] });
    if (r.canceled) return;
    const uri = r.assets[0].uri;
    IMG[uri] = { uri }; // ponytail: Pic only reads IMG keys, so a picked photo shows until the app restarts. Pic accepting a uri fixes it.
    mut(() => { ch.img = uri; });
  };
  return (
    <Screen>
      <Hdr title="Chat settings" />
      <Body>
        <Hero img={ch.img} name={ch.name} sub={`Group · ${n} people · made by ${profile(ch.created_by)?.full_name}`} onEdit={admin ? () => rename(ch) : undefined} onCam={admin ? cam : undefined} />
        <Grp>
          <NotifyRow chatId={ch.id} />
          {admin ? <Li left={<Ms n="group" col={c.ink2} />} title="Members" sub="Add or remove people" chevron onPress={() => go('Chat-X07-GroupPeople', { chatId: ch.id })} /> : null}
          {admin && ch.status === 'active' ? <Li left={<Ms n="archive" col={c.ink2} />} title="Archive group" sub="Everyone can still read it. No one can post." onPress={() => archiveGroup(ch)} /> : null}
          {admin && ch.status !== 'active' ? <Li left={<Ms n="unarchive" col={c.ink2} />} title="Unarchive group" onPress={() => { mut(() => { ch.status = 'active'; }); sendMessage({ chatId: ch.id, kind: 'system', body: '{who} unarchived the group' }); toast('Group unarchived'); }} /> : null}
          {admin ? null : <Li left={<Ms n="logout" col={c.negative} />} title="Leave group" titleCol={c.negative} onPress={() => leave(ch)} />}
        </Grp>
        <Sys>{ch.status === 'active' ? `Only the ${n} people in this group can read it` : 'Archived. Members can read it, but no one can post.'}</Sys>
      </Body>
    </Screen>
  );
};

/* ---------- DM settings ---------- */
const REASONS = ['Harassment or bullying', 'Personal information shared', 'Inappropriate content', 'Spam', 'Something else'];
/** Report a person, from the same reasons as Chat-F19-Report. Sends their latest message and the 5 before it as context. */
const ReportPerson = ({ chatId, other }: any) => {
  const [why, setWhy] = useState<string | null>(null);
  const send = () => {
    const theirs = chatMessages(chatId).filter(m => m.sender_id === other.id);
    const last = theirs.slice(-1)[0];
    mut(() => insert('reports', { id: newId('rep'), message_id: last?.id ?? null, reported_user_id: other.id, reporter_id: meId(), reason: why, context_ids: theirs.slice(-6, -1).map(m => m.id), status: 'open', created_at: Date.now() }));
    closeSheet(); toast('Report sent');
  };
  return (
    <SheetBody title={`Report ${other.full_name}`}>
      <T s={13} lh={18} w="600" col={c.ink2} style={{ marginBottom: 4 }}>Why are you reporting this?</T>
      {REASONS.map(r => <SheetRow key={r} label={r} onPress={() => setWhy(r)} right={<Ck on={why === r} />} />)}
      <T s={12} lh={17} col={c.ink3} style={{ marginTop: 8 }}>{`Their latest messages go to your college admin. ${firstName(other.id)} isn’t told who reported it.`}</T>
      <BtnP style={{ marginTop: 16 }} disabled={!why} onPress={send}>Send report</BtnP>
    </SheetBody>
  );
};
/** Chat-S17-DMSettings */
const DmSettings = ({ route }: any) => {
  useData();
  const id = route.params?.chatId, ch = byId('chats', id); if (!ch) return null;
  const other = otherMember(id), m = memberOf(id); if (!other) return null;
  const blocked = isBlocked(meId(), other.id), first = firstName(other.id);
  const dv = division(where('division_members', x => x.student_id === other.id)[0]?.division_id);
  const block = () => { mut(() => insert('blocks', { blocker_id: meId(), blocked_id: other.id, created_at: Date.now() })); toast(`Blocked ${other.full_name}`, unblock); };
  const unblock = () => mut(d => { d.blocks = d.blocks.filter(b => !(b.blocker_id === meId() && b.blocked_id === other.id)); });
  return (
    <Screen>
      <Hdr title="Chat settings" />
      <Body>
        <Hero img={other.img} name={other.full_name} shape="round" sub={`Student · ${other.class_label} · ${dv?.name}`} />
        <Grp>
          <Li title="Mute notifications" right={<Sw label="Mute notifications" on={!!m?.muted} onChange={v => mut(() => { if (m) m.muted = v; })} />} />
          <Li title="Files and links" chevron right={<T s={14} lh={20} col={c.ink3}>{shared(id).length}</T>} onPress={() => swap('Chat-S09R-DMResources', { chatId: id })} />
        </Grp>
        <View style={{ height: 12 }} />
        <Grp>
          <Li left={<Ms n="flag" col={c.negative} />} title={`Report ${other.full_name}`} titleCol={c.negative} onPress={() => openSheet(() => <ReportPerson chatId={id} other={other} />)} />
          {blocked
            ? <Li left={<Ms n="block" col={c.ink2} />} title={`Unblock ${other.full_name}`} sub={`${first} can’t message you. You still see ${first} in class groups.`} onPress={unblock} />
            : <Li left={<Ms n="block" col={c.negative} />} title={`Block ${other.full_name}`} titleCol={c.negative} onPress={block} />}
        </Grp>
      </Body>
    </Screen>
  );
};

export const screens: any = {
  'Chat-F28-People': CoursePeople, 'Chat-S13-CoursePeople': CoursePeople,
  'Chat-F22-Settings': Settings, 'Chat-S10-Settings': Settings, 'Chat-S11-ClassSettings': Settings, 'Chat-S12-ClubSettings': Settings,
  'Chat-F29-SearchChat': SearchChat,
  'Chat-F12-Breakouts': Breakouts, 'Chat-F13-NewBreakout': NewBreakout,
  'Chat-F15-Breakout': ChatPlace, 'Chat-F15X-BreakoutEnded': ChatPlace, 'Chat-S06-ClassGroup': ChatPlace, 'Chat-S08-Club': ChatPlace, 'Chat-X05-GroupChat': ChatPlace, 'Chat-S09-DM': ChatPlace, 'Chat-F10-DM': ChatPlace,
  'Chat-F15S-BreakoutSchedule': BatchSchedule, 'Chat-F15R-BreakoutResources': BatchResources, 'Chat-F15P-BreakoutPeople': BatchPeople,
  'Chat-F16-BreakoutInfo': BatchInfo, 'Chat-F16N-Rename': BatchInfo,
  'Chat-S07-Info': ClassPeople, 'Chat-S14-ClassResources': ClassResources,
  'Chat-S08P-ClubPosts': ClubPosts, 'Chat-S15-ClubResources': ClubResources, 'Chat-S16-ClubPeople': ClubPeople,
  'Chat-X03-GroupInfo': GroupInfo, 'Chat-X04-EditGroup': GroupInfo, 'Chat-X06-GroupResources': GroupResources, 'Chat-X07-GroupPeople': GroupPeople,
  'Chat-S09R-DMResources': DmResources, 'Chat-F10R-DMResources': DmResources, 'Chat-S17-DMSettings': DmSettings,
  'Chat-SharedInChat': SharedInChat,
};
