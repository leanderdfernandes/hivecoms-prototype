// Buzz (PRD 5): notice board feed, To do stack, post + reach, compose, share. Stems map to shared components with a role check.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Keyboard, KeyboardAvoidingView, Linking, PanResponder, Pressable, Platform, ScrollView, Share, TextInput, View, useWindowDimensions } from 'react-native';
import { StackActions } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { create } from 'zustand';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { BtnP, BtnS, BtnT, Body, Card, Ck, Chips, Tabs, Fab, Confetti, DoneBurst, Rise, celebrate, closeAllSheets, closeSheet, confirmSheet, Empty, Field, Fi, Grp, Hdr, IB, Li, Ms, openSheet, Pic, Pill, Row, Screen, SearchBar, Sec, Seg, SeenChip, SheetBody, SheetRow, SlidePage, T, Tap, toast, useBottom, openSchedule, pickDateTime, PasteBtn } from './ui';
import { c, P, shadow } from './theme';
import { IMG } from './images';
import { byId, days, dayDiff, db, memberOf, fmtAge, fmtClock, fmtDate, fmtDay, fmtShort, fmtSize, fmtTime, hours, insert, isFaculty, isOffline, meId, mut, newId, notify, pct, profile, useData, useMe, useOffline, where } from './db';
import { back, go, goTab, navRef, npf, swap } from './nav';
import { chatTitle, division, openChat, otherMember, peopleCount, sendMessage, threadReplies, ClubJoin, clubCount, inClub, clubLeads, clubRequest, clubChat, joinClub, withdrawClubRequest, placeRoute } from './place';

const H = 3600e3, D = 24 * H;
const num = (n: number) => n.toLocaleString('en-IN');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fmtWhen = (t: number) => { const d = new Date(t); return `${fmtDate(t)}, ${d.getHours() === 12 && !d.getMinutes() ? 'noon' : fmtTime(t)}`; };
const dueWord = (t: number) => { const n = dayDiff(t), d = fmtWhen(t); return n === 0 ? `today, ${d.split(', ')[1]}` : n === 1 ? `tomorrow, ${d.split(', ')[1]}` : d; };
const postLink = (id: string) => `https://hive.app/buzz/${id}`;
export const openPost = (postId: string) => go(isFaculty() ? 'FacultyPost' : 'StudentPost', { postId });

/* ---------- Lookups ---------- */
const acct = (p: any) => byId('buzz_accounts', p?.account_id);
/** Tap a post's picture or name: a person opens their profile, a club you're in opens its place (Posts tab), anything else its Buzz page. */
export const openAccount = (a: any) => {
  if (!a) return;
  if (a.user_id) return go('Profile', { userId: a.user_id });
  const ch = a.club_id && db().chats.find(x => x.kind === 'club' && x.club_id === a.club_id);
  if (ch && memberOf(ch.id)) return openChat(ch.id, 'Posts');
  go('StudentAccount', { accountId: a.id });
};
/** Feed categories. Events are known from event_at; the rest is a keyword stand-in.
 * ponytail: keyword classifier, swap for the AI model's label (write it to p.category on publish). */
const classify = (p: any) => {
  if (p.event_at) return 'Events';
  if (acct(p)?.club_id) return 'Clubs';
  const t = `${p.title} ${p.body || ''}`.toLowerCase();
  if (/placement|campus drive|drive|intern|resume|recruit|tcs|infosys/.test(t)) return 'Placements';
  if (/exam|it1|it2|marks|timetable|syllabus|question paper|lab|assignment|seminar/.test(t)) return 'Academics';
  return 'Notices';
};
const catOf = (p: any) => p.category || classify(p);
const isOwn = (p: any) => where('buzz_account_members', m => m.account_id === p.account_id && m.user_id === meId()).length > 0;
const todoOf = (pid: string) => db().todo_items.find(t => t.post_id === pid && t.user_id === meId());
const attsOf = (pid: string) => where('buzz_attachments', a => a.post_id === pid).sort((a, b) => (a.sort || 0) - (b.sort || 0));
const seenRows = (pid: string) => where('buzz_seen', s => s.post_id === pid);
const doneCount = (pid: string) => where('todo_items', t => t.post_id === pid && t.state === 'done').length;
const seenPct = (p: any) => pct(seenRows(p.id).length, p.recipient_count);
const commentsOf = (pid: string) => where('buzz_comments', x => x.post_id === pid).sort((a, b) => a.created_at - b.created_at);
const newComments = (p: any) => commentsOf(p.id).filter(x => x.created_at > (p.read_comments?.[meId()] || 0) && x.author_id !== meId()).length;
const addressed = (p: any) => { const k = p.task_for || p.audience_kind; return k === 'everyone' || k === (isFaculty() ? 'faculty' : 'students'); };
const closedAt = (p: any) => p.due_at + 30 * D;
const isOpenTask = (p: any) => !!p.due_at && !isOwn(p) && addressed(p) && todoOf(p.id)?.state !== 'done' && Date.now() < closedAt(p);
const markSeen = (pid: string) => { if (db().buzz_recipients.some(r => r.post_id === pid && r.user_id === meId()) && !db().buzz_seen.some(s => s.post_id === pid && s.user_id === meId())) mut(() => { insert('buzz_seen', { post_id: pid, user_id: meId(), seen_at: Date.now(), link_opened_at: null }); }); };
const readable = (accountId?: string) => {
  const mine = new Set(where('buzz_recipients', r => r.user_id === meId()).map(r => r.post_id));
  const clubAcc = new Set(db().buzz_accounts.filter(a => a.club_id && inClub(a.club_id)).map(a => a.id));
  return db().buzz_posts.filter(p => !p.deleted_at && p.posted_at && (!accountId || p.account_id === accountId) && (mine.has(p.id) || isOwn(p) || clubAcc.has(p.account_id))).sort((a, b) => b.posted_at - a.posted_at);
};

/* ---------- To do ---------- */
const myTodos = () => where('todo_items', t => {
  if (t.user_id !== meId() || t.state === 'done') return false;
  if (t.source === 'message') return !!byId('messages', t.message_id);
  const p = byId('buzz_posts', t.post_id);
  return p && !p.deleted_at && p.posted_at && Date.now() < closedAt(p);
}).sort((a, b) => (a.source === 'message' ? -1 : byId('buzz_posts', a.post_id).due_at) - (b.source === 'message' ? -1 : byId('buzz_posts', b.post_id).due_at));
export const todoCount = () => myTodos().length;
/** Hold a chat message → Add to To do. Chat shows Chat-F26-AddedTodo itself. */
export function addTodoFromMessage(messageId: string) {
  const had = db().todo_items.find(t => t.message_id === messageId && t.user_id === meId() && t.state !== 'done');
  if (had) return had;
  let row: any;
  mut(() => { row = insert('todo_items', { id: newId('td'), user_id: meId(), source: 'message', message_id: messageId, state: 'open', saved_at: Date.now() }); });
  return row;
}
function markDone(pid: string) {
  let t = todoOf(pid);
  mut(() => {
    if (!t) t = insert('todo_items', { id: newId('td'), user_id: meId(), source: 'buzz_post', post_id: pid, state: 'open', saved_at: Date.now() });
    t.failed = isOffline();
    if (!t.failed) { t.state = 'done'; t.done_at = Date.now(); }
  });
  if (t.failed) return;
  markSeen(pid);
  toast('Marked as done', () => undoDone(pid));
}
const undoDone = (pid: string) => { const t = todoOf(pid); if (t) mut(() => { t.state = 'open'; t.done_at = null; }); };

/** Task strip text and state, per StudentStates. */
function taskStrip(p: any): null | { t1: string; t2: string; col?: string; bold?: boolean; btn?: 'mark' | 'done' | 'retry'; own?: boolean } {
  if (!p.due_at) return null;
  const now = Date.now(), due = p.due_at, dd = dayDiff(due);
  if (isOwn(p)) return { own: true, t1: `Due ${fmtWhen(due)}${dd === 0 ? ' · today' : dd === 1 ? ' · tomorrow' : ''}`, t2: `${num(doneCount(p.id))} of ${num(p.recipient_count)} marked as done` };
  if (!addressed(p)) return { t1: `${(p.task_for || p.audience_kind) === 'faculty' ? 'Faculty' : 'Students'} · due ${fmtDate(due)}`, t2: 'No action for you' };
  const t = todoOf(p.id), head = p.task_label ? `${p.task_label} · due ${fmtDate(due)}` : `Due ${fmtWhen(due)}`;
  if (t?.failed) return { t1: 'Couldn’t mark as done', t2: 'Check your connection', btn: 'retry', col: c.negative };
  if (t?.state === 'done') {
    if (t.done_at > due) return { t1: `Was due ${fmtDate(due)}`, t2: `Marked done ${plural(Math.max(1, Math.round((t.done_at - due) / D)), 'day')} late`, btn: 'done' };
    return { t1: head, t2: 'You marked this done', btn: 'done' };
  }
  if (now >= closedAt(p)) return { t1: `Was due ${fmtShort(due)}`, t2: 'Not done · closed' };
  if (due < now) return { t1: `Was due ${fmtWhen(due)}`, t2: 'Late', col: c.caution, bold: true, btn: 'mark' };
  if (dd === 0) return { t1: `Due today, ${fmtTime(due)}`, t2: `${plural(Math.ceil((due - now) / H), 'hour')} left`, col: c.caution, bold: true, btn: 'mark' };
  return { t1: head, t2: `In ${plural(dd, 'day')}`, col: dd <= 2 ? c.caution : undefined, bold: dd <= 2, btn: 'mark' };
}

/* ---------- Shared bits ---------- */
const pickWhen = (title: string, initial: number, onPick: (t: number) => void) => pickDateTime(initial, onPick, title);
const Strip = ({ children, style, icon, iconCol }: any) => (
  <View style={[{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 8, paddingRight: 8, paddingLeft: 12, borderRadius: 14, backgroundColor: c.blueSoft }, style]}>
    {icon ? <Ms n={icon} s={20} col={iconCol || c.ink2} /> : null}{children}
  </View>
);
/** Strip action: brand yellow, ink label. `done` = mint with a green tick. */
const Act = ({ children, onPress, done }: any) => (
  <Tap label={typeof children === 'string' ? children : undefined} onPress={onPress} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: done ? c.mint : c.yellow }}>
    {done ? <Ms n="check" s={18} col={c.greenText} /> : null}<T s={13} lh={18} w="600" col={done ? c.greenText : c.ink}>{children}</T>
  </Tap>
);
const StripText = ({ t1, t2, col, bold }: any) => (
  <View style={{ flex: 1, minWidth: 0 }}><T s={14} lh={19} w="600">{t1}</T>{t2 ? <T s={12} lh={16} w={bold ? '600' : undefined} col={col || c.ink2}>{t2}</T> : null}</View>
);
/** Due date and done state. Seen % is not here: every own post shows it in the action row, due date or not. */
const TaskStrip = ({ p }: { p: any }) => {
  const s = taskStrip(p);
  if (!s) return null;
  return (
    <Strip icon={s.btn === 'done' ? 'task_alt' : 'event_available'} iconCol={s.btn === 'done' ? c.greenText : s.col}>
      <StripText {...s} />
      {s.btn === 'mark' ? <Act onPress={() => markDone(p.id)}>Mark as done</Act> : null}
      {s.btn === 'retry' ? <Act onPress={() => markDone(p.id)}>Retry</Act> : null}
      {s.btn === 'done' ? <Act done onPress={() => undoDone(p.id)}>Done</Act> : null}
    </Strip>
  );
};
/** Seen % is only for the person who wrote the post: they know who it was meant for. */
const mine = (p: any) => p.author_id === meId() && !!p.posted_at;
const seenAction = (p: any) => <SeenChip pct={seenPct(p)} onPress={() => go('FacultyWhoSaw', { postId: p.id })} />;
const EventStrip = ({ p }: { p: any }) => p.event_at ? (
  <Strip icon="event">
    <StripText t1={`${fmtWhen(p.event_at)}${p.event_place ? ` · ${p.event_place}` : ''}`} t2={p.seats_total ? `${p.seats_total - (p.seats_taken || 0)} of ${p.seats_total} seats left` : undefined} />
    <Act onPress={() => npf('Register')}>Register</Act>
  </Strip>
) : null;
const photoSrc = (a: any) => (a.uri ? { uri: a.uri } : IMG[a.img]);
const naturalRatio = (a: any) => {
  if (a.w && a.h) return a.w / a.h;
  const src = a.img && IMG[a.img] ? Image.resolveAssetSource(IMG[a.img]) : null;
  return src ? src.width / src.height : 4 / 3;
};
/** Where the image sits in a w x h frame. A crop is zoom + offset as fractions of the frame, so it renders the same at any size. */
const cropBox = (a: any, w: number, h: number, cr: any = a.crop) => {
  const r = naturalRatio(a), bw = r > w / h ? h * r : w, bh = r > w / h ? h : w / r;
  const z = Math.min(4, Math.max(1, cr?.z ?? 1)), mx = (bw * z - w) / 2 / w, my = (bh * z - h) / 2 / h;
  const x = Math.max(-mx, Math.min(mx, cr?.x ?? 0)), y = Math.max(-my, Math.min(my, cr?.y ?? 0));
  return { z, x, y, width: bw * z, height: bh * z, left: (w - bw * z) / 2 + x * w, top: (h - bh * z) / 2 + y * h };
};
const Tile = ({ a, style, onSize, children }: any) => {
  const [sz, setSz] = useState<any>(null);
  const box = sz && cropBox(a, sz.w, sz.h);
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: c.sunken }, style]} onLayout={e => { const { width: w, height: h } = e.nativeEvent.layout; setSz({ w, h }); onSize?.({ w, h }); }}>
      {box ? <Image source={photoSrc(a)} accessibilityIgnoresInvertColors style={{ position: 'absolute', left: box.left, top: box.top, width: box.width, height: box.height }} /> : null}
      {children}
    </View>
  );
};
const PhotoGrid = ({ list, tile }: { list: any[]; tile: (a: any, st: any) => any }) => {
  const l = list.slice(0, 3);
  return (
    <View style={{ flexDirection: 'row', gap: 3, aspectRatio: l.length === 1 ? 4 / 3 : 1.9, marginTop: 12, borderRadius: 12, overflow: 'hidden' }}>
      {tile(l[0], { flex: l.length === 2 ? 1 : 2 })}
      {l.length === 2 ? tile(l[1], { flex: 1 }) : null}
      {l.length > 2 ? <View style={{ flex: 1, gap: 3 }}>{tile(l[1], { flex: 1 })}{tile(l[2], { flex: 1 })}</View> : null}
    </View>
  );
};
const Photos = ({ p, list }: { p: any; list: any[] }) => (
  <Tap label={`Open ${plural(list.length, 'photo')}`} onPress={() => go('StudentGallery', { postId: p.id })}>
    <PhotoGrid list={list} tile={(a, st) => <Tile key={a.id} a={a} style={st} />} />
  </Tap>
);
const attIcon = (a: any) => (a.kind === 'link' ? 'link' : a.icon || 'description');
function openAtt(p: any, a: any) {
  if (a.kind === 'file') return go('FacultyFile', { postId: p.id, attId: a.id });
  if (a.kind === 'app') return npf(a.title);
  markSeen(p.id);
  mut(() => { const s = db().buzz_seen.find(x => x.post_id === p.id && x.user_id === meId()); if (s && !s.link_opened_at) s.link_opened_at = Date.now(); });
  Linking.openURL(a.url).catch(() => toast(`Couldn’t open ${a.title}`));
}
const AttRow = ({ p, a }: any) => (
  <Tap label={a.title} onPress={() => openAtt(p, a)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
    <Fi n={attIcon(a)} />
    <View style={{ flex: 1, minWidth: 0 }}><T s={14} lh={19} n={1}>{a.title}</T><T s={12} lh={16} col={c.ink3} n={1}>{a.meta}</T></View>
  </Tap>
);
const Atts = ({ p }: { p: any }) => {
  const all = attsOf(p.id), ph = all.filter(a => a.kind === 'photo'), rest = all.filter(a => a.kind !== 'photo');
  return <>{ph.length ? <Photos p={p} list={ph} /> : null}{rest.length ? <View style={{ marginTop: 8 }}>{rest.map(a => <AttRow key={a.id} p={p} a={a} />)}</View> : null}</>;
};

/* ---------- Comments ---------- */
function addComment(p: any, body: string, mention: string | null, parentId: string | null) {
  const id = newId('cm'), own = isOwn(p);
  mut(() => {
    insert('buzz_comments', { id, post_id: p.id, author_id: meId(), as_account: own ? p.account_id : null, parent_id: parentId, mention_user_id: mention, body, created_at: Date.now(), waiting: isOffline() });
    where('buzz_account_members', m => m.account_id === p.account_id && m.user_id !== meId()).forEach(m => notify(m.user_id, 'buzz_comment', { post_id: p.id, comment_id: id }));
    new Set([parentId && byId('buzz_comments', parentId)?.author_id, mention].filter(u => u && u !== meId())).forEach((u: any) => notify(u, 'buzz_reply', { post_id: p.id, comment_id: id }));
  });
  markSeen(p.id);
}
const commentName = (x: any, p: any) => (x.as_account ? acct(p)?.name : profile(x.author_id)?.full_name);
const CommentBody = ({ x }: { x: any }) => {
  const n = x.mention_user_id && profile(x.mention_user_id)?.full_name;
  const tag = n && `@${n}`, has = tag && x.body.startsWith(tag);
  return <T s={14} lh={20} style={{ marginTop: 2 }}>{has ? <T s={14} lh={20} w="600" col={c.greenText}>{tag}</T> : null}{has ? x.body.slice(tag.length) : x.body}</T>;
};
const CommentRow = ({ x, p, full, onReply }: { x: any; p: any; full?: boolean; onReply?: (x: any) => void }) => {
  const off = useOffline(), own = isOwn(p);
  const options = () => openSheet(() => (
    <SheetBody title="Comment options">
      <SheetRow icon="reply" label="Reply" onPress={() => { closeSheet(); onReply?.(x); }} />
      {x.author_id === meId() || own ? <SheetRow neg icon="delete" label="Delete" onPress={() => {
        closeSheet();
        mut(d => { d.buzz_comments = d.buzz_comments.filter(k => k.id !== x.id); });
        toast('Comment deleted', () => mut(() => { insert('buzz_comments', x); }));
      }} /> : null}
    </SheetBody>
  ));
  const dept = !x.as_account && byId('departments', profile(x.author_id)?.department_id)?.short;
  return (
    <Tap disabled={!full} onLong={options} style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
      <Tap label={`Open ${commentName(x, p)}`} onPress={() => (x.as_account ? openAccount(acct(p)) : x.author_id && go('Profile', { userId: x.author_id }))}><Pic size={28} img={x.as_account ? acct(p)?.img : profile(x.author_id)?.img} name={commentName(x, p)} /></Tap>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Row gap={4} style={{ flexWrap: 'wrap' }}>
          <T s={13} lh={16} w="600">{commentName(x, p)}</T>
          {x.as_account ? <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: c.greenWash }}><T s={11} lh={14} w="600" col={c.greenText}>Author</T></View> : null}
          <T s={12} lh={16} col={c.ink3}>{full && dept ? `· ${dept} ` : ''}· {fmtAge(x.created_at)}</T>
        </Row>
        <CommentBody x={x} />
        {x.waiting && off ? <T s={12} lh={16} col={c.ink3}>Waiting to send</T> : null}
        {full ? <Row gap={8}><Tap label="Reply" onPress={() => onReply?.(x)} style={{ minHeight: 32, justifyContent: 'center' }}><T s={12} lh={16} w="600" col={c.ink2}>Reply</T></Tap></Row> : null}
      </View>
      {full ? <IB n="more_horiz" s={18} col={c.ink3} label={`Options for ${commentName(x, p)}’s comment: reply, delete`} onPress={options} style={{ width: 32, height: 32 }} /> : null}
    </Tap>
  );
};
const CommentBox = ({ p, reply, clearReply, onSent }: { p: any; reply?: any; clearReply?: () => void; onSent?: () => void }) => {
  const me = useMe(), own = isOwn(p), a = acct(p);
  const [txt, setTxt] = useState(''), [mention, setMention] = useState<string | null>(null), input = useRef<any>(null);
  useEffect(() => {
    if (!reply) return;
    setTimeout(() => input.current?.focus(), 50);
    const who = profile(reply.author_id);
    if (!reply.as_account && who) { setTxt(`@${who.full_name} `); setMention(who.id); }
  }, [reply]);
  const q = /@([^@]*)$/.exec(txt)?.[1]?.toLowerCase();
  const people = q == null || (mention && txt.includes(`@${profile(mention)?.full_name}`)) ? [] : (() => {
    const ids = new Set([...commentsOf(p.id).map(x => x.author_id), ...where('buzz_recipients', r => r.post_id === p.id).map(r => r.user_id)]);
    ids.delete(meId());
    return [...ids].map(profile).filter(u => u && (u.full_name.toLowerCase().startsWith(q) || u.full_name.toLowerCase().split(' ').some((w: string) => w.startsWith(q)))).slice(0, 5);
  })();
  const send = () => { addComment(p, txt.trim(), mention, reply?.id ?? null); setTxt(''); setMention(null); clearReply?.(); Keyboard.dismiss(); onSent?.(); };
  return (
    <View style={{ marginTop: 10, marginBottom: 10 }}>
      {people.length ? <View style={{ marginBottom: 6 }}><T s={12} lh={16} w="600" col={c.ink3}>People</T>{people.map(u => (
        <Tap key={u.id} label={u.full_name} onPress={() => { setTxt(txt.replace(/@[^@]*$/, `@${u.full_name} `)); setMention(u.id); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }}>
          <Pic size={28} img={u.img} name={u.full_name} /><T s={14} lh={19} n={1} style={{ flex: 1 }}>{u.full_name}</T><T s={12} lh={16} col={c.ink3}>{byId('departments', u.department_id)?.short}</T>
        </Tap>
      ))}</View> : null}
      <Row gap={10}>
        <Pic size={28} img={own ? a?.img : me?.img} name={own ? a?.name : me?.full_name} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: c.sunken }}>
          <TextInput ref={input} accessibilityLabel={`${own ? `Comment as ${a?.name}` : 'Add a comment'}. Type @ to tag someone`} value={txt} onChangeText={setTxt} placeholder={reply ? `Reply to ${commentName(reply, p)}` : own ? `Comment as ${a?.name}` : 'Add a comment'} placeholderTextColor={c.ink3} multiline style={{ flex: 1, fontSize: 14, color: c.ink, paddingVertical: 8, fontFamily: 'Poppins_400Regular' }} />
          {txt.trim() ? <IB n="send" s={20} col={c.greenText} label="Send" onPress={send} style={{ width: 36, height: 36, marginRight: -8 }} /> : null}
        </View>
      </Row>
    </View>
  );
};

