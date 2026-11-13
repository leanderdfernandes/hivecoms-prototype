// A "chat place": the header + segmented tabs shared by every course, class group, club, focus batch, group and DM (PRD 4).
// Also the one message write path, so Buzz, Resources and Chat agree on how something lands in a chat.
import React from 'react';
import { View } from 'react-native';
import { Badge, BtnP, BtnS, closeSheet, Hdr, IB, Li, Ms, openSheet, Pic, Row, Tabs, SheetBody, T, Tap, Grp, toast } from './ui';
import { c } from './theme';
import { byId, db, fmtRow, insert, isFaculty, memberOf, members, meId, mut, newId, notify, profile, where, firstName, isOffline } from './db';
import { go, npf, swap } from './nav';

export type Tab = 'Schedule' | 'Posts' | 'Resources' | 'Chat' | 'People';
const r = (f: string, s: string) => (isFaculty() ? f : s);

export const otherMember = (chatId: string) => profile(members(chatId).find(m => m.user_id !== meId())?.user_id);
export const chatTitle = (ch: any) => (ch.kind === 'dm' ? otherMember(ch.id)?.full_name : ch.name);
export const division = (id: string) => byId('divisions', id);
/** Course counts are the students the chat is for; their faculty sit on top ("Div A · 62 people"). Groups count everyone in them. */
export const peopleCount = (chatId: string) => { const k = byId('chats', chatId)?.kind; return members(chatId).filter(m => k === 'course' ? m.role !== 'faculty' : true).length; };
/** "Faculty · Computer Engineering" / "Student · TE Comp · Div A" */
export const personLine = (p: any) => p?.role === 'support' ? 'Hive team · Usually replies within a day' : p?.role === 'faculty' ? `Faculty · ${byId('departments', p.department_id)?.name}` : `Student · ${p?.class_label} · ${byId('divisions', where('division_members', m => m.student_id === p?.id)[0]?.division_id)?.name}`;

