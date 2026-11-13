// 1-1 voice calls (internet calling, mocked) and the end-to-end encryption note for DMs.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c } from './theme';
import { BtnP, Ms, Pic, Row, SheetBody, T, Tap, closeSheet, openSheet, toast } from './ui';
import { back, go } from './nav';
import { insert, meId, mut, newId, useData, useOffline } from './db';
import { otherMember } from './place';

const first = (p: any) => p?.full_name?.split(' ')[0] ?? 'them';
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Start a voice call from a DM. Calls ride on data, so offline gets a friendly no. */
export function startCall(chatId: string, offline: boolean) {
  if (offline) return toast('You’re offline. Calls need internet, so try again once you’re back.');
  go('Chat-X20-Call', { chatId });
}

/** Chat-X20-Call: Calling → Ringing → connected with a timer. Hanging up (or Back) logs the call in the chat. */
const CallScreen = ({ route }: any) => {
  useData();
  const i = useSafeAreaInsets();
  const chatId = route.params?.chatId, who = otherMember(chatId);
  const [phase, setPhase] = useState<'calling' | 'ringing' | 'live' | 'ended'>('calling');
  const [secs, setSecs] = useState(0), [muted, setMuted] = useState(false), [speaker, setSpeaker] = useState(false);
  const live = useRef({ phase, secs }); live.current = { phase, secs };
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // ponytail: scripted pickup after ~4s; swap for real call signalling (WebRTC) when calls go live.
    const a = setTimeout(() => setPhase('ringing'), 1200), b = setTimeout(() => setPhase('live'), 4200);
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => {
      clearTimeout(a); clearTimeout(b); loop.stop();
      const s = live.current.secs, ok = s > 0;
      mut(() => insert('messages', { id: newId('m'), chat_id: chatId, sender_id: meId(), kind: 'call', call_secs: s, body: ok ? `Voice call · ${clock(s)}` : 'Voice call · No answer', sent_at: Date.now(), status: 'sent', missed: !ok }));
    };
  }, []);
  useEffect(() => { if (phase !== 'live') return; const t = setInterval(() => setSecs(s => s + 1), 1000); return () => clearInterval(t); }, [phase]);

  const hangUp = () => { setPhase('ended'); setTimeout(back, 700); };
  const status = phase === 'calling' ? 'Calling…' : phase === 'ringing' ? `Ringing ${first(who)}’s phone…` : phase === 'live' ? clock(secs) : 'Call ended';
  const Ctl = ({ icon, label, on, onPress, neg }: any) => (
    <View style={{ alignItems: 'center', gap: 8, width: 84 }}>
      <Tap label={label} onPress={onPress} style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: neg ? c.negative : on ? c.onFill : 'rgba(255,255,255,.14)' }}>
        <Ms n={icon} s={28} col={neg ? c.onFill : on ? c.inverse : c.onFill} />
      </Tap>
      <T s={12} lh={16} col="rgba(255,255,255,.8)">{label}</T>
    </View>
  );
  const ring = (d: number) => ({ position: 'absolute', width: 128, height: 128, borderRadius: 64, borderWidth: 2, borderColor: c.present,
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [phase === 'live' ? 0 : 0.6 - d, 0] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1 + d, 1.6 + d] }) }] } as any);
  return (
    <View style={{ flex: 1, backgroundColor: c.inverse, paddingTop: i.top + 12, paddingBottom: Math.max(i.bottom, 16) + 24 }}>
      <StatusBar style="light" />
      <Row gap={6} style={{ alignSelf: 'center' }}><Ms n="lock" s={14} col="rgba(255,255,255,.7)" /><T s={12} lh={16} col="rgba(255,255,255,.7)">End-to-end encrypted</T></Row>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <View style={{ width: 128, height: 128, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={ring(0)} /><Animated.View style={ring(0.2)} />
          <Pic img={who?.img} name={who?.full_name} size={128} />
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <T v s={24} lh={30} col={c.onFill}>{who?.full_name}</T>
          <T s={15} lh={20} col={phase === 'live' ? c.present : 'rgba(255,255,255,.75)'}>{status}</T>
          {phase === 'live' && muted ? <T s={13} lh={18} col="rgba(255,255,255,.6)">{`You’re muted. ${first(who)} can’t hear you.`}</T> : null}
        </View>
      </View>
      <Row style={{ justifyContent: 'center', gap: 4 }}>
        <Ctl icon="volume_up" label="Speaker" on={speaker} onPress={() => setSpeaker(s => !s)} />
        <Ctl icon={muted ? 'mic_off' : 'mic'} label={muted ? 'Unmute' : 'Mute'} on={muted} onPress={() => setMuted(m => !m)} />
        <Ctl icon="call_end" label="End" neg onPress={hangUp} />
      </Row>
    </View>
  );
};

/** Call row inside a DM. Tap to call back. */
export const CallBubble = ({ m, mine }: any) => {
  const off = useOffline(), missed = !!m.missed;
  const [, , dur] = (m.body || '').match(/^(Voice call) · (.+)$/) || [];
  return (
    <Tap label={`${m.body}. Call back`} onPress={() => startCall(m.chat_id, off)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 180 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Ms n={missed ? 'phone_missed' : mine ? 'call_made' : 'call_received'} s={18} col={missed ? c.negative : c.greenText} />
      </View>
      <View style={{ flex: 1 }}>
        <T s={14} lh={19} w="500">{missed && !mine ? 'Missed voice call' : 'Voice call'}</T>
        <T s={12} lh={16} col={c.ink3}>{dur || ''}</T>
      </View>
      <Ms n="call" s={20} col={c.greenText} />
    </Tap>
  );
};

/** Top of every DM, WhatsApp-style: says plainly who can read this. Tap for the details. */
export const EncryptedNote = ({ chatId }: { chatId: string }) => {
  const who = otherMember(chatId), name = first(who);
  return (
    <Tap label="Messages and calls are end-to-end encrypted. Learn more" onPress={() => openEncrypted(name)}
      style={{ alignSelf: 'center', maxWidth: 320, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, backgroundColor: c.yellowSoft, marginBottom: 2 }}>
      <Ms n="lock" s={14} col={c.yellowText} />
      <T s={12} lh={17} col={c.yellowText}>Messages and calls are end-to-end encrypted.</T>
    </Tap>
  );
};
export const openEncrypted = (name: string) => openSheet(() => (
  <SheetBody title="End-to-end encrypted">
    <View style={{ gap: 14 }}>
      {[
        ['lock', `Only you and ${name} can read these messages or hear these calls. Not even Hive.`],
        ['flag', 'If you report a message, it’s shared with your college’s Hive admins.'],
      ].map(([icon, line]) => (
        <Row key={icon} gap={12} style={{ alignItems: 'flex-start' }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}><Ms n={icon} s={18} col={c.greenText} /></View>
          <T s={14} lh={20} col={c.ink2} style={{ flex: 1, paddingTop: 7 }}>{line}</T>
        </Row>
      ))}
      <BtnP onPress={closeSheet} style={{ marginTop: 4 }}>OK</BtnP>
    </View>
  </SheetBody>
));

export const screens: any = { 'Chat-X20-Call': CallScreen };
