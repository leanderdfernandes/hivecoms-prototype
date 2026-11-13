// Resources module (PRD 7). One file on purpose: faculty and student screens share rows and helpers.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Image, Linking, View, useWindowDimensions } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Path } from 'react-native-svg';
import { ActionTile, Badge, Body, BtnP, BtnS, BtnT, Card, celebrate, Ck, closeSheet, confirmSheet, Empty, Fab, Field, Fi, fileIcon, Fo, Grp, Hdr, IB, Li, Ms, openSheet, Pic, Pill, Row, Screen, SearchBar, Sec, SheetBody, SheetRow, SlidePage, swapSheet, Sw, T, Tag, Tap, toast, useBottom, useUi, PasteBtn } from './ui';
import { c } from './theme';
import { IMG } from './images';
import { back, go, swap } from './nav';
import { byId, days, db, dayDiff, divisionStudents, fmtClock, fmtDay, fmtShort, fmtSize, hours, insert, isFaculty, isOffline, memberOf, members, meId, mut, newId, notify, pct, profile, useData, useOffline, where } from './db';
import { chatTitle, ensureDm, openChat, openDm, otherMember, PlaceShell, sendMessage } from './place';

/* ---------- Lookups ---------- */
const curYear = () => db().academic_years.find(y => y.is_current)?.id;
const pastYear = () => db().academic_years.find(y => !y.is_current);
const low = (s: string) => (/^(Today|Yesterday)$/.test(s) ? s.toLowerCase() : s);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const base = (name: string) => name.replace(/\.[^.]+$/, '');
const sha = (name: string, size: number) => `${name.toLowerCase()}:${size}`;
const join = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const MIME: any = { pptx: PPTX, pdf: 'application/pdf', docx: 'application/msword', jpg: 'image/jpeg', mp4: 'video/mp4' };
const iconOfMime = (m?: string) => (/pdf/.test(m || '') ? 'picture_as_pdf' : /video/.test(m || '') ? 'movie' : fileIcon(m));
const iconOf = (r: any) => (r.kind === 'link' ? 'play_arrow' : iconOfMime(byId('files', r.file_id)?.mime));
const short = (f: any) => (f?.kind === 'unit' ? `Unit ${f.unit_no}` : f?.name);
const justNow = (t: number) => Date.now() - t < 10 * 60e3;
const changed = (r: any) => r.updated_at || r.created_at;
const isNote = (r: any) => r.added_by_role === 'student' && r.source !== 'chat';
const owns = (r: any) => r.added_by === meId() || r.moved_by === meId();
const dvName = (o: any) => byId('divisions', o?.division_id)?.name;

export const courseFolders = (courseId: string, yearId = curYear()) => where('folders', f => f.course_id === courseId && f.academic_year_id === yearId).sort((a, b) => a.sort - b.sort);
const gone = (r: any) => r.removed_at || (r.source === 'chat' && db().messages.some(m => m.resource_id === r.id && (m.unsent_at || m.deleted_by)));
export const resourcesIn = (folderId: string) => where('resources', r => r.folder_id === folderId && !gone(r)).sort((a, b) => (b.sort || 0) - (a.sort || 0));

const sharesOf = (rid: string) => where('resource_shares', s => s.resource_id === rid);
const isShared = (rid: string, oid: string) => db().resource_shares.some(s => s.resource_id === rid && s.offering_id === oid);
const pubRow = (fid: string, oid: string) => db().folder_publications.find(p => p.folder_id === fid && p.offering_id === oid);
const isPub = (fid: string, oid: string) => !!pubRow(fid, oid)?.published;
/** Faculty sees what this division has, plus files saved but not shared yet and everything in a folder still to publish here. */
const facRows = (f: any, oid: string) => resourcesIn(f.id).filter(r => f.kind === 'focus_batch' || !isPub(f.id, oid) || isShared(r.id, oid) || !sharesOf(r.id).length);
const stuRows = (f: any, oid: string) => resourcesIn(f.id).filter(r => !r.upload && (f.kind === 'focus_batch' || isShared(r.id, oid)));
const canSee = (f: any, oid: string) => isFaculty() || (f.kind === 'focus_batch' ? !!memberOf(f.chat_id) : f.kind === 'shared_in_chat' || isPub(f.id, oid));
const myChat = (courseId: string) => db().chats.find(ch => ch.kind === 'course' && ch.status !== 'read_only' && byId('offerings', ch.offering_id)?.course_id === courseId && memberOf(ch.id));
const myOfferings = (courseId: string) => where('offering_faculty', x => x.faculty_id === meId()).map(x => byId('offerings', x.offering_id)).filter(o => o?.course_id === courseId && o.term_id !== 't-past');
const myStudentOffering = (courseId: string) => where('offerings', o => o.course_id === courseId).find(o => db().division_members.some(m => m.division_id === o.division_id && m.student_id === meId()));
const facultyName = (oid: string) => { const fs = where('offering_faculty', x => x.offering_id === oid); return profile((fs.find(x => /^Teaches/.test(x.label)) || fs[0])?.faculty_id)?.full_name; };
const batchStudents = (chatId: string) => members(chatId).filter(m => m.role !== 'faculty').map(m => profile(m.user_id));

/** Everything a Resources route needs from { chatId, folderId, resourceId }. */
function ctxOf(p: any = {}) {
  const res = byId('resources', p.resourceId);
  let folder = byId('folders', p.folderId) || byId('folders', res?.folder_id);
  const given = byId('chats', p.chatId);
  if (!folder && given?.kind === 'focus_batch') folder = db().folders.find(f => f.chat_id === given.id);
  const ch = given || (folder?.chat_id && byId('chats', folder.chat_id)) || myChat(folder?.course_id);
  const off = byId('offerings', ch?.offering_id);
  const course = byId('courses', off?.course_id ?? folder?.course_id);
  if (!folder && course) folder = courseFolders(course.id).find(f => f.kind === 'unit' && resourcesIn(f.id).length);
  return { res, folder, ch, off, course, dv: byId('divisions', off?.division_id), chatId: ch?.id };
}

/* ---------- Seen ---------- */
const audience = (r: any, oid: string) => { const f = byId('folders', r?.folder_id); return f?.kind === 'focus_batch' ? batchStudents(f.chat_id) : divisionStudents(byId('offerings', oid)?.division_id); };
const viewsOf = (r: any, aud: any[]) => { const ids = new Set(aud.map(u => u.id)); return where('resource_views', v => v.resource_id === r.id && !v.stale && ids.has(v.user_id)); };
export const seenPct = (resourceId: string, offeringId: string) => { const r = byId('resources', resourceId), aud = audience(r, offeringId); return pct(viewsOf(r, aud).length, aud.length); };
const myView = (rid: string) => db().resource_views.find(v => v.resource_id === rid && v.user_id === meId());
const isNew = (r: any) => { if (isNote(r) || changed(r) < days(-7)) return false; const v = myView(r.id); return !v || v.stale; }; // ponytail: rolling 7 days + unopened instead of "since last opened", so tab switches don't wipe New.
/** Seen = opened OR downloaded. Faculty previews don't count. */
export function markViewed(resourceId: string, kind: 'opened' | 'downloaded' = 'opened') {
  if (isFaculty()) return;
  const f = byId('folders', byId('resources', resourceId)?.folder_id), now = Date.now();
  mut(() => {
    const v = myView(resourceId) || insert('resource_views', { resource_id: resourceId, user_id: meId(), offering_id: myStudentOffering(f?.course_id)?.id, opened_at: null, downloaded_at: null });
    v.stale = false; if (kind === 'downloaded') v.downloaded_at = now; else v.opened_at = now;
  });
}
const SeenTag = ({ r, oid, chatId }: any) => {
  const n = seenPct(r.id, oid), full = n >= 100, k = full ? c.onFill : c.greenText;
  return (
    <Tap onPress={() => go('Res-F09-Seen', { resourceId: r.id, chatId })} label={`${n}% seen`} style={{ paddingVertical: 11 }}>
      <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: full ? c.green : c.greenWash }}><Ms n={full ? 'done_all' : 'visibility'} s={14} col={k} /><T s={12} lh={18} w="600" col={k}>{n}%</T></View>
    </Tap>
  );
};

/* ---------- Writes ---------- */
function setPub(fid: string, oid: string, published: boolean) {
  const p = pubRow(fid, oid);
  if (p) { p.published = published; p.published_at = published ? Date.now() : p.published_at; } else insert('folder_publications', { folder_id: fid, offering_id: oid, published, published_at: Date.now() });
}
function notifyPeople(ids: string[], kind: string, x: any) { ids.forEach(id => notify(id, kind, x)); }
function mkFile(p: any) {
  const id = newId('file'), pages = p.pages || [[base(p.name), `${fmtSize(p.size)}`]];
  insert('files', { id, name: p.name, mime: p.mime, size_bytes: p.size, page_count: pages.length, sha256: sha(p.name, p.size), uploaded_by: meId(), created_at: Date.now(), version: 1, uri: p.uri, img: p.img });
  pages.forEach((x: any, i: number) => insert('file_pages', { file_id: id, page_no: i + 1, title: x[0], text: x[1] }));
  insert('file_versions', { file_id: id, version_no: 1, page_count: pages.length, change_note: null, created_at: Date.now() });
  return id;
}
/** Keep notifications to one per share action per division (PRD 7.2). */
function commit(items: any[], oids: string[], chatId: string) {
  const now = Date.now(), newShares: any[] = [], newPubs: string[][] = [];
  const batch = byId('folders', items[0]?.folderId)?.kind === 'focus_batch' ? byId('folders', items[0].folderId) : null;
  const off = isOffline();
  mut(d => {
    items.forEach((it, i) => {
      const r = it.useId ? byId('resources', it.useId) : insert('resources', {
        id: newId('res'), folder_id: it.folderId, kind: it.link ? 'link' : 'file', file_id: it.link ? null : mkFile(it), title: it.link ? it.link.title : base(it.name), added_by: meId(), added_by_role: 'faculty', source: 'resources',
        url: it.link?.url, link_title: it.link?.title, link_provider: it.link?.provider, link_duration: it.link?.duration, link_thumb_path: it.link?.thumb,
        unit_no: batch ? autoUnit(it.name || it.link?.title, byId('folders', it.folderId)?.course_id) : undefined,
        created_at: now, updated_at: null, removed_at: null, sort: now + items.length - i, upload: off ? (i === 1 ? 'failed' : 'waiting') : null,
      });
      oids.forEach(o => {
        if (!isShared(r.id, o)) newShares.push(insert('resource_shares', { resource_id: r.id, offering_id: o, shared_at: now, shared_by: meId() }));
        if (!isPub(r.folder_id, o)) { setPub(r.folder_id, o, true); newPubs.push([r.folder_id, o]); }
      });
    });
    const f = byId('folders', items[0]?.folderId), word = items[0]?.link ? 'link' : 'file', text = `${profile(meId())?.full_name} shared ${plural(items.length, word)} in ${f?.name}`;
    oids.forEach(o => notifyPeople(divisionStudents(byId('offerings', o).division_id).map(u => u.id), 'files_shared', { folder_id: f?.id, chat_id: chatId, text }));
    if (batch) notifyPeople(batchStudents(batch.chat_id).map(u => u.id), 'files_shared', { folder_id: batch.id, chat_id: batch.chat_id, text });
  });
  const word = plural(items.length, items[0]?.link ? 'link' : 'file');
  if (off) return toast(`No connection. ${items[0].link ? items[0].link.title : base(items[0].name)} uploads when you're back online.`);
  if (batch) return toast(`${word} shared with ${batch.name}`);
  if (!oids.length) return toast(`${word} saved`);
  toast(`${word} shared with ${plural(oids.length, 'division')}`, () => {
    mut(d => { d.resource_shares = d.resource_shares.filter(s => !newShares.includes(s)); newPubs.forEach(([f, o]) => setPub(f, o, false)); });
    toast('Sharing undone');
  });
}
const useFlush = () => {
  const off = useOffline();
  useEffect(() => { if (!off && where('resources', r => r.upload === 'waiting').length) mut(d => d.resources.forEach(r => { if (r.upload === 'waiting') { r.upload = null; r.created_at = Date.now(); } })); }, [off]);
};
const publish = (f: any, oid: string, chatId: string) => {
  const added: any[] = [];
  mut(() => {
    setPub(f.id, oid, true);
    resourcesIn(f.id).forEach(r => { if (!isShared(r.id, oid)) added.push(insert('resource_shares', { resource_id: r.id, offering_id: oid, shared_at: Date.now(), shared_by: meId() })); });
    notifyPeople(divisionStudents(byId('offerings', oid).division_id).map(u => u.id), 'files_shared', { folder_id: f.id, chat_id: chatId, text: `${profile(meId())?.full_name} published ${f.name}` });
  });
  toast(`${short(f)} published for ${dvName(byId('offerings', oid))}`, () => mut(d => { setPub(f.id, oid, false); d.resource_shares = d.resource_shares.filter(s => !added.includes(s)); }));
};
/** Auto-filing: file name (and first page) against unit titles and keywords. */
function autoFolder(p: any, courseId: string) {
  const hay = `${p.name || ''} ${p.pages?.[0]?.join(' ') || ''}`.toLowerCase();
  const u = where('syllabus_units', x => x.course_id === courseId).find(x => [x.title, ...(x.keywords || [])].some(k => hay.includes(k.toLowerCase())));
  return u ? courseFolders(courseId).find(f => f.unit_id === u.id)?.id : null;
}
const autoUnit = (name: string, courseId: string) => byId('folders', autoFolder({ name }, courseId))?.unit_no;
function findDup(p: any, courseId: string) {
  const s = sha(p.name, p.size);
  return courseFolders(courseId).flatMap(f => resourcesIn(f.id)).find(r => byId('files', r.file_id)?.sha256 === s);
}
function openRes(r: any, chatId?: string, page?: number) {
  if (r.kind === 'link') { markViewed(r.id); Linking.openURL(/^https?:/.test(r.url) ? r.url : `https://${r.url}`).catch(() => toast("Couldn't open that link")); return; } // ponytail: opens outside Hive, no webview installed; embed YouTube when react-native-webview is added.
  go('Res-S03-Viewer', { resourceId: r.id, chatId, page });
}
/** Opens the thread of the message that shared this file, creating it if none (PRD Res-S04-Ask). */
export function askAboutSlide(resourceId: string, no: number, chatId?: string, nav: any = go) {
  const r = byId('resources', resourceId), f = byId('folders', r?.folder_id), cid = f?.chat_id || chatId || myChat(f?.course_id)?.id;
  const title = where('file_pages', x => x.file_id === r?.file_id && x.page_no === no)[0]?.title || r?.title;
  const root = db().messages.find(m => m.chat_id === cid && m.resource_id === resourceId && !m.thread_root_id && !m.unsent_at);
  const rootId = root?.id || sendMessage({ chatId: cid, kind: 'file', resource_id: resourceId, body: '', sender_id: r.added_by });
  nav('Chat-S03-Thread', { chatId: cid, rootId, slideQuote: { no, title } });
}
/** A folder for any place: Shared in chat for a course chat, the batch folder, or the chat's own folder (8.3). */
export function placeFolder(chatId: string) {
  const ch = byId('chats', chatId), courseId = byId('offerings', ch?.offering_id)?.course_id, kind = ch?.kind === 'course' ? 'shared_in_chat' : ch?.kind === 'focus_batch' ? 'focus_batch' : 'chat';
  const hit = db().folders.find(f => (kind === 'shared_in_chat' ? f.course_id === courseId && f.academic_year_id === curYear() : f.chat_id === chatId) && f.kind === kind);
  if (hit) return hit;
  let made: any;
  mut(() => { made = insert('folders', { id: newId('fld'), course_id: courseId || null, academic_year_id: curYear(), kind, chat_id: kind === 'shared_in_chat' ? null : chatId, name: kind === 'shared_in_chat' ? 'Shared in chat' : ch?.name || 'Files', owner_id: meId(), sort: 999 }); });
  return made;
}
/** A phone file sent in a chat lands in Resources. Returns the resource id to put on the file message. */
export function fileFromPhone(chatId: string, p: any) {
  const f = placeFolder(chatId), ch = byId('chats', chatId), id = newId('res');
  mut(() => {
    insert('resources', { id, folder_id: f.id, kind: 'file', file_id: mkFile(p), title: base(p.name), added_by: meId(), added_by_role: isFaculty() ? 'faculty' : 'student', source: 'chat', created_at: Date.now(), updated_at: null, removed_at: null, sort: Date.now(), upload: null });
    if (ch.kind === 'course') insert('resource_shares', { resource_id: id, offering_id: ch.offering_id, shared_at: Date.now(), shared_by: meId() });
  });
  return id;
}