/** Tabs for a place, in order (PRD 4 table). Past course chats have none. */
export function placeTabs(ch: any): Tab[] {
  if (ch.kind === 'course') return ch.status === 'read_only' && ch.academic_year_id !== 'y2627' ? [] : ['Schedule', 'Resources', 'Chat', 'People'];
  if (ch.kind === 'focus_batch') return ['Schedule', 'Resources', 'Chat', 'People'];
  if (ch.kind === 'club') return ['Posts', 'Resources', 'Chat', 'People'];
  if (ch.kind === 'dm') return memberOf(ch.id, SUPPORT) ? [] : ['Resources', 'Chat'];
  return ['Resources', 'Chat', 'People'];
}
/** Route (artboard stem) for one tab of a place, by role. null = Not part of flow. */
export function placeRoute(ch: any, tab: Tab): string | null {
  const dmFac = isFaculty();
  switch (ch.kind) {
    case 'course':
      if (ch.status === 'read_only' && ch.academic_year_id !== 'y2627') return 'Chat-S04-Past';
      return tab === 'Chat' ? r('Chat-F02-Course', 'Chat-S02-Course') : tab === 'Resources' ? r('Res-F01-Tab', 'Res-S01-Tab') : tab === 'People' ? r('Chat-F28-People', 'Chat-S13-CoursePeople') : null;
    case 'class_group': return tab === 'Chat' ? 'Chat-S06-ClassGroup' : tab === 'Resources' ? 'Chat-S14-ClassResources' : 'Chat-S07-Info';
    case 'club': return tab === 'Chat' ? 'Chat-S08-Club' : tab === 'Posts' ? 'Chat-S08P-ClubPosts' : tab === 'Resources' ? 'Chat-S15-ClubResources' : 'Chat-S16-ClubPeople';
    case 'focus_batch':
      if (ch.status === 'closed' && tab === 'Chat') return 'Chat-F15X-BreakoutEnded';
      return tab === 'Chat' ? 'Chat-F15-Breakout' : tab === 'Schedule' ? 'Chat-F15S-BreakoutSchedule' : tab === 'Resources' ? 'Chat-F15R-BreakoutResources' : 'Chat-F15P-BreakoutPeople';
    case 'group': return tab === 'Chat' ? 'Chat-X05-GroupChat' : tab === 'Resources' ? 'Chat-X06-GroupResources' : 'Chat-X07-GroupPeople';
    case 'dm': return tab === 'Chat' ? (dmFac ? 'Chat-F10-DM' : 'Chat-S09-DM') : (dmFac ? 'Chat-F10R-DMResources' : 'Chat-S09R-DMResources');
  }
  return null;
}
/** Gear target per place (PRD 4 table). DM gear only for student ↔ student. */
function gearRoute(ch: any): string | null {
  switch (ch.kind) {
    case 'course': return r('Chat-F22-Settings', 'Chat-S10-Settings');
    case 'class_group': return 'Chat-S11-ClassSettings';
    case 'club': return 'Chat-S12-ClubSettings';
    case 'focus_batch': return 'Chat-F16-BreakoutInfo';
    case 'group': return 'Chat-X03-GroupInfo';
    case 'dm': return !isFaculty() && otherMember(ch.id)?.role === 'student' ? 'Chat-S17-DMSettings' : null;
  }
  return null;
}
/** Open a place on a tab (Chat by default, PRD Chat-02-Entry). */
export function openChat(chatId: string, tab: Tab = 'Chat', params: any = {}) {
  const ch = byId('chats', chatId); if (!ch) return;
  const route = placeRoute(ch, tab);
  route ? go(route, { chatId, ...params }) : npf(tab);
}
/** The DM with a person, created if it doesn't exist yet. */
/* ---------- Clubs (PRD CL-1–8): open clubs join instantly, others need a lead or the coordinator to approve. ---------- */
export const clubChat = (clubId: string) => db().chats.find(x => x.kind === 'club' && x.club_id === clubId);
export const inClub = (clubId: string, u = meId()) => {
  if (byId('clubs', clubId)?.coordinator_id === u) return true;
  const ch = clubChat(clubId);
  return where('club_members', m => m.club_id === clubId && m.user_id === u).length > 0 && (!ch || !!memberOf(ch.id, u));
};
export const clubRequest = (clubId: string, u = meId()) => where('club_requests', r => r.club_id === clubId && r.user_id === u && r.status === 'pending')[0];
export const clubCount = (clubId: string) => { const ch = clubChat(clubId); return ch ? members(ch.id).length : where('club_members', m => m.club_id === clubId).length + 1; };
export const clubLeads = (clubId: string) => [byId('clubs', clubId)?.coordinator_id, ...where('club_members', m => m.club_id === clubId && m.role === 'lead').map(m => m.user_id)].filter(Boolean) as string[];
export const canApprove = (clubId: string) => clubLeads(clubId).includes(meId());
function addToClub(clubId: string, user_id: string) {
  const ch = clubChat(clubId);
  mut(() => {
    if (!where('club_members', m => m.club_id === clubId && m.user_id === user_id).length) insert('club_members', { club_id: clubId, user_id, role: 'member' });
    if (!ch) return;
    const old = (db().chat_members || []).find(m => m.chat_id === ch.id && m.user_id === user_id);
    if (old) old.left_at = null;
    else insert('chat_members', { chat_id: ch.id, user_id, role: 'member', notify: 'every', muted: false, last_read_at: Date.now(), joined_at: Date.now(), left_at: null });
  });
}
export function joinClub(clubId: string) {
  const k = byId('clubs', clubId);
  if (!k || inClub(clubId) || clubRequest(clubId)) return;
  if (k.join === 'request') {
    mut(() => { insert('club_requests', { id: newId('cr'), club_id: clubId, user_id: meId(), status: 'pending', created_at: Date.now() }); clubLeads(clubId).forEach(u => notify(u, 'club_request', { chat_id: clubChat(clubId)?.id })); });
    mockApprove(clubId);
    return toast('Request sent. A club lead will reply soon.');
  }
  addToClub(clubId, meId());
  const ch = clubChat(clubId); if (ch) sendMessage({ chatId: ch.id, kind: 'system', body: '{who} joined the club' });
  toast(`Welcome to ${k.name}`);
}
/** ponytail: demo stand-in for a lead answering on their phone. Approves 6 s after asking, as the first student lead. */
function mockApprove(clubId: string) {
  const me = meId();
  setTimeout(() => {
    const r = clubRequest(clubId, me), ch = clubChat(clubId), lead = where('club_members', m => m.club_id === clubId && m.role === 'lead')[0]?.user_id || byId('clubs', clubId)?.coordinator_id;
    if (!r || meId() !== me) return;
    mut(() => { r.status = 'approved'; r.answered_by = lead; });
    addToClub(clubId, me);
    mut(() => {
      if (ch) insert('messages', { id: newId('m'), chat_id: ch.id, sender_id: lead, kind: 'system', body: `${profile(lead)?.full_name} added ${profile(me)?.full_name}`, sent_at: Date.now(), status: 'sent' });
      insert('notifications', { id: newId('n'), user_id: me, kind: 'club_approved', actor_id: lead, chat_id: ch?.id, read_at: null, created_at: Date.now() });
    });
    toast(`You're in ${byId('clubs', clubId)?.name}`);
  }, 6000);
}
export function withdrawClubRequest(clubId: string) { const r = clubRequest(clubId); if (r) { mut(() => { r.status = 'withdrawn'; }); toast('Request withdrawn'); } }
export function answerClubRequest(r: any, yes: boolean) {
  const ch = clubChat(r.club_id), who = profile(r.user_id)?.full_name;
  mut(() => { r.status = yes ? 'approved' : 'declined'; r.answered_by = meId(); });
  if (yes) { addToClub(r.club_id, r.user_id); if (ch) sendMessage({ chatId: ch.id, kind: 'system', body: `{who} added ${who}` }); mut(() => { notify(r.user_id, 'club_approved', { chat_id: ch?.id }); }); }
  toast(yes ? `${who} is in` : 'Request declined');
}
/** Join control. small = pill for lists; otherwise a full-width button for the club page. */
export const ClubJoin = ({ clubId, small }: { clubId: string; small?: boolean }) => {
  const k = byId('clubs', clubId); if (!k) return null;
  const member = inClub(clubId), req = clubRequest(clubId), ask = k.join === 'request';
  if (small) {
    const [label, quiet, fn] = member ? ['Joined', true, undefined] : req ? ['Requested', true, () => withdrawClubRequest(clubId)] : [ask ? 'Ask to join' : 'Join', false, () => joinClub(clubId)];
    return (
      <Tap label={label as string} disabled={!fn} onPress={fn as any} style={{ height: 34, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: quiet ? c.sunken : c.green }}>
        {member ? <Ms n="check" s={16} col={c.ink2} /> : null}<T s={13} lh={18} w="600" col={quiet ? c.ink2 : c.onFill}>{label as string}</T>
      </Tap>
    );
  }
  if (member) return <BtnP icon="forum" onPress={() => { const ch = clubChat(clubId); if (ch) openChat(ch.id, 'Chat'); }}>Open club chat</BtnP>;
  if (req) return <BtnS icon="hourglass_top" onPress={() => withdrawClubRequest(clubId)}>Requested · Tap to withdraw</BtnS>;
  return <BtnP icon="group_add" onPress={() => joinClub(clubId)}>{ask ? 'Ask to join' : 'Join club'}</BtnP>;
};