/* ---------- Post card ---------- */
/** The post's words: the stored title leads in semibold, the body follows. No separate headline. */
export const PostText = ({ p, s = 15, lh = 22 }: { p: any; s?: number; lh?: number }) => (
  <T s={s} lh={lh}><T s={s} lh={lh} w="600">{p.title}</T>{p.body ? `\n${p.body}` : ''}</T>
);
const shareIcon = P.ios ? 'ios_share' : 'share';
/** Comments · Share, and for the author the seen % (every own post, due date or not). */
const Actions = ({ p, onComments, count, fresh }: any) => (
  <Row gap={22} style={{ minHeight: 44, marginTop: 2 }}>
    <Tap label={count ? `${count} comments` : 'Comment'} onPress={onComments} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ms n="chat_bubble" s={18} col={c.ink2} />
      {count ? <T s={13} lh={18} w="500" col={c.ink2}>{count}</T> : null}
      {fresh ? <T s={13} lh={18} w="600" col={c.greenText}>{fresh} new</T> : null}
    </Tap>
    <Tap label="Share" onPress={() => openBuzzShare(p.id)} style={{ minHeight: 44, justifyContent: 'center' }}><Ms n={shareIcon} s={18} col={c.ink2} /></Tap>
    <View style={{ flex: 1 }} />
    {mine(p) ? seenAction(p) : null}
  </Row>
);
export const PostCard = ({ post: p, noHead, style }: { post: any; noHead?: boolean; style?: any }) => {
  useData();
  const [open, setOpen] = useState(false);
  const fac = isFaculty(), own = isOwn(p), a = acct(p), cms = commentsOf(p.id), fresh = own ? newComments(p) : 0;
  const aud = fac ? p.audience_label : p.audience_short || p.audience_label;
  const off = useOffline();
  return (
    <View style={[{ flexDirection: 'row', gap: 12, paddingLeft: 16, paddingRight: 16, paddingTop: 14, paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: c.line }, style]}>
      <Tap disabled={noHead} label={`Open ${a?.name}`} onPress={() => openAccount(a)}><Pic size={42} img={a?.img} name={a?.name} /></Tap>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Row gap={4} style={{ minHeight: 20 }}>
          <Tap disabled={noHead} label={a?.name} onPress={() => openAccount(a)} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <T s={15} lh={20} w="600" n={1} style={{ flexShrink: 1 }}>{a?.name}</T>
            {a?.official ? <Ms n="verified" s={16} fill col={c.green} /> : null}
            <T s={13} lh={20} col={c.ink3} n={1} style={{ flexShrink: 0 }}>{`· ${fmtAge(p.posted_at)}`}</T>
          </Tap>
          {own ? <IB n="more_horiz" s={20} col={c.ink3} label="Post options" onPress={() => openPostMenu(p.id)} style={{ width: 36, height: 28, marginRight: -8 }} /> : null}
        </Row>
        <T s={12} lh={16} col={c.ink3} n={1}>To {aud}</T>
        <Tap label={p.title} onPress={() => openPost(p.id)} style={{ marginTop: 6 }}><PostText p={p} /></Tap>
        {p.waiting && off ? <T s={12} lh={16} col={c.ink3} style={{ marginTop: 4 }}>Waiting to send</T> : null}
        <Atts p={p} />
        <BuzzPoll p={p} />
        <EventStrip p={p} />
        <TaskStrip p={p} />
        <Actions p={p} count={cms.length} fresh={fresh} onComments={() => { if (fac) openPost(p.id); else { setOpen(!open); markSeen(p.id); } }} />
        {open ? (
          <View style={{ paddingBottom: 4 }}>
            {cms.slice(-2).map(x => <CommentRow key={x.id} x={x} p={p} />)}
            {cms.length > 2 ? <Tap label="View all comments" onPress={() => openPost(p.id)} style={{ minHeight: 32, justifyContent: 'center', marginTop: 6 }}><T s={13} lh={18} w="600" col={c.greenText}>View all {cms.length} comments</T></Tap> : null}
            <CommentBox p={p} />
          </View>
        ) : null}
      </View>
    </View>
  );
};