/* ---------- Picking files ---------- */
export async function pickFiles(src: 'camera' | 'photos' | 'file'): Promise<any[]> {
  try {
    if (src === 'file') {
      const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      return r.canceled ? [] : r.assets.map(a => ({ name: a.name, size: a.size || 0, mime: a.mimeType || '', uri: a.uri }));
    }
    if (src === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return [];
    const opts: any = { mediaTypes: ['images'], allowsMultipleSelection: src === 'photos' };
    const r = await (src === 'camera' ? ImagePicker.launchCameraAsync(opts) : ImagePicker.launchImageLibraryAsync(opts));
    return r.canceled ? [] : r.assets.map(a => ({ name: a.fileName || `IMG_${Date.now() % 10000}.jpg`, size: a.fileSize || 900e3, mime: a.mimeType || 'image/jpeg', uri: a.uri }));
  } catch { toast("Couldn't open that here. Try File instead."); return []; }
}
// Testers on emulators have no files: same rows the canvas uses, and they trigger the duplicate and too-large paths.
const SAMPLES: any[] = [
  { name: 'Activity selection.pptx', size: 2.2e6, mime: PPTX, pages: [['Activity selection', 'Pick the most non-overlapping activities'], ['Sort by finish time', 'Then scan once, keeping what fits'], ['Why it works', 'The earliest finish leaves the most room']] },
  { name: 'Fractional knapsack notes.pdf', size: 640e3, mime: MIME.pdf, pages: [['Fractional knapsack notes', 'Value per kg decides the order'], ['Worked example', 'W = 50 kg, three items\nTake all of the best two, then 2/3 of the last']] },
  { name: 'Recurrence practice set.pdf', size: 410e3, mime: MIME.pdf, pages: [['Recurrence practice set', 'Solve with the master theorem\nT(n) = 2T(n/2) + n']] },
  { name: 'IMG_2041.jpg', size: 900e3, mime: MIME.jpg, img: 'hall' },
  { name: 'Greedy algorithms.pptx', size: 3.1e6, mime: PPTX },
  { name: 'Lecture 12 recording.mp4', size: 640e6, mime: MIME.mp4 },
];
const toCheck = (chatId: string, folderId: string, files: any[]) => go('Res-F04-Check', { chatId, folderId, files });

const CloseHdr = ({ title, sub }: any) => (
  <Row gap={6} style={{ minHeight: 52, paddingHorizontal: 6 }}>
    <IB n="close" label="Cancel" onPress={back} />
    <View style={{ flex: 1 }}><T v s={16} lh={21} n={2}>{title}</T>{sub ? <T s={12} lh={16} col={c.ink3}>{sub}</T> : null}</View>
  </Row>
);
const SheetHead = ({ left, title, sub }: any) => (
  <Row gap={12} style={{ marginBottom: 14 }}>
    {left}
    <View style={{ flex: 1 }}><T v s={17} lh={22} n={2}>{title}</T>{typeof sub === 'string' ? <T s={12} lh={16} col={c.ink3}>{sub}</T> : sub}</View>
    <Tap onPress={closeSheet} label="Close" style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(120,120,128,.14)', alignItems: 'center', justifyContent: 'center' }}><Ms n="close" s={18} /></Tap>
  </Row>
);
const Tile = ({ icon, label, onPress }: any) => <ActionTile width="33.33%" icon={icon} label={label} onPress={onPress} />;
/** Res-F03-Add */
const AddSheet = ({ chatId, folderId }: any) => {
  const f = byId('folders', folderId);
  const pick = async (src: any) => { closeSheet(); const files = await pickFiles(src); if (files.length) toCheck(chatId, folderId, files); };
  return (
    <SheetBody title={f ? `Add to ${short(f)}` : 'Add files'}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
        <Tile icon="photo_camera" label="Camera" onPress={() => pick('camera')} />
        <Tile icon="photo_library" label="Photos" onPress={() => pick('photos')} />
        <Tile icon="description" label="File" onPress={() => pick('file')} />
        <Tile icon="document_scanner" label="Scan" onPress={() => pick('camera')} />
        <Tile icon="add_to_drive" label="Drive" onPress={() => pick('file')} />
        <Tile icon="link" label="Link" onPress={() => swapSheet(() => <LinkSheet chatId={chatId} folderId={folderId} />)} />
      </View>
      <BtnT col={c.ink3} style={{ alignSelf: 'center', marginTop: 4 }} onPress={() => swapSheet(() => <SampleSheet chatId={chatId} folderId={folderId} />)}>Use sample files</BtnT>
    </SheetBody>
  );
};
export const openAddSheet = (chatId: string, folderId?: string) => openSheet(() => <AddSheet chatId={chatId} folderId={folderId} />);
const SampleSheet = ({ chatId, folderId }: any) => {
  const [on, setOn] = useState<number[]>([0]);
  return (
    <SheetBody title="Sample files" sub="For testing without files on this phone">
      {SAMPLES.map((s, i) => <SheetRow key={s.name} label={s.name} sub={fmtSize(s.size)} icon={iconOfMime(s.mime)} onPress={() => setOn(on.includes(i) ? on.filter(x => x !== i) : [...on, i])} right={<Ck sq on={on.includes(i)} />} />)}
      <BtnP disabled={!on.length} style={{ marginTop: 12 }} onPress={() => { closeSheet(); toCheck(chatId, folderId, on.map(i => SAMPLES[i])); }}>{`Add ${plural(on.length, 'file')}`}</BtnP>
      <BtnT style={{ alignSelf: 'center' }} onPress={() => { closeSheet(); go('Res-F06-ShareIn', { files: SAMPLES.slice(0, 4), from: 'WhatsApp' }); }}>Try sharing in from WhatsApp</BtnT>
    </SheetBody>
  );
};

const FChip = ({ label, ask, onPress }: any) => (
  <Tap onPress={onPress} label={label} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 2, height: 26, paddingLeft: 10, paddingRight: 4, borderRadius: 999, marginTop: 4, backgroundColor: ask ? c.cautionBg : c.greenWash }}>
    <T s={12} lh={16} w="600" n={1} col={ask ? c.caution : c.greenText}>{label}</T><Ms n="expand_more" s={16} col={ask ? c.caution : c.greenText} />
  </Tap>
);
const FolderPick = ({ courseId, on, onPick }: any) => (
  <SheetBody title="Pick a folder">
    {courseFolders(courseId).filter(f => f.kind === 'unit' || f.kind === 'custom').map(f => <SheetRow key={f.id} icon="folder" fill label={f.name} right={f.id === on ? <Ms n="check" col={c.greenText} /> : null} onPress={() => { closeSheet(); onPick(f.id); }} />)}
  </SheetBody>
);