/** Hive Support is a DM with the Hive team's account (PRD SP-1). ponytail: canned acknowledgement stands in for Freshchat ticketing and agent replies. */
export const SUPPORT = 'p-hive';
export function openSupport() {
  const id = ensureDm(SUPPORT);
  if (!where('messages', m => m.chat_id === id).length) mut(() => insert('messages', { id: newId('m'), chat_id: id, sender_id: SUPPORT, kind: 'text', body: `Hi ${profile(meId())?.full_name.split(' ')[0]}, this is Hive Support. Tell us what's not working, or send a screenshot. We reply here, usually within a day.`, sent_at: Date.now(), status: 'sent' }));
  openChat(id, 'Chat');
}
function supportAck(chatId: string) {
  const last = where('messages', m => m.chat_id === chatId && m.sender_id === SUPPORT && m.ack).sort((a, b) => b.sent_at - a.sent_at)[0];
  if (last && Date.now() - last.sent_at < 10 * 60000) return;
  setTimeout(() => mut(() => insert('messages', { id: newId('m'), chat_id: chatId, sender_id: SUPPORT, kind: 'text', ack: true, body: `Thanks, we've got it. Ticket HS-${1000 + where('messages', m => m.chat_id === chatId).length} is open, and someone from the Hive team will reply here.`, sent_at: Date.now(), status: 'sent' })), 1500);
}
export function ensureDm(userId: string) {
  let id = db().chats.find(ch => ch.kind === 'dm' && memberOf(ch.id, meId()) && memberOf(ch.id, userId))?.id;
  if (!id) {
    const nid = newId('dm'); id = nid;
    mut(() => {
      insert('chats', { id: nid, kind: 'dm', status: 'active', who_can_send: 'everyone', academic_year_id: 'y2627', created_at: Date.now(), created_by: meId() });
      [meId(), userId].forEach(user_id => insert('chat_members', { chat_id: nid, user_id, role: 'member', notify: 'every', muted: false, last_read_at: Date.now(), joined_at: Date.now(), left_at: null }));
    });
  }
  return id as string;
}
/** Open the DM with a person, creating it if needed (Chat-X01, People rows, Reply privately). */
export function openDm(userId: string, params: any = {}) { openChat(ensureDm(userId), 'Chat', params); }

