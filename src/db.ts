// Local data store: PRD section 3 tables as plain arrays, seeded on first run, persisted on the device.
// ponytail: local store instead of Supabase tables, so testers on two phones don't share data. Move reads/writes in mut()/useData() to Supabase when real multi-device matters.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type Row = any;
export type DB = Record<string, Row[]> & { _now?: any };

const KEY = 'hive-db-v16'; // bump when the seed changes so phones pick up the new world
const store = create<{ db: DB; tick: number; me: string | null; role: 'faculty' | 'student' | null; offline: boolean }>(() => ({ db: {} as DB, tick: 0, me: null, role: null, offline: false }));

/** Subscribe a component to all data; re-renders on every write (G7 live updates on this device). */
export const useData = (): DB => { store(s => s.tick); return store.getState().db; };
export const db = (): DB => store.getState().db;
let saveT: any;
/** The only write path. Mutate in place. */
export function mut(fn: (d: DB) => void) {
  const d = store.getState().db; fn(d); store.setState(s => ({ tick: s.tick + 1 }));
  clearTimeout(saveT); saveT = setTimeout(() => AsyncStorage.setItem(KEY, JSON.stringify(d)).catch(() => {}), 800);
}
export const setSession = (me: string | null, role: 'faculty' | 'student' | null) => store.setState({ me, role });
export const useRole = () => store(s => s.role);
export const useMeId = () => store(s => s.me) as string;
export const meId = () => store.getState().me as string;
export const role = () => store.getState().role;
export const isFaculty = () => store.getState().role === 'faculty';
export const useMe = (): Row => { store(s => s.tick); const id = store(s => s.me); return byId('profiles', id); };
/** "Simulate no connection" toggle on the Profile screen: drives G8 queued/failed states for testers. */
export const useOffline = () => store(s => s.offline);
export const isOffline = () => store.getState().offline;
export const setOffline = (v: boolean) => store.setState({ offline: v });

let nid = 1;
export const newId = (p = 'x') => `${p}-${Date.now().toString(36)}-${nid++}`;
export const byId = (t: string, id: any): Row => (db()[t] || []).find(r => r.id === id);
export const where = (t: string, f: (r: Row) => boolean): Row[] => (db()[t] || []).filter(f);
export const insert = (t: string, r: Row) => { (db()[t] = db()[t] || []).push(r); return r; };

/** Every notification writes a row (PRD 8.8); StudentNotifications reads only this table. */
export const notify = (user_id: string, kind: string, payload: Row = {}) => insert('notifications', { id: newId('n'), user_id, kind, actor_id: meId(), read_at: null, created_at: Date.now(), ...payload });

export async function loadDb(seed: () => DB) {
  const raw = await AsyncStorage.getItem(KEY).catch(() => null);
  let d: DB | null = null;
  if (raw) try { d = JSON.parse(raw); } catch {}
  store.setState({ db: d || seed() });
  store.setState(s => ({ tick: s.tick + 1 }));
}
export async function resetDb(seed: () => DB) {
  await AsyncStorage.removeItem(KEY).catch(() => {});
  store.setState(s => ({ db: seed(), tick: s.tick + 1 }));
}

/* ---------- Dates ---------- */
const H = 3600e3, D = 24 * H;
export const hours = (h: number) => Date.now() + h * H;
export const days = (d: number, hh?: number, mm = 0) => { const t = new Date(Date.now() + d * D); if (hh != null) t.setHours(hh, mm, 0, 0); return t.getTime(); };
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sod = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const dayDiff = (t: number) => Math.round((sod(t) - sod(Date.now())) / D);
/** 9:12 am */
export const fmtTime = (t: number) => { const d = new Date(t), h = d.getHours(), m = d.getMinutes(); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}${m ? ' ' : ' '}${h < 12 ? 'am' : 'pm'}`; };
/** 9:12 am with minutes always, as in chat metas */
export const fmtClock = (t: number) => { const d = new Date(t), h = d.getHours(); return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
/** Sat 7 Nov */
export const fmtDate = (t: number) => { const d = new Date(t); return `${WD[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
/** 7 Nov */
export const fmtShort = (t: number) => { const d = new Date(t); return `${d.getDate()} ${MON[d.getMonth()]}`; };
/** Today / Yesterday / Mon / 3 Nov */
export const fmtDay = (t: number) => { const n = dayDiff(t); return n === 0 ? 'Today' : n === -1 ? 'Yesterday' : n > -7 && n < 0 ? WD[new Date(t).getDay()] : fmtShort(t); };
/** chat-row time: 9:41 am / Yesterday / Mon / 3 Nov */
export const fmtRow = (t: number) => dayDiff(t) === 0 ? fmtClock(t) : fmtDay(t);
/** Buzz age: 5h / Yesterday / 3 Nov */
export const fmtAge = (t: number) => { const h = Math.floor((Date.now() - t) / H); return h < 1 ? 'Just now' : h < 24 && dayDiff(t) === 0 ? `${h}h` : fmtDay(t); };
export const fmtSize = (b: number) => b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`;
export const pct = (a: number, b: number) => b ? Math.round((a / b) * 100) : 0;

/* ---------- Common lookups ---------- */
export const profile = (id: string): Row => byId('profiles', id);
export const firstName = (id: string) => (profile(id)?.full_name || '').split(' ')[0];
export const members = (chatId: string): Row[] => where('chat_members', m => m.chat_id === chatId && !m.left_at);
export const memberOf = (chatId: string, uid = meId()) => (db().chat_members || []).find(m => m.chat_id === chatId && m.user_id === uid && !m.left_at);
export const divisionStudents = (divId: string): Row[] => where('division_members', m => m.division_id === divId).map(m => ({ ...profile(m.student_id), batch: m.batch }));