/** Res-F13-Link */
async function linkPreview(raw: string) {
  if (/x8KdP2greedy/.test(raw)) return { url: raw, title: 'Greedy algorithms in 15 minutes', provider: 'YouTube · Abdul Bari', duration: '15:02', thumb: 'daa' };
  const u = /^https?:/.test(raw) ? raw : `https://${raw}`, domain = (u.match(/^https?:\/\/([^/]+)/) || [])[1] || raw, fallback: any = { url: raw, title: raw, provider: domain };
  if (!/youtu\.?be/.test(domain)) return fallback;
  try { const j = await (await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`)).json(); return { url: raw, title: j.title, provider: `YouTube · ${j.author_name}`, thumbUri: j.thumbnail_url }; } catch { return fallback; }
}
const LinkSheet = ({ chatId, folderId }: any) => {
  const { course, off } = ctxOf({ chatId, folderId }), offs = myOfferings(course?.id);
  const [url, setUrl] = useState(''), [prev, setPrev] = useState<any>(null), [fid, setFid] = useState(folderId), [ticks, setTicks] = useState<string[]>(offs.map(o => o.id));
  useEffect(() => {
    if (!url.trim()) return setPrev(null);
    let live = true;
    const t = setTimeout(async () => { const p = await linkPreview(url.trim()); if (live) { setPrev(p); if (!fid) setFid(autoFolder({ name: p.title }, course?.id)); } }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [url]);
  const folder = byId('folders', fid), isBatch = folder?.kind === 'focus_batch';
  return (
    <SheetBody title="Add a link">
      <Row gap={8} style={{ paddingLeft: 14, paddingRight: 2, borderRadius: 12, backgroundColor: c.sunken, minHeight: 48 }}>
        <Ms n="link" col={c.ink3} /><Field autoFocus autoCapitalize="none" keyboardType="url" aria-label="Link" placeholder="Paste a link" autoCorrect={false} value={url} onChangeText={setUrl} style={{ flex: 1, paddingHorizontal: 0, backgroundColor: 'transparent' }} />
        {url ? <IB n="cancel" label="Clear link" col={c.ink3} onPress={() => setUrl('')} /> : <PasteBtn onPaste={setUrl} />}
      </Row>
      {prev ? (
        <View style={{ marginTop: 12 }}>
          {prev.thumb || prev.thumbUri ? (
            <View style={{ height: 150, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: c.sunken, marginBottom: 8 }}>
              <Image source={prev.thumbUri ? { uri: prev.thumbUri } : IMG[prev.thumb]} style={{ position: 'absolute', width: '100%', height: '100%' }} />
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.scrim, alignItems: 'center', justifyContent: 'center' }}><Ms n="play_arrow" col={c.onFill} fill /></View>
              {prev.duration ? <View style={{ position: 'absolute', right: 8, bottom: 8, paddingHorizontal: 6, borderRadius: 6, backgroundColor: c.inverse }}><T s={12} lh={18} col={c.onFill}>{prev.duration}</T></View> : null}
            </View>
          ) : null}
          <T s={15} lh={20} w="500" n={2}>{prev.title}</T>
          <T s={12} lh={16} col={c.ink3}>{prev.provider}</T>
          <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
            {isBatch ? <FChip label={folder.name} /> : <FChip label={folder?.name || 'Pick a folder'} ask={!folder} onPress={() => openSheet(() => <FolderPick courseId={course?.id} on={fid} onPick={setFid} />)} />}
            {isBatch ? null : <Tap label="Divisions" onPress={() => openSheet(() => <DivSheet offs={offs} value={ticks} onDone={setTicks} />)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}><T v s={14} col={c.greenText}>{ticks.length === offs.length ? 'All divisions' : join(offs.filter(o => ticks.includes(o.id)).map(dvName)) || 'No divisions'}</T><Ms n="expand_more" s={18} col={c.greenText} /></Tap>}
          </Row>
        </View>
      ) : null}
      <BtnP disabled={!prev || !fid} style={{ marginTop: 12 }} onPress={() => { closeSheet(); commit([{ link: prev, folderId: fid }], isBatch ? [] : ticks, chatId); if (fid !== folderId) go('Res-F02-Folder', { folderId: fid, chatId }); }}>Share link</BtnP>
    </SheetBody>
  );
};
/** Division checklist, F04's Share to block as a sheet. */
const DivSheet = ({ offs, value, onDone }: any) => {
  const [on, setOn] = useState<string[]>(value);
  return (
    <SheetBody title="Shared with">
      {offs.map((o: any) => <SheetRow key={o.id} label={dvName(o)} onPress={() => setOn(on.includes(o.id) ? on.filter(x => x !== o.id) : [...on, o.id])} right={<Ck on={on.includes(o.id)} />} />)}
      <BtnP style={{ marginTop: 12 }} onPress={() => { closeSheet(); onDone(on); }}>{`Share to ${plural(on.length, 'division')}`}</BtnP>
    </SheetBody>
  );
};

/* ---------- Res-F04-Check ---------- */
const TooLargeSheet = ({ it, chatId, folderId, drop }: any) => (
  <SheetBody title="This video is too large">
    <Row gap={12} style={{ marginBottom: 10 }}><Fi l n={iconOfMime(it.mime)} /><View style={{ flex: 1 }}><T s={15} lh={20} w="500" n={1}>{it.name}</T><T s={12} lh={16} col={c.ink3}>{fmtSize(it.size)} · files can be up to 100 MB</T></View></Row>
    <T s={14} lh={20} col={c.ink2}>Upload it to YouTube or Drive and add the link. Students watch it inside Hive.</T>
    <BtnP style={{ marginTop: 16 }} onPress={() => { drop(); swapSheet(() => <LinkSheet chatId={chatId} folderId={folderId} />); }}>Add a link instead</BtnP>
    <BtnT style={{ alignSelf: 'center' }} onPress={() => { drop(); swapSheet(() => <AddSheet chatId={chatId} folderId={folderId} />); }}>Pick another file</BtnT>
  </SheetBody>
);
const DuplicateSheet = ({ it, dup, oid, chatId, onKeep, onUse, onReplace }: any) => {
  const f = byId('folders', dup.folder_id);
  return (
    <SheetBody title={`${dup.title} is already in ${short(f)}`}>
      <Row gap={12} style={{ marginBottom: 14 }}><Fi l n={iconOf(dup)} /><View style={{ flex: 1 }}><T s={15} lh={20} w="500" n={1}>{it.name}</T><T s={12} lh={16} col={c.ink3}>Added {fmtShort(dup.created_at)} · {seenPct(dup.id, oid)}% seen</T></View></Row>
      <BtnP onPress={onReplace}>Upload new version</BtnP>
      <BtnS style={{ marginTop: 8 }} onPress={() => { closeSheet(); onKeep(); }}>Keep both</BtnS>
      <BtnT style={{ alignSelf: 'center' }} onPress={() => { closeSheet(); onUse(); }}>Use the one in Hive</BtnT>
    </SheetBody>
  );
};
const Check = ({ route }: any) => {
  useData();
  const { chatId, folderId, files = [] } = route.params || {}, { off, course } = ctxOf({ chatId, folderId });
  const preset = byId('folders', folderId), batch = preset?.kind === 'focus_batch' ? preset : null, offs = myOfferings(course?.id);
  const [items, setItems] = useState<any[]>(() => files.map((p: any, key: number) => ({ ...p, key, folderId: batch?.id ?? autoFolder(p, course?.id) ?? folderId ?? null })));
  const [ticks, setTicks] = useState<string[]>(offs.map(o => o.id));
  const sheetOpen = useUi(s => s.sheets.length);
  const upd = (key: number, x: any) => setItems(xs => xs.map(i => (i.key === key ? { ...i, ...x } : i)));
  const drop = (key: number) => setItems(xs => xs.filter(i => i.key !== key));
  useEffect(() => {
    if (!items.length) return back();
    if (sheetOpen) return;
    const it = items.find(i => !i.seen); if (!it) return;
    upd(it.key, { seen: true });
    if (it.size > 100e6) return openSheet(() => <TooLargeSheet it={it} chatId={chatId} folderId={folderId} drop={() => drop(it.key)} />);
    const dup = findDup(it, course?.id);
    if (dup) openSheet(() => <DuplicateSheet it={it} dup={dup} oid={off?.id} chatId={chatId} onKeep={() => {}} onUse={() => upd(it.key, { useId: dup.id, folderId: dup.folder_id })} onReplace={() => {
      closeSheet();
      const params = { resourceId: dup.id, chatId, picked: it };
      if (items.length === 1) swap('Res-F08-Replace', params); else { drop(it.key); go('Res-F08-Replace', params); }
    }} />);
  }, [items, sheetOpen]);
  const n = items.length, fn = plural(n, 'file'), all = ticks.length === offs.length;
  const cta = batch ? `Share ${fn} to ${batch.name}` : offs.length === 1 ? `Share ${fn} to ${dvName(offs[0])}` : all ? `Share ${fn} to all divisions` : `Share ${fn} to ${join(offs.filter(o => ticks.includes(o.id)).map(dvName))}`;
  const go2 = () => {
    const open = items.find(i => !i.folderId);
    if (open) return toast(`Pick a folder for ${open.name}`);
    commit(items, batch ? [] : ticks, chatId);
    const target = items[0]?.folderId;
    target === folderId ? back() : swap('Res-F05-Added', { folderId: target, chatId });
  };
  return (
    <Screen>
      <CloseHdr title={fn} />
      <Body pad={12}>
        <Grp style={{ marginTop: 6 }}>
          {items.map(it => {
            const fo = byId('folders', it.folderId);
            return (
              <Li key={it.key} min={72} left={<Fi l n={iconOfMime(it.mime)} />} title={<T s={15} lh={20} w="500" n={1}>{it.name}</T>}
                sub={batch || it.useId ? <FChip label={fo?.name} /> : <FChip label={fo?.name || 'Pick a folder'} ask={!fo} onPress={() => openSheet(() => <FolderPick courseId={course?.id} on={it.folderId} onPick={(id: string) => upd(it.key, { folderId: id })} />)} />}
                right={/image/.test(it.mime) ? <IB n="close" label={`Remove ${it.name}`} col={c.ink3} onPress={() => drop(it.key)} /> : null} />
            );
          })}
        </Grp>
        {batch ? null : (
          <>
            <Sec right={offs.length > 1 ? <BtnT onPress={() => setTicks(all ? [] : offs.map(o => o.id))}>{all ? 'Unselect all' : 'Select all'}</BtnT> : null}>Share to</Sec>
            <Grp>{offs.map(o => <Li key={o.id} title={dvName(o)} right={<Ck on={ticks.includes(o.id)} />} onPress={() => setTicks(ticks.includes(o.id) ? ticks.filter(x => x !== o.id) : [...ticks, o.id])} />)}</Grp>
          </>
        )}
      </Body>
      <View style={{ padding: 16, paddingBottom: 16 + useBottom() }}>
        {batch || ticks.length ? <BtnP onPress={go2}>{cta}</BtnP> : <BtnS onPress={go2}>Save without sharing</BtnS>}
      </View>
    </Screen>
  );
};

/* ---------- Faculty tab, F11 ---------- */
const facTabRows = (course: any, off: any) => {
  const fs = course ? courseFolders(course.id) : [];
  return { units: fs.filter(f => f.kind === 'unit'), custom: fs.filter(f => f.kind === 'custom'), shared: fs.find(f => f.kind === 'shared_in_chat'), batches: where('chats', ch => ch.kind === 'focus_batch' && ch.status !== 'closed' && ch.offering_id === off?.id) };
};
const CountEnd = ({ n }: any) => <T s={13} lh={18} col={c.ink3}>{n}</T>;
const fileCount = (f: any, oid: string) => facRows(f, oid).filter(r => !isNote(r)).length;
const Inner = (props: any) => <T s={15} lh={20} n={1} {...props} />;

const FacTab = ({ route, stem, manage }: any) => {
  useData(); useFlush();
  const { chatId } = route.params || {}, { off, course, dv } = ctxOf({ chatId });
  const { units, custom, shared, batches } = facTabRows(course, off);
  if (!course) return <Screen><PlaceShell chatId={chatId} tab="Resources" stem={stem} /></Screen>;
  if (!manage && needsReuse(course.id)) return <NewSemBody chatId={chatId} course={course} stem={stem} />;
  const row = (f: any) => {
    const n = fileCount(f, off.id), pub = isPub(f.id, off.id), when = pubRow(f.id, off.id)?.published_at;
    const open = () => go('Res-F02-Folder', { folderId: f.id, chatId });
    const onLong = () => openFolderMenu(f.id, chatId);
    if (manage) return <Li key={f.id} min={64} left={<Fo n={pub ? 'folder' : 'folder_off'} mut={!pub} />} title={f.name} sub={`${pub ? (when && justNow(when) ? 'Published just now' : 'Published') : 'Not published'} · ${plural(n, 'file')}`} right={pub ? null : <BtnT onPress={() => publish(f, off.id, chatId)}>Publish</BtnT>} onPress={open} onLong={onLong} />;
    return <Li key={f.id} left={<Fo mut={!n || !pub} n={n && !pub ? 'folder_off' : 'folder'} />} title={f.name} sub={n && !pub ? 'Not published' : undefined} right={<CountEnd n={n} />} chevron onPress={open} onLong={onLong} />;
  };
  return (
    <Screen>
      <PlaceShell chatId={chatId} tab="Resources" stem={stem}>
        <SearchBar placeholder={`Search ${course.short} files`} onPress={() => go('Res-S06-Search', { chatId })} />
        <Body pad={96}>
          <Sec>{manage ? `${course.short} syllabus` : 'Syllabus'}</Sec>
          <Grp>{units.map(row)}</Grp>
          {batches.length && !manage ? <Sec>Focus batches</Sec> : null}
          {batches.length && !manage ? (
            <Grp>{batches.map(ch => {
              const f = db().folders.find(x => x.chat_id === ch.id);
              return <Li key={ch.id} left={<Fo n="filter_center_focus" />} title={ch.name} sub={plural(batchStudents(ch.id).length, 'student')} right={<CountEnd n={f ? resourcesIn(f.id).length : 0} />} chevron onPress={() => go('Res-F12-Batch', { folderId: placeFolder(ch.id).id, chatId: ch.id })} />;
            })}</Grp>
          ) : null}
          <Sec>Your folders</Sec>
          <Grp>
            {custom.map(row)}
            {shared && !manage ? <Li left={<Fo n="forum" mut />} title={shared.name} right={<CountEnd n={fileCount(shared, off.id)} />} chevron onPress={() => go('Res-F02-Folder', { folderId: shared.id, chatId })} /> : null}
            {manage ? null : <Li left={<View style={{ width: 40, alignItems: 'center' }}><Ms n="create_new_folder" col={c.greenText} /></View>} title={<Inner col={c.greenText}>New folder</Inner>} onPress={() => openSheet(() => <NameSheet title="New folder" action="Create folder" onSave={(name: string) => mut(() => { insert('folders', { id: newId('fld'), course_id: course.id, academic_year_id: curYear(), kind: 'custom', name, owner_id: meId(), sort: Date.now() }); })} />)} />}
          </Grp>
          {!manage && reuseSets(course.id).length ? <BtnT col={c.ink3} style={{ alignSelf: 'center', marginTop: 12 }} onPress={() => confirmSheet({ title: 'Try the new-year flow?', body: `For testing: ${course.short} starts empty, as if 2026–27 just began. Reset demo data on Profile brings the files back.`, action: 'Start empty', neg: false, onConfirm: () => startReuseDemo(course.id) })}>Try the new-year flow</BtnT> : null}
        </Body>
        <Fab round icon="add" label="Add files" onPress={() => openAddSheet(chatId)} />
      </PlaceShell>
    </Screen>
  );
};
const NameSheet = ({ title, init = '', action, onSave }: any) => {
  const [v, setV] = useState(init);
  return (
    <SheetBody title={title}>
      <Field autoFocus value={v} onChangeText={setV} maxLength={30} aria-label="Name" />
      <T s={12} lh={16} col={c.ink3} style={{ textAlign: 'right', marginTop: 4 }}>{v.length} / 30</T>
      <Row gap={8} style={{ marginTop: 12 }}>
        <BtnS style={{ flex: 1 }} onPress={closeSheet}>Cancel</BtnS>
        <BtnP style={{ flex: 1 }} disabled={!v.trim()} onPress={() => { closeSheet(); onSave(v.trim()); }}>{action}</BtnP>
      </Row>
    </SheetBody>
  );
};

/* ---------- Faculty folder, F02, F05, F12, F15, F21 ---------- */
const facSub = (r: any, f: any) => {
  if (r.kind === 'link' && !justNow(r.created_at)) return r.link_provider;
  if (justNow(r.created_at)) return 'Just now';
  const when = r.updated_at ? `Updated ${low(fmtDay(r.updated_at))}${byId('files', r.file_id)?.version > 1 ? ` · v${byId('files', r.file_id).version}` : ''}` : isNote(r) ? fmtDay(r.created_at) : fmtShort(r.created_at);
  if (f.kind === 'focus_batch' && r.unit_no) return `Unit ${r.unit_no} · ${low(fmtDay(r.created_at))}`;
  return r.added_by === meId() || r.updated_at ? when : `${profile(r.added_by)?.full_name} · ${when}`;
};
const FacFile = ({ r, f, off, chatId }: any) => {
  const mine = owns(r), waiting = r.upload === 'waiting', failed = r.upload === 'failed', note = isNote(r);
  if (r.upload) return (
    <Li min={68} left={<Fi l n={iconOf(r)} />} title={<T s={15} lh={20} w="500" n={1}>{r.title}</T>}
      sub={<Row gap={4}><Ms n={waiting ? 'schedule' : 'error'} s={14} col={c.caution} /><T s={12} lh={16} col={c.caution}>{waiting ? 'Waiting for connection' : "Couldn't upload"}</T></Row>}
      right={failed ? <Pill onPress={() => mut(() => { r.upload = isOffline() ? 'waiting' : null; if (!r.upload) r.created_at = Date.now(); })}>Retry</Pill> : null} />
  );
  const menu = () => (note ? openNoteMenu(r.id, chatId) : openFileMenu(r.id, chatId));
  const fresh = justNow(r.created_at) && !where('resource_views', v => v.resource_id === r.id).length, unshared = f.kind !== 'focus_batch' && !sharesOf(r.id).length;
  return (
    <Li min={68} style={{ paddingRight: 4 }} left={<Fi l n={iconOf(r)} />} title={<T s={15} lh={20} w="500" n={1}>{r.title}</T>} sub={facSub(r, f)} onPress={() => openRes(r, chatId)} onLong={mine || note ? menu : undefined}
      right={<Row gap={2}>{unshared ? <Tag>Not shared</Tag> : fresh ? <Tag green>New</Tag> : note ? null : <SeenTag r={r} oid={off?.id} chatId={chatId} />}{mine || note ? <IB n="more_vert" col={c.ink2} label={`Options for ${r.title}`} style={{ width: 40, height: 40 }} onPress={menu} /> : <IB n="share" s={20} col={c.ink2} label={`Share ${r.title}`} style={{ width: 40, height: 40 }} onPress={() => go('Res-F22-FileShare', { resourceId: r.id, chatId })} />}</Row>} />
  );
};
const FacFolder = ({ route }: any) => {
  useData(); useFlush();
  const { folder: f, off, course, dv, ch, chatId } = ctxOf(route.params);
  if (!f) return <Screen><Hdr title="Folder" /><Empty icon="folder_open" title="No files yet" /></Screen>;
  const batch = f.kind === 'focus_batch', n = batch ? batchStudents(f.chat_id).length : 0;
  const rows = facRows(f, off?.id), files = rows.filter(r => !isNote(r)), notes = rows.filter(isNote);
  const waiting = rows.find(r => r.upload === 'waiting');
  const lastYear = f.kind === 'unit' ? reuseSets(course.id).filter(s => s.folder.unit_no === f.unit_no).flatMap(s => s.rows) : [];
  return (
    <Screen>
      <Hdr title={f.name} sub={batch ? `Focus batch · ${plural(n, 'student')}` : `${course?.short} · ${dv?.name}`}
        right={batch ? <IB n="chat_bubble" label={`Open ${f.name} chat`} onPress={() => openChat(f.chat_id)} /> : <IB n="more_horiz" label="Folder options" onPress={() => openFolderMenu(f.id, chatId)} />} />
      {!rows.length ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
          <Empty icon="folder_open" title="No files yet" line={batch ? `Only these ${plural(n, 'student')} see files you add here.` : f.kind === 'unit' ? `Files you add here show up for ${dv?.name} once you publish.` : `Files you add here show up for ${dv?.name}.`} />
          <View style={{ alignItems: 'center', marginTop: -32 }}>
            <BtnP icon="add" onPress={() => openAddSheet(chatId, f.id)}>Add files</BtnP>
            {lastYear.length ? <BtnT style={{ marginTop: 4 }} onPress={() => go('Res-F19-Choose', { chatId, unitFolderId: f.id })}>{`Reuse ${plural(lastYear.length, 'file')} from ${pastYear()?.label}`}</BtnT> : null}
          </View>
        </View>
      ) : (
        <>
          {batch ? <Row gap={4} style={{ alignSelf: 'center', marginVertical: 6 }}><Ms n="lock" s={14} col={c.ink3} /><T s={12} lh={17} col={c.ink3}>Only these {plural(n, 'student')} see these files</T></Row> : null}
          <Body pad={96}>
            {files.length ? <Grp style={{ marginTop: 10 }}>{files.map(r => <FacFile key={r.id} r={r} f={f} off={off} chatId={chatId} />)}</Grp> : null}
            {notes.length ? <><Sec>From students</Sec><Grp>{notes.map(r => <FacFile key={r.id} r={r} f={f} off={off} chatId={chatId} />)}</Grp></> : null}
          </Body>
          <Fab round icon="add" label="Add files" onPress={() => openAddSheet(chatId, f.id)} />
          {waiting ? <View style={{ position: 'absolute', left: 16, right: 16, bottom: 92, borderRadius: 16, backgroundColor: c.inverse, padding: 12 }}><T s={14} lh={19} col={c.onFill}>No connection. {waiting.title} uploads when you're back online.</T></View> : null}
        </>
      )}
    </Screen>
  );
};

/* ---------- Sheets: F07, F17, F20, Move, Shared with ---------- */
const FileMenu = ({ rid, chatId }: any) => {
  useData();
  const r = byId('resources', rid), { off, dv, folder } = ctxOf({ resourceId: rid, chatId }), [ask, setAsk] = useState(false);
  if (!r) return null;
  const n = seenPct(rid, off?.id), d = sharesOf(rid).length, batch = folder?.kind === 'focus_batch';
  if (ask) return (
    <SheetBody title={`Remove ${r.title}?`}>
      <T s={14} lh={20} col={c.ink2}>Students who downloaded it keep their copy.</T>
      <View style={{ gap: 8, marginTop: 16 }}>
        {batch ? null : <BtnS onPress={() => { closeSheet(); const row = db().resource_shares.find(s => s.resource_id === rid && s.offering_id === off?.id); mut(d2 => { d2.resource_shares = d2.resource_shares.filter(s => s !== row); }); toast(`Removed from ${dv?.name}`, () => mut(() => { if (row) insert('resource_shares', row); })); }}>{`Remove from ${dv?.name}`}</BtnS>}
        <BtnS neg onPress={() => { closeSheet(); mut(() => { r.removed_at = Date.now(); }); toast(`${r.title} deleted everywhere`); }}>Delete everywhere</BtnS>
        <BtnT style={{ alignSelf: 'center' }} onPress={() => setAsk(false)}>Cancel</BtnT>
      </View>
    </SheetBody>
  );
  const nav = (stem: string, p: any) => { closeSheet(); go(stem, p); };
  const chev = (t?: string) => <Row gap={2}>{t ? <T s={13} lh={18} col={c.ink3}>{t}</T> : null}<Ms n="chevron_right" col={c.ink3} /></Row>;
  return (
    <SheetBody>
      <SheetHead left={<Fi l n={iconOf(r)} />} title={r.title} sub={<Tap label={`${n}% seen`} onPress={() => nav('Res-F09-Seen', { resourceId: rid, chatId })} style={{ flexDirection: 'row', alignItems: 'center' }}><T s={13} lh={18} w="600" col={c.greenText}>{n}% seen</T><Ms n="chevron_right" s={16} col={c.greenText} /></Tap>} />
      <BtnS icon="share" onPress={() => nav('Res-F22-FileShare', { resourceId: rid, chatId })}>Share</BtnS>
      <View style={{ marginTop: 8 }}>
        {batch ? null : <SheetRow label="Move" right={chev(short(folder))} onPress={() => openSheet(() => <MoveSheet rid={rid} />)} />}
        {batch ? null : <SheetRow label="Shared with" right={chev(plural(d, 'division'))} onPress={() => openSharedWith(rid)} />}
        <SheetRow label="Rename" right={chev()} onPress={() => openSheet(() => <NameSheet title="Rename" init={r.title} action="Save" onSave={(t: string) => mut(() => { r.title = t; })} />)} />
        {r.kind === 'file' ? <SheetRow label="Upload new version" right={chev()} onPress={() => nav('Res-F08-Replace', { resourceId: rid, chatId })} /> : null}
      </View>
      <BtnT neg style={{ alignSelf: 'center', marginTop: 4 }} onPress={() => setAsk(true)}>Remove file</BtnT>
    </SheetBody>
  );
};
export const openFileMenu = (rid: string, chatId?: string) => openSheet(() => <FileMenu rid={rid} chatId={chatId} />);
const MoveSheet = ({ rid }: any) => {
  useData();
  const r = byId('resources', rid), from = byId('folders', r.folder_id), [to, setTo] = useState(r.folder_id), dest = byId('folders', to);
  return (
    <SheetBody title="Move">
      {courseFolders(from.course_id).filter(f => f.kind === 'unit' || f.kind === 'custom').map(f => <SheetRow key={f.id} icon="folder" fill label={f.name} onPress={() => setTo(f.id)} right={<Ck on={to === f.id} />} />)}
      <BtnP style={{ marginTop: 12 }} disabled={to === r.folder_id} onPress={() => { closeSheet(); mut(() => { r.folder_id = to; }); toast(`Moved to ${dest.name}`, () => mut(() => { r.folder_id = from.id; })); }}>{`Move to ${short(dest)}`}</BtnP>
    </SheetBody>
  );
};
const openSharedWith = (rid: string) => {
  const f = byId('folders', byId('resources', rid)?.folder_id), offs = myOfferings(f?.course_id);
  openSheet(() => <DivSheet offs={offs} value={sharesOf(rid).map(s => s.offering_id)} onDone={(on: string[]) => {
    const before = sharesOf(rid);
    mut(d => {
      d.resource_shares = d.resource_shares.filter(s => s.resource_id !== rid || on.includes(s.offering_id));
      on.forEach(o => { if (!isShared(rid, o)) insert('resource_shares', { resource_id: rid, offering_id: o, shared_at: Date.now(), shared_by: meId() }); if (!isPub(f.id, o)) setPub(f.id, o, true); });
    });
    toast(`Shared with ${plural(on.length, 'division')}`, () => mut(d => { d.resource_shares = [...d.resource_shares.filter(s => s.resource_id !== rid), ...before]; }));
  }} />);
};
const FolderMenu = ({ fid, chatId }: any) => {
  useData();
  const f = byId('folders', fid), { off, dv } = ctxOf({ folderId: fid, chatId });
  const pub = isPub(fid, off?.id), n = fileCount(f, off?.id);
  return (
    <SheetBody>
      <SheetHead left={<Fo />} title={f.name} sub={`${plural(n, 'file')} · ${pub ? 'published' : 'not published'}`} />
      {pub ? <BtnS icon="share" onPress={() => { closeSheet(); go('Res-F18-FolderShare', { folderId: fid, chatId }); }}>Share</BtnS> : null}
      <View style={{ marginTop: 8 }}>
        {f.kind !== 'custom' ? null : <SheetRow label="Rename" right={<Ms n="chevron_right" col={c.ink3} />} onPress={() => openSheet(() => <NameSheet title="Rename" init={f.name} action="Save" onSave={(t: string) => mut(() => { f.name = t; })} />)} />}
        {pub ? <SheetRow label="Unpublish" right={<Ms n="chevron_right" col={c.ink3} />} onPress={() => { closeSheet(); mut(() => setPub(fid, off.id, false)); toast(`${short(f)} hidden from ${dv?.name}`, () => mut(() => setPub(fid, off.id, true))); }} />
          : <SheetRow label="Publish" right={<Ms n="chevron_right" col={c.ink3} />} onPress={() => { closeSheet(); publish(f, off.id, chatId); }} />}
      </View>
    </SheetBody>
  );
};
export const openFolderMenu = (fid: string, chatId?: string) => openSheet(() => <FolderMenu fid={fid} chatId={chatId} />);
const NoteMenu = ({ rid, chatId }: any) => {
  useData();
  const r = byId('resources', rid), { off, dv, folder } = ctxOf({ resourceId: rid, chatId }), [ask, setAsk] = useState(false);
  if (!r) return null;
  const who = profile(r.added_by), first = who?.full_name?.split(' ')[0];
  if (ask) return (
    <SheetBody title={`Remove ${first}’s note?`}>
      <T s={14} lh={20} col={c.ink2}>It leaves {short(folder)} for {dv?.name}. {first} gets a notification.</T>
      <View style={{ gap: 8, marginTop: 16 }}>
        <BtnS neg onPress={() => { closeSheet(); mut(() => { r.removed_at = Date.now(); notify(r.added_by, 'note_removed', { folder_id: r.folder_id, chat_id: chatId, text: `Your note ${r.title} was removed from ${short(folder)}` }); }); toast('Note removed'); }}>Remove note</BtnS>
        <BtnT style={{ alignSelf: 'center' }} onPress={() => setAsk(false)}>Cancel</BtnT>
      </View>
    </SheetBody>
  );
  return (
    <SheetBody>
      <SheetHead left={<Fi l n={iconOf(r)} />} title={r.title} sub={`Added by ${who?.full_name} · ${seenPct(rid, off?.id)}% seen`} />
      <BtnS icon="share" onPress={() => { closeSheet(); go('Res-F22-FileShare', { resourceId: rid, chatId }); }}>Share</BtnS>
      <View style={{ marginTop: 8 }}>
        <SheetRow label="Move to course files" right={<Ms n="chevron_right" col={c.ink3} />} onPress={() => { closeSheet(); mut(() => { r.added_by_role = 'faculty'; r.moved_by = meId(); }); toast(`${r.title} moved to course files`, () => mut(() => { r.added_by_role = 'student'; r.moved_by = null; })); }} />
        <SheetRow label={`Message ${who?.full_name}`} right={<Ms n="chevron_right" col={c.ink3} />} onPress={() => { closeSheet(); openDm(r.added_by); }} />
      </View>
      <BtnT neg style={{ alignSelf: 'center', marginTop: 4 }} onPress={() => setAsk(true)}>Remove note</BtnT>
    </SheetBody>
  );
};
export const openNoteMenu = (rid: string, chatId?: string) => openSheet(() => <NoteMenu rid={rid} chatId={chatId} />);

/* ---------- Res-F08-Replace ---------- */
const Replace = ({ route }: any) => {
  useData();
  const { resourceId, chatId, picked } = route.params || {}, r = byId('resources', resourceId), file = byId('files', r?.file_id);
  const [pick, setPick] = useState<any>(picked), [note, setNote] = useState(''), [tell, setTell] = useState(false);
  if (!r) return <Screen><Hdr title="New version" /></Screen>;
  const word = /presentation|ppt/.test(file?.mime) ? 'slide' : 'page', pages = pick?.pages?.length || file?.page_count, d = sharesOf(r.id).length;
  const change = () => openSheet(() => (
    <SheetBody title="Pick a file">
      <SheetRow icon="description" label="File" onPress={async () => { closeSheet(); const fs = await pickFiles('file'); if (fs[0]) setPick(fs[0]); }} />
      <SheetRow icon="add_to_drive" label="Drive" onPress={async () => { closeSheet(); const fs = await pickFiles('file'); if (fs[0]) setPick(fs[0]); }} />
      <SheetRow icon={iconOfMime(file?.mime)} label={`${r.title} final${file?.name.match(/\.[^.]+$/)?.[0] || ''}`} sub="Sample file" onPress={() => { closeSheet(); setPick({ name: `${r.title} final${file?.name.match(/\.[^.]+$/)?.[0] || ''}`, size: Math.round(file.size_bytes * 1.1), mime: file.mime }); }} />
    </SheetBody>
  ));
  const upload = () => {
    if (isOffline()) return toast(`No connection. ${pick.name} uploads when you're back online.`); // ponytail: blocks instead of queueing new versions offline; first uploads do queue.
    const now = Date.now(), v = (file.version || 1) + 1;
    mut(() => {
      Object.assign(file, { name: pick.name, size_bytes: pick.size, sha256: sha(pick.name, pick.size), version: v, uri: pick.uri ?? file.uri });
      insert('file_versions', { file_id: file.id, version_no: v, page_count: pages, change_note: note.trim() || null, created_at: now });
      r.updated_at = now; r.change_note = note.trim() || null;
      where('resource_views', x => x.resource_id === r.id).forEach(x => { x.stale = true; x.downloaded_at = null; });
    });
    if (tell) sharesOf(r.id).forEach(s => { const cid = db().chats.find(ch => ch.kind === 'course' && ch.offering_id === s.offering_id)?.id; if (cid) sendMessage({ chatId: cid, kind: 'file', resource_id: r.id, body: note.trim() ? `New version: ${note.trim()}` : 'New version' }); });
    back(); toast('New version uploaded');
  };
  return (
    <Screen>
      <CloseHdr title="New version" />
      <Body pad={12}>
        <Grp style={{ marginTop: 6 }}>
          <Li min={64} left={<Fi l n={iconOf(r)} />} title={<T s={15} lh={20} w="500" n={1}>{file?.name}</T>} sub={`v${file?.version || 1} · ${plural(file?.page_count, word)}`} />
          {pick ? <Li min={64} left={<Fi l n={iconOfMime(pick.mime)} />} title={<T s={15} lh={20} w="500" n={1}>{pick.name}</T>} sub={`Becomes v${(file?.version || 1) + 1} · ${plural(pages, word)}`} right={<BtnT onPress={change}>Change</BtnT>} />
            : <Li min={64} left={<Fi l n="upload_file" />} title="Pick a file" onPress={change} chevron />}
        </Grp>
        <T s={13} lh={18} w="600" col={c.ink2} style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 6 }}>What changed</T>
        <Field aria-label="What changed" placeholder="e.g. slides 12–18" value={note} onChangeText={setNote} style={{ marginHorizontal: 16 }} />
        <Grp style={{ marginTop: 16 }}>
          <Li title="Tell students" sub={tell ? 'In each division’s chat' : 'They’ll see “Updated” on the file'} right={<Sw on={tell} onChange={setTell} label="Tell students" />} />
          <Li title="Shared with" right={<CountEnd n={plural(d, 'division')} />} chevron onPress={() => openSharedWith(r.id)} />
        </Grp>
      </Body>
      <View style={{ padding: 16, paddingBottom: 16 + useBottom() }}><BtnP disabled={!pick} onPress={upload}>Upload new version</BtnP></View>
    </Screen>
  );
};