/** Chat-F03-Switch: faculty's divisions for this course. Swaps the screen, stays on the tab. */
export function openSwitch(ch: any, stem: string) {
  const courseId = byId('offerings', ch.offering_id)?.course_id;
  const mine = where('offering_faculty', f => f.faculty_id === meId()).map(f => byId('offerings', f.offering_id)).filter(o => o?.course_id === courseId);
  openSheet(() => (
    <SheetBody title="Your divisions" sub={byId('courses', courseId)?.name}>
      <Grp style={{ marginHorizontal: 0 }}>
        {mine.map(o => {
          const chat = db().chats.find(x => x.offering_id === o.id && x.kind === 'course'); const dv = division(o.division_id); const u = unread(chat.id);
          return <Li key={o.id} min={64} bold title={dv.name} sub={`${dv.class_label} · ${peopleCount(chat.id)} people · ${o.schedule_text}`} onPress={() => { closeSheet(); swap(stem, { chatId: chat.id }); }}
            right={<Row gap={8}>{u ? <Badge n={u} /> : null}{chat.id === ch.id ? <Ms n="check" col={c.greenText} /> : null}</Row>} />;
        })}
      </Grp>
    </SheetBody>
  ));
}

/** Header + tabs for any place. stem = this route, so Switch can stay on the current tab. Content goes below. */
export const PlaceShell = ({ chatId, tab, stem, children, right }: { chatId: string; tab: Tab; stem: string; children?: React.ReactNode; right?: React.ReactNode }) => {
  const ch = byId('chats', chatId);
  if (!ch) return null;
  const tabs = placeTabs(ch), gear = gearRoute(ch), other = ch.kind === 'dm' ? otherMember(chatId) : null;
  const dv = ch.division_id ? division(ch.division_id) : null;
  const canSwitch = ch.kind === 'course' && isFaculty() && where('offering_faculty', f => f.faculty_id === meId()).map(f => byId('offerings', f.offering_id)).filter(o => o?.course_id === byId('offerings', ch.offering_id)?.course_id).length > 1;
  const focus = ch.kind === 'focus_batch';
  const sub = ch.kind === 'course' ? `${dv?.name} · ${peopleCount(chatId)} people`
    : focus ? `${dv?.name} · ${ch.name} · ${ch.status === 'closed' ? 'ended' : `${peopleCount(chatId)} people`}`
    : other ? personLine(other)
    : ch.kind === 'class_group' ? `Class group · ${peopleCount(chatId)} people` : ch.kind === 'club' ? `Club · ${peopleCount(chatId)} members` : `Group · ${peopleCount(chatId)} people`;
  return (
    <>
      <Hdr lines={1} title={focus ? byId('courses', byId('offerings', ch.offering_id)?.course_id)?.name : chatTitle(ch)} sub={canSwitch ? <Row gap={2}><T s={12} lh={16} col={c.ink3}>{sub}</T><Ms n="expand_more" s={16} col={c.ink3} /></Row> : sub}
        onTitle={canSwitch ? () => openSwitch(ch, stem) : undefined}
        pic={<Pic img={ch.img || other?.img} name={chatTitle(ch)} size={36} shape={other ? 'round' : 'course'} fac={other?.role === 'faculty'} badge={focus ? 'filter_center_focus' : undefined} />}
        right={<>{right}{other && other.role !== 'support' && ch.status === 'active' && !where('blocks', b => [b.blocker_id, b.blocked_id].includes(other.id) && [b.blocker_id, b.blocked_id].includes(meId())).length ? <IB n="call" label={`Voice call ${other.full_name}`} onPress={() => isOffline() ? toast('You’re offline. Calls need internet, so try again once you’re back.') : go('Chat-X20-Call', { chatId })} /> : null}{tab === 'Chat' && ch.status === 'active' ? <IB n="search" label="Search this chat" onPress={() => go('Chat-F29-SearchChat', { chatId })} /> : null}{gear ? <IB n="settings" label="Chat settings" onPress={() => go(gear, { chatId })} /> : null}</>} />
      {tabs.length ? <Tabs items={tabs} on={tab} onPick={t => { if (t === tab) return; const to = placeRoute(ch, t as Tab); to ? swap(to, { chatId }) : npf(t); }} /> : null}
      {children}
    </>
  );
};