/* ---------- Feeds ---------- */
const chipMem: Record<string, string> = {};
const CHIP_EMPTY: Record<string, [string, string]> = { 'To do': ['No tasks right now', 'checklist'], Events: ['No events coming up', 'event'], Notices: ['No notices', 'campaign'], Academics: ['Nothing on academics', 'school'], Placements: ['No placement news', 'work'], Clubs: ['Nothing from clubs yet', 'groups'], 'Your posts': ['You haven’t posted yet', 'edit'] };
const CATS = ['Events', 'Notices', 'Academics', 'Placements', 'Clubs'];
const chipFilter = (chip: string, p: any) => chip === 'To do' ? isOpenTask(p) : CATS.includes(chip) ? catOf(p) === chip : chip === 'Your posts' ? isOwn(p) : true;
/** Newly due scheduled posts go out when any feed opens. ponytail: stands in for the publish-scheduled cron. */
const publishDue = () => { const due = db().buzz_posts.filter(p => p.scheduled_for && !p.posted_at && p.scheduled_for <= Date.now()); if (due.length) mut(() => due.forEach(publish)); };
/** ponytail: seen = open the post, or the first 2 cards of a feed staying on screen 1s. Real per-card visibility needs viewability tracking. */
const useSeenFirst = (list: any[], key: string) => useEffect(() => {
  const id = setTimeout(() => list.slice(0, 2).forEach(p => markSeen(p.id)), 1000);
  return () => clearTimeout(id);
}, [key]);
const Feed = ({ mem, accountId, items, top, pad = 24, noHead, chips = ['All', ...CATS] }: { mem: string; accountId?: string; items?: string[]; top?: (chip: string) => React.ReactNode; pad?: number; noHead?: boolean; chips?: any }) => {
  useData();
  const [chip, setChip] = useState(chipMem[mem] || 'All');
  useEffect(publishDue, []);
  const all = readable(accountId);
  // On one account's page, only the kinds it actually posts; no tabs when there's one kind or fewer.
  const own = accountId ? CATS.filter(k => k !== 'Clubs' && all.some(p => catOf(p) === k)) : null;
  const labels: string[] | null = chips === false ? null : own ? (own.length > 1 ? ['All', ...own] : null) : chips;
  const list = all.filter(p => chipFilter(labels?.includes(chip) ? chip : 'All', p));
  useSeenFirst(list, chip + list.length);
  const pick = (x: string) => { chipMem[mem] = x; setChip(x); };
  const sched = chip === 'Scheduled';
  const empt = CHIP_EMPTY[chip];
  return (
    <>
      {labels ? <Tabs items={labels} on={chip} onPick={pick} mine="Your posts" /> : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Body pad={pad}>
        {top?.(chip)}
        {sched ? <ScheduledList /> : !all.length ? <Empty icon="campaign" title="Nothing on Buzz yet" line="Posts from your college show up here." />
          : !list.length ? <Empty icon={empt?.[1] || 'campaign'} title={empt?.[0] || 'Nothing on Buzz yet'} action="All" onAction={() => pick('All')} />
          : list.map(p => <PostCard key={p.id} post={p} noHead={noHead} />)}
      </Body>
      </KeyboardAvoidingView>
    </>
  );
};
export const BuzzFeed = ({ accountId, chips = false }: { accountId?: string; chips?: any }) => <Feed mem={`acc:${accountId}`} accountId={accountId} chips={chips === true ? undefined : chips} noHead={!!accountId} />;

/** Feed-top shortcut (To do, Scheduled). Flat tinted tile: yellow for things you owe, blue for things queued. */
const BigStrip = ({ icon, title, sub, right, onPress, tone = 'yellow' }: any) => (
  <Tap label={title} onPress={onPress} style={{ marginHorizontal: 16, marginTop: 12, minHeight: 60, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: tone === 'yellow' ? c.yellowSoft : c.blueSoft }}>
    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: tone === 'yellow' ? c.yellow : c.blue, alignItems: 'center', justifyContent: 'center' }}><Ms n={icon} s={20} col={c.ink} /></View>
    <View style={{ flex: 1, minWidth: 0 }}><T s={14} lh={19} w="600">{title}</T><T s={13} lh={18} col={c.ink2} n={1}>{sub}</T></View>
    {right}
  </Tap>
);
const unreadNotes = () => where('notifications', n => n.user_id === meId() && !n.read_at && n.kind !== 'chat_message').length;
const FeedHdr = ({ right }: any) => {
  const n = unreadNotes();
  return (
    <Hdr noBack big title="Buzz" right={<>
      <IB n="search" label="Search Buzz" onPress={() => go('StudentSearch')} />
      <IB n="notifications" fill={n > 0} count={n} label={n ? `Notifications, ${n} new` : 'Notifications'} onPress={() => go('StudentNotifications')} />
      {right}
    </>} />
  );
};
const CatchUp = <Row gap={2}><T s={13} lh={18} w="600">Catch up</T><Ms n="chevron_right" s={18} /></Row>;
const Main = () => {
  useData();
  return (
    <Screen>
      <FeedHdr />
      <Feed mem="main" pad={120} top={chip => {
        const n = todoCount(), late = myTodos().filter(t => t.post_id && byId('buzz_posts', t.post_id).due_at < Date.now()).length;
        if (chip === 'Clubs') return <ClubRail />;
        return chip === 'All' ? <>{n ? <BigStrip icon="checklist" title="To do" sub={`${n} to do${late ? ` · ${late} late` : ''}`} right={CatchUp} onPress={() => go('StudentPost')} /> : null}<ClubSuggest /></> : null;
      }} />
    </Screen>
  );
};
const FacultyBuzz = () => {
  useData();
  return (
    <Screen>
      <FeedHdr right={<Tap label="New post" onPress={() => go('FacultyNewPost')} style={{ width: 40, height: 40, borderRadius: 20, marginLeft: 6, marginRight: 8, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center', boxShadow: shadow.button } as any}><Ms n="add" s={26} col={c.onFill} /></Tap>} />
      <Feed mem="faculty" pad={120} chips={['All', 'Your posts', ...CATS, 'Scheduled']} top={chip => {
        if (chip === 'Clubs') return <ClubRail />;
        if (chip !== 'All') return null;
        const n = todoCount(), m = myTodos().filter(t => t.source === 'message').length, sch = scheduledPosts();
        return <>
          {n ? <BigStrip icon="checklist" title="To do" sub={`${n} to do${m ? ` · ${m} saved from chat` : ''}`} right={CatchUp} onPress={() => go('FacultyTodo')} /> : null}
          {sch.length ? <BigStrip icon="schedule_send" title={`${sch.length} scheduled`} sub={`${sch[0].title} · ${fmtWhen(sch[0].scheduled_for)}`} tone="blue" right={<Ms n="chevron_right" col={c.ink2} />} onPress={() => go('FacultyScheduled')} /> : null}
        </>;
      }} />
    </Screen>
  );
};
const StudentAccount = ({ route }: any) => {
  useData();
  const a = byId('buzz_accounts', route.params?.accountId);
  if (!a) return <Screen><Hdr title="Buzz" /><Empty icon="campaign" title="Nothing on Buzz yet" /></Screen>;
  if (a.club_id) return <ClubIntro clubId={a.club_id} />;
  return (
    <Screen>
      <Hdr title={a.name} sub={a.sub} pic={<Pic size={36} img={a.img} name={a.name} />} right={<IB n="search" label={`Search ${a.name} posts`} onPress={() => go('StudentSearch', { accountId: a.id })} />} />
      <Feed mem={`acc:${a.id}`} accountId={a.id} noHead />
    </Screen>
  );
};

/* ---------- Polls on posts (same tables as chat polls, keyed by post_id) ---------- */
const BuzzPoll = ({ p }: { p: any }) => {
  const poll = where('polls', x => x.post_id === p.id)[0];
  if (!poll) return null;
  const opts = where('poll_options', o => o.poll_id === poll.id).sort((a, b) => a.sort - b.sort), votes = where('poll_votes', v => v.poll_id === poll.id);
  const own = isOwn(p), mineV = votes.filter(v => v.user_id === meId()), voted = mineV.length > 0, tot = new Set(votes.map(v => v.user_id)).size;
  const show = voted || own || !!poll.closed_at;
  const vote = (o: any) => mut(d => {
    const had = d.poll_votes.findIndex((v: any) => v.poll_id === poll.id && v.option_id === o.id && v.user_id === meId());
    if (!poll.multi_answer) d.poll_votes = d.poll_votes.filter((v: any) => !(v.poll_id === poll.id && v.user_id === meId()));
    if (had >= 0 && poll.multi_answer) d.poll_votes.splice(had, 1);
    if (had < 0) d.poll_votes.push({ poll_id: poll.id, option_id: o.id, user_id: meId() });
  });
  return (
    <View style={{ marginTop: 10, gap: 6 }}>
      {opts.map(o => {
        const n = votes.filter(v => v.option_id === o.id).length, on = mineV.some(v => v.option_id === o.id), pc = tot ? Math.round((n / tot) * 100) : 0;
        return (
          <Tap key={o.id} label={`${o.text}${show ? `, ${pc} percent` : ''}`} disabled={own || !!poll.closed_at} onPress={() => vote(o)}
            style={{ minHeight: 44, borderRadius: 12, overflow: 'hidden', borderWidth: show ? 0 : 1.5, borderColor: c.green, backgroundColor: show ? c.sunken : 'transparent', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 }}>
            {show ? <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pc}%`, backgroundColor: on ? c.mint : c.track }} /> : null}
            <T s={14} lh={19} w={on ? '600' : '400'} col={show ? c.ink : c.greenText} style={{ flex: 1 }} center={!show}>{o.text}</T>
            {on ? <Ms n="check_circle" s={18} fill col={c.greenText} /> : null}
            {show ? <T s={14} lh={19} w="600">{pc}%</T> : null}
          </Tap>
        );
      })}
      <T s={12} lh={16} col={c.ink3}>{`${plural(tot, 'vote')}${poll.multi_answer ? ' · pick any' : ''}${!show ? ' · tap to vote' : voted && !own ? ' · tap another to change' : ''}`}</T>
    </View>
  );
};
/** Demo poll from Anita to DAA Div A, so both sides show: students vote, she sees results. */
export function seedBuzzPoll(d: any) {
  const studs = d.division_members.filter((m: any) => m.division_id === 'div-a').map((m: any) => m.student_id);
  const now = Date.now();
  d.buzz_posts.push({ id: 'post-daa-poll', account_id: 'acc-u-p-anita', author_id: 'p-anita', title: 'Extra DAA revision before IT2: which day works?', body: '', audience_kind: 'students', audience_label: 'TE Comp · Div A', audience_short: 'your class', recipient_count: studs.length, due_at: null, event_at: null, posted_at: now - 3 * 3600000, deleted_at: null, category: 'Academics' });
  studs.forEach((user_id: string) => d.buzz_recipients.push({ post_id: 'post-daa-poll', user_id }));
  d.polls.push({ id: 'poll-buzz-daa', post_id: 'post-daa-poll', question: 'Extra DAA revision before IT2: which day works?', multi_answer: false, names_visible: false, closed_at: null });
  const opts = [['Thursday, 4 pm', 0.45], ['Friday, 2 pm', 0.3], ['Saturday, 10 am', 0.1]] as const;
  let k = 0;
  opts.forEach(([text, share], sort) => {
    const id = `po-buzz-${sort}`; d.poll_options.push({ id, poll_id: 'poll-buzz-daa', text, sort });
    const n = Math.round(studs.length * share);
    studs.filter((u: string) => u !== 'p-rohan').slice(k, k + n).forEach((user_id: string) => d.poll_votes.push({ poll_id: 'poll-buzz-daa', option_id: id, user_id }));
    k += n;
  });
  // Everyone who voted has seen it, plus a few who only looked.
  const seen = new Set(d.poll_votes.filter((v: any) => v.poll_id === 'poll-buzz-daa').map((v: any) => v.user_id).concat(studs.slice(-6)));
  seen.forEach((user_id: any) => d.buzz_seen.push({ post_id: 'post-daa-poll', user_id, seen_at: now - 3600000, link_opened_at: null }));
}

/* ---------- Clubs: page, directory, rail, suggestions ---------- */
const clubAcct = (clubId: string) => db().buzz_accounts.find(a => a.club_id === clubId);
const openClub = (clubId: string) => openAccount(clubAcct(clubId));
const myClubs = () => db().clubs.filter(k => inClub(k.id));
const clubLine = (k: any) => `${k.category} · ${clubCount(k.id)} members`;
/** Club page before you join: what it is, who runs it, its latest posts, and Join. Chat, Resources and People open once you're in.
 * ponytail: every club post previews here; a per-post "members only" flag would hide some. */
const PREVIEW = 3;
const ClubIntro = ({ clubId }: { clubId: string }) => {
  useData();
  const k = byId('clubs', clubId); if (!k) return null;
  const leads = clubLeads(clubId).map(id => profile(id)).filter(Boolean) as any[];
  const posts = db().buzz_posts.filter(p => p.account_id === clubAcct(clubId)?.id && p.posted_at && !p.deleted_at).sort((a, b) => b.posted_at - a.posted_at);
  const member = inClub(clubId), req = clubRequest(clubId), bottom = useBottom();
  const enter = () => { const ch = clubChat(clubId); const to = ch && placeRoute(ch, 'Posts'); if (to) swap(to, { chatId: ch.id }); };
  const join = () => { joinClub(clubId); if (inClub(clubId)) enter(); };
  return (
    <Screen>
      <Hdr title={k.name} sub={clubLine(k)} pic={<Pic size={36} shape="course" img={k.img} name={k.name} />} />
      <Body pad={member || req ? 32 : 120}>
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <T s={15} lh={23}>{k.about}</T>
          <Row gap={8} style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row' }}>{leads.slice(0, 3).map((u, i) => <View key={u.id} style={{ marginLeft: i ? -10 : 0, borderRadius: 99, borderWidth: 2, borderColor: c.page }}><Pic size={28} img={u.img} name={u.full_name} /></View>)}</View>
            <T s={13} lh={18} col={c.ink2} n={2} style={{ flex: 1 }}>{`Run by ${leads[0]?.full_name}${leads.length > 1 ? ` and ${leads.length - 1} student lead${leads.length > 2 ? 's' : ''}` : ''}`}</T>
          </Row>
          {req ? <Row gap={10} style={{ marginTop: 16, padding: 12, borderRadius: 14, backgroundColor: c.yellowSoft }}>
            <Ms n="hourglass_top" s={20} col={c.yellowText} />
            <T s={14} lh={20} style={{ flex: 1 }}>Request sent. A lead will let you in soon.</T>
            <BtnT onPress={() => withdrawClubRequest(clubId)} col={c.yellowText}>Withdraw</BtnT>
          </Row> : null}
          {member ? <BtnP icon="arrow_forward" style={{ marginTop: 16 }} onPress={enter}>Go to club</BtnP> : null}
        </View>
        <Sec>{posts.length ? 'Recent posts' : 'Posts'}</Sec>
        {!posts.length ? <T s={14} lh={20} col={c.ink3} style={{ paddingHorizontal: 16 }}>No posts yet.</T> : null}
        {posts.slice(0, member ? posts.length : PREVIEW).map(p => <PostCard key={p.id} post={p} noHead />)}
        {!member && posts.length > PREVIEW ? <Row gap={8} style={{ paddingHorizontal: 16, paddingTop: 12 }}><Ms n="lock" s={16} col={c.ink3} /><T s={13} lh={18} col={c.ink3} style={{ flex: 1 }}>{`Join to see all ${posts.length} posts, the club chat and files.`}</T></Row>
          : !member ? <Row gap={8} style={{ paddingHorizontal: 16, paddingTop: 12 }}><Ms n="lock" s={16} col={c.ink3} /><T s={13} lh={18} col={c.ink3} style={{ flex: 1 }}>Join to get the club chat and files.</T></Row> : null}
      </Body>
      {member || req ? null : (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(bottom, 16), backgroundColor: c.page, borderTopWidth: 1, borderTopColor: c.line }}>
          <BtnP icon="group_add" onPress={join}>{k.join === 'request' ? 'Ask to join' : 'Join club'}</BtnP>
          <T s={12} lh={16} col={c.ink3} center style={{ marginTop: 6 }}>{k.join === 'request' ? 'A club lead approves new members, usually within a day.' : 'Anyone can join. Leave any time.'}</T>
        </View>
      )}
    </Screen>
  );
};
/** All clubs, by kind, with a join control on each row. */
const BuzzClubs = () => {
  useData();
  const [q, setQ] = useState(''), k = q.trim().toLowerCase();
  const list = db().clubs.filter(x => !k || x.name.toLowerCase().includes(k) || (x.category || '').toLowerCase().includes(k));
  const kinds = [...new Set(list.map(x => x.category))];
  return (
    <Screen>
      <Hdr title="Clubs" sub={`${db().clubs.length} clubs at your college`} />
      <SearchBar placeholder="Search clubs" value={q} onChange={setQ} />
      <Body pad={32}>
        {!list.length ? <Empty icon="search" title={`No clubs match “${q.trim()}”`} /> : null}
        {kinds.map(kind => <View key={kind}><Sec>{kind}</Sec>{list.filter(x => x.category === kind).map(x => (
          <Tap key={x.id} label={x.name} onPress={() => openClub(x.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingHorizontal: 16, paddingVertical: 8 }}>
            <Pic size={48} shape="course" img={x.img} name={x.name} />
            <View style={{ flex: 1, minWidth: 0 }}><T s={15} lh={20} w="600" n={1}>{x.name}</T><T s={12} lh={16} col={c.ink3} n={1}>{`${clubCount(x.id)} members · ${x.join === 'request' ? 'Approval needed' : 'Open to all'}`}</T></View>
            <ClubJoin small clubId={x.id} />
          </Tap>
        ))}</View>)}
      </Body>
    </Screen>
  );
};
/** Top of the Clubs tab: your clubs as a row, then a way into every club. */
const ClubRail = () => {
  const mine = myClubs();
  const tile = (key: string, label: string, pic: any, onPress: () => void) => (
    <Tap key={key} label={label} onPress={onPress} style={{ width: 76, alignItems: 'center', gap: 6 }}>{pic}<T s={12} lh={16} center n={1}>{label}</T></Tap>
  );
  return (
    <View style={{ paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <Row style={{ paddingLeft: 16, paddingRight: 8, marginBottom: 6 }}>
        <T s={13} lh={18} w="600" col={c.ink2} style={{ flex: 1 }}>{mine.length ? 'Your clubs' : 'You’re not in a club yet'}</T>
        <BtnT icon="explore" onPress={() => go('BuzzClubs')} style={{ paddingHorizontal: 8 }}>Explore clubs</BtnT>
      </Row>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, gap: 4 }}>
        {tile('all', 'All clubs', <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: c.yellowSoft, alignItems: 'center', justifyContent: 'center' }}><Ms n="explore" s={28} fill col={c.yellowText} /></View>, () => go('BuzzClubs'))}
        {mine.map(k => tile(k.id, k.name.replace(/ Club$/, ''), <Pic size={60} shape="course" img={k.img} name={k.name} />, () => openClub(k.id)))}
      </ScrollView>
    </View>
  );
};
/** "Clubs to join" in the All feed. ponytail: shows until dismissed; gate it to the first weeks of term once terms carry a start date in the app. */
const ClubSuggest = () => {
  const me = profile(meId());
  if (isFaculty() || me?.hide_club_suggest) return null;
  const myDivs = where('division_members', m => m.student_id === meId()).map(m => m.division_id);
  const classmates = (clubId: string) => where('club_members', m => m.club_id === clubId && where('division_members', d => d.student_id === m.user_id && myDivs.includes(d.division_id)).length > 0).length;
  const picks = db().clubs.filter(k => !inClub(k.id)).map(k => ({ k, n: classmates(k.id) })).sort((a, b) => b.n - a.n).slice(0, 5);
  if (!picks.length) return null;
  return (
    <View style={{ marginTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <Row style={{ paddingLeft: 16, paddingRight: 4 }}>
        <T s={15} lh={20} w="600" style={{ flex: 1 }}>Clubs to join</T>
        <BtnT onPress={() => go('BuzzClubs')} style={{ paddingHorizontal: 8 }}>See all</BtnT>
        <IB n="close" s={20} col={c.ink3} label="Hide club suggestions" onPress={() => { mut(() => { me.hide_club_suggest = true; }); toast('Hidden. Explore clubs any time from the Clubs tab or your profile.'); }} />
      </Row>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingTop: 6, paddingBottom: 4 }}>
        {picks.map(({ k, n }) => (
          <Tap key={k.id} label={k.name} onPress={() => openClub(k.id)} style={{ width: 150, padding: 12, borderRadius: 18, backgroundColor: c.sunken, alignItems: 'center', gap: 8 }}>
            <Pic size={56} shape="course" img={k.img} name={k.name} />
            <View style={{ alignItems: 'center' }}><T s={14} lh={19} w="600" n={1} center>{k.name}</T><T s={12} lh={16} col={c.ink3} n={1} center>{n ? `${n} from your class` : clubLine(k)}</T></View>
            <ClubJoin small clubId={k.id} />
          </Tap>
        ))}
      </ScrollView>
    </View>
  );
};

/* ---------- Post screen / To do ---------- */
const PostScreen = ({ postId }: { postId: string }) => {
  useData();
  const p = byId('buzz_posts', postId);
  const [reply, setReply] = useState<any>(null);
  const bottom = useBottom(), sv = useRef<any>(null), cy = useRef(0);
  useEffect(() => {
    if (!p) return;
    const id = setTimeout(() => markSeen(postId), 1000);
    if (isOwn(p)) mut(() => { p.read_comments = { ...(p.read_comments || {}), [meId()]: Date.now() }; });
    return () => clearTimeout(id);
  }, [postId]);
  if (!p || p.deleted_at) return <Screen><Hdr title="Buzz" /><Empty icon="campaign" title="This post was deleted" /></Screen>;
  const a = acct(p), own = isOwn(p), all = commentsOf(p.id);
  const roots = all.filter(x => !x.parent_id).reverse();
  const when = `${fmtAge(p.posted_at || p.scheduled_for)} · ${isFaculty() ? p.audience_label : p.audience_short || p.audience_label}`;
  return (
    <Screen>
      <Hdr right={<>
        <IB n={shareIcon} label="Share" onPress={() => openBuzzShare(p.id)} />
        {own ? <IB n="more_horiz" label="Post options: edit, change due date, delete" onPress={() => openPostMenu(p.id, back)} /> : null}
      </>} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView ref={sv} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <Tap label={a?.name} onPress={() => openAccount(a)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pic size={42} img={a?.img} name={a?.name} />
            <View style={{ flex: 1 }}><Row gap={4}><T s={15} lh={20} w="600" n={1} style={{ flexShrink: 1 }}>{a?.name}</T>{a?.official ? <Ms n="verified" s={16} fill col={c.green} /> : null}</Row><T s={12} lh={16} col={c.ink3}>{when}</T></View>
          </Tap>
          <View style={{ marginTop: 12 }}><PostText p={p} s={17} lh={26} /></View>
          <BuzzPoll p={p} />
          <Atts p={p} />
          <EventStrip p={p} />
          <TaskStrip p={p} />
          <View onLayout={e => { cy.current = e.nativeEvent.layout.y; }}><Row gap={6} style={{ marginTop: 12, minHeight: 44, borderBottomWidth: 1, borderBottomColor: c.line }}><Ms n="chat_bubble" s={18} col={c.ink2} /><T s={13} lh={18} w="600" col={c.ink2} style={{ flex: 1 }}>{all.length ? plural(all.length, 'comment') : 'No comments yet'}</T>{mine(p) ? seenAction(p) : null}</Row></View>
          {roots.map(r => (
            <View key={r.id}>
              <CommentRow full x={r} p={p} onReply={setReply} />
              {all.filter(x => x.parent_id === r.id).map(x => <View key={x.id} style={{ marginLeft: 38 }}><CommentRow full x={x} p={p} onReply={setReply} /></View>)}
            </View>
          ))}
        </ScrollView>
        <View style={{ paddingHorizontal: 16, paddingBottom: Math.max(bottom - 6, 0), borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>
          {reply ? <Row gap={8} style={{ marginTop: 8 }}><T s={12} lh={16} col={c.ink2} style={{ flex: 1 }} n={1}>Replying to <T s={12} lh={16} w="600" col={c.ink2}>{commentName(reply, p)}</T>: {reply.body}</T><Tap label="Cancel reply" onPress={() => setReply(null)}><Ms n="close" s={16} col={c.ink3} /></Tap></Row> : null}
          <CommentBox p={p} reply={reply} clearReply={() => setReply(null)} onSent={() => setTimeout(() => sv.current?.scrollTo({ y: Math.max(0, cy.current - 60), animated: true }), 250)} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
};

/** One card's words, from a Buzz task or a message saved from chat. */
function todoCard(t: any) {
  const fac = isFaculty();
  if (t.source === 'message') {
    const m = byId('messages', t.message_id), ch = byId('chats', m.chat_id), who = profile(m.sender_id), res = m.resource_id && byId('resources', m.resource_id);
    const replies = threadReplies(m.id).length, crs = ch?.offering_id && byId('courses', byId('offerings', ch.offering_id)?.course_id), dv = ch?.division_id && division(ch.division_id);
    const openIt = () => m.thread_root_id ? go('Chat-S03-Thread', { chatId: m.chat_id, rootId: m.thread_root_id }) : replies ? go('Chat-S03-Thread', { chatId: m.chat_id, rootId: m.id }) : openChat(m.chat_id, 'Chat', { messageId: m.id });
    return {
      pic: <Pic size={36} img={who?.img} name={who?.full_name} />, from: who?.full_name, when: `${ch ? chatTitle(ch) : ''}${dv ? ` · ${dv.name}` : ''}`,
      title: t.title || m.body || res?.title, body: t.note,
      att: res ? { icon: 'slideshow', a1: res.title, a2: `${crs?.short} resources · ${byId('folders', res.folder_id)?.name}`, go: () => go('Chat-R01-File', { messageId: m.id, resourceId: res.id }) }
        : replies ? { icon: 'forum', a1: `${plural(replies, 'reply').replace('replys', 'replies')} in the thread`, a2: `${crs?.short || ''}${dv ? ` · ${dv.name}` : ''}`, go: openIt } : null,
      due: fac ? 'Saved from chat' : 'You saved this from chat', left: `${fmtDay(t.saved_at)}, ${fmtClock(t.saved_at)}`, leftCol: c.ink2, open: 'Open in chat', onOpen: openIt,
    };
  }
  const p = byId('buzz_posts', t.post_id), a = acct(p), first = attsOf(p.id).find(x => x.kind !== 'photo'), s = taskStrip(p)!;
  return {
    pic: <Pic size={36} img={a?.img} name={a?.name} />, from: a?.name, when: `${fmtAge(p.posted_at)} · ${p.audience_short || p.audience_label}`, title: p.title, body: p.body,
    att: first ? { icon: attIcon(first), a1: first.title, a2: first.meta, go: () => openAtt(p, first) } : null,
    due: s.t1, left: s.t2, leftCol: s.col || c.ink2, open: 'Open full post', onOpen: () => openPost(p.id),
  };
}
const toBuzz = () => { if (navRef.isReady()) navRef.dispatch(StackActions.popToTop()); goTab('Buzz'); };
/** To do, as stories. Tap the sides to browse (nothing changes). Swipe right marks done, swipe left skips. */
const TodoStack = () => {
  useData();
  const bottom = useBottom();
  const { width } = useWindowDimensions();
  const [deck] = useState(() => myTodos().map(t => t.id));
  const [i, setI] = useState(0), [doneNow, setDoneNow] = useState(0);
  const x = useRef(new Animated.Value(0)).current, fade = useRef(new Animated.Value(1)).current, busy = useRef(false);
  const n = deck.length, row = i < n ? byId('todo_items', deck[i]) : null, card = row ? todoCard(row) : null;
  const open = deck.filter(id => byId('todo_items', id)?.state !== 'done');
  /** Card leaves one way (fling = farther, tilted), next one slides in from the other side. */
  const goTo = (k: number, fling = 0) => {
    if (busy.current || k < 0 || k > n || k === i) { if (k < 0) Animated.sequence([Animated.timing(x, { toValue: 18, duration: 90, useNativeDriver: true }), Animated.spring(x, { toValue: 0, useNativeDriver: true })]).start(); else Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(); return; }
    busy.current = true;
    const dir = fling || (k > i ? -1 : 1);
    Animated.parallel([
      Animated.timing(x, { toValue: dir * width * (fling ? 1.2 : 0.6), duration: fling ? 230 : 170, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setI(k); x.setValue(-(k > i ? -1 : 1) * width * 0.35);
      Animated.parallel([
        Animated.timing(x, { toValue: 0, duration: 260, easing: Easing.out(Easing.exp), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start(() => { busy.current = false; });
    });
  };
  const done = (fling = 0) => {
    if (!row || row.state === 'done') return goTo(i + 1, fling);
    if (isOffline()) { Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(); return toast('Couldn’t mark as done · Check your connection'); }
    const r = row, k = i, prev = { state: r.state, done_at: r.done_at };
    mut(() => { r.state = 'done'; r.done_at = Date.now(); });
    setDoneNow(v => v + 1);
    goTo(i + 1, fling);
    toast('Marked as done', () => { mut(() => Object.assign(r, prev)); setDoneNow(v => v - 1); goTo(k); });
  };
  const undoHere = () => { mut(() => { row.state = 'open'; row.done_at = null; }); setDoneNow(v => Math.max(0, v - 1)); };
  const iRef = useRef(i); iRef.current = i;
  const fn = useRef<any>({}); fn.current = { goTo, done };
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => x.setValue(g.dx),
    onPanResponderRelease: (_, g) => {
      if (g.dx > 90 || g.vx > 0.7) fn.current.done(1); // right: done
      else if (g.dx < -90 || g.vx < -0.7) fn.current.goTo(iRef.current + 1, -1); // left: skip
      else Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(),
  })).current;
  const isDone = row?.state === 'done';
  const stamp = (label: string, col: string, bg: string, side: 'left' | 'right', from: number[], to: number[]) => (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 22, [side]: 22, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 2, borderColor: col, backgroundColor: bg, opacity: x.interpolate({ inputRange: from, outputRange: to, extrapolate: 'clamp' }), transform: [{ rotate: side === 'left' ? '-10deg' : '10deg' }] } as any}>
      <T s={15} lh={20} w="700" col={col}>{label}</T>
    </Animated.View>
  );
  return (
    <Screen>
      <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingTop: 8 }}>
        {deck.map((id, k) => <View key={id} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: byId('todo_items', id)?.state === 'done' ? c.green : k === i ? c.ink : c.track }} />)}
      </View>
      <Row style={{ minHeight: 48, paddingHorizontal: 8 }}>
        <IB n="close" label="Close" onPress={back} />
        <T s={16} lh={22} w="600" center style={{ flex: 1 }}>To do</T>
        <T s={13} lh={18} col={c.ink3} center style={{ width: 44 }}>{card ? `${i + 1}/${n}` : ''}</T>
      </Row>
      {card ? (
        <>
          <Animated.View {...pan.panHandlers} style={{ flex: 1, opacity: fade, transform: [{ translateX: x }, { rotate: x.interpolate({ inputRange: [-width, 0, width], outputRange: ['-12deg', '0deg', '12deg'] }) }] }}>
            <Pressable accessibilityLabel="Tap the right side for the next task, the left side to go back" onPress={e => goTo(e.nativeEvent.locationX < width / 3 ? i - 1 : i + 1)} style={{ flex: 1 }}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 }}>
                <View style={{ borderRadius: 24, paddingTop: 20, paddingHorizontal: 18, paddingBottom: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: isDone ? c.present : c.line }}>
                  <Row gap={10}>{card.pic}<View style={{ flex: 1, minWidth: 0 }}><T s={14} lh={18} w="600" n={1}>{card.from}</T><T s={12} lh={16} col={c.ink3} n={1}>{card.when}</T></View></Row>
                  <T s={19} lh={27} w="600" style={{ marginTop: 16 }}>{card.title}</T>
                  {card.body ? <T s={15} lh={23} col={c.ink2} style={{ marginTop: 6 }}>{card.body}</T> : null}
                  {card.att ? <Tap label={card.att.a1} onPress={card.att.go} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, marginTop: 10 }}>
                    <Fi n={card.att.icon} /><View style={{ flex: 1, minWidth: 0 }}><T s={14} lh={19} n={1}>{card.att.a1}</T><T s={12} lh={16} col={c.ink3} n={1}>{card.att.a2}</T></View>
                  </Tap> : null}
                  <Strip icon={isDone ? 'task_alt' : 'event_available'} iconCol={isDone ? c.greenText : card.leftCol}><StripText t1={card.due} t2={isDone ? 'You marked this done' : card.left} col={isDone ? c.greenText : card.leftCol} bold /></Strip>
                  <Tap label={card.open} onPress={card.onOpen} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12, minHeight: 40 }}><T s={13} lh={18} w="600" col={c.greenText}>{card.open}</T><Ms n="chevron_right" s={18} col={c.greenText} /></Tap>
                  {stamp('DONE', c.greenText, c.mint, 'left', [20, 110], [0, 1])}
                  {stamp('SKIP', c.ink2, c.sunken, 'right', [-110, -20], [1, 0])}
                </View>
                <T s={12} lh={16} col={c.ink3} center style={{ marginTop: 14 }}>Swipe right when it’s done · left to skip</T>
              </ScrollView>
            </Pressable>
          </Animated.View>
          <View style={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: Math.max(bottom, 16) }}>
            {isDone ? <BtnS icon="undo" style={{ height: 52 }} onPress={undoHere}>Marked as done · Undo</BtnS>
              : <BtnP style={{ height: 52 }} icon="check" onPress={() => done(1)}>Mark as done</BtnP>}
          </View>
        </>
      ) : open.length ? (
        <StackEnd left={open.length} onFirst={() => goTo(deck.indexOf(open[0]))} bottom={bottom} />
      ) : (
        <CaughtUp done={doneNow} party={doneNow > 0} bottom={bottom} />
      )}
    </Screen>
  );
};
/** Reached the end with tasks still open: no party, just where things stand and a way back. */
const StackEnd = ({ left, onFirst, bottom }: any) => (
  <View style={{ flex: 1 }}>
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: c.yellowSoft, alignItems: 'center', justifyContent: 'center' }}><Ms n="checklist" s={40} col={c.ink} /></View>
      <Rise delay={80}><T s={24} lh={32} w="700" center style={{ marginTop: 20 }}>That’s everything for now</T></Rise>
      <Rise delay={160}><T s={15} lh={22} col={c.ink2} center style={{ marginTop: 6 }}>{`${plural(left, 'task')} still to do. ${left === 1 ? 'It stays' : 'They stay'} on Buzz until you mark ${left === 1 ? 'it' : 'them'} done.`}</T></Rise>
    </View>
    <View style={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: Math.max(bottom, 16), gap: 4 }}>
      <BtnP style={{ height: 52 }} onPress={onFirst}>Go to the first one</BtnP>
      <BtnT col={c.ink2} style={{ alignSelf: 'center' }} onPress={toBuzz}>Close</BtnT>
    </View>
  </View>
);
const CHEERS = ['Nothing else is waiting on you. Go enjoy your day.', 'Your plate is clear. Nice work.', 'Every task, handled. Take a breather.'];
/** The reward for clearing To do: confetti, a popping tick, a buzz, and what you got through. */
const CaughtUp = ({ done, party, bottom }: any) => {
  const [cheer] = useState(() => CHEERS[Math.floor(Math.random() * CHEERS.length)]);
  useEffect(() => { if (party) celebrate(); }, []);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
        <DoneBurst />
        <Rise delay={220}><T s={28} lh={36} w="700" center>All caught up!</T></Rise>
        <Rise delay={320}><T s={15} lh={22} col={c.ink2} center style={{ marginTop: 6 }}>{party ? cheer : 'Nothing is waiting on you right now.'}</T></Rise>
        {done ? <Rise delay={440}><Row gap={8} style={{ marginTop: 22, paddingHorizontal: 16, height: 40, borderRadius: 999, backgroundColor: c.mint }}><Ms n="task_alt" s={20} col={c.greenText} /><T s={14} lh={19} w="600" col={c.greenText}>{`${plural(done, 'task')} done just now`}</T></Row></Rise> : null}
      </View>
      {party ? <Confetti /> : null}
      <View style={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: Math.max(bottom, 16) }}><BtnP style={{ height: 52 }} onPress={toBuzz}>Back to Buzz</BtnP></View>
    </View>
  );
};
const PostOrTodo = ({ route }: any) => (route.params?.postId ? <PostScreen key={route.params.postId} postId={route.params.postId} /> : <TodoStack />);

/* ---------- Gallery ---------- */
const StudentGallery = ({ route }: any) => {
  useData();
  const { width } = useWindowDimensions();
  const p = byId('buzz_posts', route.params?.postId), photos = p ? attsOf(p.id).filter(a => a.kind === 'photo') : [], a = acct(p);
  const [i, setI] = useState(route.params?.index || 0);
  const ref = useRef<any>(null), start = useRef(i).current, bottom = useBottom();
  const to = (k: number) => { const n = Math.max(0, Math.min(photos.length - 1, k)); setI(n); ref.current?.scrollTo({ x: n * width, animated: true }); };
  const W = '#ffffff';
  return (
    <Screen style={{ backgroundColor: c.inverse }}>
      <StatusBar style="light" />
      <Row style={{ minHeight: 48, paddingHorizontal: 8 }}>
        <IB n="close" col={W} label="Close photos" onPress={back} />
        <T s={15} lh={20} w="600" col={W} center style={{ flex: 1 }}>{i + 1} of {photos.length}</T>
        <IB n={shareIcon} col={W} label="Share photo" onPress={() => p && openBuzzShare(p.id)} />
      </Row>
      <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentOffset={{ x: start * width, y: 0 }} onMomentumScrollEnd={e => setI(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {photos.map((ph, k) => (
          <View key={ph.id} style={{ width }}>
            <Image source={photoSrc(ph)} accessibilityLabel={`Photo ${k + 1} of ${photos.length}`} resizeMode="contain" style={{ flex: 1, width }} />
            <Tap label="Previous photo" onPress={() => to(k - 1)} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '35%' }} />
            <Tap label="Next photo" onPress={() => to(k + 1)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '35%' }} />
          </View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 14 }}>{photos.map((ph, k) => <View key={ph.id} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: k === i ? W : 'rgba(255,255,255,.35)' }} />)}</View>
      <View style={{ paddingHorizontal: 20, paddingBottom: Math.max(bottom, 24) }}>
        <T s={12} lh={16} col="rgba(255,255,255,.7)">{a?.name} · {p ? fmtDay(p.posted_at).toLowerCase() : ''}</T>
        <T v s={15} lh={20} col={W} style={{ marginTop: 2 }}>{p?.title}</T>
      </View>
    </Screen>
  );
};

/* ---------- Search ---------- */
const Hl = ({ text, q, s = 15, lh = 20, col }: any) => {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <T s={s} lh={lh} col={col} n={2}>{text}</T>;
  return <T s={s} lh={lh} col={col} n={2}>{text.slice(0, i)}<T s={s} lh={lh} w="600" col={c.greenText}>{text.slice(i, i + q.length)}</T>{text.slice(i + q.length)}</T>;
};
const StudentSearch = ({ route }: any) => {
  useData();
  const accountId = route.params?.accountId, scoped = accountId && byId('buzz_accounts', accountId);
  const year = db().academic_years.find(y => y.is_current)?.label;
  const [q, setQ] = useState(''), [chip, setChip] = useState('All');
  const k = q.trim().toLowerCase(), posts = k ? readable(accountId) : [];
  const has = (x?: string) => (x || '').toLowerCase().includes(k);
  const accounts = k && !accountId ? db().buzz_accounts.filter(a => has(a.name)) : [];
  const hits = posts.filter(p => has(p.title) || has(p.body) || has(acct(p)?.name));
  const files = posts.flatMap(p => attsOf(p.id).filter(a => a.kind === 'file' && has(a.title)).map(a => ({ p, a })));
  const show = (x: string) => chip === 'All' || chip === x;
  const clubs = accounts.filter(a => a.club_id), offices = accounts.filter(a => !a.club_id && !a.user_id), people = accounts.filter(a => a.user_id);
  const nothing = k && !(show('Clubs') && clubs.length) && !(show('Offices') && offices.length) && !(chip === 'All' && people.length) && !(show('Posts') && hits.length) && !(show('Files') && files.length);
  const accRow = (a: any, sub: string) => <Li key={a.id} min={58} left={<Pic size={36} shape={a.club_id ? 'course' : 'round'} img={a.img} name={a.name} />} title={<Hl text={a.name} q={q.trim()} />} sub={sub} onPress={() => openAccount(a)} />;
  const state = (p: any) => { const s = taskStrip(p); return s && !s.own && s.btn ? (s.btn === 'done' ? 'Done' : s.t2.startsWith('In ') ? `Due ${s.t2.toLowerCase()}` : s.t2) : null; };
  return (
    <Screen>
      <Row gap={8} style={{ paddingRight: 16 }}>
        <SearchBar autoFocus style={{ flex: 1, marginTop: 6, marginRight: 0 }} placeholder={scoped ? `Search ${scoped.name} posts` : `Search ${year}`} value={q} onChange={setQ} />
        {q ? <IB n="cancel" s={20} col={c.ink3} label="Clear search" onPress={() => setQ('')} style={{ position: 'absolute', right: 76, top: 2 }} /> : null}
        <Tap label="Cancel" onPress={back} style={{ minHeight: 44, justifyContent: 'center', marginTop: 6 }}><T s={15} lh={20} col={c.greenText}>Cancel</T></Tap>
      </Row>
      <Chips items={['All', 'Posts', 'Clubs', 'Offices', 'Files']} on={chip} onPick={setChip} />
      <Body>
        {k ? <T s={12} lh={16} col={c.ink3} style={{ paddingHorizontal: 16, paddingTop: 12 }}>Results from {year}</T> : null}
        {nothing ? <Empty icon="search" title={`No results for “${q.trim()}”`} line={`Searching ${year}`} /> : null}
        {show('Clubs') && clubs.length ? <><Sec>Clubs</Sec><Grp>{clubs.map(a => { const kl = byId('clubs', a.club_id); return accRow(a, `${kl?.category} · ${clubCount(a.club_id)} members${inClub(a.club_id) ? ' · Joined' : ''}`); })}</Grp></> : null}
        {show('Offices') && offices.length ? <><Sec>Departments and offices</Sec><Grp>{offices.map(a => accRow(a, a.sub))}</Grp></> : null}
        {chip === 'All' && people.length ? <><Sec>Faculty</Sec><Grp>{people.map(a => accRow(a, 'Faculty'))}</Grp></> : null}
        {show('Posts') && hits.length ? <><Sec>Posts</Sec><Grp>{hits.map(p => <Li key={p.id} min={58} title={<Hl text={p.title} q={q.trim()} />} sub={`${acct(p)?.name} · ${fmtAge(p.posted_at)}${state(p) ? `  ${state(p)}` : ''}`} onPress={() => openPost(p.id)} />)}</Grp></> : null}
        {show('Files') && files.length ? <><Sec>Files</Sec><Grp>{files.map(({ p, a }) => <Li key={a.id} min={58} left={<Fi n={attIcon(a)} />} title={<Hl text={a.title} q={q.trim()} />} sub={`${acct(p)?.name} · ${fmtAge(p.posted_at)} · ${a.meta}`} onPress={() => go('FacultyFile', { postId: p.id, attId: a.id })} />)}</Grp></> : null}
      </Body>
    </Screen>
  );
};

/* ---------- Notifications ---------- */
const ago = (t: number) => { const m = Math.floor((Date.now() - t) / 60000); return m < 60 ? `${Math.max(m, 1)}m` : dayDiff(t) === 0 ? `${Math.floor(m / 60)}h` : dayDiff(t) === -1 ? 'Yesterday' : fmtDate(t); };
/** Kind → badge icon, badge colour, filter tab. */
const NK: Record<string, [string, string, 'Buzz' | 'Chats' | 'Files']> = {
  due_soon: ['schedule', c.honey, 'Buzz'], due_changed: ['event_repeat', c.blue, 'Buzz'], buzz_remind: ['notifications_active', c.honey, 'Buzz'],
  new_post: ['campaign', c.green, 'Buzz'], buzz_comment: ['chat_bubble', c.blue, 'Buzz'], buzz_reply: ['reply', c.blue, 'Buzz'],
  not_seen: ['visibility_off', c.honey, 'Buzz'], scheduled_sent: ['send', c.green, 'Buzz'],
  thread_reply: ['forum', c.blue, 'Chats'], group_added: ['group_add', c.green, 'Chats'], message_deleted: ['delete', c.inkOff, 'Chats'], scheduled_failed: ['error', c.negative, 'Chats'],
  club_request: ['group_add', c.honey, 'Chats'], club_approved: ['groups', c.green, 'Chats'],
  files_shared: ['folder', c.green, 'Files'], resource_reminder: ['description', c.honey, 'Files'], note_removed: ['remove_circle', c.inkOff, 'Files'],
};
type Part = string | { b: string };
/** Important = something you have to act on or a deadline moved. ponytail: inferred from kind; a faculty "Mark as important" flag on posts would feed in here. */
const IMPORTANT = new Set(['due_soon', 'due_changed', 'buzz_remind', 'not_seen', 'scheduled_failed', 'resource_reminder']);
/** Like Gmail, importance comes from rules, not the sender: action kinds above, plus posts and messages about exams, fees, results or timetable changes. */
const KEY_TOPIC = /(exams?|IT ?[12]|test|marks|results?|grades?|fees?|payment|hall ticket|timetable|schedule[ds]?|rescheduled|postponed|cancel+ed|deadline)/i;
const isImportant = (n: any) => {
  if (IMPORTANT.has(n.kind)) return true;
  const p = n.post_id && byId('buzz_posts', n.post_id), m = n.message_id && byId('messages', n.message_id);
  return KEY_TOPIC.test(`${p?.title || ''} ${p?.body || ''} ${m?.body || ''}`);
};
/** Where a notification came from, said in words on every row. */
const SRC: Record<string, [string, string]> = { Buzz: ['campaign', 'Buzz'], Chats: ['forum', 'Chat'], Files: ['folder', 'Resources'] };
/** Words, picture and destination for a row. Returns null when what it points at is gone. */
function noteRow(n: any): null | { pic: any; parts: Part[]; quote?: string; go: () => void } {
  const p = n.post_id && byId('buzz_posts', n.post_id);
  if (n.post_id && (!p || p.deleted_at)) return null;
  const a = p && acct(p), actor = n.actor_id && profile(n.actor_id), cm = n.comment_id && byId('buzz_comments', n.comment_id), t = p?.title;
  const m = n.message_id && byId('messages', n.message_id), ch = byId('chats', n.chat_id || m?.chat_id);
  const toPost = () => openPost(p.id), toChat = () => (ch ? openChat(ch.id, 'Chat', m && !m.deleted_by ? { messageId: m.id } : {}) : null);
  const pic = (u: any) => <Pic size={44} img={u?.img} name={u?.name || u?.full_name} />, place = <Pic size={44} shape="course" img={ch?.img} name={ch ? chatTitle(ch) : ''} />;
  const B = (s?: string) => ({ b: s || '' });
  switch (n.kind) {
    case 'due_soon': return { pic: pic(a), parts: [B(t), ` is due ${dueWord(p.due_at)}.`], go: toPost };
    case 'due_changed': return { pic: pic(a), parts: [B(a?.name), ' moved the due date of ', B(t), ` to ${fmtDate(p.due_at)}.`], go: toPost };
    case 'buzz_remind': return { pic: pic(a), parts: [B(a?.name), ' reminded you: ', B(t), n.target === 'not_done' ? ` is due ${dueWord(p.due_at)}.` : '.'], go: toPost };
    case 'new_post': return { pic: pic(a), parts: [B(a?.name), ' posted ', B(t)], go: toPost };
    case 'buzz_comment': return { pic: pic(actor), parts: [B(actor?.full_name), ' commented on ', B(t)], quote: cm?.body, go: toPost };
    case 'buzz_reply': { const by = cm?.as_account ? a : actor; return { pic: pic(by), parts: [B(by?.name || by?.full_name), ' replied to your comment on ', B(t)], quote: cm?.body.replace(`@${profile(cm.mention_user_id)?.full_name} `, ''), go: toPost }; }
    case 'not_seen': { const k = Math.max(p.recipient_count - seenRows(p.id).length - unreachable(p).length, 0); return { pic: pic(a), parts: [B(plural(k, 'student')), ' haven’t seen ', B(t), ` yet. It’s due ${dueWord(p.due_at)}.`], go: () => go('FacultyWhoSaw', { postId: p.id }) }; }
    case 'scheduled_sent': return p ? { pic: pic(a), parts: ['Your scheduled post ', B(t), ` went out to ${num(p.recipient_count)} people.`], go: toPost }
      : m && ch ? { pic: place, parts: ['Your scheduled message went out in ', B(chatTitle(ch)), '.'], quote: m.body, go: toChat } : null;
    case 'scheduled_failed': return ch ? { pic: place, parts: ['Your scheduled message to ', B(chatTitle(ch)), ' couldn’t be sent. The chat is read-only now.'], go: toChat } : null;
    case 'thread_reply': return m ? { pic: pic(actor), parts: [B(actor?.full_name), ' replied in a thread in ', B(ch ? chatTitle(ch) : 'a chat')], quote: m.body, go: () => go('Chat-S03-Thread', { chatId: m.chat_id, rootId: m.thread_root_id }) } : null;
    case 'group_added': return ch ? { pic: place, parts: [B(actor?.full_name), ' added you to ', B(chatTitle(ch))], go: toChat } : null;
    case 'club_request': { const k = ch && byId('clubs', ch.club_id), waiting = where('club_requests', r => r.club_id === k?.id && r.status === 'pending').length;
      return k ? { pic: place, parts: waiting > 1 ? [B(`${waiting} people`), ' asked to join ', B(k.name)] : [B(actor?.full_name || 'Someone'), ' asked to join ', B(k.name)], go: () => go('Chat-S16-ClubPeople', { chatId: ch.id }) } : null; }
    case 'club_approved': return ch ? { pic: place, parts: ['You’re in ', B(chatTitle(ch)), '. Say hi to the club.'], go: toChat } : null;
    case 'message_deleted': return ch ? { pic: pic(actor), parts: [B(actor?.full_name), ' deleted your message in ', B(chatTitle(ch)), '.'], go: toChat } : null;
    case 'files_shared': case 'resource_reminder': case 'note_removed': {
      const f = byId('folders', n.folder_id), r = byId('resources', n.resource_id);
      const goRes = () => (r ? go('Res-S03-Viewer', { resourceId: r.id, chatId: n.chat_id }) : f ? go('Res-S02-Folder', { folderId: f.id, chatId: n.chat_id }) : toChat());
      if (n.kind === 'files_shared') return { pic: pic(actor), parts: [B(actor?.full_name), ` shared ${n.count ? plural(n.count, 'file') : 'files'} in `, B(f?.name || 'Resources')], go: goRes };
      if (n.kind === 'resource_reminder') return { pic: pic(actor), parts: [B(actor?.full_name), ' asked you to open ', B(r?.title || 'a file')], go: goRes };
      return { pic: pic(actor), parts: [B(actor?.full_name), ' removed your note ', B(n.title || 'from Resources'), f ? ` in ${f.name}.` : '.'], go: goRes };
    }
  }
  return n.text ? { pic: pic(actor), parts: [n.text], go: () => (ch ? toChat() : p ? toPost() : npf('Notifications')) } : null;
}
/** One list, newest first, grouped New / Today / This week / Earlier. Kind badge on the picture says what happened at a glance. */
const StudentNotifications = () => {
  useData();
  const [fresh] = useState(() => new Set(where('notifications', n => n.user_id === meId() && !n.read_at).map(n => n.id)));
  const [tab, setTab] = useState('All');
  useEffect(() => { if (fresh.size) mut(() => where('notifications', n => fresh.has(n.id)).forEach(n => { n.read_at = Date.now(); })); }, []);
  const rows = where('notifications', n => n.user_id === meId() && n.kind !== 'chat_message').sort((a, b) => b.created_at - a.created_at)
    .map(n => ({ n, r: noteRow(n) })).filter(x => x.r && (tab === 'All' || (tab === 'Important' ? isImportant(x.n) : NK[x.n.kind]?.[2] === tab)));
  const line = ({ n, r }: any) => {
    const [icon, tone] = NK[n.kind] || ['notifications', c.ink3], isNew = fresh.has(n.id);
    return (
      <Tap key={n.id} label={r.parts.map((x: Part) => (typeof x === 'string' ? x : x.b)).join('')} onPress={r.go} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: isNew ? c.yellowSoft : undefined }}>
        <View>
          {r.pic}
          <View style={{ position: 'absolute', right: -4, bottom: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: tone, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: isNew ? c.yellowSoft : c.page }}><Ms n={icon} s={12} fill col={tone === c.green || tone === c.negative ? c.onFill : c.ink} /></View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T s={14} lh={20}>{r.parts.map((x: Part, i: number) => (typeof x === 'string' ? x : <T key={i} s={14} lh={20} w="600">{x.b}</T>))}</T>
          {r.quote ? <T s={13} lh={18} col={c.ink2} n={2} style={{ marginTop: 4, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: c.line }}>{r.quote}</T> : null}
          <Row gap={4} style={{ marginTop: 4 }}>
            <Ms n={(SRC[NK[n.kind]?.[2]] || SRC.Buzz)[0]} s={14} col={c.ink3} />
            <T s={12} lh={16} col={c.ink3} n={1} style={{ flex: 1 }}>{[(SRC[NK[n.kind]?.[2]] || SRC.Buzz)[1], byId('chats', n.chat_id) ? chatTitle(byId('chats', n.chat_id)) : '', ago(n.created_at)].filter(Boolean).join(' · ')}</T>
          </Row>
        </View>
        {isNew ? <View accessibilityLabel="New" style={{ width: 8, height: 8, borderRadius: 4, marginTop: 8, backgroundColor: c.green }} /> : null}
      </Tap>
    );
  };
  const groups: [string, any[]][] = [
    ['New', rows.filter(x => fresh.has(x.n.id))],
    ['Today', rows.filter(x => !fresh.has(x.n.id) && dayDiff(x.n.created_at) === 0)],
    ['This week', rows.filter(x => !fresh.has(x.n.id) && dayDiff(x.n.created_at) < 0 && dayDiff(x.n.created_at) >= -6)],
    ['Earlier', rows.filter(x => !fresh.has(x.n.id) && dayDiff(x.n.created_at) < -6)],
  ];
  return (
    <Screen>
      <Hdr title="Notifications" />
      <Tabs items={['All', 'Important', 'Buzz', 'Chats', 'Files']} on={tab} onPick={setTab} />
      <Body>
        {!rows.length ? <Empty icon="notifications" title={tab === 'All' ? 'No notifications yet' : tab === 'Important' ? 'You’re all set. Exams, fees and deadlines show up here.' : `Nothing from ${tab} yet`} /> : null}
        {groups.filter(g => g[1].length).map(([label, list]) => <View key={label}><Sec>{label}</Sec>{list.map(line)}</View>)}
      </Body>
    </Screen>
  );
};
/** Seed one notification of every kind for both demo people. Runs after every module's seed, so chats, messages and files exist. */
export function seedNotes(d: any) {
  const min = (m: number) => Date.now() - m * 60000, H = 60, DY = 24 * 60;
  const n = (user_id: string, kind: string, mAgo: number, read: boolean, x: any = {}) => d.notifications.push({ id: `n-seed-${d.notifications.length}`, user_id, kind, actor_id: null, read_at: read ? min(mAgo) : null, created_at: min(mAgo), ...x });
  const thread = (by: string) => d.messages.find((m: any) => m.thread_root_id === 'msg-rohan-it2' && m.sender_id === by);
  const sched = d.messages.find((m: any) => m.chat_id === 'chat-daa-a' && m.sender_id === 'p-anita' && !m.scheduled_for && m.kind !== 'system');
  // Student (Rohan)
  n('p-rohan', 'due_soon', 10, false, { post_id: 'post-samarth' });
  n('p-rohan', 'thread_reply', 25, false, { message_id: thread('p-anita')?.id, chat_id: 'chat-daa-a', actor_id: 'p-anita' });
  n('p-rohan', 'files_shared', 50, false, { folder_id: 'fld-u3', chat_id: 'chat-daa-a', actor_id: 'p-anita', count: 2 });
  n('p-rohan', 'buzz_reply', 2 * H, false, { post_id: 'post-samarth', comment_id: 'cm-s2' });
  n('p-rohan', 'buzz_remind', 4 * H, true, { post_id: 'post-fees', target: 'not_done' });
  n('p-rohan', 'resource_reminder', 6 * H, true, { resource_id: 'res-greedy', chat_id: 'chat-daa-a', actor_id: 'p-anita' });
  if (d.club_requests[0]) n('p-rohan', 'club_request', 40, false, { chat_id: 'chat-code', actor_id: d.club_requests[0].user_id });
  n('p-rohan', 'group_added', DY + 3 * H, true, { chat_id: 'chat-code', actor_id: 'p-sara' });
  n('p-rohan', 'message_deleted', 2 * DY, true, { chat_id: 'chat-class-a', actor_id: 'p-anita' });
  n('p-rohan', 'note_removed', 3 * DY, true, { folder_id: 'fld-u2', chat_id: 'chat-daa-a', actor_id: 'p-anita', title: 'IT1 guesses' });
  n('p-rohan', 'new_post', 6 * DY, true, { post_id: 'post-it2tt' });
  n('p-rohan', 'due_changed', 7 * DY, true, { post_id: 'post-visit' });
  n('p-rohan', 'new_post', 8 * DY, true, { post_id: 'post-infosys' });
  // Faculty (Anita)
  n('p-anita', 'not_seen', 30, false, { post_id: 'post-visit' });
  n('p-anita', 'buzz_comment', 3 * H, false, { post_id: 'post-visit', comment_id: 'cm-v3', actor_id: 'p-riya' });
  n('p-anita', 'thread_reply', 4 * H, false, { message_id: thread('p-neha')?.id, chat_id: 'chat-daa-a', actor_id: 'p-neha' });
  n('p-anita', 'due_soon', 5 * H, true, { post_id: 'post-it2' });
  n('p-anita', 'new_post', 6 * H, true, { post_id: 'post-it2' });
  if (sched) n('p-anita', 'scheduled_sent', DY + 2 * H, true, { message_id: sched.id, chat_id: 'chat-daa-a' });
  n('p-anita', 'scheduled_failed', 2 * DY, true, { chat_id: 'chat-ds-past' });
  n('p-anita', 'group_added', 3 * DY, true, { chat_id: 'chat-team4', actor_id: 'p-rohan' });
  n('p-anita', 'scheduled_sent', 4 * DY, true, { post_id: 'post-feedback' });
  n('p-anita', 'buzz_remind', 6 * DY, true, { post_id: 'post-it1', target: 'not_done' });
}

/* ---------- Who saw ---------- */
const recipientsOf = (pid: string) => where('buzz_recipients', r => r.post_id === pid).map(r => profile(r.user_id)).filter(Boolean);
const unreachable = (p: any) => { const seen = new Set(seenRows(p.id).map(s => s.user_id)); return recipientsOf(p.id).filter(u => (!u.has_app || !u.push_enabled) && !seen.has(u.id)); };
/** Conic ring without an SVG lib: two rotated half discs. */
const Ring = ({ value, size = 64 }: { value: number; size?: number }) => {
  const deg = Math.min(value, 100) * 3.6, h = size / 2;
  const half = (st: any) => <View style={[{ position: 'absolute', top: 0, width: h, height: size, backgroundColor: c.green }, st]} />;
  return (
    <View accessibilityLabel={`${value}% seen`} style={{ width: size, height: size, borderRadius: h, overflow: 'hidden', backgroundColor: c.track, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', left: h, top: 0, width: h, height: size, overflow: 'hidden' }}><View style={{ position: 'absolute', left: -h, width: size, height: size, transform: [{ rotate: `${Math.min(deg, 180)}deg` }] }}>{half({ left: 0 })}</View></View>
      <View style={{ position: 'absolute', left: 0, top: 0, width: h, height: size, overflow: 'hidden' }}><View style={{ position: 'absolute', left: 0, width: size, height: size, transform: [{ rotate: `${Math.max(deg - 180, 0)}deg` }] }}>{half({ left: h })}</View></View>
      <View style={{ width: size - 10, height: size - 10, borderRadius: h, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}><T v s={15} lh={20}>{value}%</T></View>
    </View>
  );
};
const Meter = ({ label, n, total }: any) => (
  <Row gap={10} style={{ minHeight: 30 }}>
    <T s={13} lh={18} n={1} style={{ flex: 1 }}>{label}</T>
    <T s={13} lh={18} col={c.ink2}><T s={13} lh={18} w="600">{num(n)}</T> of {num(total)}</T>
    <View style={{ width: 96, height: 4, borderRadius: 2, backgroundColor: c.track, overflow: 'hidden' }}><View style={{ height: 4, width: `${pct(n, total)}%`, borderRadius: 2, backgroundColor: c.green }} /></View>
  </Row>
);
const autoNext = (due: number) => {
  const at8 = (t: number) => { const d = new Date(t); d.setHours(8, 0, 0, 0); return d.getTime(); };
  const list = [at8(due - 2 * D), at8(due)].filter(t => t > Date.now());
  if (!list.length) return null;
  return `${list.map(t => (dayDiff(t) === 0 ? 'today' : fmtDate(t))).join(' and ')}, 8 am`;
};
const FacultyWhoSaw = ({ route }: any) => {
  useData();
  const kind = route.name === 'FacultySeenDue' ? 'due' : route.name === 'FacultySeenLink' ? 'link' : route.name === 'FacultySeenPlain' ? 'plain' : null;
  const hasLink = (p: any) => attsOf(p.id).some(a => a.kind === 'link');
  const p = byId('buzz_posts', route.params?.postId) || readable().filter(isOwn).find(x => !kind || (kind === 'due' ? x.due_at && !hasLink(x) : kind === 'link' ? !x.due_at && hasLink(x) : !x.due_at && !hasLink(x))) || readable().filter(isOwn)[0];
  const [tab, setTab] = useState('not'), [q, setQ] = useState(''), [more, setMore] = useState(false);
  const bottom = useBottom();
  if (!p) return <Screen><Hdr title="Seen by" /><Empty icon="visibility" title="Nothing on Buzz yet" /></Screen>;
  const a = acct(p), total = p.recipient_count, due = !!p.due_at, link = hasLink(p);
  const seen = seenRows(p.id), seenBy = new Map(seen.map(s => [s.user_id, s])), rec = recipientsOf(p.id);
  const done = new Set(where('todo_items', t => t.post_id === p.id && t.state === 'done').map(t => t.user_id));
  const cant = unreachable(p), cantIds = new Set(cant.map(u => u.id)), linkN = seen.filter(s => s.link_opened_at).length;
  const notSeen = rec.filter(u => !seenBy.has(u.id) && !cantIds.has(u.id)), notDone = rec.filter(u => !done.has(u.id));
  const nNot = Math.max(total - seen.length - cant.length, 0), nNotDone = total - done.size;
  const tabs: [string, string][] = [['not', `Not seen ${num(nNot)}`], ...(due ? [['notdone', `Not done ${num(nNotDone)}`]] as any : []), ['seen', `Seen ${num(seen.length)}`], ['cant', `Can’t reach ${cant.length}`]];
  const remindable = tab === 'not' || tab === 'notdone', n = tab === 'not' ? nNot : nNotDone, target = tab === 'not' ? 'not_seen' : 'not_done';
  const sent = where('buzz_reminders', r => r.post_id === p.id && r.target === target && !r.auto && dayDiff(r.sent_at) === 0).pop();
  const remindedIds = new Set(where('buzz_reminders', r => r.post_id === p.id && r.target === target && !r.auto).flatMap(r => r.user_ids || []));
  const quiet = { col: c.ink3 }, agoTxt = (t: number) => { const x = fmtAge(t).toLowerCase(); return x.endsWith('h') ? `${x} ago` : x; };
  const rowsFor = (): any[] => {
    const rollSeen = (u: any) => { const s: any = seenBy.get(u.id); return `${u.roll_number || ''}${s ? ` · seen ${agoTxt(s.seen_at)}` : ''}`; };
    const rem = (u: any, def: string) => remindedIds.has(u.id) && sent ? { status: `Reminded ${fmtClock(sent.sent_at)}`, col: c.greenText, bold: true } : { status: def, ...quiet };
    if (tab === 'not') return notSeen.map(u => ({ u, meta: u.roll_number, ...rem(u, 'Not seen') }));
    if (tab === 'notdone') return notDone.map(u => ({ u, meta: rollSeen(u), ...rem(u, 'Not done') }));
    if (tab === 'seen') return seen.map(s => ({ s, u: profile(s.user_id) })).filter(x => x.u).sort((x, y) => y.s.seen_at - x.s.seen_at).map(({ s, u }) => {
      const st = done.has(u.id) ? 'Done' : s.link_opened_at ? 'Opened link' : 'Seen';
      return { u, meta: `${u.roll_number || ''} · ${agoTxt(s.seen_at)}`, status: st, ...(st === 'Seen' ? quiet : { col: c.positive, bold: true }) };
    });
    return cant.map(u => ({ u, meta: u.roll_number, status: !u.has_app ? 'No Hive app' : 'Notifications off', col: c.caution, bold: true }));
  };
  const k = q.trim().toLowerCase();
  const rows = rowsFor().filter(r => !k || r.u.full_name.toLowerCase().includes(k) || (r.u.roll_number || '').includes(k));
  const preview = tab === 'not' ? `Reminder: ${p.title}` : `Reminder: ${p.title} is due ${dueWord(p.due_at)}. Mark it done when finished.`;
  const ask = () => openSheet(() => (
    <SheetBody title={`Remind ${plural(n, 'student')}?`}>
      <T s={14} lh={20} col={c.ink2}>{due ? 'They get this notification now, on top of Hive’s automatic reminders. You can remind once a day.' : 'They get this notification now. You can remind once a day.'}</T>
      <Row gap={10} style={{ marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: c.sunken, alignItems: 'flex-start' }}>
        <Pic size={32} img={a?.img} name={a?.name} />
        <View style={{ flex: 1 }}><T s={13} lh={18} w="600">{a?.name}</T><T s={13} lh={18} col={c.ink2}>{preview}</T></View>
      </Row>
      <Row gap={8} style={{ marginTop: 16 }}>
        <BtnS style={{ flex: 1 }} onPress={closeSheet}>Cancel</BtnS>
        <BtnP style={{ flex: 1 }} onPress={() => {
          closeSheet();
          const people = tab === 'not' ? notSeen : notDone;
          mut(() => {
            insert('buzz_reminders', { post_id: p.id, target, sent_by: meId(), sent_at: Date.now(), count: n, auto: false, user_ids: people.map(u => u.id) });
            people.forEach(u => notify(u.id, 'buzz_remind', { post_id: p.id, target }));
          });
          toast(`Reminder sent to ${plural(n, 'student')}`);
        }}>Remind students</BtnP>
      </Row>
    </SheetBody>
  ));
  const next = due ? autoNext(p.due_at) : null;
  const sub = due ? `Due ${fmtWhen(p.due_at)}${dayDiff(p.due_at) === 1 ? ' · tomorrow' : ''}` : `${p.audience_label} · ${fmtDay(p.posted_at).toLowerCase()}`;
  return (
    <Screen>
      <Hdr title="Seen by" right={<IB n="download" label="Download list" onPress={() => toast(isOffline() ? 'Couldn’t download list · Retry' : 'Saved to your phone')} />} />
      <Body pad={100}>
        <Card style={{ marginHorizontal: 16, marginTop: 8, padding: 16 }}>
          <Row gap={16}>
            <Ring value={pct(seen.length, total)} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T s={15} lh={20}><T s={15} lh={20} w="600">{num(seen.length)}</T> of {num(total)} seen</T>
              <T s={12} lh={16} col={c.ink3} n={1}>{p.title}</T>
              <T s={12} lh={16} col={c.ink3}>{sub}</T>
            </View>
          </Row>
          {due || link ? <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.line }}>
            {due ? <Meter label="Marked as done" n={done.size} total={total} /> : null}
            {link ? <Meter label="Opened link" n={linkN} total={total} /> : null}
          </View> : null}
          {next ? <Row gap={8} style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.line }}>
            <Ms n="notifications" s={16} col={c.ink3} />
            <T s={12} lh={16} col={c.ink2} style={{ flex: 1 }}>Hive reminds students automatically: <T s={12} lh={16} w="600" col={c.ink2}>{next}</T></T>
          </Row> : null}
        </Card>
        <View style={{ paddingTop: 12, paddingHorizontal: 16 }}>
          <SearchBar style={{ marginHorizontal: 0, marginTop: 0 }} placeholder="Name or roll number" value={q} onChange={setQ} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {tabs.map(([id, label]) => <OptChip key={id} h={32} label={label} on={tab === id} onPress={() => { setTab(id); setMore(false); }} />)}
          </View>
        </View>
        {rows.length ? <Grp style={{ marginTop: 10 }}>
          {rows.slice(0, more ? undefined : 40).map(r => (
            <Li key={r.u.id} min={58} left={<Pic size={34} img={r.u.img} name={r.u.full_name} />} title={r.u.full_name} sub={r.meta} right={<T s={12} lh={16} w={r.bold ? '600' : undefined} col={r.col}>{r.status}</T>} />
          ))}
          {!more && rows.length > 40 ? <Li title={`See all ${num(rows.length)}`} titleCol={c.greenText} onPress={() => setMore(true)} /> : null}
        </Grp> : null}
      </Body>
      {remindable && n > 0 ? <View style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(bottom, 20) }}>
        {sent ? <Row gap={6} style={{ height: 50, borderRadius: 999, backgroundColor: c.sunken, justifyContent: 'center' }}><Ms n="check" s={18} col={c.ink2} /><T s={14} lh={19} col={c.ink2}>Reminder sent today, {fmtClock(sent.sent_at)}</T></Row>
          : <BtnP icon="notifications" style={{ height: 50 }} onPress={ask}>{tab === 'not' ? `Remind ${num(n)} who haven’t seen it` : `Remind ${num(n)} who haven’t done it`}</BtnP>}
      </View> : null}
    </Screen>
  );
};
const OptChip = ({ label, on, onPress, tick, h = 36 }: any) => (
  <Tap label={label} onPress={onPress} style={{ height: h, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? c.ink : c.surface, borderWidth: 1, borderColor: on ? c.ink : c.line }}>
    {tick && on ? <Ms n="check" s={16} col={c.onFill} /> : null}<T s={13} lh={18} w="500" col={on ? c.onFill : c.ink2}>{label}</T>
  </Tap>
);

/* ---------- Compose ---------- */
const YEARS = ['1st year', '2nd year', '3rd year', '4th year'];
const progName = (p: any) => p.name.replace(' Engineering', '');
/** Live count and labels for an audience pick. Student counts come from programmes.by_year; faculty from profiles. */
function audience(x0: any) {
  const d = db(), x = { prog: ['all'], year: ['all'], dept: ['all'], ...x0 }; // a missing pick means all
  const club = byId('buzz_accounts', x.account_id)?.club_id;
  if (x.who === 'Members' && club) {
    const ids = where('club_members', m => m.club_id === club).map(m => m.user_id), n = ids.length, cn = byId('clubs', club)?.name;
    return { count: n, unit: `${num(n)} ${n === 1 ? 'member' : 'members'}`, to: `${cn} members`, card: 'all members', short: 'all members', kind: 'students', ids, progs: [], years: [], depts: [] };
  }
  if (x.who === 'Faculty') {
    const all = x.dept.includes('all'), depts = all ? d.departments : d.departments.filter(k => x.dept.includes(k.id));
    const count = d.profiles.filter(u => u.role === 'faculty' && depts.some(k => k.id === u.department_id)).length;
    const name = all ? 'All departments' : depts.map(k => k.name.replace(' Engineering', '')).join(', ');
    return { count, unit: plural(count, 'faculty').replace('facultys', 'faculty'), to: name, card: all ? 'all faculty' : `${name} faculty`, short: all ? 'all faculty' : `${name} faculty`, kind: 'faculty', progs: [], years: [], depts: depts.map(k => k.id) };
  }
  const allP = x.prog.includes('all'), allY = x.year.includes('all');
  const progs = allP ? d.programmes : d.programmes.filter(p => x.prog.includes(p.id)), years: number[] = allY ? [1, 2, 3, 4] : x.year;
  const count = progs.reduce((s, p) => s + years.reduce((t, y) => t + (p.by_year[y] || 0), 0), 0);
  const pn = allP ? 'All programmes' : progs.map(progName).join(', '), yn = allY ? 'all years' : years.slice().sort().map(y => YEARS[y - 1]).join(', ');
  return { count, unit: `${num(count)} ${count === 1 ? 'student' : 'students'}`, to: `${pn} · ${yn}`, card: allP && allY ? 'all students' : allP ? yn : allY ? `${pn}, all years` : `${pn}, ${yn}`, short: allY ? (allP ? 'all students' : pn) : yn, kind: 'students', progs: progs.map(p => p.id), years, depts: [] };
}
/** Generated people matching the audience. ponytail: not every student exists locally, so reach rows can be fewer than recipient_count. */
const matchPeople = (au: any) => db().profiles.filter(u => au.ids ? au.ids.includes(u.id) : (au.kind === 'faculty' ? u.role === 'faculty' && au.depts.includes(u.department_id) : u.role === 'student' && au.progs.includes(u.programme_id) && au.years.includes(u.year_of_study)));
const ensureTodos = (p: any) => {
  if (!p.due_at) return;
  const had = new Set(where('todo_items', t => t.post_id === p.id).map(t => t.user_id));
  where('buzz_recipients', r => r.post_id === p.id && !had.has(r.user_id)).forEach(r => insert('todo_items', { id: newId('td'), user_id: r.user_id, source: 'buzz_post', post_id: p.id, state: 'open', saved_at: Date.now() }));
};
/** Materialise recipients, tasks and notifications. Call inside mut(). */
function publish(p: any) {
  const was = p.scheduled_for;
  matchPeople(audience(p.audience_filter)).forEach(u => {
    insert('buzz_recipients', { post_id: p.id, user_id: u.id });
    if (u.id !== meId()) notify(u.id, 'new_post', { post_id: p.id });
  });
  p.posted_at = Date.now(); p.scheduled_for = null;
  ensureTodos(p);
  const a = acct(p); if (a) a.post_count = (a.post_count || 0) + 1;
  if (was) notify(p.author_id, 'scheduled_sent', { post_id: p.id });
}
const accKind = (a: any) => (a.user_id ? 0 : a.club_id ? 2 : 1);
const myAccounts = () => where('buzz_account_members', m => m.user_id === meId()).map(m => byId('buzz_accounts', m.account_id)).filter(Boolean).sort((a, b) => accKind(a) - accKind(b));
const accSub = (a: any) => (a.user_id ? 'Your own account' : a.club_id ? 'Club you head' : 'Department');
const blankDraft = () => {
  const acc = myAccounts().find(a => !a.user_id) || myAccounts()[0], progs = acc?.department_id ? where('programmes', p => p.department_id === acc.department_id).map(p => p.id) : [];
  return { id: null, account_id: acc?.id, who: 'Students', prog: progs.length ? progs : ['all'], year: progs.length ? [2] : ['all'], dept: ['all'], title: '', body: '', atts: [], due_at: null, event: null, sched: null };
};
const useDraft = create<any>(() => ({ loaded: false }));
const patch = (x: any) => useDraft.setState(x);
const loadPost = (p: any) => useDraft.setState({
  ...blankDraft(), loaded: true, id: p.id, ...p.audience_filter, account_id: p.account_id, title: p.title, body: p.body || '', due_at: p.due_at, sched: p.scheduled_for,
  atts: attsOf(p.id), event: p.event_at ? { at: p.event_at, place: p.event_place, seats: p.seats_total, taken: p.seats_taken } : null,
}, true);
const resetDraft = () => useDraft.setState({ ...blankDraft(), loaded: true }, true);

const DraftTile = ({ a, style, onRemove }: any) => {
  const sz = useRef<any>(null);
  return (
    <Tile a={a} style={style} onSize={(x: any) => { sz.current = x; }}>
      <Tap label="Zoom and crop photo" onPress={() => go('FacultyPhotoCrop', { id: a.id, aspect: sz.current ? sz.current.w / sz.current.h : 4 / 3 })} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      <Tap label="Remove photo" onPress={onRemove} style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}><Ms n="close" s={15} /></Tap>
      <View pointerEvents="none" style={{ position: 'absolute', left: 6, bottom: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}><Ms n="crop" s={15} /></View>
    </Tile>
  );
};
/** Zoom and crop: the bright frame is exactly what shows on Buzz. Pinch or use the buttons to zoom, drag to move. */
const FacultyPhotoCrop = ({ route }: any) => {
  const { id, aspect } = route.params, a = useDraft.getState().atts.find((x: any) => x.id === id);
  const { width } = useWindowDimensions(), w = width - 32, h = w / aspect, W = c.onFill, bottom = useBottom();
  const [cr, setCr] = useState<any>(a?.crop || { z: 1, x: 0, y: 0 }), [drag, setDrag] = useState(false);
  const cur = useRef(cr), g = useRef<any>({}).current;
  cur.current = cr;
  const set = (n: any) => { const b = cropBox(a, w, h, n); setCr({ z: b.z, x: b.x, y: b.y }); };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { g.start = cur.current; g.d = 0; g.sx = 0; g.sy = 0; setDrag(true); },
    onPanResponderMove: (e, st) => {
      const t: any = e.nativeEvent.touches;
      if (t.length >= 2) {
        const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
        if (!g.d) { g.d = d; g.start = cur.current; }
        set({ ...g.start, z: (g.start.z * d) / g.d });
      } else {
        if (g.d) { g.d = 0; g.start = cur.current; g.sx = st.dx; g.sy = st.dy; }
        set({ ...g.start, x: g.start.x + (st.dx - g.sx) / w, y: g.start.y + (st.dy - g.sy) / h });
      }
    },
    onPanResponderRelease: () => setDrag(false), onPanResponderTerminate: () => setDrag(false),
  })).current;
  if (!a) return null;
  const box = cropBox(a, w, h, cr);
  const done = () => { patch({ atts: useDraft.getState().atts.map((x: any) => (x.id === id ? { ...x, crop: cr } : x)) }); back(); };
  return (
    <Screen style={{ backgroundColor: c.inverse }}>
      <StatusBar style="light" />
      <Row style={{ minHeight: 52, paddingHorizontal: 16, justifyContent: 'space-between' }}>
        <BtnT col={W} onPress={back}>Cancel</BtnT><T v s={16} lh={21} col={W}>Zoom and crop</T><BtnT col={c.toastUndo} onPress={done}>Done</BtnT>
      </Row>
      <View {...pan.panHandlers} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <View style={{ width: w, height: h }}>
          <Image source={photoSrc(a)} accessibilityLabel="Photo being cropped" style={{ position: 'absolute', left: box.left, top: box.top, width: box.width, height: box.height }} />
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 2, borderWidth: 1, borderColor: W, boxShadow: '0 0 0 2000px rgba(42,38,34,.72)' } as any}>
            {drag ? [1, 2].map(i => <React.Fragment key={i}>
              <View style={{ position: 'absolute', left: `${(i * 100) / 3}%`, top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,.5)' }} />
              <View style={{ position: 'absolute', top: `${(i * 100) / 3}%`, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,.5)' }} />
            </React.Fragment>) : null}
          </View>
        </View>
      </View>
      <View style={{ alignItems: 'center', gap: 6, paddingTop: 8, paddingBottom: bottom + 12 }}>
        <T s={13} lh={18} col={W} center>Only what's inside the frame shows on Buzz</T>
        <Row gap={8}>
          <IB n="remove" col={W} label="Zoom out" onPress={() => set({ ...cr, z: cr.z - 0.25 })} />
          <T s={14} lh={19} col={W} style={{ width: 52, textAlign: 'center' }}>{`${Math.round(cr.z * 100)}%`}</T>
          <IB n="add" col={W} label="Zoom in" onPress={() => set({ ...cr, z: cr.z + 0.25 })} />
          <BtnT col={W} onPress={() => set({ z: 1, x: 0, y: 0 })}>Reset</BtnT>
        </Row>
      </View>
    </Screen>
  );
};
const LinkSheet = () => {
  const [url, setUrl] = useState(''), [title, setTitle] = useState('');
  const dom = url.trim().replace(/^https?:\/\//, '').split('/')[0];
  return (
    <SheetBody title="Add a link">
      <View style={{ gap: 8 }}>
        <Row gap={4}><Field autoFocus autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="Paste a link" value={url} onChangeText={setUrl} style={{ flex: 1 }} /><PasteBtn onPaste={setUrl} /></Row>
        <Field placeholder="Name (optional)" value={title} onChangeText={setTitle} />
        <BtnP disabled={!dom} onPress={() => {
          const full = /^https?:/.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
          patch({ atts: [...useDraft.getState().atts, { id: newId('a'), kind: 'link', url: full, title: title.trim() || dom, meta: dom }] }); closeSheet();
        }}>Add link</BtnP>
      </View>
    </SheetBody>
  );
};
const EventSheet = () => {
  const cur = useDraft.getState().event;
  const [at, setAt] = useState(cur?.at || days(7, 10)), [place, setPlace] = useState(cur?.place || ''), [seats, setSeats] = useState(cur?.seats ? String(cur.seats) : '');
  return (
    <SheetBody title="Add an event">
      <View style={{ gap: 8 }}>
        <SheetRow icon="event" label={fmtWhen(at)} sub="Change date and time" onPress={() => pickWhen('Event date', at, setAt)} />
        <Field placeholder="Place" value={place} onChangeText={setPlace} />
        <Field placeholder="Seats (optional)" keyboardType="number-pad" value={seats} onChangeText={setSeats} />
        <BtnP onPress={() => { patch({ event: { at, place: place.trim(), seats: parseInt(seats, 10) || null, taken: cur?.taken || 0 } }); closeSheet(); }}>Add event</BtnP>
      </View>
    </SheetBody>
  );
};
const FacultyNewPost = ({ route }: any) => {
  useData();
  const editId = route.params?.postId;
  useState(() => { const s = useDraft.getState(); if (editId) { if (s.id !== editId) loadPost(byId('buzz_posts', editId)); } else if (!s.loaded || s.id) resetDraft(); return 0; });
  const dr = useDraft();
  const bottom = useBottom();
  const a = byId('buzz_accounts', dr.account_id), au = audience(dr), accounts = myAccounts();
  const editing = dr.id && byId('buzz_posts', dr.id), wasPosted = !!editing?.posted_at;
  const label = dr.id ? 'Save changes' : dr.sched ? 'Schedule' : 'Post';
  const pollOk = !dr.poll || dr.poll.opts.filter((o: string) => o.trim()).length >= 2;
  const can = !!dr.title?.trim() && !!a && pollOk;
  const close = () => { if (dr.id) resetDraft(); else if (dr.title || dr.body) toast('Draft kept'); back(); };
  const submit = () => {
    const row: any = {
      account_id: dr.account_id, title: dr.title.trim(), body: dr.body.trim(), audience_kind: au.kind, audience_filter: { who: dr.who, prog: dr.prog, year: dr.year, dept: dr.dept, account_id: dr.account_id },
      audience_label: au.card, audience_short: au.short, recipient_count: au.count, due_at: dr.due_at, reminders: !!dr.due_at,
      event_at: dr.event?.at ?? null, event_place: dr.event?.place ?? null, seats_total: dr.event?.seats ?? null, seats_taken: dr.event?.taken ?? 0, waiting: isOffline(),
    };
    const id = dr.id || newId('post');
    mut(d => {
      let p = byId('buzz_posts', id);
      if (p) { Object.assign(p, row); if (wasPosted) p.edited_at = Date.now(); else p.scheduled_for = dr.sched; ensureTodos(p); }
      else p = insert('buzz_posts', { id, author_id: meId(), posted_at: null, scheduled_for: dr.sched, deleted_at: null, ...row });
      d.buzz_attachments = d.buzz_attachments.filter(x => x.post_id !== id);
      dr.atts.forEach((x: any, i: number) => insert('buzz_attachments', { ...x, post_id: id, sort: i }));
      if (!dr.due_at) d.todo_items = d.todo_items.filter(t => t.post_id !== id);
      p.category = classify(p);
      if (dr.poll && !where('polls', x => x.post_id === id).length) {
        const pid = newId('poll');
        insert('polls', { id: pid, post_id: id, question: row.title, multi_answer: dr.poll.multi, names_visible: false, closed_at: null });
        dr.poll.opts.map((o: string) => o.trim()).filter(Boolean).forEach((text: string, sort: number) => insert('poll_options', { id: newId('po'), poll_id: pid, text, sort }));
      }
      if (!p.posted_at && !dr.sched) { p.scheduled_for = null; publish(p); }
    });
    toast(dr.id ? 'Changes saved' : dr.sched ? `Scheduled for ${fmtWhen(dr.sched)}` : `Posted to ${au.unit}`);
    resetDraft(); back();
  };
  const addPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true });
    if (!r.canceled) patch({ atts: [...useDraft.getState().atts, ...r.assets.map(x => ({ id: newId('a'), kind: 'photo', uri: x.uri, w: x.width, h: x.height }))] });
  };
  const addFile = async () => {
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: false });
    if (r.canceled) return;
    const f = r.assets[0], ext = (f.name.split('.').pop() || 'file').toUpperCase(), size = f.size || 0;
    patch({ atts: [...useDraft.getState().atts, { id: newId('a'), kind: 'file', title: f.name, type: ext, size_bytes: size, pages: 1, meta: `${ext} · ${fmtSize(size)}` }] });
  };
  const rm = (id: string) => patch({ atts: dr.atts.filter((x: any) => x.id !== id) });
  const X = ({ onPress, label: l }: any) => <IB n="close" s={18} col={c.ink3} label={l} onPress={onPress} style={{ width: 36, height: 36 }} />;
  const nonPhoto = dr.atts.filter((x: any) => x.kind !== 'photo'), photos = dr.atts.filter((x: any) => x.kind === 'photo');
  // X-style toolbar: one row of outline icons in the brand colour, no tiles.
  const tool = (icon: string, l: string, fn: () => void, on?: boolean) => (
    <Tap key={l} label={l} onPress={fn} style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 }}>
      <Ms n={icon} s={24} col={c.greenText} fill={on} /><T s={11} lh={14} w={on ? '600' : '400'} col={on ? c.greenText : c.ink2} n={1}>{l}</T>
    </Tap>
  );
  const poll = dr.poll as null | { opts: string[]; multi: boolean };
  const setPoll = (x: any) => patch({ poll: x && { ...poll, ...x } });
  const hair = { minHeight: 48, borderBottomWidth: 1, borderBottomColor: c.line };
  return (
    <Screen>
      <Row gap={6} style={{ minHeight: 48, paddingLeft: 8, paddingRight: 16 }}>
        <IB n="close" label="Close and keep as draft" onPress={close} />
        <T v s={16} lh={22} center={P.ios} style={{ flex: 1 }}>{dr.id ? 'Edit post' : 'New post'}</T>
        {!wasPosted ? <IB n="schedule" col={dr.sched ? c.greenText : c.ink} label="Schedule post" style={{ width: 36, height: 36, backgroundColor: dr.sched ? c.greenWash : 'transparent' }} onPress={() => (dr.sched ? patch({ sched: null }) : openSchedule({ onPick: t => patch({ sched: t }) }))} /> : null}
        <Tap label={label} disabled={!can} onPress={submit} style={{ height: 36, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center', backgroundColor: can ? c.green : c.sunken }}><T v s={14} lh={19} col={can ? c.onFill : c.inkOff}>{label}</T></Tap>
      </Row>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
          <Row gap={10} style={hair}>
            <T s={14} lh={19} col={c.ink3} style={{ width: 40 }}>From</T>
            <Tap disabled={accounts.length < 2} label={`From ${a?.name}. Change`} style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }} onPress={() => openSheet(() => (
              <SheetBody title="Post as">{myAccounts().map(k => (
                <Tap key={k.id} label={k.name} onPress={() => { const was = useDraft.getState(); patch({ account_id: k.id, ...(k.club_id ? { who: 'Members' } : was.who === 'Members' ? { who: 'Students' } : {}) }); closeSheet(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
                  <Pic size={36} img={k.img} name={k.name} />
                  <View style={{ flex: 1, minWidth: 0 }}><T s={15} lh={20} w="500" n={1}>{k.name}</T><T s={12} lh={16} col={c.ink3}>{accSub(k)}</T></View>
                  {k.id === useDraft.getState().account_id ? <Ms n="check" col={c.greenText} /> : null}
                </Tap>
              ))}</SheetBody>
            ))}>
              <Pic size={24} img={a?.img} name={a?.name} /><T s={15} lh={20}>{a?.name}</T>{accounts.length > 1 ? <Ms n="expand_more" s={18} col={c.ink3} /> : null}
            </Tap>
          </Row>
          <Tap label={`To ${au.to}. ${au.unit}. Change`} onPress={() => go(dr.who === 'Faculty' ? 'FacultyToFaculty' : 'FacultyTo')} style={[hair, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
            <T s={14} lh={19} col={c.ink3} style={{ width: 40 }}>To</T>
            <T s={15} lh={20} n={1} style={{ flex: 1 }}>{au.to}</T>
            <T s={13} lh={18} col={c.ink3}>{au.unit}</T>
            <Ms n="chevron_right" s={18} col={c.ink3} />
          </Tap>
          {dr.sched ? <Row gap={8} style={{ minHeight: 44, borderBottomWidth: 1, borderBottomColor: c.line }}>
            <Ms n="schedule" s={18} col={c.greenText} />
            <Tap label="Change time" style={{ flex: 1, minHeight: 40, justifyContent: 'center' }} onPress={() => openSchedule({ title: 'Sends', value: dr.sched, onPick: t => patch({ sched: t }) })}><T s={14} lh={19}>Sends <T s={14} lh={19} w="600">{fmtWhen(dr.sched)}</T></T></Tap>
            <Tap label="Send now instead" style={{ minHeight: 40, justifyContent: 'center' }} onPress={() => patch({ sched: null })}><T s={13} lh={18} w="600" col={c.ink2}>Send now instead</T></Tap>
          </Row> : null}
          {/* One field, like any feed. The first line is stored as the title (notifications, search, share cards use it). */}
          <TextInput autoFocus={!dr.id} accessibilityLabel="Post" placeholder="What’s happening on campus?" placeholderTextColor={c.ink3} multiline value={dr.text ?? (dr.body ? `${dr.title}\n${dr.body}` : dr.title)}
            onChangeText={t => { const i = t.indexOf('\n'); patch({ text: t, ...(i < 0 ? { title: t, body: '' } : { title: t.slice(0, i), body: t.slice(i + 1) }) }); }}
            style={{ marginTop: 18, minHeight: 110, fontSize: 16, lineHeight: 24, fontFamily: 'Poppins_400Regular', color: c.ink, padding: 0, textAlignVertical: 'top' }} />
          {photos.length ? <>
            <PhotoGrid list={photos} tile={(x, st) => <DraftTile key={x.id} a={x} style={st} onRemove={() => rm(x.id)} />} />
            <T s={12} lh={16} col={c.ink3} style={{ marginTop: 6 }}>This is how it shows on Buzz. Tap a photo to zoom and crop.</T>
            {photos.length > 3 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ marginTop: 8 }}>{photos.slice(3).map((x: any) => (
              <View key={x.id}><Image source={photoSrc(x)} style={{ width: 84, height: 84, borderRadius: 10 }} /><Tap label="Remove photo" onPress={() => rm(x.id)} style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}><Ms n="close" s={14} /></Tap></View>
            ))}</ScrollView> : null}
          </> : null}
          {nonPhoto.length ? <View style={{ marginTop: 8 }}>{nonPhoto.map((x: any) => (
            <Row key={x.id} gap={12} style={{ minHeight: 44 }}><Fi n={attIcon(x)} /><View style={{ flex: 1, minWidth: 0 }}><T s={14} lh={19} n={1}>{x.title}</T><T s={12} lh={16} col={c.ink3} n={1}>{x.meta}</T></View><X label={`Remove ${x.title}`} onPress={() => rm(x.id)} /></Row>
          ))}</View> : null}
          {poll ? <View style={{ marginTop: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: c.line, gap: 8 }}>
            <Row><T s={13} lh={18} w="600" col={c.ink2} style={{ flex: 1 }}>Poll · your post is the question</T><X label="Remove poll" onPress={() => patch({ poll: null })} /></Row>
            {poll.opts.map((o, i) => <View key={i}><Field value={o} onChangeText={v => setPoll({ opts: poll.opts.map((x, j) => (j === i ? v : x)) })} placeholder={`Option ${i + 1}`} style={{ paddingRight: 44 }} />
              {poll.opts.length > 2 ? <IB n="close" s={18} label="Remove option" onPress={() => setPoll({ opts: poll.opts.filter((_, j) => j !== i) })} style={{ position: 'absolute', right: 2, top: 2 }} /> : null}</View>)}
            {poll.opts.length < 6 ? <BtnT icon="add" onPress={() => setPoll({ opts: [...poll.opts, ''] })}>Add option</BtnT> : null}
            <Tap label="Allow more than one answer" onPress={() => setPoll({ multi: !poll.multi })} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }}><T s={14} style={{ flex: 1 }}>Allow more than one answer</T><Ck sq on={poll.multi} /></Tap>
          </View> : null}
          {dr.due_at ? <Strip style={{ paddingRight: 4 }}>
            <Tap label="Change due date" style={{ flex: 1 }} onPress={() => pickWhen('Due date', dr.due_at, t => patch({ due_at: t }))}><T s={14} lh={19} w="600">Due {fmtWhen(dr.due_at)}</T><T s={12} lh={16} col={c.ink2}>Reminders 2 days before and on the day</T></Tap>
            <X label="Remove due date" onPress={() => patch({ due_at: null })} />
          </Strip> : null}
          {dr.event ? <Strip style={{ paddingRight: 4 }}>
            <Tap label="Change event" style={{ flex: 1 }} onPress={() => openSheet(() => <EventSheet />)}><T s={14} lh={19} w="600">{fmtWhen(dr.event.at)}{dr.event.place ? ` · ${dr.event.place}` : ''}</T>{dr.event.seats ? <T s={12} lh={16} col={c.ink2}>{dr.event.seats} seats</T> : null}</Tap>
            <X label="Remove event" onPress={() => patch({ event: null })} />
          </Strip> : null}
        </ScrollView>
        <View style={{ flexDirection: 'row', paddingTop: 8, paddingHorizontal: 4, paddingBottom: Math.max(bottom, 8), backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line }}>
          {tool('image', 'Photo', addPhoto)}
          {tool('description', 'File', addFile)}
          {tool('link', 'Link', () => openSheet(() => <LinkSheet />))}
          {tool('ballot', 'Poll', () => patch({ poll: poll ? null : { opts: ['', ''], multi: false } }), !!poll)}
          {tool('event_available', 'Due date', () => pickWhen('Due date', dr.due_at || days(7, 17), t => patch({ due_at: t })), !!dr.due_at)}
          {tool('event', 'Event', () => openSheet(() => <EventSheet />), !!dr.event)}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
};
const flip = (list: any[], id: any) => { if (id === 'all') return ['all']; const n = list.includes(id) ? list.filter(x => x !== id) : [...list.filter(x => x !== 'all'), id]; return n.length ? n : ['all']; };
const FacultyTo = ({ route }: any) => {
  useData();
  const d0 = useDraft.getState();
  const [who, setWho] = useState(route.name === 'FacultyToFaculty' ? 'Faculty' : d0.who === 'Members' ? 'Members' : 'Students');
  const [prog, setProg] = useState<any[]>(d0.prog || ['all']), [year, setYear] = useState<any[]>(d0.year || ['all']), [dept, setDept] = useState<any[]>(d0.dept || ['all']);
  const club = byId('buzz_accounts', d0.account_id)?.club_id;
  const au = audience({ who, prog, year, dept, account_id: d0.account_id }), bottom = useBottom();
  const group = (name: string, opts: [any, string][], list: any[], set: (x: any[]) => void) => (
    <View key={name} style={{ marginTop: 22 }}>
      <T s={12} lh={16} w="600" col={c.ink3}>{name}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{opts.map(([id, l]) => <OptChip key={id} tick label={l} on={list.includes(id)} onPress={() => set(flip(list, id))} />)}</View>
    </View>
  );
  const d = db();
  return (
    <Screen>
      <Row style={{ minHeight: 48, paddingHorizontal: 8 }}>
        <Tap label="Cancel" onPress={back} style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' }}><T s={15} lh={20} col={c.greenText}>Cancel</T></Tap>
        <T v s={16} lh={22} center style={{ flex: 1 }}>To</T>
        <View style={{ width: 64 }} />
      </Row>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 }}>
        <Seg style={{ marginHorizontal: 0 }} items={club ? ['Members', 'Students', 'Faculty'] : ['Students', 'Faculty']} on={who} onPick={setWho} />
        {who === 'Members' ? <T s={14} lh={20} col={c.ink2} style={{ marginTop: 22 }}>{`Everyone in ${byId('clubs', club)?.name}. Members who join later see it too.`}</T> : who === 'Students' ? <>
          {group('Programme', [['all', 'All programmes'], ...d.programmes.map(p => [p.id, progName(p)] as [any, string])], prog, setProg)}
          {group('Year', [['all', 'All years'], ...YEARS.map((y, i) => [i + 1, y] as [any, string])], year, setYear)}
        </> : group('Department', [['all', 'All departments'], ...d.departments.map(k => [k.id, k.name.replace(' Engineering', '')] as [any, string])], dept, setDept)}
      </ScrollView>
      <Row gap={12} style={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: Math.max(bottom, 16), backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line }}>
        <View style={{ flex: 1, minWidth: 0 }}><T s={15} lh={20} w="600">{au.unit}</T><T s={12} lh={16} col={c.ink3} n={1}>{au.to}</T></View>
        <Tap label="Done" onPress={() => { patch({ who, prog, year, dept }); back(); }} style={{ height: 44, paddingHorizontal: 20, borderRadius: 999, justifyContent: 'center', backgroundColor: c.green, boxShadow: shadow.button } as any}><T v s={15} lh={20} col={c.onFill}>Done</T></Tap>
      </Row>
    </Screen>
  );
};

/* ---------- Scheduled ---------- */
const scheduledPosts = () => db().buzz_posts.filter(p => !p.deleted_at && !p.posted_at && p.scheduled_for && isOwn(p)).sort((a, b) => a.scheduled_for - b.scheduled_for);
const ScheduledList = () => {
  const list = scheduledPosts();
  if (!list.length) return <Empty icon="schedule_send" title="Nothing scheduled" />;
  return <>{list.map(p => (
    <Card key={p.id} style={{ marginHorizontal: 16, marginTop: 12, padding: 16 }}>
      <Row gap={6}><Ms n="schedule_send" s={18} col={c.greenText} /><T s={14} lh={19} w="600" style={{ flex: 1 }}>{fmtWhen(p.scheduled_for)}</T></Row>
      <T s={12} lh={16} col={c.ink3} style={{ marginTop: 2 }}>To {p.audience_label}</T>
      <T v s={15} lh={21} style={{ marginTop: 10 }}>{p.title}</T>
      {p.body ? <T s={14} lh={20} col={c.ink2} style={{ marginTop: 2 }}>{p.body}</T> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <Pill icon="edit" onPress={() => go('FacultyNewPost', { postId: p.id })}>Edit</Pill>
        <Pill icon="schedule" onPress={() => openSchedule({ title: 'Change time', value: p.scheduled_for, onPick: t => mut(() => { p.scheduled_for = t; }) })}>Change time</Pill>
        <Pill onPress={() => { mut(() => publish(p)); toast(`Posted to ${num(p.recipient_count)} ${p.audience_kind === 'faculty' ? 'faculty' : 'students'}`); }}>Post now</Pill>
      </View>
    </Card>
  ))}</>;
};
const FacultyScheduled = () => {
  useData();
  return <Screen><Hdr title="Scheduled" /><Body><ScheduledList /></Body></Screen>;
};

/* ---------- Attachment viewer ---------- */
const FacultyFile = ({ route }: any) => {
  useData();
  const p = byId('buzz_posts', route.params?.postId), a = where('buzz_attachments', x => x.id === route.params?.attId)[0] || (p && attsOf(p.id).find(x => x.kind === 'file'));
  const [i, setI] = useState(1), [saved, setSaved] = useState(false);
  if (!a) return <Screen><Hdr title="File" /><Empty icon="description" title="File removed" /></Screen>;
  const n = a.pages || 1, name = a.title.replace(/\.\w+$/, '');
  const get = () => { if (isOffline()) return toast(`Couldn’t download ${a.title} · Retry`); setSaved(true); toast('Saved to your phone'); };
  return (
    <Screen>
      <Row style={{ minHeight: 52, paddingHorizontal: 6 }}>
        <IB n="close" label="Close" onPress={back} />
        <View style={{ flex: 1, minWidth: 0 }}><T v s={16} lh={21} n={1}>{name}</T><T s={12} lh={16} col={c.ink3} n={1}>{acct(p)?.name} · {p?.title}</T></View>
        <IB n={shareIcon} label="Share" onPress={() => openBuzzShare(p.id)} />
        {saved ? <IB n="download_done" col={c.greenText} label="Saved to your phone" /> : <IB n="download" label={`Download · ${fmtSize(a.size_bytes || 0)}`} onPress={get} />}
      </Row>
      <Body>
        <SlidePage doc big style={{ margin: 16 }} title={a.preview_title || name} lines={a.preview_lines} />
        <Row gap={8} style={{ justifyContent: 'center' }}>
          {n > 1 ? <IB n="chevron_left" label="Previous page" onPress={() => setI(Math.max(1, i - 1))} /> : null}
          <T s={12} lh={16} col={c.ink3}>Page {i} of {n} · {a.type || 'PDF'}{a.size_bytes ? ` · ${fmtSize(a.size_bytes)}` : ''}</T>
          {n > 1 ? <IB n="chevron_right" label="Next page" onPress={() => setI(Math.min(n, i + 1))} /> : null}
        </Row>
      </Body>
    </Screen>
  );
};

/* ---------- Sheets ---------- */
const copyLink = async (id: string) => { await Clipboard.setStringAsync(postLink(id)); toast('Link copied'); };
const shareText = (p: any) => `${acct(p)?.name} on Hive: ${p.title}\n${postLink(p.id)}`;
const osShare = (p: any) => Share.share({ message: shareText(p), url: postLink(p.id), title: p.title }).catch(() => {});
/** Straight into WhatsApp or mail when installed, else the OS sheet. The link opens the post in the app (deep link: buzz/:postId). */
const openOrShare = (url: string, p: any) => Linking.openURL(url).catch(() => osShare(p));
const OtherApps = ({ p }: { p: any }) => {
  const app = (icon: string, l: string, fn: () => void, bg = c.sunken, col = c.ink2) => (
    <Tap key={l} label={l} onPress={() => { closeSheet(); fn(); }} style={{ width: 72, alignItems: 'center', gap: 6 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Ms n={icon} col={col} /></View><T s={12} lh={15} center>{l}</T>
    </Tap>
  );
  return (
    <>
      <T s={13} lh={18} w="600" col={c.ink2} style={{ marginTop: 18, marginBottom: 8 }}>Share outside Hive</T>
      <Row gap={4} style={{ justifyContent: 'space-between' }}>
        {app('chat', 'WhatsApp', () => openOrShare(`whatsapp://send?text=${encodeURIComponent(shareText(p))}`, p), c.mint, c.greenText)}
        {app('link', 'Copy link', () => copyLink(p.id))}
        {app('mail', 'Email', () => openOrShare(`mailto:?subject=${encodeURIComponent(p.title)}&body=${encodeURIComponent(shareText(p))}`, p))}
        {app('more_horiz', 'More', () => osShare(p))}
      </Row>
    </>
  );
};
function shareTo(postId: string, ids: string[], note: string) {
  const sent = ids.map(chatId => sendMessage({ chatId, kind: 'buzz_card', buzz_post_id: postId, body: note.trim() }));
  closeSheet();
  toast(isOffline() ? 'Waiting to send' : `Shared to ${plural(ids.length, 'chat')}`, () => mut(d => { d.messages = d.messages.filter(m => !sent.includes(m.id)); }));
}
const myChats = () => where('chat_members', m => m.user_id === meId() && !m.left_at).map(m => ({ ch: byId('chats', m.chat_id), role: m.role })).filter(x => x.ch && x.ch.status === 'active');
const toggle = (l: string[], id: string) => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]);
const Quote = ({ top, title }: any) => (
  <View style={{ padding: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.sunken }}><T s={12} lh={18} col={c.ink3}>{top}</T><T s={13} lh={18} w="600">{title}</T></View>
);
/** StudentShare */
const StudentShareSheet = ({ postId }: { postId: string }) => {
  const p = byId('buzz_posts', postId), [q, setQ] = useState(''), [sel, setSel] = useState<string[]>([]), [note, setNote] = useState('');
  const order: any = { dm: 0, group: 1, class_group: 2, club: 3, focus_batch: 4, course: 5 };
  const list = myChats().map(x => x.ch).filter(ch => (chatTitle(ch) || '').toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => order[a.kind] - order[b.kind]);
  return (
    <SheetBody title="Share">
      <Quote top={acct(p)?.name} title={p.title} />
      <T s={13} lh={18} w="600" col={c.ink2} style={{ marginTop: 16, marginBottom: 8 }}>Share in chat</T>
      <SearchBar style={{ marginHorizontal: 0, marginTop: 0 }} placeholder="People and groups" value={q} onChange={setQ} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginTop: 14 }} contentContainerStyle={{ gap: 6 }}>
        {list.map(ch => {
          const on = sel.includes(ch.id), name = chatTitle(ch), dm = ch.kind === 'dm';
          return (
            <Tap key={ch.id} label={name} onPress={() => setSel(toggle(sel, ch.id))} style={{ width: 64, alignItems: 'center', gap: 6 }}>
              <View>
                <Pic size={52} img={dm ? otherMember(ch.id)?.img : ch.img} name={name} />
                {on ? <View style={{ position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 2px ${c.surface}` } as any}><Ms n="check" s={14} col={c.onFill} /></View> : null}
              </View>
              <T s={12} lh={15} n={2} center>{name}</T>
            </Tap>
          );
        })}
      </ScrollView>
      {sel.length ? (
        <Row gap={8} style={{ marginTop: 16 }}>
          <Field accessibilityLabel="Add a note (optional)" placeholder="Add a note (optional)" value={note} onChangeText={setNote} style={{ flex: 1, minHeight: 44, borderRadius: 999 }} />
          <BtnP style={{ height: 44 }} onPress={() => shareTo(postId, sel, note)}>{`Share to ${plural(sel.length, 'chat')}`}</BtnP>
        </Row>
      ) : (
        <OtherApps p={p} />
      )}
    </SheetBody>
  );
};
/** Chat-F17-BuzzShare */
const FacultyShareSheet = ({ postId }: { postId: string }) => {
  const p = byId('buzz_posts', postId), [q, setQ] = useState(''), [sel, setSel] = useState<string[]>([]), [note, setNote] = useState('');
  const has = (ch: any) => (chatTitle(ch) || '').toLowerCase().includes(q.trim().toLowerCase());
  const mine = myChats().filter(x => has(x.ch)), courses = mine.filter(x => x.ch.kind === 'course'), groups = mine.filter(x => x.ch.kind === 'class_group'), others = mine.filter(x => x.ch.kind !== 'course' && x.ch.kind !== 'class_group');
  const files = attsOf(postId).filter(a => a.kind === 'file').length;
  const row = ({ ch }: any, sub: string) => <Li key={ch.id} min={56} style={{ paddingHorizontal: 0 }} left={<Pic size={36} shape={ch.kind === 'dm' ? 'round' : 'course'} img={ch.kind === 'dm' ? otherMember(ch.id)?.img : ch.img} name={chatTitle(ch)} />} title={chatTitle(ch)} sub={sub} right={<Ck on={sel.includes(ch.id)} />} onPress={() => setSel(toggle(sel, ch.id))} />;
  return (
    <SheetBody title="Share">
      <Quote top={`Buzz · ${acct(p)?.name}`} title={`${p.title}${files ? ` · ${plural(files, 'file')}` : ''}`} />
      <SearchBar style={{ marginHorizontal: 0, marginTop: 12 }} placeholder="Search chats and people" value={q} onChange={setQ} />
      {courses.length ? <T s={13} lh={18} w="600" col={c.ink2} style={{ marginTop: 14 }}>Your courses</T> : null}
      {courses.map(x => row(x, `${division(x.ch.division_id)?.name} · ${peopleCount(x.ch.id)} people`))}
      {groups.length ? <T s={13} lh={18} w="600" col={c.ink2} style={{ marginTop: 14 }}>Class groups</T> : null}
      {groups.map(x => row(x, x.role === 'mentor' ? 'You’re the class mentor' : `${peopleCount(x.ch.id)} people`))}
      {others.length ? <T s={13} lh={18} w="600" col={c.ink2} style={{ marginTop: 14 }}>Other chats</T> : null}
      {others.map(x => row(x, x.ch.kind === 'dm' ? 'Direct message' : x.ch.kind === 'focus_batch' ? `Focus batch · ${peopleCount(x.ch.id)} people` : x.ch.kind === 'club' ? `Club · ${peopleCount(x.ch.id)} people` : `Group · ${peopleCount(x.ch.id)} people`))}
      <Field accessibilityLabel="Add a note (optional)" placeholder="Add a note (optional)" value={note} onChangeText={setNote} style={{ marginTop: 12 }} />
      <BtnP style={{ marginTop: 12 }} disabled={!sel.length} onPress={() => shareTo(postId, sel, note)}>{sel.length ? `Share to ${plural(sel.length, 'chat')}` : 'Pick chats'}</BtnP>
      {sel.length ? null : <OtherApps p={p} />}
    </SheetBody>
  );
};
export function openBuzzShare(postId: string) {
  openSheet(() => (isFaculty() ? <FacultyShareSheet postId={postId} /> : <StudentShareSheet postId={postId} />));
}
const changeDue = (p: any) => pickWhen('Change due date', p.due_at || days(7, 17), t => {
  const old = p.due_at, ids = where('buzz_recipients', r => r.post_id === p.id).map(r => r.user_id);
  mut(() => { p.due_at = t; p.reminders = true; ensureTodos(p); ids.forEach(u => { if (u !== meId()) notify(u, 'due_changed', { post_id: p.id }); }); });
  toast(`Due ${fmtWhen(t)}`, () => mut(() => { p.due_at = old; }));
});
/** FacultyPostMenu */
function openPostMenu(postId: string, onDeleted?: () => void) {
  const p = byId('buzz_posts', postId);
  const del = () => confirmSheet({
    title: 'Delete this post?', action: 'Delete post',
    body: `It’s removed from Buzz for ${num(p.recipient_count)} people, with its comments and ${num(doneCount(p.id))} marked as done. This can’t be undone.`,
    onConfirm: () => {
      closeAllSheets();
      mut(d => { p.deleted_at = Date.now(); d.todo_items = d.todo_items.filter(t => t.post_id !== p.id); d.buzz_comments = d.buzz_comments.filter(x => x.post_id !== p.id); });
      toast('Post deleted'); onDeleted?.();
    },
  });
  const nav = (fn: () => void) => { closeSheet(); fn(); };
  openSheet(() => (
    <SheetBody title={p.title} right={<Tap label={`${seenPct(p)}% seen`} onPress={() => nav(() => go('FacultyWhoSaw', { postId }))} style={{ flexDirection: 'row', alignItems: 'center' }}><T s={13} lh={18} w="600" col={c.greenText}>{seenPct(p)}% seen</T><Ms n="chevron_right" s={18} col={c.greenText} /></Tap>}>
      <BtnS icon={shareIcon} onPress={() => nav(() => openBuzzShare(postId))}>Share</BtnS>
      <View style={{ marginTop: 8 }}>
        <SheetRow label="Edit post" right={<Ms n="chevron_right" col={c.ink3} />} onPress={() => nav(() => go('FacultyNewPost', { postId }))} />
        <SheetRow label="Change due date" right={<Row gap={4}>{p.due_at ? <T s={13} lh={18} col={c.ink3}>{fmtDate(p.due_at)}</T> : null}<Ms n="chevron_right" col={c.ink3} /></Row>} onPress={() => nav(() => changeDue(p))} />
        <SheetRow label="Copy link" onPress={() => nav(() => copyLink(postId))} />
        <SheetRow neg label="Delete post" onPress={del} />
      </View>
    </SheetBody>
  ));
}

/* ---------- Registry ---------- */
export const roots: any = { faculty: FacultyBuzz, student: Main };
export const screens: any = {
  Main, BuzzClubs, StudentPost: PostOrTodo, StudentAccount, StudentGallery, StudentSearch, StudentNotifications,
  FacultyBuzz, FacultyPost: PostOrTodo, FacultyTodo: TodoStack, FacultyWhoSaw, FacultySeenPlain: FacultyWhoSaw, FacultySeenDue: FacultyWhoSaw, FacultySeenLink: FacultyWhoSaw,
  FacultyNewPost, FacultyPhotoCrop, FacultyTo, FacultyToFaculty: FacultyTo, FacultyFile, FacultyScheduled,
};

/* ---------- Seed (PRD 11.1 Buzz). Canvas world, relative dates. ---------- */
export function seedBuzz(d: any) {
  const min = (m: number) => Date.now() - m * 60000;
  const roleOf = new Map(d.profiles.map((u: any) => [u.id, u.role]));
  const uOf = new Map(d.profiles.map((u: any) => [u.id, u]));
  const divA: string[] = d.division_members.filter((m: any) => m.division_id === 'div-a').map((m: any) => m.student_id);
  const faculty: string[] = d.profiles.filter((u: any) => u.role === 'faculty').map((u: any) => u.id);
  const mech = (n: number) => Array.from({ length: n }, (_, i) => `s-mech-${i + 1}`);
  const byYear = (pg: string, y: number) => d.programmes.find((p: any) => p.id === pg).by_year[y];
  const allStudents = d.programmes.reduce((s: number, p: any) => s + (Object.values(p.by_year) as number[]).reduce((a, b) => a + b, 0), 0);

  d.buzz_accounts = [
    { id: 'acc-admin', name: 'Admin', initials: 'AD', official: true, sub: 'Principal’s office', post_count: 112, img: 'campus1' },
    { id: 'acc-mech', name: 'Mech Department', initials: 'ME', official: true, sub: 'Official', post_count: 64, img: 'plant3', department_id: 'd-mech' },
    { id: 'acc-accounts', name: 'Accounts', initials: 'AC', official: true, sub: 'Official', post_count: 48, img: 'campus2' },
    { id: 'acc-exam', name: 'Exam Cell', initials: 'EX', official: true, sub: 'Official', post_count: 36, img: 'hall' },
    { id: 'acc-tp', name: 'Training and Placement', initials: 'TP', official: true, sub: 'Official', post_count: 27, img: 'campus3' },
    { id: 'acc-placement', name: 'Placement Cell', initials: 'PC', official: true, sub: 'Official', post_count: 19, img: 'tcs' },
    { id: 'acc-robo', name: 'Robotics Club', initials: 'RC', official: false, sub: 'Club', post_count: 14, img: 'robotics', club_id: 'club-robo' },
    { id: 'acc-code', name: 'Coding Club', initials: 'CC', official: false, sub: 'Club', post_count: 9, img: 'team', club_id: 'club-code' },
    ...d.clubs.filter((k: any) => k.id !== 'club-robo' && k.id !== 'club-code').map((k: any, i: number) => ({ id: `acc-${k.id}`, name: k.name, official: false, sub: 'Club', post_count: 2, img: k.img, club_id: k.id })),
    // Everyone who can post also has their own account (From: you).
    ...d.profiles.filter((u: any) => u.role === 'faculty').map((u: any) => ({ id: `acc-u-${u.id}`, name: u.full_name, sub: 'Faculty', post_count: 0, img: u.img, user_id: u.id })),
  ];
  d.buzz_account_members = [
    { account_id: 'acc-mech', user_id: 'p-anita' }, { account_id: 'acc-mech', user_id: 'p-sanjay' }, { account_id: 'acc-robo', user_id: 'p-sanjay' }, { account_id: 'acc-code', user_id: 'p-anita' },
    ...d.profiles.filter((u: any) => u.role === 'faculty').map((u: any) => ({ account_id: `acc-u-${u.id}`, user_id: u.id })),
  ];

  let aid = 0;
  /** Adds a post, its attachments, recipients and a todo row for each person the task is for. */
  const post = (id: string, account_id: string, title: string, body: string, posted_at: number | null, rec: string[], x: any = {}, atts: any[] = []) => {
    const p = { id, account_id, author_id: x.author_id || null, title, body, audience_kind: 'students', recipient_count: rec.length, due_at: null, reminders: !!x.due_at, event_at: null, event_place: null, seats_total: null, scheduled_for: null, posted_at, edited_at: null, deleted_at: null, ...x };
    d.buzz_posts.push(p);
    atts.forEach((a, i) => d.buzz_attachments.push({ id: `att-${++aid}`, post_id: id, sort: i, ...a }));
    rec.forEach(user_id => d.buzz_recipients.push({ post_id: id, user_id }));
    if (p.due_at) {
      const k = p.task_for || p.audience_kind;
      rec.filter(u => k === 'everyone' || (k === 'faculty') === (roleOf.get(u) === 'faculty')).forEach(user_id => d.todo_items.push({ id: `td-${id}-${user_id}`, user_id, source: 'buzz_post', post_id: id, state: 'open', saved_at: posted_at }));
    }
    return p;
  };
  const file = (title: string, meta: string, size_bytes: number, pages: number, preview_title?: string, preview_lines?: string[]) => ({ kind: 'file', title, meta, size_bytes, pages, type: 'PDF', preview_title, preview_lines });
  const link = (title: string, url: string) => ({ kind: 'link', title, url: `https://${url}`, meta: url.split('/')[0] });
  const photo = (img: string) => ({ kind: 'photo', img });
  /** Reach rows: the first n reachable recipients have seen; can't-reach people stay out, as the canvas counts them. */
  const reach = (id: string, rec: string[], seen: number, done = 0, opened = 0) => {
    const ok = rec.filter(u => { const p: any = uOf.get(u); return p.has_app && p.push_enabled; });
    ok.slice(0, seen).forEach((user_id, i) => d.buzz_seen.push({ post_id: id, user_id, seen_at: hours(-(1 + i % 30)), link_opened_at: i < opened ? hours(-(1 + i % 20)) : null }));
    ok.slice(0, done).forEach((u, i) => { const t = d.todo_items.find((r: any) => r.post_id === id && r.user_id === u); if (t) { t.state = 'done'; t.done_at = hours(-(1 + i % 20)); } });
  };
  const comment = (id: string, post_id: string, author_id: string | null, body: string, mAgo: number, x: any = {}) => d.buzz_comments.push({ id, post_id, author_id, as_account: null, parent_id: null, mention_user_id: null, body, created_at: min(mAgo), ...x });

  const dA = [...divA];
  post('post-fees', 'acc-accounts', `Pay semester fees by ${fmtShort(days(9))}`, `Even-semester fees are open. A late fee of ₹500 applies from ${fmtShort(days(10))}.`, hours(-7), [...dA, ...faculty],
    { audience_kind: 'everyone', task_for: 'students', audience_label: 'all students and faculty', audience_short: 'all students', recipient_count: allStudents + faculty.length, due_at: days(9, 17) },
    [link('Pay fees online', 'fees.pccegoa.edu.in'), file('Fee structure 2026–27.pdf', 'PDF · 120 KB', 120000, 1, 'Fee structure 2026–27', ['Tuition, exam and lab fees for the even semester'])]);
  post('post-it2', 'acc-admin', 'Send IT2 question papers to the Exam Cell', 'Two sets per course, sealed.', hours(-3), faculty,
    { audience_kind: 'faculty', audience_label: 'all faculty', audience_short: 'all faculty', due_at: days(4, 12) },
    [file('Question paper format.pdf', 'PDF · 2 pages', 90000, 2, 'Question paper format', ['Two sets per course', 'Seal each set separately'])]);
  post('post-samarth', 'acc-admin', 'Register on the Samarth portal', 'B.E. first year and lateral entry students must register on Samarth and upload the enrolment form.', hours(-5), dA,
    { audience_label: '1st year', audience_short: '1st year', due_at: days(2, 17) },
    [file('Enrolment forms.pdf', 'PDF · 2 pages', 180000, 2, 'Enrolment form', ['Name, roll number and programme', 'Signature of student']), link('Samarth registration', 'samarth.edu.in')]);
  const visit = ['p-rohan', ...mech(213)];
  post('post-visit', 'acc-mech', 'Industrial visit to the Verna plant', `${fmtDate(days(5))}. The bus leaves the main gate at 8 am. Carry your ID card and the signed consent form.`, days(-1, 10), visit,
    { author_id: 'p-anita', audience_label: 'Mechanical, 2nd year', audience_short: '2nd year', due_at: days(1, 17), task_label: 'Consent form', audience_filter: { who: 'Students', prog: ['pg-mech'], year: [2], dept: ['all'] }, read_comments: { 'p-anita': min(210) } },
    [photo('plant1'), photo('plant2'), photo('plant3'), file('Consent form.pdf', 'PDF · 210 KB', 210000, 1, 'Parent consent form', [`Industrial visit · Verna plant · ${fmtDate(days(5))}`, 'Signature of parent']), link('Bus seat sign-up', 'forms.gle/verna-bus')]);
  reach('post-visit', visit, 176, 92, 140);
  post('post-closed', 'acc-admin', `College closed on ${fmtDate(days(4))}`, `The college is closed for the state holiday. Sessions move to ${fmtDate(days(9))}.`, days(-1, 12), [...dA, ...faculty], { audience_kind: 'everyone', audience_label: 'all students and faculty', audience_short: 'all students', recipient_count: allStudents + faculty.length }, [photo('campus1')]);
  post('post-tcs', 'acc-placement', 'TCS campus drive: register now', 'Open to all TE and BE students. Bring your resume and college ID.', days(-2, 11), dA, { audience_label: 'TE Comp · Div A', audience_short: 'TE Comp · Div A' }, [photo('tcs')]);
  const shoes = mech(198);
  post('post-shoes', 'acc-mech', 'Bring safety shoes for workshop', 'The workshop floor is closed to anyone without safety shoes.', days(-2, 9), shoes,
    { author_id: 'p-anita', audience_label: 'Mechanical, 3rd year', audience_short: '3rd year', due_at: days(5, 17), audience_filter: { who: 'Students', prog: ['pg-mech'], year: [3], dept: ['all'] } });
  reach('post-shoes', shoes, 162, 118);
  post('post-it1', 'acc-exam', 'Enter IT1 marks for all divisions', 'Marks lock for the semester after the due date.', days(-6, 10), faculty,
    { audience_kind: 'faculty', audience_label: 'all faculty', audience_short: 'all faculty', due_at: days(-2, 17) }, [{ kind: 'app', title: 'Open Assessments', meta: 'Hive · Assessments', icon: 'fact_check' }]);
  post('post-feedback', 'acc-mech', 'Workshop feedback', 'Tell us how the workshop went. It takes two minutes.', days(-4, 9), shoes,
    { author_id: 'p-anita', audience_label: 'Mechanical, 3rd year', audience_short: '3rd year', audience_filter: { who: 'Students', prog: ['pg-mech'], year: [3], dept: ['all'] } }, [link('Feedback form', 'forms.gle/workshop-feedback')]);
  reach('post-feedback', shoes, 171, 0, 104);
  post('post-it2tt', 'acc-exam', 'IT2 timetable published', `${fmtShort(days(8))} to ${fmtShort(days(12))}. Check your slot and room.`, days(-6, 16), [...dA, ...faculty],
    { audience_kind: 'everyone', audience_label: 'all students and faculty', audience_short: 'all students', recipient_count: allStudents + faculty.length }, [file('IT2 timetable.pdf', 'PDF · 1 page', 75000, 1, 'IT2 timetable', ['Morning and afternoon slots by course'])]);
  post('post-infosys', 'acc-tp', 'Infosys campus drive', 'Registrations open next week. Final-year students, keep your resume ready.', days(-8, 11), dA, { audience_label: 'TE Comp · Div A', audience_short: 'TE Comp · Div A' });
  post('post-scholarship', 'acc-admin', 'Submit scholarship documents', 'Upload your income certificate and the signed scholarship form on the portal.', days(-13, 10), dA,
    { audience_label: 'all students', audience_short: 'all students', recipient_count: allStudents, due_at: days(-6, 17) }, [file('Scholarship form.pdf', 'PDF · 1 page', 95000, 1, 'Scholarship form', ['Income certificate', 'Signature of parent'])]);
  post('post-latefees', 'acc-admin', 'Late fees waived for scholarship students', 'Scholarship students pay no late fee this semester.', days(-28, 10), dA, { audience_label: 'all students', audience_short: 'all students', recipient_count: allStudents });
  post('post-examfees', 'acc-exam', 'Exam fees for supplementary exams', 'Pay at the Accounts counter before your form is signed.', days(-40, 10), dA, { audience_label: 'all students', audience_short: 'all students', recipient_count: allStudents });
  const robo: string[] = ['p-sanjay', ...d.club_members.filter((m: any) => m.club_id === 'club-robo').map((m: any) => m.user_id)];
  post('post-robo-1', 'acc-robo', 'Line-follower workshop', 'Build and race a line-follower in one day. Kits are provided.', days(-1, 15), robo, { audience_label: 'all members', audience_short: 'all members', event_at: days(6, 10), event_place: 'Lab 2', seats_total: 40, seats_taken: 8 }, [photo('robotics')]);
  post('post-robo-2', 'acc-robo', 'Recruitment for 2026–27', `First and second years can apply until ${fmtDate(days(12))}.`, days(-3, 15), robo, { audience_label: 'all members', audience_short: 'all members', due_at: days(12, 17) }, [file('Recruitment form.pdf', 'PDF · 2 pages', 110000, 2, 'Recruitment form', ['Name, year and team preference'])]);
  d.todo_items.filter((t: any) => t.post_id === 'post-robo-2' && t.user_id === 'p-rohan').forEach((t: any) => { t.state = 'done'; t.done_at = hours(-30); });
  post('post-robo-3', 'acc-robo', 'Robocon team list is out', 'Congratulations to the 14 of you who made it.', days(-12, 15), robo, { audience_label: 'all members', audience_short: 'all members' });
  const code: string[] = ['p-anita', ...d.club_members.filter((m: any) => m.club_id === 'club-code').map((m: any) => m.user_id)];
  const codeAud = { who: 'Members', prog: ['all'], year: ['all'], dept: ['all'], account_id: 'acc-code' };
  post('post-code-hack', 'acc-code', 'Hackathon: 24 hours, teams of two', 'Build anything for campus life. Prizes for the top three teams, food on us.', hours(-2), code,
    { author_id: 'p-anita', audience_label: 'all members', audience_short: 'all members', event_at: days(10, 9), event_place: 'Seminar hall', seats_total: 60, seats_taken: 22, audience_filter: codeAud }, [photo('team')]);
  reach('post-code-hack', code.slice(1), 21);
  post('post-code-contest', 'acc-code', 'Saturday contest results', 'Sara D’Costa and Rohan Kamat tied for first. Editorials are in the club Resources.', days(-2, 18), code,
    { author_id: 'p-anita', audience_label: 'all members', audience_short: 'all members', audience_filter: codeAud });
  reach('post-code-contest', code.slice(1), 30);
  const club = (id: string) => [d.clubs.find((k: any) => k.id === id)?.coordinator_id, ...d.club_members.filter((m: any) => m.club_id === id).map((m: any) => m.user_id)];
  const mem = (id: string) => ({ audience_label: 'all members', audience_short: 'all members', audience_filter: { who: 'Members', prog: ['all'], year: ['all'], dept: ['all'], account_id: `acc-${id}` } });
  post('post-music-1', 'acc-club-music', 'Friday jam: open mic', 'Auditorium, 6 pm. Sign up at the door for a five-minute slot. Drums and a keyboard are there.', days(-1, 12), club('club-music'), { ...mem('club-music'), event_at: days(2, 18), event_place: 'Auditorium' });
  post('post-music-2', 'acc-club-music', 'Band auditions for the fest', 'Looking for a bassist and a second vocalist. Send a 1-minute clip in the club chat.', days(-6, 16), club('club-music'), mem('club-music'));
  post('post-photo-1', 'acc-club-photo', 'Photo walk to Fontainhas', 'Sunday 7 am, meet at the main gate. Phones are fine, no camera needed.', days(-2, 10), club('club-photo'), { ...mem('club-photo'), event_at: days(4, 7), event_place: 'Main gate' }, [photo('campus3')]);
  post('post-photo-2', 'acc-club-photo', 'Exhibition picks are up', 'Twelve photos made it to the campus exhibition. See them in the library foyer all week.', days(-9, 15), club('club-photo'), mem('club-photo'), [photo('campus1')]);
  post('post-drama-1', 'acc-club-drama', 'Street play on road safety', 'We perform at Miramar beach next Saturday. Rehearsals Mon, Wed, Fri at 5 pm in the seminar hall.', days(-3, 17), club('club-drama'), { ...mem('club-drama'), event_at: days(9, 17), event_place: 'Miramar beach' });
  post('post-foot-1', 'acc-club-foot', 'Inter-college league fixtures', 'First match is against GEC on the 28th. Squad list goes up after Thursday practice.', days(-1, 19), club('club-foot'), mem('club-foot'));
  post('post-nss-1', 'acc-club-nss', 'Beach clean-up this Sunday', 'Calangute, 6:30 to 9 am. Gloves and bags provided. Counts as 3 NSS hours.', days(-2, 9), club('club-nss'), { ...mem('club-nss'), event_at: days(4, 6), event_place: 'Calangute beach', seats_total: 80, seats_taken: 52 });
  post('post-nss-2', 'acc-club-nss', 'Blood donation drive', 'With Goa Medical College, in the gym on the 2nd. Eat breakfast before you come.', days(-8, 11), club('club-nss'), mem('club-nss'));
  post('post-anita-office', 'acc-u-p-anita', 'Office hours moved to Thursday', 'This week I’m in the staff room on Thursday, 3 to 5 pm, instead of Wednesday.', hours(-26), visit,
    { author_id: 'p-anita', audience_label: 'Mechanical, 2nd year', audience_short: '2nd year', audience_filter: { who: 'Students', prog: ['pg-mech'], year: [2], dept: ['all'], account_id: 'acc-u-p-anita' } });
  reach('post-anita-office', visit, 140);
  // Scheduled: recipients materialise when it goes out.
  post('post-ev', 'acc-mech', 'Seminar on EV drivetrains', `${fmtWhen(days(3, 14))} in the seminar hall.`, null, [],
    { author_id: 'p-anita', audience_label: 'Mechanical, 3rd year', audience_short: '3rd year', recipient_count: byYear('pg-mech', 3), scheduled_for: days(1, 8), audience_filter: { who: 'Students', prog: ['pg-mech'], year: [3], dept: ['all'] } }, [photo('ev')]);

  // Comments
  comment('cm-s0', 'post-samarth', 'p-rohan', 'Is the enrolment form signed by the HOD or the class mentor?', 240);
  comment('cm-s1', 'post-samarth', 'p-riya', 'Do lateral entry students use their diploma roll number?', 180);
  comment('cm-s2', 'post-samarth', null, '@Riya Sawant Yes, use your diploma roll number.', 120, { as_account: 'acc-admin', parent_id: 'cm-s1', mention_user_id: 'p-riya' });
  comment('cm-v0', 'post-visit', 'p-kevin', 'Should we wear the college uniform?', 400);
  comment('cm-v1', 'post-visit', 'p-joel', 'Is lunch provided at the plant?', 300);
  comment('cm-v2', 'post-visit', 'p-anita', '@Joel Pereira Yes, lunch is at the plant. Carry water.', 240, { as_account: 'acc-mech', parent_id: 'cm-v1', mention_user_id: 'p-joel' });
  comment('cm-v3', 'post-visit', 'p-riya', 'Do we carry the original consent form, or is a photocopy fine?', 180);
  comment('cm-r1', 'post-robo-1', 'p-meera', 'Teams of two. Pick your partner before Friday.', 500);

  // Reminders already sent, so the reach screen has history without blocking today's button.
  d.buzz_reminders.push({ post_id: 'post-visit', target: 'not_seen', sent_by: null, sent_at: days(-1, 8), count: 60, auto: true, user_ids: [] });
}