/* ---------- Res-F09-Seen ---------- */
const Seen = ({ route }: any) => {
  useData();
  const { resourceId, chatId } = route.params || {}, { res: r, off, dv, ch } = ctxOf({ resourceId, chatId });
  const [q, setQ] = useState(''), [moreA, setMoreA] = useState(false), [moreB, setMoreB] = useState(false);
  if (!r) return <Screen><Hdr title="Seen by" /></Screen>;
  const aud = audience(r, off?.id), views = viewsOf(r, aud), vBy = new Map(views.map(v => [v.user_id, v]));
  const hit = (u: any) => !q || (u.full_name || '').toLowerCase().includes(q.toLowerCase());
  const rank = (u: any) => (u.img ? 0 : 1);
  const notSeen = aud.filter(u => !vBy.has(u.id)).sort((a, b) => rank(a) - rank(b));
  const seen = aud.filter(u => vBy.has(u.id)).sort((a, b) => stamp(vBy.get(b.id)) - stamp(vBy.get(a.id)));
  const n = pct(seen.length, aud.length), last = where('resource_reminders', x => x.resource_id === r.id && x.offering_id === off?.id).pop();
  const when = (t: number) => (dayDiff(t) === 0 ? fmtClock(t) : `${fmtDay(t)}, ${fmtClock(t)}`);
  const remind = () => mut(() => {
    insert('resource_reminders', { resource_id: r.id, offering_id: off?.id, sent_by: meId(), sent_at: Date.now(), recipient_count: notSeen.length });
    notifyPeople(notSeen.map(u => u.id), 'resource_reminder', { resource_id: r.id, chat_id: chatId, text: `Reminder: open ${r.title}` });
  });
  const list = (xs: any[], more: boolean, setMore: any, right: (u: any) => any) => {
    const fs = xs.filter(hit), shown = more || q ? fs : fs.slice(0, 3);
    return (
      <Grp>
        {shown.map(u => <Li key={u.id} left={<Pic img={u.img} name={u.full_name} size={36} />} title={u.full_name} right={right(u)} onPress={() => openDm(u.id)} />)}
        {!more && !q && fs.length > 3 ? <Li title={<Inner col={c.greenText}>{`See all ${fs.length}`}</Inner>} onPress={() => setMore(true)} /> : null}
      </Grp>
    );
  };
  return (
    <Screen>
      <Hdr title="Seen by" sub={`${r.title} · ${ch?.kind === 'focus_batch' ? ch.name : dv?.name}`} />
      <T v s={28} lh={36} style={{ marginHorizontal: 16, marginTop: 6 }}>{n}% seen</T>
      <SearchBar placeholder="Search students" value={q} onChange={setQ} />
      <Body>
        {notSeen.length ? (
          <>
            <Sec right={Date.now() - (last?.sent_at || 0) < 3600e3 ? <Tag green icon="check">Reminded just now</Tag> : <Pill icon="notifications" onPress={remind}>{`Remind ${plural(notSeen.length, 'student')}`}</Pill>}>Not seen yet {notSeen.length}</Sec>
            {list(notSeen, moreA, setMoreA, u => (u.has_app === false ? <T s={13} lh={18} col={c.ink3}>Never signed in</T> : null))}
          </>
        ) : null}
        <Sec>Seen by {seen.length}</Sec>
        {seen.length ? list(seen, moreB, setMoreB, u => { const v: any = vBy.get(u.id); return <T s={13} lh={18} col={c.ink3}>{v.downloaded_at ? `Downloaded ${when(v.downloaded_at)}` : `Opened ${when(v.opened_at)}`}</T>; }) : null}
      </Body>
    </Screen>
  );
};
const stamp = (v: any) => Math.max(v?.downloaded_at || 0, v?.opened_at || 0);

/* ---------- Share, F18 + F22: a file or folder to any chat, group or person ---------- */
const KIND_LABEL: any = { course: 'Course chat', focus_batch: 'Focus batch', class_group: 'Class group', group: 'Group', club: 'Club', dm: 'Direct message' };
const KIND_RANK: any = { course: 0, focus_batch: 1, class_group: 2, group: 3, club: 4, dm: 5 };
const ShareInChat = ({ route }: any) => {
  useData();
  const { resourceId, folderId, chatId } = route.params || {}, { res: r, folder } = ctxOf({ resourceId, folderId, chatId });
  const f = folderId ? folder : null;
  const [on, setOn] = useState<string[]>([]), [ppl, setPpl] = useState<string[]>([]), [msg, setMsg] = useState(''), [q, setQ] = useState('');
  const k = q.trim().toLowerCase(), has = (x?: string) => !k || (x || '').toLowerCase().includes(k);
  const chats = where('chats', x => !!memberOf(x.id) && x.status === 'active' && has(chatTitle(x))).sort((x, y) => (x.id === chatId ? -1 : y.id === chatId ? 1 : KIND_RANK[x.kind] - KIND_RANK[y.kind]));
  const dmWith = new Set(where('chats', x => x.kind === 'dm' && !!memberOf(x.id)).map(x => otherMember(x.id)?.id));
  const roster = chatId ? members(chatId).map(m => profile(m.user_id)) : [];
  const people = (k ? where('profiles', u => has(u.full_name)) : roster).filter(u => u && u.id !== meId() && !dmWith.has(u.id)).slice(0, k ? 20 : 8);
  const file = byId('files', r?.file_id), word = /presentation|ppt/.test(file?.mime) ? 'slide' : 'page', n = on.length + ppl.length;
  const flip = (l: string[], id: string) => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]);
  const send = () => {
    const ids = [...on, ...ppl.map(ensureDm)];
    ids.forEach(id => {
      if (f) sendMessage({ chatId: id, kind: 'resource_folder', folder_id: f.id, body: msg.trim() || f.name });
      else {
        sendMessage({ chatId: id, kind: 'file', resource_id: r.id, body: msg.trim() });
        const o = byId('chats', id)?.offering_id;
        if (byId('chats', id)?.kind === 'course' && o && !isShared(r.id, o)) mut(() => { insert('resource_shares', { resource_id: r.id, offering_id: o, shared_at: Date.now(), shared_by: meId() }); });
      }
    });
    celebrate();
    toast(`Shared with ${n === 1 ? (ppl.length ? profile(ppl[0])?.full_name : chatTitle(byId('chats', on[0]))) : `${n} chats and people`}`);
    back(); if (ids.length === 1) openChat(ids[0]);
  };
  const chatRow = (x: any) => {
    const other = x.kind === 'dm' ? otherMember(x.id) : null, sub = x.kind === 'course' ? `${KIND_LABEL.course} · ${byId('divisions', x.division_id)?.name}` : x.kind === 'dm' ? (other?.role === 'faculty' ? 'Faculty' : 'Student') : `${KIND_LABEL[x.kind] || 'Chat'} · ${members(x.id).length} people`;
    return <Li key={x.id} left={<Pic size={40} img={x.img || other?.img} name={chatTitle(x)} shape={other ? 'round' : 'course'} />} title={chatTitle(x) || 'Chat'} sub={sub} right={<Ck on={on.includes(x.id)} />} onPress={() => setOn(flip(on, x.id))} />;
  };
  return (
    <Screen>
      <CloseHdr title={f ? 'Share folder' : 'Share file'} />
      <Row gap={12} style={{ marginHorizontal: 16, marginTop: 4, padding: 12, borderRadius: 16, backgroundColor: c.blueSoft }}>
        {f ? <Fo /> : <Fi l n={iconOf(r)} />}
        <View style={{ flex: 1 }}>
          <T s={15} lh={20} w="600" n={1}>{f ? f.name : r?.title}</T>
          <T s={12} lh={16} col={c.ink2}>{f ? plural(resourcesIn(f.id).length, 'file') : `${short(folder)}${file ? ` · ${plural(file.page_count, word)}` : ''}`}</T>
        </View>
      </Row>
      <SearchBar placeholder="Search people, groups and chats" value={q} onChange={setQ} />
      <Body pad={12}>
        {chats.length ? <><Sec>Chats and groups</Sec><Grp>{chats.slice(0, k ? 30 : 12).map(chatRow)}</Grp></> : null}
        {people.length ? <><Sec>{k ? 'People' : 'People in this class'}</Sec><Grp>{people.map(u => <Li key={u.id} left={<Pic size={40} img={u.img} name={u.full_name} fac={u.role === 'faculty'} />} title={u.full_name} sub={u.role === 'faculty' ? 'Faculty' : u.class_label || 'Student'} right={<Ck on={ppl.includes(u.id)} />} onPress={() => setPpl(flip(ppl, u.id))} />)}</Grp></> : null}
        {!chats.length && !people.length ? <Empty icon="search" title={`No one matches “${q.trim()}”`} /> : null}
      </Body>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 + useBottom(), gap: 8, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.page }}>
        {n ? <Field aria-label="Message" placeholder="Add a message (optional)" value={msg} onChangeText={setMsg} /> : null}
        <BtnP disabled={!n} icon="send" onPress={send}>{n ? `Share with ${n === 1 ? '1' : n}` : 'Pick who to share with'}</BtnP>
      </View>
    </Screen>
  );
};