/* ---------- Messages ---------- */
export const unread = (chatId: string) => {
  const m = memberOf(chatId); if (!m) return 0;
  return db().messages.filter(x => x.chat_id === chatId && !x.thread_root_id && x.sender_id !== meId() && x.kind !== 'system' && x.sent_at > m.last_read_at && !x.scheduled_for && x.status !== 'waiting').length;
};
/** Opening a chat reads it: clears the badge and turns my receipts to seen. */
export const markRead = (chatId: string) => {
  const m = memberOf(chatId); if (!m) return;
  const ids = new Set(db().messages.filter(x => x.chat_id === chatId).map(x => x.id));
  const mine = db().message_receipts.filter(r => r.user_id === meId() && !r.seen_at && ids.has(r.message_id));
  if (unread(chatId) || mine.length) mut(() => { m.last_read_at = Date.now(); mine.forEach(r => { r.seen_at = Date.now(); }); });
};
/** Visible (sent) messages at chat level. */
export const chatMessages = (chatId: string) => db().messages.filter(x => x.chat_id === chatId && !x.scheduled_for && (!x.thread_root_id || x.also_sent_to_chat) && !(x.hidden_for || []).includes(meId())).sort((a, b) => a.sent_at - b.sent_at);
export const threadReplies = (rootId: string) => db().messages.filter(x => x.thread_root_id === rootId).sort((a, b) => a.sent_at - b.sent_at);
/** Chats-list preview: "{first name}: {text}" or "You: {text}" */
/** System lines read per viewer: {who} or a leading "You" becomes the sender's name for everyone else. */
export const sysText = (m: any) => { const me = m.sender_id === meId(), name = profile(m.sender_id)?.full_name || ''; return (m.body || '').replace('{who}', me ? 'You' : name).replace(/^You /, me ? 'You ' : `${name} `) + (me && m.me_suffix ? m.me_suffix : ''); };
export const previewOf = (m: any) => {
  if (!m) return '';
  if (m.kind === 'system') return sysText(m);
  const me = m.sender_id === meId(), p = profile(m.sender_id);
  const who = me ? 'You' : p?.role === 'faculty' ? p.full_name : firstName(m.sender_id);
  const body = m.unsent_at ? 'Message unsent' : m.deleted_by ? 'Message deleted' : m.kind === 'file' ? (m.body || byId('resources', m.resource_id)?.title || 'File') : m.kind === 'poll' ? `Poll: ${byId('polls', m.poll_id)?.question ?? ''}` : m.kind === 'buzz_card' ? `Buzz: ${byId('buzz_posts', m.buzz_post_id)?.title ?? ''}` : m.body;
  return !me && byId('chats', m.chat_id)?.kind === 'dm' ? body : `${who}: ${body}`;
};
export const rowTime = fmtRow;