/* ---------- Reuse: F10, F19, 8.7 ---------- */
/** Union of last year's resources for this course, deduped by sha256, minus what this year already has. */
function reuseSets(courseId: string) {
  const py = pastYear()?.id; if (!py) return [];
  const have = new Set(courseFolders(courseId).flatMap(f => resourcesIn(f.id)).map(r => r.file_id));
  const shas = new Set<string>();
  return courseFolders(courseId, py).map(folder => ({
    folder,
    rows: resourcesIn(folder.id).filter(r => {
      if (have.has(r.file_id)) return false;
      const s = byId('files', r.file_id)?.sha256 || r.id; if (shas.has(s)) return false;
      shas.add(s); return true;
    }),
  })).filter(s => s.rows.length);
}
const needsReuse = (courseId: string) =>
  !where('course_year_prefs', p => p.course_id === courseId && p.year_id === curYear()).length
  && !courseFolders(courseId).some(f => f.kind !== 'focus_batch' && resourcesIn(f.id).length)
  && reuseSets(courseId).length > 0;
function doReuse(ids: string[], courseId: string) {
  const now = Date.now();
  mut(d => {
    reuseSets(courseId).forEach(({ folder, rows }) => {
      const picked = rows.filter(r => ids.includes(r.id)); if (!picked.length) return;
      let to = courseFolders(courseId).find(f => (folder.kind === 'unit' ? f.unit_no === folder.unit_no : f.name === folder.name));
      if (!to) to = insert('folders', { id: newId('fld'), course_id: courseId, academic_year_id: curYear(), kind: folder.kind, unit_no: folder.unit_no, unit_id: folder.unit_id, name: folder.name, owner_id: meId(), sort: folder.sort });
      picked.forEach(r => insert('resources', { ...r, id: newId('res'), folder_id: to.id, added_by: meId(), source: 'reuse', reused_from_id: r.id, created_at: now - 3600e3, updated_at: null, removed_at: null }));
    });
  });
}
/** ponytail: testers can't switch the seed's year, so this empties the course's current year at runtime; Reset demo data undoes it. */
function startReuseDemo(courseId: string) {
  mut(d => {
    courseFolders(courseId).filter(f => f.kind !== 'focus_batch').forEach(f => { f.academic_year_id = 'archived-demo'; });
    d.course_year_prefs = where('course_year_prefs', p => p.course_id !== courseId);
    where('syllabus_units', u => u.course_id === courseId).forEach(u => insert('folders', { id: `${newId('fld')}-u${u.number}`, course_id: courseId, academic_year_id: curYear(), kind: 'unit', unit_id: u.id, unit_no: u.number, name: `Unit ${u.number} · ${u.title}`, owner_id: meId(), sort: u.number }));
    insert('folders', { id: newId('fld'), course_id: courseId, academic_year_id: curYear(), kind: 'shared_in_chat', name: 'Shared in chat', owner_id: meId(), sort: 99 });
  });
}
const FadeIn = ({ delay, children }: any) => {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: 1, duration: 380, delay, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start(); }, []);
  return <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>{children}</Animated.View>;
};
/** The bee's flight: a dashed loop beside the heading (static, from the design). */
const BeeFlight = () => (
  <View pointerEvents="none" style={{ position: 'absolute', right: 18, top: 10 }}>
    <Svg width={96} height={64} viewBox="0 0 96 64">
      <Path d="M4 58 C 18 50, 30 40, 34 26 C 38 12, 54 6, 58 16 C 62 28, 46 34, 42 24 C 38 12, 62 6, 92 6" fill="none" stroke={c.ink3} strokeWidth={1.6} strokeDasharray="4 5" strokeLinecap="round" />
    </Svg>
  </View>
);
/** A folder arriving: slides up, fades in, and its file count fills to the real number. */
const ArrivingFolder = ({ icon = 'folder', mut: muted, title, n, delay }: any) => {
  const a = useRef(new Animated.Value(0)).current, [k, setK] = useState(0);
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    let i = 0, id: any; const t = setTimeout(() => { id = setInterval(() => { i += 1; setK(Math.min(i, n)); if (i >= n) clearInterval(id); }, Math.max(30, 360 / n)); }, delay + 120);
    return () => { clearTimeout(t); clearInterval(id); };
  }, []);
  return (
    <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
      <Row gap={12} style={{ minHeight: 52, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: muted ? c.sunken : c.greenWash, alignItems: 'center', justifyContent: 'center' }}><Ms n={icon} s={18} fill={!muted} col={muted ? c.ink2 : c.greenText} /></View>
        <T s={15} lh={20} n={1} style={{ flex: 1 }}>{title}</T>
        <T s={13} lh={18} col={c.ink3}>{k}</T>
      </Row>
    </Animated.View>
  );
};
/** Res-F10: reuse last year's files for this course. Last year's folders arrive one by one in a stacked card. */
const NewSemBody = ({ chatId, course, stem }: any) => {
  const sets = reuseSets(course.id), total = sets.reduce((k, s) => k + s.rows.length, 0), top = sets.slice(0, 4), rest = sets.slice(4);
  const owner = profile(sets[0]?.folder.owner_id), mine = owner?.id === meId(), yr = pastYear()?.label;
  const reuse = (ids: string[]) => { doReuse(ids, course.id); swap('Res-F11-Hidden', { chatId }); toast(`${plural(ids.length, 'file')} added. Publish a folder when students should see it.`); };
  const option = (icon: string, label: string, onPress: () => void) => (
    <Li left={<View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.sunken, alignItems: 'center', justifyContent: 'center' }}><Ms n={icon} s={20} col={c.ink2} /></View>} title={<T s={15} lh={20} w="600">{label}</T>} chevron onPress={onPress} />
  );
  return (
    <Screen>
      <PlaceShell chatId={chatId} tab="Resources" stem={stem}>
        <Body>
          <View style={{ paddingHorizontal: 20, paddingTop: 22 }}>
            <BeeFlight />
            <T s={24} lh={31} w="600" style={{ paddingRight: 96 }}>{`Reuse existing ${course.short} resources?`}</T>
            <T s={14} lh={20} col={c.ink2} style={{ marginTop: 8 }}>{`${mine || !owner ? `From when you taught it in ${yr}` : `From ${owner.full_name}’s ${course.short} in ${yr}`}. Students see them only when you publish.`}</T>
          </View>
          <View style={{ marginHorizontal: 16, marginTop: 20 }}>
            {/* Two sheets peeking under the card: a stack of last year's files. */}
            <View style={{ position: 'absolute', left: 14, right: 14, bottom: -12, height: 40, borderRadius: 18, backgroundColor: c.surface, boxShadow: '0 0 0 1px rgba(16,24,40,.06)' } as any} />
            <View style={{ position: 'absolute', left: 7, right: 7, bottom: -6, height: 40, borderRadius: 18, backgroundColor: c.surface, boxShadow: '0 0 0 1px rgba(16,24,40,.06)' } as any} />
            <View style={{ padding: 10, borderRadius: 20, backgroundColor: c.surface, boxShadow: '0 0 0 1px rgba(16,24,40,.06), 0 8px 20px -12px rgba(16,24,40,.25)' } as any}>
              {top.map((s, i) => <ArrivingFolder key={s.folder.id} title={s.folder.name} n={s.rows.length} delay={180 + i * 160} />)}
              {rest.length ? <ArrivingFolder icon="more_horiz" mut title={plural(rest.length, 'more folder')} n={rest.reduce((k, s) => k + s.rows.length, 0)} delay={180 + top.length * 160} /> : null}
              <BtnP style={{ marginTop: 12, height: 52 }} onPress={() => reuse(sets.flatMap(s => s.rows.map(r => r.id)))}>{`Reuse all ${total} files`}</BtnP>
            </View>
          </View>
          <Grp style={{ marginTop: 28 }}>
            {option('checklist', 'Choose files', () => go('Res-F19-Choose', { chatId }))}
            {option('add', 'Start fresh', () => mut(() => { insert('course_year_prefs', { course_id: course.id, year_id: curYear(), fresh: true }); }))}
          </Grp>
        </Body>
      </PlaceShell>
    </Screen>
  );
};
const NewSem = ({ route }: any) => {
  useData();
  const { chatId, reuse_demo } = route.params || {}, { course } = ctxOf({ chatId });
  useEffect(() => { if (reuse_demo && course && !needsReuse(course.id)) startReuseDemo(course.id); }, []);
  if (!course) return <Screen><PlaceShell chatId={chatId} tab="Resources" stem="Res-F10-NewSem" /></Screen>;
  return needsReuse(course.id) ? <NewSemBody chatId={chatId} course={course} stem="Res-F10-NewSem" /> : <FacTab route={route} stem="Res-F01-Tab" />;
};
const Choose = ({ route }: any) => {
  useData();
  const { chatId, unitFolderId } = route.params || {}, { course } = ctxOf({ chatId }), unit = byId('folders', unitFolderId);
  const sets = course ? reuseSets(course.id).filter(s => !unit || s.folder.unit_no === unit.unit_no) : [];
  const allIds = sets.flatMap(s => s.rows.map(r => r.id));
  const [on, setOn] = useState<string[]>(allIds), [open, setOpen] = useState<string | null>(unit ? sets[0]?.folder.id : null);
  const toggle = (ids: string[], v: boolean) => setOn(v ? [...new Set([...on, ...ids])] : on.filter(i => !ids.includes(i)));
  const all = on.length === allIds.length;
  return (
    <Screen>
      <Row gap={8} style={{ minHeight: 52, paddingHorizontal: 16 }}>
        <BtnT onPress={back}>Cancel</BtnT>
        <View style={{ flex: 1, alignItems: 'center' }}><T v s={16} lh={21}>{on.length} of {allIds.length}</T><T s={12} lh={16} col={c.ink3}>{course?.short} · {pastYear()?.label}</T></View>
        <BtnT onPress={() => setOn(all ? [] : allIds)}>{all ? 'Clear' : 'All'}</BtnT>
      </Row>
      <Body pad={12}>
        <Grp style={{ marginTop: 6 }}>
          {sets.map(({ folder, rows }) => {
            const ids = rows.map(r => r.id), k = ids.filter(i => on.includes(i)).length, exp = open === folder.id;
            return (
              <View key={folder.id}>
                <Row style={{ paddingLeft: 14 }}>
                  <Tap label={`Tick ${folder.name}`} onPress={() => toggle(ids, k !== ids.length)} style={{ paddingVertical: 12, paddingRight: 12 }}>
                    {k && k < ids.length ? <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center' }}><Ms n="remove" s={16} col={c.onFill} /></View> : <Ck sq on={k === ids.length} />}
                  </Tap>
                  <Li style={{ flex: 1, paddingLeft: 0 }} title={folder.name} right={<Row gap={2}><CountEnd n={`${k} of ${ids.length}`} /><Ms n={exp ? 'expand_less' : 'expand_more'} col={c.ink3} /></Row>} onPress={() => setOpen(exp ? null : folder.id)} />
                </Row>
                {exp ? rows.map(r => <Li key={r.id} style={{ paddingLeft: 40 }} left={<Ck sq on={on.includes(r.id)} />} title={r.title} onPress={() => toggle([r.id], !on.includes(r.id))} />) : null}
              </View>
            );
          })}
        </Grp>
      </Body>
      <View style={{ padding: 16, paddingBottom: 16 + useBottom() }}>
        <BtnP disabled={!on.length} onPress={() => { const k = on.length; doReuse(on, course.id); swap('Res-F11-Hidden', { chatId }); toast(`${plural(k, 'file')} added. Publish a folder when students should see it.`); }}>{`Reuse ${plural(on.length, 'file')}`}</BtnP>
      </View>
    </Screen>
  );
};

/* ---------- Student tab, folder, notes ---------- */
const StuTab = ({ route, stem }: any) => {
  useData();
  const { chatId } = route.params || {}, { off, course, dv } = ctxOf({ chatId });
  if (!course) return <Screen><PlaceShell chatId={chatId} tab="Resources" stem={stem} /></Screen>;
  const fs = courseFolders(course.id).filter(f => f.kind === 'unit' || f.kind === 'custom').filter(f => isPub(f.id, off.id));
  const units = fs.filter(f => f.kind === 'unit'), custom = fs.filter(f => f.kind === 'custom');
  const shared = courseFolders(course.id).find(f => f.kind === 'shared_in_chat'), sharedRows = shared ? stuRows(shared, off.id) : [];
  const batches = where('chats', ch => ch.kind === 'focus_batch' && ch.status !== 'closed' && ch.offering_id === off.id && !!memberOf(ch.id));
  if (!fs.length && !sharedRows.length) return (
    <Screen><PlaceShell chatId={chatId} tab="Resources" stem={stem}><Empty icon="folder_open" title="No resources yet" line={`Files ${facultyName(off.id)} publishes for ${dv?.name} show up here.`} /></PlaceShell></Screen>
  );
  const all = [...fs, ...(shared ? [shared] : [])].flatMap(f => stuRows(f, off.id).map(r => ({ r, f })));
  const fresh = all.filter(x => isNew(x.r)).sort((a, b) => changed(b.r) - changed(a.r)).slice(0, 3);
  const row = (f: any, icon = 'folder', mut2 = false) => {
    const rows = stuRows(f, off.id), k = rows.filter(isNew).length;
    return <Li key={f.id} left={<Fo n={icon} mut={mut2} />} title={f.name} right={k ? <Badge label={`${k} new`} /> : <CountEnd n={rows.filter(r => !isNote(r)).length} />} chevron onPress={() => go('Res-S02-Folder', { folderId: f.id, chatId })} />;
  };
  return (
    <Screen>
      <PlaceShell chatId={chatId} tab="Resources" stem={stem}>
        <SearchBar placeholder={`Search ${course.short} files`} onPress={() => go('Res-S06-Search', { chatId })} />
        <Body>
          {fresh.length ? <Sec>New</Sec> : null}
          {fresh.length ? <Grp>{fresh.map(({ r, f }) => <Li key={r.id} min={64} left={<Fi l n={iconOf(r)} />} title={<T s={15} lh={20} w="500" n={1}>{r.title}</T>} sub={<Row gap={4}><Ms n={f.kind === 'shared_in_chat' ? 'forum' : 'folder'} s={14} col={c.ink3} /><T s={12} lh={16} col={c.ink3} n={1} style={{ flexShrink: 1 }}>{`${f.kind === 'shared_in_chat' ? 'Shared in chat' : f.name} · ${r.updated_at ? 'updated ' : ''}${low(fmtDay(changed(r)))}`}</T></Row>} onPress={() => openRes(r, chatId)} />)}</Grp> : null}
          <Sec>Folders</Sec>
          <Grp>
            {units.map(f => row(f))}
            {batches.map(ch => { const f = db().folders.find(x => x.chat_id === ch.id); return <Li key={ch.id} left={<Fo n="filter_center_focus" />} title={ch.name} right={<CountEnd n={f ? resourcesIn(f.id).length : 0} />} chevron onPress={() => go('Chat-F15R-BreakoutResources', { chatId: ch.id })} />; })}
            {custom.map(f => row(f))}
            {sharedRows.length ? row(shared, 'forum', true) : null}
          </Grp>
        </Body>
      </PlaceShell>
    </Screen>
  );
};
const stuSub = (r: any) => {
  if (r.kind === 'link') return { t: `${(r.link_provider || '').split(' · ')[0]}${r.link_duration ? ` · ${parseInt(r.link_duration, 10)} min` : ''}` };
  if (isNew(r)) return { t: `${r.updated_at ? 'Updated' : 'New'} · ${low(fmtDay(changed(r)))}`, on: true };
  return { t: fmtShort(changed(r)) };
};
const StuFolder = ({ route }: any) => {
  useData();
  const bottom = useBottom(), { folder: f, off, chatId } = ctxOf(route.params), [sel, setSel] = useState<string[] | null>(null);
  if (!f) return <Screen><Hdr title="Folder" /><Empty icon="folder_open" title="No files here yet" /></Screen>;
  const rows = stuRows(f, off?.id), files = rows.filter(r => !isNote(r)), notes = rows.filter(isNote), fileOnly = files.filter(r => r.kind === 'file');
  const canNotes = f.kind === 'unit' || f.kind === 'custom';
  const addNotes = () => openSheet(() => <NotesSheet folderId={f.id} chatId={chatId} />);
  const size = (ids: string[]) => ids.reduce((n, id) => n + (byId('files', byId('resources', id)?.file_id)?.size_bytes || 0), 0);
  const done = (r: any) => { const v = myView(r.id); return v && !v.stale && v.downloaded_at; };
  const row = (r: any, sub: any) => (
    <Li key={r.id} min={64} left={<Fi l n={iconOf(r)} />} title={<T s={15} lh={20} w="500" n={1}>{r.title}</T>} sub={sub} onPress={() => openRes(r, chatId)} right={done(r) ? <Ms n="download_done" col={c.greenText} /> : null} />
  );
  if (sel) return (
    <Screen>
      <Row gap={8} style={{ minHeight: 52, paddingHorizontal: 16 }}>
        <BtnT onPress={() => setSel(null)}>Cancel</BtnT>
        <T v s={16} lh={21} style={{ flex: 1, textAlign: 'center' }}>{sel.length} selected</T>
        <BtnT onPress={() => setSel(fileOnly.map(r => r.id))}>Select all</BtnT>
      </Row>
      <Body pad={12}>
        <Grp style={{ marginTop: 6 }}>
          {fileOnly.map(r => <Li key={r.id} left={<Ck on={sel.includes(r.id)} />} title={r.title} right={<CountEnd n={fmtSize(byId('files', r.file_id)?.size_bytes || 0)} />} onPress={() => setSel(sel.includes(r.id) ? sel.filter(i => i !== r.id) : [...sel, r.id])} />)}
        </Grp>
      </Body>
      {sel.length ? <View style={{ padding: 16, paddingBottom: 16 + bottom }}><BtnP onPress={() => {
        if (isOffline()) return toast(`Couldn't download ${byId('resources', sel[0])?.title} · Retry`);
        sel.forEach(id => markViewed(id, 'downloaded')); toast(`Downloaded ${plural(sel.length, 'file')}`); setSel(null);
      }}>{`Download ${plural(sel.length, 'file')} · ${fmtSize(size(sel))}`}</BtnP></View> : null}
    </Screen>
  );
  return (
    <Screen>
      <Hdr title={f.name} right={<><IB n="share" label={`Share ${f.name}`} onPress={() => go('Res-F18-FolderShare', { folderId: f.id, chatId })} />{fileOnly.length ? <BtnT style={{ paddingHorizontal: 10 }} onPress={() => setSel([])}>Select</BtnT> : null}</>} />
      {!rows.length ? <Empty icon="folder_open" title="No files here yet" line={`${facultyName(off?.id)} hasn't added files to ${f.name}.`} action={canNotes ? 'Add notes' : undefined} onAction={addNotes} /> : (
        <Body>
          {files.length ? <Grp style={{ marginTop: 10 }}>{files.map(r => { const s = stuSub(r); return row(r, <T s={12} lh={16} w={s.on ? '600' : undefined} col={s.on ? c.greenText : c.ink3}>{s.t}</T>); })}</Grp> : null}
          {canNotes ? <Sec right={<BtnT onPress={addNotes}>Add notes</BtnT>}>From classmates</Sec> : null}
          {notes.length ? <Grp>{notes.map(r => row(r, `${profile(r.added_by)?.full_name} · ${fmtDay(r.created_at)}`))}</Grp> : null}
        </Body>
      )}
    </Screen>
  );
};
const NotesSheet = ({ folderId, chatId }: any) => {
  const f = byId('folders', folderId), { off } = ctxOf({ folderId, chatId }), [picked, setPicked] = useState<any[]>([]);
  const take = async (src: any) => { const fs = await pickFiles(src); if (fs.length) setPicked(p => [...p, ...fs]); };
  const add = () => {
    const now = Date.now(), offline = isOffline();
    mut(() => picked.forEach((p, i) => {
      const r = insert('resources', { id: newId('res'), folder_id: folderId, kind: 'file', file_id: mkFile(p), title: base(p.name), added_by: meId(), added_by_role: 'student', source: 'resources', created_at: now, updated_at: null, removed_at: null, sort: now + i, upload: offline ? 'waiting' : null });
      insert('resource_shares', { resource_id: r.id, offering_id: off?.id, shared_at: now, shared_by: meId() });
    }));
    closeSheet();
    toast(offline ? `No connection. ${base(picked[0].name)} uploads when you're back online.` : `Added to ${short(f)}`);
  };
  return (
    <SheetBody title={`Add notes to ${short(f)}`} sub="Classmates see your name.">
      {picked.map((p, i) => <Row key={i} gap={12} style={{ minHeight: 56 }}><Fi l n={iconOfMime(p.mime)} /><View style={{ flex: 1 }}><T s={15} lh={20} w="500" n={1}>{p.name}</T><T s={12} lh={16} col={c.ink3}>{fmtSize(p.size)}</T></View><IB n="close" label="Pick another file" col={c.ink3} onPress={() => setPicked(picked.filter((_, j) => j !== i))} /></Row>)}
      {picked.length ? <BtnP style={{ marginTop: 12 }} onPress={add}>{`Add to ${short(f)}`}</BtnP> : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
            <Tile icon="description" label="File" onPress={() => take('file')} />
            <Tile icon="photo_library" label="Photos" onPress={() => take('photos')} />
            <Tile icon="document_scanner" label="Scan" onPress={() => take('camera')} />
            <Tile icon="add_to_drive" label="Drive" onPress={() => take('file')} />
          </View>
          <BtnT col={c.ink3} style={{ alignSelf: 'center', marginTop: 4 }} onPress={() => setPicked([{ name: 'Knapsack worked example.jpg', size: 900e3, mime: MIME.jpg, img: 'hall' }])}>Use a sample file</BtnT>
        </>
      )}
    </SheetBody>
  );
};

/* ---------- Res-S03-Viewer, shared by both roles ---------- */
const PAGE_H = 410;
const Viewer = ({ route }: any) => {
  useData();
  const { resourceId, page = 1, chatId } = route.params || {}, { res: r, folder, course } = ctxOf({ resourceId, chatId });
  const file = byId('files', r?.file_id);
  const pages = file ? where('file_pages', p => p.file_id === file.id).sort((a, b) => a.page_no - b.page_no) : [];
  const shown = pages.length ? pages : [{ page_no: 1, title: r?.title, text: '' }];
  const [i, setI] = useState(page), list = useRef<FlatList<any>>(null), [saved, setSaved] = useState(false), bottom = useBottom();
  const [banner, setBanner] = useState(() => { const v = myView(resourceId); return v?.stale && r?.change_note ? r.change_note : null; });
  useEffect(() => { if (r && !r.removed_at) markViewed(r.id); }, []);
  if (!r || r.removed_at) return <Screen><Hdr title="File" /><Empty icon="draft" title="File removed" /></Screen>;
  const word = /presentation|ppt/.test(file?.mime || '') ? 'slide' : 'page', pic = file?.uri && /image/.test(file.mime) ? { uri: file.uri } : file?.img ? IMG[file.img] : null;
  const v = myView(r.id), got = saved || (v && !v.stale && v.downloaded_at);
  const download = () => {
    if (isOffline()) return toast(`Couldn't download ${r.title} · Retry`, undefined);
    setSaved(true); markViewed(r.id, 'downloaded');
  };
  const jump = (no: number) => { setBanner(null); list.current?.scrollToIndex({ index: Math.min(no, shown.length) - 1, animated: true }); };
  const jumpTo = parseInt((banner || '').match(/\d+/)?.[0] || '1', 10);
  return (
    <Screen>
      <Hdr title={r.title} sub={`${short(folder)} · ${word} ${i} of ${shown.length}`}
        right={<><IB n="share" label={`Share ${r.title}`} onPress={() => go('Res-F22-FileShare', { resourceId: r.id, chatId })} />{got ? <IB n="download_done" col={c.greenText} label="Saved to your phone" /> : <IB n="download" label={`Download · ${fmtSize(file?.size_bytes || 0)}`} onPress={download} />}</>} />
      {banner ? (
        <Tap label="Jump there" onPress={() => jump(jumpTo)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginTop: 6, paddingVertical: 8, paddingLeft: 12, paddingRight: 8, borderRadius: 14, backgroundColor: c.greenZone }}>
          <Ms n="update" s={20} col={c.greenText} />
          <T s={13} lh={18} style={{ flex: 1 }} n={2}><T s={13} lh={18} w="600">Updated</T> · {banner}</T>
          <T v s={14} col={c.greenText}>Jump there</T>
        </Tap>
      ) : null}
      {pic ? <View style={{ flex: 1, padding: 16 }}><Image source={pic} accessibilityLabel={r.title} resizeMode="contain" style={{ flex: 1, width: '100%', borderRadius: 12 }} /></View> : (
        <FlatList ref={list} data={shown} keyExtractor={p => String(p.page_no)} style={{ flex: 1 }} showsVerticalScrollIndicator={false}
          initialScrollIndex={Math.min(page, shown.length) - 1} getItemLayout={(_, index) => ({ length: PAGE_H, offset: PAGE_H * index, index })}
          onScroll={e => { const n = Math.round(e.nativeEvent.contentOffset.y / PAGE_H) + 1; if (n !== i && n >= 1 && n <= shown.length) setI(n); }} scrollEventThrottle={64}
          renderItem={({ item }) => <View style={{ height: PAGE_H, paddingHorizontal: 16, paddingTop: 12 }}><SlidePage big unit={`${course?.short} · ${short(folder)}`} title={item.title} lines={(item.text || '').split('\n').filter(Boolean)} page={item.page_no} total={shown.length} doc={word === 'page'} /></View>} />
      )}
      <View style={{ padding: 16, paddingBottom: 16 + bottom }}>
        <BtnS icon="forum" onPress={() => askAboutSlide(r.id, i, chatId)}>{`Ask about ${word} ${i}`}</BtnS>
      </View>
    </Screen>
  );
};
const Ask = ({ route }: any) => {
  const { resourceId, page = 1, chatId } = route.params || {};
  useEffect(() => { askAboutSlide(resourceId, page, chatId, swap); }, []);
  return <Screen />;
};

/* ---------- Res-S06-Search ---------- */
const Hit = ({ text, q }: any) => {
  const i = text.toLowerCase().indexOf(q);
  return <T s={12} lh={16} col={c.ink3} n={1}>{i < 0 ? text : <>{text.slice(0, i)}<T s={12} lh={16} w="600" col={c.greenText}>{text.slice(i, i + q.length)}</T>{text.slice(i + q.length)}</>}</T>;
};
const Search = ({ route }: any) => {
  useData();
  const { chatId } = route.params || {}, { off, course } = ctxOf({ chatId }), [raw, setRaw] = useState('');
  const q = raw.trim().toLowerCase();
  const rows = !q || !course ? [] : courseFolders(course.id).filter(f => canSee(f, off?.id)).flatMap(f => (isFaculty() ? facRows(f, off?.id) : stuRows(f, off?.id)).map(r => ({ r, f })));
  const fileHits = rows.flatMap(({ r }) => {
    const pages = where('file_pages', p => p.file_id === r.file_id).sort((a, b) => a.page_no - b.page_no);
    const word = /presentation|ppt/.test(byId('files', r.file_id)?.mime || '') ? 'Slide' : 'Page';
    const pg = pages.find(p => (p.title || '').toLowerCase().includes(q)) || pages.find(p => (p.text || '').toLowerCase().includes(q));
    if (pg) {
      const inTitle = (pg.title || '').toLowerCase().includes(q), text = pg.text || '', at = text.toLowerCase().indexOf(q);
      return [{ r, page: pg.page_no, text: `${word} ${pg.page_no} · ${inTitle ? pg.title : `${at > 12 ? '…' : ''}${text.slice(Math.max(0, at - 12), at + 40)}…`}` }];
    }
    return (r.title || '').toLowerCase().includes(q) ? [{ r, text: isNote(r) ? profile(r.added_by)?.full_name : fmtDay(changed(r)) }] : [];
  });
  const chats = !q || !course ? [] : where('chats', ch => byId('offerings', ch.offering_id)?.course_id === course.id && !!memberOf(ch.id)).map(ch => ch.id);
  const msgHits = !q ? [] : db().messages.filter(m => chats.includes(m.chat_id) && !m.unsent_at && !m.deleted_by && !m.scheduled_for && (m.body || '').toLowerCase().includes(q)).sort((a, b) => b.sent_at - a.sent_at).slice(0, 12);
  return (
    <Screen>
      <Row style={{ paddingRight: 16 }}>
        <View style={{ flex: 1 }}><SearchBar autoFocus placeholder={`Search ${course?.short} files`} value={raw} onChange={setRaw} style={{ marginRight: 8, marginTop: 6 }} /></View>
        <BtnT onPress={back} style={{ marginTop: 6 }}>Cancel</BtnT>
      </Row>
      <Body>
        {q && !fileHits.length && !msgHits.length ? <Empty icon="search" title={`No results for “${raw.trim()}”`} line={`Nothing in ${course?.short} files or chat.`} /> : null}
        {fileHits.length ? <Sec>Files</Sec> : null}
        {fileHits.length ? <Grp>{fileHits.map(({ r, page, text }: any) => <Li key={r.id} min={64} left={<Fi l n={iconOf(r)} />} title={<T s={15} lh={20} w="500" n={1}>{r.title}</T>} sub={<Hit text={text} q={q} />} onPress={() => openRes(r, chatId, page)} />)}</Grp> : null}
        {msgHits.length ? <Sec>Chat</Sec> : null}
        {msgHits.length ? <Grp>{msgHits.map(m => { const who = profile(m.sender_id); return <Li key={m.id} min={64} left={<Pic img={who?.img} name={who?.full_name} size={36} fac={who?.role === 'faculty'} />} title={<Hit text={m.body} q={q} />} sub={`${who?.full_name} · ${low(fmtDay(m.sent_at))}`} onPress={() => (m.thread_root_id ? go('Chat-S03-Thread', { chatId: m.chat_id, rootId: m.thread_root_id }) : openChat(m.chat_id, 'Chat', { messageId: m.id }))} />; })}</Grp> : null}
      </Body>
    </Screen>
  );
};

/* ---------- Res-F06-ShareIn ---------- */
const ShareIn = ({ route }: any) => {
  useData();
  const { files = SAMPLES.slice(0, 4), from = 'WhatsApp' } = route.params || {}, [q, setQ] = useState('');
  const match = (s: string) => !q || (s || '').toLowerCase().includes(q.toLowerCase());
  const courses = [...new Set(where('offering_faculty', x => x.faculty_id === meId()).map(x => byId('offerings', x.offering_id)).filter(o => o?.term_id !== 't-past').map(o => o.course_id))].map(id => byId('courses', id)).filter(x => match(x.name));
  const lastOf = (id: string) => db().messages.reduce((t, m) => (m.chat_id === id && m.sent_at > t ? m.sent_at : t), 0);
  const recent = where('chats', ch => !!memberOf(ch.id) && ch.status !== 'read_only').filter(ch => match(chatTitle(ch))).sort((a, b) => lastOf(b.id) - lastOf(a.id)).slice(0, 6);
  const send = (id: string) => {
    files.forEach((p: any) => sendMessage({ chatId: id, kind: 'file', resource_id: fileFromPhone(id, p), body: '' }));
    back();
    openChat(id);
  };
  return (
    <Screen>
      <CloseHdr title="Add to Hive" sub={`${plural(files.length, 'file')} from ${from}`} />
      <Row gap={6} style={{ paddingHorizontal: 16, marginTop: 4, flexWrap: 'wrap' }}>
        {files.slice(0, 2).map((p: any) => <Tag key={p.name} icon={iconOfMime(p.mime)}>{p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name}</Tag>)}
        {files.length > 2 ? <Tag>+{files.length - 2}</Tag> : null}
      </Row>
      <SearchBar placeholder="Search courses and chats" value={q} onChange={setQ} />
      <Body>
        {courses.length ? <Sec>Course resources</Sec> : null}
        {courses.length ? <Grp>{courses.map(x => <Li key={x.id} left={<Pic img={x.img} name={x.name} size={36} shape="course" />} title={<T s={15} lh={20} w="500" n={1}>{x.name}</T>} sub={myOfferings(x.id).map(dvName).join(' · ')} chevron onPress={() => swap('Res-F04-Check', { chatId: myChat(x.id)?.id, files })} />)}</Grp> : null}
        {recent.length ? <Sec>Send in a chat</Sec> : null}
        {recent.length ? <Grp>{recent.map(ch => <Li key={ch.id} left={<Pic img={ch.img} name={chatTitle(ch)} size={36} shape={ch.kind === 'dm' ? 'round' : 'course'} />} title={<T s={15} lh={20} w="500" n={1}>{chatTitle(ch)}</T>} sub={ch.kind === 'course' ? 'Course chat' : ch.kind === 'class_group' ? 'Class group' : ch.kind === 'dm' ? 'Direct message' : ch.kind === 'focus_batch' ? 'Focus batch' : ch.kind === 'club' ? 'Club' : 'Group'} onPress={() => send(ch.id)} />)}</Grp> : null}
      </Body>
    </Screen>
  );
};