const deliver = (m: any) => members(m.chat_id).forEach(mb => {
  if (mb.user_id === m.sender_id) return;
  insert('message_receipts', { message_id: m.id, user_id: mb.user_id, delivered_at: Date.now(), seen_at: null });
  if (mb.notify !== 'off' && !mb.muted) notify(mb.user_id, m.thread_root_id ? 'thread_reply' : 'chat_message', { message_id: m.id, chat_id: m.chat_id });
});

/**
 * THE message write path. Inserts one message row; online it writes a delivered receipt for every other member (who counts = members at send time)
 * and a notification for members with notify on. Offline it queues with status 'waiting' (G8) and flushQueue() delivers on reconnect.
 */
export function sendMessage(x: { chatId: string; kind?: string; body?: string; [k: string]: any }) {
  const { chatId, kind = 'text', body = '', ...rest } = x;
  const id = newId('m'), now = Date.now(), sched = rest.scheduled_for;
  mut(() => {
    const row = insert('messages', { id, chat_id: chatId, sender_id: meId(), kind, body, sent_at: sched || now, client_id: id, status: !sched && isOffline() ? 'waiting' : 'sent', ...rest });
    if (!sched && !isOffline()) deliver(row);
    const me = memberOf(chatId); if (me) me.last_read_at = now;
  });
  if (kind === 'text' && memberOf(chatId, SUPPORT)) supportAck(chatId);
  return id;
}
/** Scheduled message goes out now (Send now, or its time came). A read-only target refuses it (PRD 9.3). */
export function fireScheduled(m: any) {
  mut(d => {
    if (byId('chats', m.chat_id)?.status !== 'active') {
      d.messages.splice(d.messages.indexOf(m), 1);
      notify(m.sender_id, 'scheduled_failed', { chat_id: m.chat_id, payload: `Couldn't send your scheduled message to ${chatTitle(byId('chats', m.chat_id))}` });
      return;
    }
    delete m.scheduled_for; m.sent_at = Date.now(); deliver(m);
    notify(m.sender_id, 'scheduled_sent', { message_id: m.id, chat_id: m.chat_id });
  });
}
/** Back online: queued messages go, and due scheduled messages fire. Safe to call any time. */
export function flushQueue() {
  if (isOffline()) return;
  const waiting = db().messages.filter(m => m.status === 'waiting'), due = db().messages.filter(m => m.scheduled_for && m.scheduled_for <= Date.now());
  if (waiting.length) mut(() => waiting.forEach(m => { m.status = 'sent'; deliver(m); }));
  due.forEach(fireScheduled);
}
/** ponytail: a queued send "fails" after 30 s offline so testers can reach Couldn't send · Retry; real failures come with a backend. */
export function ageQueue() {
  const old = db().messages.filter(m => m.status === 'waiting' && m.client_id && Date.now() - m.sent_at > 30e3);
  if (old.length) mut(() => old.forEach(m => { m.status = 'failed'; }));
}
export function retrySend(m: any) {
  mut(() => { if (isOffline()) { m.status = 'waiting'; m.sent_at = Date.now(); } else { m.status = 'sent'; deliver(m); } });
}
export const blank = <View />;