/* ---------- Chat's resource picker ---------- */
const Picker = ({ chatId, onDone }: any) => {
  useData();
  const ch = byId('chats', chatId), off = byId('offerings', ch?.offering_id);
  const courseIds = off ? [off.course_id] : [...new Set(where('chats', x => x.kind === 'course' && x.status !== 'read_only' && !!memberOf(x.id)).map(x => byId('offerings', x.offering_id)?.course_id))];
  const folders = courseIds.flatMap(id => courseFolders(id));
  const rowsOf = (f: any) => { if (isFaculty()) return off ? facRows(f, off.id) : resourcesIn(f.id); const o = myStudentOffering(f.course_id); return o && canSee(f, o.id) ? stuRows(f, o.id) : []; };
  const [on, setOn] = useState<string[]>([]), [open, setOpen] = useState<string | null>(null);
  return (
    <SheetBody title="Add from resources">
      {folders.map(f => {
        const rows = rowsOf(f); if (!rows.length) return null;
        const exp = open === f.id;
        return (
          <View key={f.id}>
            <SheetRow icon={exp ? 'folder_open' : 'folder'} fill label={f.name} right={<Row gap={2}><CountEnd n={rows.length} /><Ms n={exp ? 'expand_less' : 'expand_more'} col={c.ink3} /></Row>} onPress={() => setOpen(exp ? null : f.id)} />
            {exp ? rows.map(r => <SheetRow key={r.id} label={r.title} right={<Ck sq on={on.includes(r.id)} />} onPress={() => setOn(on.includes(r.id) ? on.filter(i => i !== r.id) : [...on, r.id])} />) : null}
          </View>
        );
      })}
      <BtnP disabled={!on.length} style={{ marginTop: 12 }} onPress={() => { closeSheet(); onDone(on); }}>{`Add ${plural(on.length, 'file')}`}</BtnP>
    </SheetBody>
  );
};
export const resourcePicker = (chatId: string, onDone: (resourceIds: string[]) => void) => openSheet(() => <Picker chatId={chatId} onDone={onDone} />);
export const pickResourcesSheet = resourcePicker;

/* ---------- Routes ---------- */
const TabScreen = (stem: string) => ({ route }: any) => (isFaculty() ? <FacTab route={route} stem={stem} /> : <StuTab route={route} stem={stem} />);
const FolderScreen = ({ route }: any) => (isFaculty() ? <FacFolder route={route} /> : <StuFolder route={route} />);
/** Sheets per PRD, also reachable by stem: pop the route, open the sheet over the parent. */
const sheetRoute = (open: (p: any) => void) => ({ route }: any) => { useEffect(() => { back(); open(route.params || {}); }, []); return <Screen />; };

export const screens: any = {
  'Res-F01-Tab': TabScreen('Res-F01-Tab'), 'Res-S01-Tab': TabScreen('Res-S01-Tab'), 'Res-S07-NotYet': TabScreen('Res-S07-NotYet'),
  'Res-F11-Hidden': ({ route }: any) => <FacTab route={route} stem="Res-F11-Hidden" manage />,
  'Res-F10-NewSem': NewSem, 'Res-F19-Choose': Choose,
  'Res-F02-Folder': FolderScreen, 'Res-S02-Folder': FolderScreen, 'Res-F05-Added': FolderScreen, 'Res-F12-Batch': FolderScreen, 'Res-F15-Offline': FolderScreen, 'Res-F21-EmptyUnit': FolderScreen,
  'Res-F04-Check': Check, 'Res-F06-ShareIn': ShareIn, 'Res-F08-Replace': Replace, 'Res-F09-Seen': Seen, 'Res-F18-FolderShare': ShareInChat, 'Res-F22-FileShare': ShareInChat,
  'Res-S03-Viewer': Viewer, 'Res-S04-Ask': Ask, 'Res-S06-Search': Search,
  'Res-F03-Add': sheetRoute(p => openAddSheet(p.chatId, p.folderId)),
  'Res-F07-Menu': sheetRoute(p => openFileMenu(p.resourceId, p.chatId)),
  'Res-F17-FolderMenu': sheetRoute(p => openFolderMenu(p.folderId, p.chatId)),
  'Res-F20-NoteOptions': sheetRoute(p => openNoteMenu(p.resourceId, p.chatId)),
  'Res-F13-Link': sheetRoute(p => openSheet(() => <LinkSheet chatId={p.chatId} folderId={p.folderId} />)),
  'Res-F14-TooLarge': sheetRoute(p => openSheet(() => <TooLargeSheet it={p.file || SAMPLES[5]} chatId={p.chatId} folderId={p.folderId} drop={() => {}} />)),
  'Res-F16-Duplicate': sheetRoute(p => { const r = byId('resources', p.resourceId); if (r) openSheet(() => <DuplicateSheet it={p.file || { name: byId('files', r.file_id)?.name }} dup={r} oid={ctxOf(p).off?.id} chatId={p.chatId} onKeep={() => {}} onUse={() => {}} onReplace={() => { closeSheet(); go('Res-F08-Replace', { resourceId: r.id, chatId: p.chatId }); }} />); }),
  'Res-S05-Notes': sheetRoute(p => openSheet(() => <NotesSheet folderId={p.folderId} chatId={p.chatId} />)),
};

/* ---------- Seed: PRD 11.1 Resources. Writes straight into d; db() isn't ready here. ---------- */
const GREEDY: [string, string][] = [
  ['Greedy algorithms', 'Make the locally best choice at each step\nNever revisit a choice\nUnit 3 overview'],
  ['What this unit covers', 'Activity selection, fractional knapsack, Huffman coding\nMinimum spanning trees and shortest paths'],
  ['What makes a problem greedy', 'A choice can be made without solving subproblems first\nThat choice leaves one smaller problem'],
  ['Greedy choice property', 'Some optimal solution contains the greedy choice\nProve it before you trust the algorithm'],
  ['Optimal substructure', 'An optimal solution contains optimal solutions to its subproblems\nDP needs this too'],
  ['Greedy vs dynamic programming', 'Greedy commits first, then solves one subproblem\nDP solves all subproblems, then chooses'],
  ['Proving it: the exchange argument', 'Take any optimal solution\nSwap in the greedy choice\nShow it is no worse'],
  ['Coin change with Indian coins', 'Take the largest coin that fits, repeat\n₹28 = 20 + 5 + 2 + 1'],
  ['When coin change fails', 'Coins 1, 3, 4 and amount 6\nGreedy gives 4 + 1 + 1, optimal is 3 + 3'],
  ['Job sequencing with deadlines', 'Sort jobs by profit, highest first\nPlace each job in the latest free slot before its deadline'],
  ['Activity selection: the problem', 'Activities with start and finish times\nPick the largest set with no overlap'],
  ['Activity selection: pick the earliest finish', 'Sort by finish time\nTake an activity if it starts after the last one ends\nO(n log n) for the sort, O(n) for the scan'],
  ['Activity selection: worked example', 'Finish times 4, 5, 6, 7, 9, 9, 10, 11\nPicked: a1, a4, a8'],
  ['Fractional knapsack', 'Sort items by value per kg\nTake the best item fully, then a fraction\nW = 50 kg'],
  ['Why greedy fails for 0/1', 'Items can’t be split\nUse dynamic programming, Unit 4'],
  ['Fractional knapsack: running time', 'Sorting costs O(n log n)\nThe fill is one pass, O(n)'],
  ['Huffman coding: the idea', 'Frequent characters get shorter codes\nNo code is a prefix of another'],
  ['Huffman coding: build the tree', 'Merge the two lowest frequencies\nRepeat until one tree remains\nUse a min-heap: O(n log n)'],
  ['Huffman coding: worked example', 'a:45 b:13 c:12 d:16 e:9 f:5\nFinal cost: 224 bits per 100 characters'],
  ['Minimum spanning trees: cut property', 'The lightest edge crossing any cut is safe to add\nKruskal and Prim both rely on it'],
  ['Kruskal’s algorithm', 'Sort edges by weight\nAdd an edge if it joins two components\nUnion-find keeps it near O(E log E)'],
  ['Prim’s algorithm', 'Grow one tree from a start vertex\nAlways add the lightest edge leaving it\nO(E log V) with a binary heap'],
  ['Dijkstra’s shortest paths', 'Settle the nearest unsettled vertex\nRelax its outgoing edges\nO((V + E) log V)'],
  ['Dijkstra fails on negative edges', 'A settled vertex could still improve\nUse Bellman-Ford instead, Unit 4'],
  ['Running times at a glance', 'Activity selection O(n log n)\nHuffman O(n log n)\nKruskal O(E log E), Prim O(E log V)'],
  ['Practice before Thursday', 'Solve Tutorial 3, questions 1 to 5\nBring one proof by exchange argument'],
];
type SeedFile = [string, string, number, string];
const U1: SeedFile[] = [['Asymptotic notation', 'pdf', 820e3, 'Big O bounds growth from above\nBig Theta bounds it from both sides'], ['Growth of functions', 'pptx', 1.4e6, 'log n, n, n log n, n², 2ⁿ\nCompare by taking limits'], ['Analysing loops', 'pdf', 510e3, 'Count how many times the inner line runs\nNested loops multiply'], ['Best, worst and average case', 'pptx', 1.1e6, 'Linear search: 1, n, n/2\nState which case you mean'], ['Basics question set', 'docx', 240e3, 'Rank ten functions by growth\nProve 3n² + n is O(n²)'], ['Tutorial 1 problems', 'pdf', 320e3, 'Find the running time of each snippet']];
const U2: SeedFile[] = [['Merge sort and quick sort', 'pptx', 2.3e6, 'Split, sort, merge: O(n log n)\nQuick sort averages O(n log n), worst case O(n²)'], ['Master theorem notes', 'pdf', 600e3, 'T(n) = aT(n/b) + f(n)\nCompare f(n) with n^(log_b a)'], ['Binary search variants', 'pdf', 390e3, 'First and last occurrence\nSearch on the answer'], ['Strassen’s method notes', 'pdf', 720e3, 'Seven multiplications instead of eight\nO(n^2.81)'], ['Tutorial 2 problems', 'pdf', 300e3, 'Solve five recurrences']];
const LAB: SeedFile[] = [['Lab 1 sorting timings', 'pdf', 340e3, 'Time insertion and merge sort on 10⁵ items'], ['Lab 2 binary search', 'pdf', 280e3, 'Count comparisons on sorted input'], ['Lab 3 quick sort pivots', 'pdf', 310e3, 'First element, median of three, random'], ['Lab 4 knapsack', 'pdf', 300e3, 'Fractional knapsack in C'], ['Lab 5 Huffman', 'pdf', 350e3, 'Encode a text file and report the ratio'], ['Lab 6 Kruskal', 'pdf', 290e3, 'Union-find on a road network'], ['Lab 7 Dijkstra', 'pdf', 330e3, 'Shortest routes on a campus map'], ['Lab record format', 'docx', 120e3, 'Aim, algorithm, output, analysis']];
const PAST: [string, string, number | null, string[]][] = [
  ['fld25-u1', 'Unit 1 · Basics', 1, ['Intro to analysis', 'Asymptotic notation 2025', 'Growth rate chart', 'Loop analysis examples', 'Unit 1 question set', 'Tutorial 1, 2025']],
  ['fld25-u2', 'Unit 2 · Divide and conquer', 2, ['Merge sort, quick sort', 'Recurrence practice set 2025', 'Strassen’s method notes 2025', 'IT1 2025 question paper', 'Old lab timetable']],
  ['fld25-u3', 'Unit 3 · Greedy', 3, ['Greedy basics', 'Activity selection 2025', 'Knapsack notes 2025', 'Huffman slides 2025', 'Kruskal and Prim', 'Dijkstra notes', 'Unit 3 question bank 2025']],
  ['fld25-u4', 'Unit 4 · Dynamic programming', 4, ['DP basics', 'Matrix chain multiplication', 'Longest common subsequence', '0/1 knapsack DP', 'Floyd-Warshall', 'Bellman-Ford', 'Unit 4 worked problems', 'Tutorial 4, 2025']],
  ['fld25-lab', 'Lab', null, ['Lab manual 2025', 'Lab 1 2025', 'Lab 2 2025', 'Lab 3 2025', 'Lab 4 2025', 'Lab 5 2025', 'Lab 6 2025', 'Lab viva questions']],
];
const OS_PAST: [string, string, number | null, string[]][] = [
  ['fld25-os-u1', 'Unit 1 · Introduction', 1, ['What an OS does', 'System calls cheat sheet', 'Unit 1 question set']],
  ['fld25-os-u2', 'Unit 2 · Processes and threads', 2, ['Process states', 'CPU scheduling', 'Scheduling practice set', 'Threads and concurrency']],
  ['fld25-os-u3', 'Unit 3 · Synchronisation', 3, ['Semaphores and mutexes', 'Deadlocks', 'Dining philosophers notes']],
  ['fld25-os-u4', 'Unit 4 · Memory', 4, ['Paging and segmentation', 'Page replacement', 'Virtual memory notes']],
  ['fld25-os-lab', 'Lab', null, ['Lab manual', 'Shell scripting lab', 'Fork and exec lab']],
  ['fld25-os-exam', 'Exam prep', null, ['IT1 2025 question paper', 'Semester question bank']],
];
const KEYWORDS: any = {
  u1: ['basics', 'asymptotic', 'big o', 'growth of', 'complexity'], u2: ['divide', 'conquer', 'merge sort', 'quick sort', 'recurrence', 'strassen', 'binary search', 'master theorem'],
  u3: ['greedy', 'knapsack', 'huffman', 'activity selection', 'kruskal', 'prim', 'dijkstra'], u4: ['dynamic programming', 'lcs', 'floyd', 'matrix chain', 'bellman'], u5: ['backtrack', 'queens', 'subset sum', 'hamiltonian'],
};

export function seedRes(d: any) {
  const Y = 'y2627', DAA = ['o-daa-a', 'o-daa-eve', 'o-daa-1'], DIV: any = { 'o-daa-a': 'div-a', 'o-daa-eve': 'div-eve', 'o-daa-1': 'div-1', 'o-cn-a': 'div-a' };
  d.course_year_prefs = [];
  d.syllabus_units.forEach((u: any) => { u.keywords = KEYWORDS[u.id]; });
  ['Physical layer', 'Data link layer', 'Network layer'].forEach((title, i) => d.syllabus_units.push({ id: `cn-u${i + 1}`, course_id: 'c-cn', number: i + 1, title, keywords: [] }));
  // Canvas: Sameer Dessai is the "Never signed in" row on Res-F09-Seen.
  const sameer = d.profiles.find((p: any) => p.id === 'p-sameer'); if (sameer) sameer.has_app = false;

  const folder = (id: string, course_id: string, name: string, kind: string, x: any = {}) => d.folders.push({ id, course_id, academic_year_id: Y, kind, name, owner_id: 'p-anita', sort: d.folders.length, ...x });
  d.syllabus_units.filter((u: any) => u.course_id === 'c-daa').forEach((u: any) => folder(`fld-${u.id}`, 'c-daa', `Unit ${u.number} · ${u.title}`, 'unit', { unit_id: u.id, unit_no: u.number }));
  folder('fld-practice', 'c-daa', 'Practice', 'focus_batch', { chat_id: 'chat-practice' });
  folder('fld-challenge', 'c-daa', 'Challenge', 'focus_batch', { chat_id: 'chat-challenge' });
  folder('fld-lab', 'c-daa', 'Lab', 'custom');
  folder('fld-exam', 'c-daa', 'Exam prep', 'custom');
  folder('fld-shared', 'c-daa', 'Shared in chat', 'shared_in_chat', { sort: 99 });
  ['fld-cn-u1', 'fld-cn-u2', 'fld-cn-u3'].forEach((id, i) => folder(id, 'c-cn', `Unit ${i + 1} · ${d.syllabus_units.find((u: any) => u.id === `cn-u${i + 1}`).title}`, 'unit', { unit_id: `cn-u${i + 1}`, unit_no: i + 1, owner_id: 'p-kiran' }));
  folder('fld-cn-shared', 'c-cn', 'Shared in chat', 'shared_in_chat', { owner_id: 'p-kiran', sort: 99 });

  const add = (id: string, folder_id: string, title: string, ext: string, bytes: number, pages: [string, string][], x: any = {}) => {
    const fid = `f-${id}`, at = x.created_at ?? days(-20), name = `${title}.${ext}`, by = x.added_by || 'p-anita';
    d.files.push({ id: fid, name, mime: MIME[ext], size_bytes: bytes, page_count: Math.max(pages.length, 1), sha256: sha(name, bytes), uploaded_by: by, created_at: at, version: x.version || 1, img: x.img });
    pages.forEach((p, i) => d.file_pages.push({ file_id: fid, page_no: i + 1, title: p[0], text: p[1] }));
    d.file_versions.push({ file_id: fid, version_no: 1, page_count: Math.max(pages.length, 1), change_note: null, created_at: at });
    const { version, img, ...rest } = x;
    d.resources.push({ id, folder_id, kind: 'file', file_id: fid, title, added_by: by, added_by_role: 'faculty', source: 'resources', created_at: at, updated_at: null, removed_at: null, upload: null, ...rest });
  };
  const share = (rid: string, oids: string[], by = 'p-anita') => oids.forEach(o => d.resource_shares.push({ resource_id: rid, offering_id: o, shared_at: days(-20), shared_by: by }));
  const ids = (div: string) => d.division_members.filter((m: any) => m.division_id === div).map((m: any) => m.student_id);

  // Club folders (Chat-S15) and the class mentor's files (Chat-S14), both from the canvas.
  folder('fld-robo-guides', null, 'Guides', 'custom', { chat_id: 'chat-robo', owner_id: 'p-sanjay', icon: 'folder' });
  folder('fld-code-prep', null, 'Contest prep', 'custom', { chat_id: 'chat-code', owner_id: 'p-anita', icon: 'folder' });
  add('res-code-dp', 'fld-code-prep', 'Dynamic programming patterns', 'pdf', 1200000, [['Dynamic programming patterns', 'Knapsack, LIS and interval DP with practice problems.']], { added_by: 'p-anita', created_at: days(-3) });
  add('res-code-graphs', 'fld-code-prep', 'Graph problems sheet', 'pdf', 460000, [['Graph problems sheet', 'BFS, DFS and shortest paths. 40 problems by difficulty.']], { added_by: 'p-sara', created_at: days(-8) });
  folder('fld-robo-photos', null, 'Robo Race 2026 photos', 'custom', { chat_id: 'chat-robo', owner_id: 'p-meera', icon: 'photo_library' });
  add('res-robo-line', 'fld-robo-guides', 'Line follower build guide', 'pdf', 2100000, [['Line follower build guide', 'Chassis, IR sensors and the motor driver, step by step.']], { added_by: 'p-sanjay', created_at: days(-2) });
  add('res-robo-pins', 'fld-robo-guides', 'Arduino pin map', 'pdf', 340000, [['Arduino pin map', 'Which pins drive the motors and read the sensors.']], { added_by: 'p-joel', created_at: days(-6) });
  add('res-robo-race', 'fld-robo-photos', 'Robo Race final', 'jpg', 1800000, [['Robo Race final', '']], { added_by: 'p-meera', created_at: days(-9), img: 'robotics' });
  folder('fld-class-a', null, 'Class files', 'chat', { chat_id: 'chat-class-a' });
  ([['res-class-tt', 'Timetable · Sem 5', -40, 'Timetable for Sem 5.'], ['res-class-it2', 'IT2 timetable', -1, 'IT2 runs 17 to 21 Nov.'], ['res-class-cal', 'Academic calendar 2026–27', -60, 'Term dates and holidays.']] as [string, string, number, string][]).forEach(([id, title, ago, line], i) => {
    add(id, 'fld-class-a', title, 'pdf', 180000 + i * 90000, [[title, line]], { created_at: days(ago), source: 'chat' });
    d.messages.push({ id: `msg-${id}`, chat_id: 'chat-class-a', sender_id: 'p-anita', kind: 'file', body: '', resource_id: id, sent_at: days(ago, 8), client_id: `msg-${id}`, status: 'sent' });
  });
  const view = (rid: string, oid: string, who: string[], n: number, skip: string[] = []) => who.filter(u => !skip.includes(u)).slice(0, n).forEach((u, i) => {
    const t = hours(-3 - i * 0.4);
    d.resource_views.push({ resource_id: rid, user_id: u, offering_id: oid, opened_at: t, downloaded_at: i % 7 === 3 ? t : null });
  });
  const PCTS = [88, 74, 69, 83, 71, 92, 66, 79];
  let pi = 0;
  const viewAll = (rid: string) => { const p = PCTS[pi++ % PCTS.length]; DAA.forEach(o => { const who = ids(DIV[o]); view(rid, o, who, Math.round((who.length * p) / 100)); }); };

  // Unit 3: exact canvas numbers for Div A. Rohan hasn't seen the new version, so his viewer shows the "Updated" banner.
  add('res-greedy', 'fld-u3', 'Greedy algorithms', 'pptx', 3.1e6, GREEDY, { created_at: days(-89), updated_at: days(-1), version: 2, change_note: 'slides 12–18' });
  d.file_versions.push({ file_id: 'f-res-greedy', version_no: 2, page_count: 26, change_note: 'slides 12–18', created_at: days(-1) });
  add('res-huffman', 'fld-u3', 'Huffman coding notes', 'pdf', 1.2e6, [['Huffman coding notes', 'Prefix-free codes from character frequencies\nBuilt bottom-up with a min-heap'], ['Building the tree', 'Merge the two smallest nodes\nAssign 0 to the left, 1 to the right'], ['Decoding', 'Walk the tree bit by bit\nA leaf gives one character']], { created_at: days(-12) });
  add('res-qbank', 'fld-u3', 'Unit 3 question bank', 'docx', 480e3, [['Short questions', 'State the greedy choice property\nDefine optimal substructure'], ['Numericals', 'Solve the fractional knapsack for W = 40\nBuild the Huffman tree for the given frequencies'], ['Long questions', 'Prove activity selection correct by exchange argument']], { created_at: days(-6) });
  add('res-tutorial3', 'fld-u3', 'Tutorial 3 problems', 'pdf', 410e3, [['Tutorial 3 problems', '1. Job sequencing with five jobs\n2. Fractional knapsack by hand'], ['Tutorial 3, continued', '3. Kruskal on the given graph\n4. Dijkstra from vertex A\n5. Why does greedy coin change fail?']], { created_at: days(-4), added_by: 'p-prakash' });
  add('res-note-neha', 'fld-u3', 'Unit 3 cheat sheet', 'pdf', 350e3, [['Unit 3 cheat sheet', 'Sort by finish time, value per kg or frequency\nEvery running time on one page']], { created_at: days(-6), added_by: 'p-neha', added_by_role: 'student' });
  const A = ids('div-a'), E = ids('div-eve'), O = ids('div-1');
  view('res-greedy', 'o-daa-a', A, 48, ['p-aditya', 'p-pooja', 'p-sameer', 'p-rohan']);
  d.resource_views.push({ resource_id: 'res-greedy', user_id: 'p-rohan', offering_id: 'o-daa-a', opened_at: days(-3), downloaded_at: null, stale: true });
  const neha = d.resource_views.find((v: any) => v.resource_id === 'res-greedy' && v.user_id === 'p-neha');
  if (neha) { neha.opened_at = hours(-2); neha.downloaded_at = hours(-2); }
  view('res-huffman', 'o-daa-a', A, 51);
  view('res-qbank', 'o-daa-a', A, 40, ['p-rohan']);
  view('res-tutorial3', 'o-daa-a', A, 50, ['p-rohan']);
  view('res-note-neha', 'o-daa-a', A, 44);
  ['res-greedy', 'res-huffman', 'res-qbank', 'res-tutorial3'].forEach((r, i) => { view(r, 'o-daa-eve', E, 30 + i * 4); view(r, 'o-daa-1', O, 34 + i * 4); });
  ['res-greedy', 'res-huffman', 'res-qbank', 'res-tutorial3'].forEach(r => share(r, DAA));
  share('res-note-neha', ['o-daa-a'], 'p-neha');

  const fill = (rows: SeedFile[], fid: string, prefix: string, by: (i: number) => string = () => 'p-anita', age = 40) => rows.forEach(([title, ext, size, text], i) => {
    const id = `res-${prefix}-${i + 1}`;
    add(id, fid, title, ext, size, [[title, text]], { created_at: days(-(age + i * 3)), added_by: by(i) });
    share(id, DAA, by(i)); viewAll(id);
  });
  fill(U1, 'fld-u1', 'u1', undefined, 70);
  fill(U2, 'fld-u2', 'u2', undefined, 55);
  fill(LAB, 'fld-lab', 'lab', i => (i > 4 ? 'p-vikram' : 'p-anita'), 30);
  fill([['IT1 2025 question paper', 'pdf', 260e3, 'Answer any four of six\nUnits 1 and 2'], ['Unit 1 to 3 revision sheet', 'pdf', 330e3, 'Ten formulas worth knowing cold']], 'fld-exam', 'exam', undefined, 16);
  d.resources.push({ id: 'res-link-greedy', folder_id: 'fld-exam', kind: 'link', file_id: null, url: 'https://www.youtube.com/results?search_query=greedy+algorithms+abdul+bari', link_title: 'Greedy algorithms in 15 minutes', link_provider: 'YouTube · Abdul Bari', link_duration: '15:02', link_thumb_path: 'daa', title: 'Greedy algorithms in 15 minutes', added_by: 'p-anita', added_by_role: 'faculty', source: 'resources', created_at: days(-10), updated_at: null, removed_at: null, upload: null });
  share('res-link-greedy', DAA); viewAll('res-link-greedy');

  // Focus batches: audience is the batch, 75% and 100% as on the canvas.
  const batch = (chat: string) => d.chat_members.filter((m: any) => m.chat_id === chat && m.role !== 'faculty').map((m: any) => m.user_id);
  add('res-practice-1', 'fld-practice', 'Greedy, solved examples', 'pdf', 900e3, [['Greedy, solved examples', 'Three knapsack problems, worked line by line'], ['Activity selection, solved', 'Sort first, then scan']], { created_at: hours(-2), unit_no: 3 });
  add('res-practice-2', 'fld-practice', 'Unit 3 question set', 'docx', 240e3, [['Unit 3 question set', 'Ten short problems, easiest first']], { created_at: days(-1), unit_no: 3 });
  add('res-challenge-1', 'fld-challenge', 'Greedy, harder proofs', 'pdf', 520e3, [['Greedy, harder proofs', 'Matroids and why greedy works on them']], { created_at: days(-2), unit_no: 3 });
  add('res-challenge-2', 'fld-challenge', 'Contest problem set', 'pdf', 300e3, [['Contest problem set', 'Five problems from past ICPC regionals']], { created_at: days(-5), unit_no: 3 });
  const P = batch('chat-practice'), C = batch('chat-challenge');
  view('res-practice-1', 'o-daa-a', P, 9); view('res-practice-2', 'o-daa-a', P, 12);
  view('res-challenge-1', 'o-daa-a', C, 6); view('res-challenge-2', 'o-daa-a', C, 7);

  // Shared in chat: phone files from each division's chat.
  add('res-activity', 'fld-shared', 'Activity selection', 'pptx', 2.2e6, [['Activity selection', 'Pick the largest set of non-overlapping activities'], ['Sort by finish time', 'Then one pass, keeping what fits'], ['Worked example', 'Eleven activities, four picked'], ['Why it’s optimal', 'The earliest finish leaves the most room']], { created_at: days(-3), source: 'chat' });
  share('res-activity', ['o-daa-a']); view('res-activity', 'o-daa-a', A, 26, ['p-rohan']);
  const sharedRows: [string, string, string, string][] = [['Board photo, greedy proof', 'jpg', 'p-neha', 'hall'], ['IT1 marks sheet', 'pdf', 'p-anita', ''], ['Class notes, Monday', 'pdf', 'p-neha', ''], ['Class notes, Wednesday', 'pdf', 'p-kevin', ''], ['Knapsack table', 'jpg', 'p-kevin', 'hall'], ['Dijkstra trace', 'pdf', 'p-aditya', ''], ['Kruskal example', 'pdf', 'p-pooja', ''], ['Seminar schedule', 'pdf', 'p-anita', ''], ['Lab 4 sample output', 'pdf', 'p-vishal', ''], ['Assignment 2 brief', 'pdf', 'p-anita', ''], ['Previous year viva questions', 'pdf', 'p-riya', '']];
  sharedRows.forEach(([title, ext, by, img], i) => {
    const id = `res-shared-${i + 1}`;
    add(id, 'fld-shared', title, ext, 300e3 + i * 40e3, [[title, 'Sent from a phone in the Div A chat']], { created_at: days(-(9 + i * 3)), added_by: by, added_by_role: by === 'p-anita' ? 'faculty' : 'student', source: 'chat', img: img || undefined });
    share(id, ['o-daa-a'], by); view(id, 'o-daa-a', A, 18 + i);
  });
  add('res-shared-eve', 'fld-shared', 'Evening batch notes', 'pdf', 280e3, [['Evening batch notes', 'Greedy recap from Thursday']], { created_at: days(-11), source: 'chat', added_by: 'p-omkar', added_by_role: 'student' });
  share('res-shared-eve', ['o-daa-eve'], 'p-omkar');

  DAA.forEach(o => ['fld-u1', 'fld-u2', 'fld-u3', 'fld-lab', 'fld-exam', 'fld-shared'].forEach(f => d.folder_publications.push({ folder_id: f, offering_id: o, published: true, published_at: days(-80) })));

  // CN so another course isn't empty. OS stays empty on purpose: it shows Res-S07-NotYet.
  ([['res-cn-1', 'fld-cn-u1', 'Transmission media', 'pptx', 'Guided and unguided media'], ['res-cn-2', 'fld-cn-u2', 'Framing and error detection', 'pdf', 'CRC, parity and checksums'], ['res-cn-3', 'fld-cn-u3', 'IP addressing', 'pdf', 'Subnets and CIDR']] as string[][]).forEach(([id, f, title, ext, text], i) => {
    add(id, f, title, ext, 700e3, [[title, text]], { created_at: days(-(30 - i * 8)), added_by: 'p-kiran' });
    share(id, ['o-cn-a'], 'p-kiran');
  });
  ['fld-cn-u1', 'fld-cn-u2', 'fld-cn-u3', 'fld-cn-shared'].forEach(f => d.folder_publications.push({ folder_id: f, offering_id: 'o-cn-a', published: true, published_at: days(-60) }));

  // OS: nothing yet this year, but Anita taught it in 2025–26. Its Resources tab opens on the reuse story by default.
  OS_PAST.forEach(([id, name, unit_no, titles], i) => {
    d.folders.push({ id, course_id: 'c-os', academic_year_id: 'y2526', kind: unit_no ? 'unit' : 'custom', unit_no, name, owner_id: 'p-anita', sort: i });
    titles.forEach((title, j) => add(`${id}-${j}`, id, title, /paper|notes|set|sheet|bank/i.test(title) ? 'pdf' : 'pptx', 300e3 + j * 90e3, [[title, '']], { created_at: days(-290 + j * 3) }));
  });
  // 2025–26: 34 files for reuse (8.7). Light rows: no pages, shares or views.
  PAST.forEach(([id, name, unit_no, titles], i) => {
    d.folders.push({ id, course_id: 'c-daa', academic_year_id: 'y2526', kind: unit_no ? 'unit' : 'custom', unit_no, unit_id: unit_no ? `u${unit_no}` : undefined, name, owner_id: 'p-anita', sort: i });
    titles.forEach((title, j) => add(`${id}-${j}`, id, title, /timetable|paper|notes|set|Tutorial/.test(title) ? 'pdf' : 'pptx', 400e3 + j * 60e3, [], { created_at: days(-300 + j) }));
  });
}
