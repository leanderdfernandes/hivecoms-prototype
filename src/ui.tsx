// Shared components (PRD 11 step 1). One file on purpose; class names in comments map to the artboard CSS.
import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Keyboard, Image, KeyboardAvoidingView, PanResponder, Pressable, ScrollView, Switch, Text, TextInput, useWindowDimensions, View, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { c, f, P, shadow } from './theme';
import { IMG } from './images';
import { back } from './nav';
import { days, fmtDate, useMe } from './db';

type S = StyleProp<ViewStyle>;

/** Material Symbols Rounded. FILL 0 by default, `fill` for FILL 1. Ligature names, as in the artboards. */
export const Ms = ({ n, s = 22, col = c.ink, fill }: { n: string; s?: number; col?: string; fill?: boolean }) => (
  <Text allowFontScaling={false} accessible={false} importantForAccessibility="no" accessibilityElementsHidden style={{ fontFamily: fill ? f.msFill : f.ms, fontSize: s, lineHeight: s, width: s, height: s, color: col, textAlign: 'center' }}>{n}</Text>
);

/** Text. Always Poppins; weight picks the face (custom fonts ignore fontWeight on Android). `v` = heading (600 by default, tighter tracking). n = line clamp with ellipsis. */
const face = (w?: string, v?: boolean) => w === '700' ? f.p7 : w === '600' || (v && w !== '500') ? f.p6 : w === '500' || v ? f.p5 : f.p4;
export const T = ({ children, s = 14, lh, w, col = c.ink, v, n, style, center, sel }: { children?: ReactNode; s?: number; lh?: number; w?: '400' | '500' | '600' | '700'; col?: string; v?: boolean; n?: number; style?: StyleProp<TextStyle>; center?: boolean; sel?: boolean }) => (
  <Text selectable={sel} numberOfLines={n} ellipsizeMode="tail" style={[{ fontSize: s, lineHeight: lh ?? Math.round(s * 1.36), color: col }, { fontFamily: face(w, v) }, v ? { letterSpacing: -0.15 } : null, center ? { textAlign: 'center' } : null, style]}>{children}</Text>
);

/** Pressable with 450 ms long-press (G10). */
export const Tap = ({ onPress, onLong, style, children, label, disabled }: { onPress?: () => void; onLong?: () => void; style?: S; children?: ReactNode; label?: string; disabled?: boolean }) => (
  <Pressable hitSlop={6} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} onLongPress={onLong} delayLongPress={450} android_ripple={{ color: 'rgba(16,24,40,.08)', foreground: true }} style={({ pressed }) => [style as any, pressed && P.ios ? { opacity: 0.6 } : null]}>{children}</Pressable>
);

export const Row = ({ children, gap = 0, style }: { children?: ReactNode; gap?: number; style?: S }) => <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;

/** Screen frame: page background + status-bar inset. */
export const Screen = ({ children, style, noTop }: { children?: ReactNode; style?: S; noTop?: boolean }) => {
  const i = useSafeAreaInsets();
  return <View style={[{ flex: 1, backgroundColor: c.page, paddingTop: noTop ? 0 : i.top }, style]}>{children}</View>;
};
/** Scroll body with room for the home indicator / FAB. */
export const Body = ({ children, pad = 24, style, refresh }: { children?: ReactNode; pad?: number; style?: S; refresh?: boolean }) => (
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ paddingBottom: pad + 24 }, style]} showsVerticalScrollIndicator={false}>{children}</ScrollView>
);
export const useBottom = () => useSafeAreaInsets().bottom;

/** .ib icon button (44). */
export const IB = ({ n, onPress, label, col, fill, dot, count, s = 22, style }: { n: string; onPress?: () => void; label: string; col?: string; fill?: boolean; dot?: boolean; count?: number; s?: number; style?: S }) => (
  <Tap onPress={onPress} label={label} style={[{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, style]}>
    <Ms n={n} s={s} col={col} fill={fill} />
    {count ? (
      <View style={{ position: 'absolute', top: 4, right: 2, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: c.negative, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.page }}>
        <T s={11} lh={14} w="600" col={c.onFill}>{count > 9 ? '9+' : count}</T>
      </View>
    ) : dot ? <View style={{ position: 'absolute', top: 10, right: 11, width: 8, height: 8, borderRadius: 4, backgroundColor: c.honey, borderWidth: 1, borderColor: c.page }} /> : null}
  </Tap>
);

/** .pic avatar. img = key in IMG (real photo); otherwise initials. shape 'round' person, 'course' rounded square. fac = faculty ring. */
export const Pic = ({ img, name, size = 48, shape = 'round', fac, badge, style }: { img?: string; name?: string; size?: number; shape?: 'round' | 'course'; fac?: boolean; badge?: string; style?: S }) => {
  const r = shape === 'round' ? size / 2 : size >= 48 ? 14 : size >= 36 ? 10 : 8;
  const ini = (name || '?').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <View style={[{ width: size, height: size }, style]}>
      <View style={[{ width: size, height: size, borderRadius: r, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: shape === 'course' ? c.greenZone : c.sunken }, fac ? { boxShadow: `0 0 0 2px ${c.page}, 0 0 0 4px ${c.green}` } as any : null]}>
        {img?.startsWith('icon:') ? <Ms n={img.slice(5)} s={size * 0.5} col={c.greenText} /> : img && (IMG[img] || img.includes(':')) ? <Image source={IMG[img] ?? { uri: img }} accessibilityIgnoresInvertColors style={{ width: size, height: size }} /> : <T v s={size * 0.31} lh={size * 0.4} col={shape === 'course' ? c.greenText : c.ink2}>{ini}</T>}
      </View>
      {badge ? <View style={{ position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 2px ${c.page}` } as any}><Ms n={badge} s={13} col={c.ink2} /></View> : null}
    </View>
  );
};

/** .hdr header: back, optional picture, title + sub, right actions. */
export const Hdr = ({ title, sub, onBack = back, pic, right, onTitle, big, noBack, lines = 2 }: { title?: string; sub?: ReactNode; onBack?: () => void; pic?: ReactNode; right?: ReactNode; onTitle?: () => void; big?: boolean; noBack?: boolean; lines?: number }) => (
  <Row gap={6} style={{ minHeight: 52, paddingHorizontal: 6, paddingLeft: noBack ? 20 : 6 }}>
    {noBack ? null : <IB n={P.backIcon} onPress={onBack} label="Back" />}
    <Tap onPress={onTitle} disabled={!onTitle} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {pic}
      <View style={{ flex: 1, minWidth: 0 }}>
        {title ? <T v s={big ? 22 : 16} lh={big ? 28 : 21} n={lines} style={{ flexShrink: 1 }}>{title}</T> : null}
        {typeof sub === 'string' ? <T s={12} lh={16} col={c.ink3} n={1}>{sub}</T> : sub}
      </View>
    </Tap>
    {right}
  </Row>
);

/** .seg segmented control. */
export const Seg = ({ items, on, onPick, style }: { items: string[]; on: string; onPick: (x: string) => void; style?: S }) => (
  <View style={[{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: c.sunken, marginHorizontal: 16, marginTop: 2 }, style]}>
    {items.map(x => (
      <Tap key={x + (x === on)} onPress={() => onPick(x)} label={x} style={[{ flex: 1, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }, x === on ? { backgroundColor: c.surface, boxShadow: '0 1px 2px rgba(16,24,40,.14), 0 2px 6px -2px rgba(16,24,40,.12)' } as any : null]}>
        <T v w={x === on ? '600' : '500'} s={13} lh={18} n={1} col={x === on ? c.ink : c.ink2}>{x}</T>
      </Tap>
    ))}
  </View>
);

/** .chip row. */
/** soft = filled chips with a brand-tinted selection (chat list), instead of outlined with an ink selection. */
export const Chip = ({ label, on, onPress, icon, soft }: { label: string; on?: boolean; onPress?: () => void; icon?: string; soft?: boolean }) => {
  const bg = soft ? (on ? c.greenWash : c.sunken) : on ? c.ink : c.surface, fg = soft ? (on ? c.greenText : c.ink2) : on ? c.onFill : c.ink2;
  return (
    <Tap onPress={onPress} label={label} style={{ height: 32, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: bg, borderWidth: soft ? 0 : 1, borderColor: on ? c.ink : c.line }}>
      {icon ? <Ms n={icon} s={16} col={fg} /> : null}
      <T s={13} lh={18} w={on && soft ? '600' : '500'} col={fg}>{label}</T>
    </Tap>
  );
};
export const Chips = ({ items, on, onPick, style, soft }: { items: string[]; on: string; onPick: (x: string) => void; style?: S; soft?: boolean }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={[{ gap: 6, paddingHorizontal: 16, paddingTop: 6 }, style]}>
    {items.map(x => <Chip key={x} soft={soft} label={x} on={x === on || x.startsWith(on + ' ·')} onPress={() => onPick(x)} />)}
  </ScrollView>
);

/** Text tabs with a honey underline: the feed filter (replaces chips on Buzz). Scrolls when it overflows. */
export const Tabs = ({ items, on, onPick, mine }: { items: string[]; on: string; onPick: (x: string) => void; mine?: string }) => {
  const me = useMe();
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: c.line }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, alignItems: 'center' }}>
        {items.map(x => {
          const sel = x === on, own = x === mine;
          return (
            <React.Fragment key={x}>
              <Tap label={x} onPress={() => onPick(x)} style={{ height: 44, paddingHorizontal: 12, justifyContent: 'center' }}>
                <Row gap={6}>
                  {own ? <Pic size={20} img={me?.img} name={me?.full_name} /> : null}
                  <T s={14} lh={20} w={sel ? '600' : '500'} col={sel ? c.ink : c.ink3}>{own ? 'Yours' : x}</T>
                </Row>
                {sel ? <View style={{ position: 'absolute', left: 12, right: 12, bottom: 0, height: 3, borderRadius: 2, backgroundColor: c.honey }} /> : null}
              </Tap>
              {own ? <View style={{ width: 1, height: 20, marginHorizontal: 4, backgroundColor: c.line }} /> : null}
            </React.Fragment>
          );
        })}
      </ScrollView>
    </View>
  );
};

/** .search: a tappable bar, or live input when value/onChange given. */
export const SearchBar = ({ placeholder, onPress, value, onChange, autoFocus, style }: { placeholder: string; onPress?: () => void; value?: string; onChange?: (s: string) => void; autoFocus?: boolean; style?: S }) => {
  const inner = (
    <>
      <Ms n="search" s={20} col={c.ink3} />
      {onChange ? <TextInput autoFocus={autoFocus} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.ink3} style={{ flex: 1, fontSize: 15, color: c.ink, padding: 0, fontFamily: f.p4 }} /> : <T s={15} col={c.ink3} n={1}>{placeholder}</T>}
    </>
  );
  const st: S = [{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.search, marginHorizontal: 16, marginTop: 10 }, style];
  return onChange ? <View style={st}>{inner}</View> : <Tap onPress={onPress} label={placeholder} style={st}>{inner}</Tap>;
};

/** .sec section label */
export const Sec = ({ children, right, style }: { children?: ReactNode; right?: ReactNode; style?: S }) => (
  <Row style={[{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, justifyContent: 'space-between' }, style]}><T s={13} lh={18} w="600" col={c.ink2} style={{ flex: 1 }}>{children}</T>{right}</Row>
);
/** .grp grouped card */
export const Grp = ({ children, style }: { children?: ReactNode; style?: S }) => {
  const kids = React.Children.toArray(children).filter(Boolean);
  // Frameless list (no cards): rows sit on the page, hairlines between them, aligned to section labels.
  return <View style={[{ marginHorizontal: 2 } as any, style]}>{kids.map((k, i) => <View key={i}>{i ? <View style={{ height: 1, backgroundColor: c.line, marginLeft: 14 }} /> : null}{k}</View>)}</View>;
};
/** .li list row: left node, title, subtitle, right node. Omit onPress for a static row. */
export const Li = ({ left, title, sub, right, onPress, onLong, min = 52, bold, chevron, titleCol, style, sub2 }: { left?: ReactNode; title?: ReactNode; sub?: ReactNode; sub2?: ReactNode; right?: ReactNode; onPress?: () => void; onLong?: () => void; min?: number; bold?: boolean; chevron?: boolean; titleCol?: string; style?: S }) => {
  const label = typeof title === 'string' ? title : undefined;
  return (
    <Tap onPress={onPress} onLong={onLong} disabled={!onPress && !onLong} label={label} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: min, paddingVertical: 8, paddingHorizontal: 14 }, style]}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' ? <T s={15} lh={20} n={2} w={bold ? '600' : undefined} col={titleCol}>{title}</T> : title}
        {typeof sub === 'string' ? <T s={12} lh={16} col={c.ink3} n={2}>{sub}</T> : sub}
        {sub2}
      </View>
      {right}
      {chevron ? <Ms n="chevron_right" col={c.ink3} /> : null}
    </Tap>
  );
};
/** .row chats-list row */
export const ChatRow = ({ pic, title, time, sub, preview, badge, onPress, unread }: { pic: ReactNode; title: string; time?: string; sub?: string; preview?: string; badge?: number; onPress?: () => void; unread?: boolean }) => (
  <Tap onPress={onPress} label={title} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, minHeight: 76 }}>
    {pic}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Row gap={8} style={{ alignItems: 'baseline' }}><T s={16} lh={21} w="600" n={1} style={{ flex: 1 }}>{title}</T>{time ? <T s={12} lh={16} w={unread ? '600' : undefined} col={unread ? c.greenText : c.ink3}>{time}</T> : null}</Row>
      {sub ? <T s={13} lh={17} col={c.ink3} n={1}>{sub}</T> : null}
      <Row gap={8}><T s={14} lh={19} col={c.ink2} n={1} style={{ flex: 1 }}>{preview}</T>{badge ? <Badge n={badge} /> : null}</Row>
    </View>
  </Tap>
);

/** .badge — 99+ in badges only. label overrides ("3 new"). */
export const Badge = ({ n, label }: { n?: number; label?: string }) => (
  <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: c.greenZone, alignItems: 'center', justifyContent: 'center' }}><T v s={12} lh={18} col={c.greenText}>{label ?? ((n ?? 0) > 99 ? '99+' : n)}</T></View>
);
/** .tg tag */
export const Tag = ({ children, green, icon }: { children?: ReactNode; green?: boolean; icon?: string }) => (
  <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: green ? c.greenWash : c.sunken }}>{icon ? <Ms n={icon} s={14} col={green ? c.greenText : c.ink2} /> : null}<T s={12} lh={18} w="600" col={green ? c.greenText : c.ink2}>{children}</T></View>
);
/** "% seen" action, sits in a post's action row next to Comments. 100% turns green with done_all. */
export const SeenChip = ({ pct, onPress }: { pct: number; onPress?: () => void }) => {
  const full = pct >= 100;
  return (
    <Tap onPress={onPress} label={`${pct}% seen. See who saw it`} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ms n={full ? 'done_all' : 'visibility'} s={18} col={full ? c.greenText : c.ink2} /><T s={13} lh={18} w="500" col={full ? c.greenText : c.ink2}>{pct}% seen</T>
    </Tap>
  );
};
/** .fi file-type tile. kind: slides | pdf | doc | image | link | video. size 32 or 40 (.l) */
export const fileIcon = (mime?: string, kind?: string) => kind === 'link' ? 'link' : kind === 'video' ? 'play_circle' : /presentation|ppt/.test(mime || '') ? 'slideshow' : /image/.test(mime || '') ? 'image' : /sheet|xls/.test(mime || '') ? 'table_chart' : 'description';
export const Fi = ({ n = 'description', l }: { n?: string; l?: boolean }) => (
  <View style={{ width: l ? 40 : 32, height: l ? 40 : 32, borderRadius: l ? 10 : 8, backgroundColor: c.sunken, alignItems: 'center', justifyContent: 'center' }}><Ms n={n} s={l ? 20 : 18} col={c.ink2} /></View>
);
/** .fo folder tile */
export const Fo = ({ n = 'folder', mut, fill = true }: { n?: string; mut?: boolean; fill?: boolean }) => (
  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: mut ? c.sunken : c.greenWash, alignItems: 'center', justifyContent: 'center' }}><Ms n={n} fill={fill} col={mut ? c.ink3 : c.greenText} /></View>
);

/** Buttons: .bp primary, .bs secondary, .bt text */
export const BtnP = ({ children, onPress, disabled, icon, style }: { children?: ReactNode; onPress?: () => void; disabled?: boolean; icon?: string; style?: S }) => (
  <Tap onPress={onPress} disabled={disabled} label={typeof children === 'string' ? children : undefined} style={[{ height: 48, borderRadius: 999, backgroundColor: disabled ? c.sunken : c.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16 }, disabled ? null : { boxShadow: shadow.button } as any, style]}>
    {icon ? <Ms n={icon} s={20} col={disabled ? c.inkOff : c.onFill} /> : null}<T v s={16} lh={22} n={1} col={disabled ? c.inkOff : c.onFill}>{children}</T>
  </Tap>
);
export const BtnS = ({ children, onPress, neg, icon, style }: { children?: ReactNode; onPress?: () => void; neg?: boolean; icon?: string; style?: S }) => (
  <Tap onPress={onPress} label={typeof children === 'string' ? children : undefined} style={[{ height: 48, borderRadius: 999, backgroundColor: c.surface, boxShadow: shadow.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16 } as any, style]}>
    {icon ? <Ms n={icon} s={20} col={neg ? c.negative : c.ink} /> : null}<T v s={15} lh={21} n={1} col={neg ? c.negative : c.ink}>{children}</T>
  </Tap>
);
export const BtnT = ({ children, onPress, neg, icon, style, col }: { children?: ReactNode; onPress?: () => void; neg?: boolean; icon?: string; style?: S; col?: string }) => {
  const k = col ?? (neg ? c.negative : c.greenText);
  return <Tap onPress={onPress} label={typeof children === 'string' ? children : undefined} style={[{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }, style]}>{icon ? <Ms n={icon} s={20} col={k} /> : null}<T v s={15} lh={21} col={k}>{children}</T></Tap>;
};
/** Action tile for add/attach drawers: tinted brand square + filled icon, so each kind of thing reads at a glance. */
export const ActionTile = ({ icon, label, onPress, tone = 'green', size = 56, width = '25%' }: { icon: string; label: string; onPress?: () => void; tone?: 'green' | 'yellow' | 'blue'; size?: number; width?: any }) => (
  <Tap onPress={onPress} label={label} style={{ width, alignItems: 'center', gap: 6, paddingVertical: 8 }}>
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}><Ms n={icon} s={size * 0.44} col={c.greenText} /></View>
    <T s={12} lh={16} col={c.ink2} center>{label}</T>
  </Tap>
);
/** .pill small button (.sbtn) */
export const Pill = ({ children, onPress, icon, on, style }: { children?: ReactNode; onPress?: () => void; icon?: string; on?: boolean; style?: S }) => (
  <Tap onPress={onPress} label={typeof children === 'string' ? children : undefined} style={[{ height: 36, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: on ? 'transparent' : c.surface }, on ? null : { boxShadow: shadow.card } as any, style]}>
    {icon ? <Ms n={icon} s={18} col={on ? c.greenText : c.ink} /> : null}<T v s={13} lh={18} n={1} col={on ? c.greenText : c.ink}>{children}</T>
  </Tap>
);
/** .ck tick */
export const Ck = ({ on, sq }: { on?: boolean; sq?: boolean }) => (
  <View style={[{ width: 24, height: 24, borderRadius: sq ? 7 : 12, alignItems: 'center', justifyContent: 'center' }, on ? { backgroundColor: c.green } : { borderWidth: 2, borderColor: c.inkOff }]}>{on ? <Ms n="check" s={16} col={c.onFill} /> : null}</View>
);
/** .sw switch */
export const Sw = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) => (
  <Switch accessibilityLabel={label} value={on} onValueChange={onChange} trackColor={{ true: c.green, false: 'rgba(120,120,128,.24)' }} thumbColor="#ffffff" />
);
/** .inp text field */
export const Field = (p: React.ComponentProps<typeof TextInput>) => (
  <TextInput placeholderTextColor={c.ink3} {...p} style={[{ minHeight: 48, paddingHorizontal: 14, borderRadius: 12, backgroundColor: c.sunken, fontSize: 15, color: c.ink, fontFamily: f.p4 }, p.style]} />
);
/** .card */
export const Card = ({ children, style, onPress }: { children?: ReactNode; style?: S; onPress?: () => void }) => {
  const st: S = [{ backgroundColor: c.surface, borderRadius: 18, boxShadow: shadow.card } as any, style];
  return onPress ? <Tap onPress={onPress} style={st}>{children}</Tap> : <View style={st}>{children}</View>;
};
/** .fab */
export const Fab = ({ label, icon = 'add', onPress, overTabs, round }: { label: string; icon?: string; onPress?: () => void; overTabs?: boolean; round?: boolean }) => {
  const i = useSafeAreaInsets();
  const lift = overTabs && P.ios ? 76 : 0; // iOS tab bar floats over the screen
  if (round) return (
    <Tap onPress={onPress} label={label} style={{ position: 'absolute', right: 16, bottom: Math.max(P.fabBottom, i.bottom + 16) + lift, width: 56, height: 56, borderRadius: 28, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center', boxShadow: shadow.button + ', 0 10px 24px -8px rgba(16,24,40,.35)' } as any}>
      <Ms n={icon} s={26} col={c.onFill} />
    </Tap>
  );
  return (
    <Tap onPress={onPress} label={label} style={{ position: 'absolute', right: 16, bottom: Math.max(P.fabBottom, i.bottom + 16) + lift, height: 52, paddingLeft: 16, paddingRight: 22, borderRadius: 999, backgroundColor: c.green, flexDirection: 'row', alignItems: 'center', gap: 6, boxShadow: shadow.button + ', 0 10px 24px -8px rgba(16,24,40,.35)' } as any}>
      <Ms n={icon} col={c.onFill} /><T v s={16} lh={22} col={c.onFill}>{label}</T>
    </Tap>
  );
};

/** Shared empty state (PRD 9): icon in 64 sunken circle, Poppins 600 title, one ink-2 line, at most one button. */
export const Empty = ({ icon = 'inbox', title, line, action, onAction }: { icon?: string; title: string; line?: string; action?: string; onAction?: () => void }) => (
  <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingVertical: 48, gap: 8 }}>
    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.sunken, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}><Ms n={icon} s={28} col={c.ink2} /></View>
    <T v s={16} lh={22} center>{title}</T>
    {line ? <T s={14} lh={20} col={c.ink2} center>{line}</T> : null}
    {action ? <BtnT onPress={onAction}>{action}</BtnT> : null}
  </View>
);

/** .sld first-page preview for slides; .pg for documents. Real file previews come from `file_pages` seed text. */
export const SlidePage = ({ unit, title, page, total, lines, doc, big, style }: { unit?: string; title: string; page?: number; total?: number; lines?: string[]; doc?: boolean; big?: boolean; style?: S }) => (
  <View style={[{ backgroundColor: doc ? c.sunken : c.greenWash, padding: big ? 14 : 10, paddingHorizontal: doc ? 22 : big ? 14 : 10, borderRadius: 8 }, style]}>
    <View style={{ backgroundColor: c.surface, borderRadius: 6, padding: big ? 20 : 12, minHeight: big ? (doc ? 420 : 210) : 98, boxShadow: '0 1px 2px rgba(42,38,34,.12)' } as any}>
      {unit ? <T s={big ? 11 : 9} lh={big ? 16 : 12} w="600" col={c.greenText} style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{unit}</T> : null}
      <T v s={big ? 20 : 15} lh={big ? 26 : 18} style={{ marginTop: 3 }} n={big ? 3 : 2}>{title}</T>
      {(lines || []).map((l, i) => <T key={i} s={big ? 14 : 10} lh={big ? 21 : 14} col={c.ink2} style={{ marginTop: big ? 8 : 2 }} n={big ? 3 : 1}>{l}</T>)}
      {page ? <T s={big ? 11 : 9} lh={12} col={c.ink3} style={{ marginTop: big ? 14 : 6 }}>{page}{total ? ` / ${total}` : ''}</T> : null}
    </View>
  </View>
);

export const Skeleton = ({ rows = 5, h = 60 }: { rows?: number; h?: number }) => (
  <View style={{ gap: 10, padding: 16 }}>{Array.from({ length: rows }).map((_, i) => <View key={i} style={{ height: h, borderRadius: 12, backgroundColor: c.sunken }} />)}</View>
);

/* ---------- Joy: confetti + a success buzz, for finishing things ---------- */
export const celebrate = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); };
const CONF = [c.green, c.yellow, c.honey, c.blue, c.present];
/** One burst of brand-coloured confetti from a point on screen. Pure Animated, native driver, no library. */
export const Confetti = ({ n = 42, from = 0.32 }: { n?: number; from?: number }) => {
  const { width, height } = useWindowDimensions();
  const t = useRef(new Animated.Value(0)).current;
  const bits = useRef(Array.from({ length: n }, (_, i) => {
    const up = height * (0.12 + Math.random() * 0.22), fall = height * (0.55 + Math.random() * 0.3);
    const k = 2 * up + 2 * Math.sqrt(up * up + up * fall); // y(t) = -k t + (k + fall) t^2 peaks at -up
    const vx = (Math.random() - 0.5) * width * 1.15;
    return { vx, k, fall, rot: (Math.random() - 0.5) * 1440, col: CONF[i % CONF.length], w: 7 + Math.random() * 6, h: 9 + Math.random() * 9, round: i % 4 === 0, delay: Math.random() * 0.08 };
  })).current;
  useEffect(() => { Animated.timing(t, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true }).start(); }, []);
  const steps = [0, 0.08, 0.16, 0.25, 0.35, 0.5, 0.7, 1];
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' }}>
      {bits.map((b, i) => {
        const y = steps.map(s => { const u = Math.max(0, s - b.delay) / (1 - b.delay); return -b.k * u + (b.k + b.fall) * u * u; });
        const x = steps.map(s => b.vx * (1 - (1 - s) * (1 - s)));
        return (
          <Animated.View key={i} style={{
            position: 'absolute', left: width / 2 - b.w / 2, top: height * from, width: b.w, height: b.round ? b.w : b.h, borderRadius: b.round ? b.w : 2, backgroundColor: b.col,
            opacity: t.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
            transform: [{ translateX: t.interpolate({ inputRange: steps, outputRange: x }) }, { translateY: t.interpolate({ inputRange: steps, outputRange: y }) }, { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${b.rot}deg`] }) }],
          }} />
        );
      })}
    </View>
  );
};
/** Big green tick that pops in with a ripple. */
export const DoneBurst = ({ size = 112 }: { size?: number }) => {
  const pop = useRef(new Animated.Value(0)).current, ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 110, useNativeDriver: true }),
      Animated.timing(ring, { toValue: 1, duration: 1100, delay: 120, easing: Easing.out(Easing.exp), useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <View style={{ width: size * 1.8, height: size * 1.8, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size, height: size, borderRadius: size, borderWidth: 3, borderColor: c.present, opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.75] }) }] }} />
      <Animated.View style={{ width: size, height: size, borderRadius: size, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 28px -10px rgba(76,126,84,.6)', transform: [{ scale: pop }, { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ['-30deg', '0deg'] }) }] } as any}>
        <Ms n="check" s={size * 0.5} col={c.onFill} />
      </Animated.View>
    </View>
  );
};
/** Rises in after a delay. */
export const Rise = ({ delay = 0, children, style }: { delay?: number; children?: ReactNode; style?: S }) => {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, []);
  return <Animated.View style={[style, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>{children}</Animated.View>;
};

/* ---------- Sheets, confirm, toast (G9, G10): imperative hosts mounted once in App.tsx ---------- */
type SheetFn = () => ReactNode;
export const useUi = create<{ sheets: SheetFn[]; toast: null | { text: string; undo?: () => void; key: number }; }>(() => ({ sheets: [], toast: null }));
/** Open a sheet. Pass a render function so it re-renders with live data. Stacks over the current one. */
// Dismiss first: a sheet opened over an open keyboard would sit behind it. Sheets with autoFocus bring it back.
export const openSheet = (fn: SheetFn) => { Keyboard.dismiss(); useUi.setState(s => ({ sheets: [...s.sheets, fn] })); };
/** Close the top sheet. */
export const closeSheet = () => useUi.setState(s => ({ sheets: s.sheets.slice(0, -1) }));
export const closeAllSheets = () => useUi.setState({ sheets: [] });
/** Replace the top sheet (next step in a flow). */
export const swapSheet = (fn: SheetFn) => useUi.setState(s => ({ sheets: [...s.sheets.slice(0, -1), fn] }));
let tk = 0, timer: any;
/** Toast. With undo: 5 seconds (G9). */
export const toast = (text: string, undo?: () => void) => {
  clearTimeout(timer); tk++;
  useUi.setState({ toast: { text, undo, key: tk } });
  timer = setTimeout(() => useUi.setState({ toast: null }), undo ? 5000 : 3000);
};
/** Confirm sheet for irreversible or many-people actions only. */
export const confirmSheet = ({ title, body, action, neg = true, onConfirm, cancel = 'Cancel' }: { title: string; body?: string; action: string; neg?: boolean; onConfirm: () => void; cancel?: string }) =>
  openSheet(() => (
    <SheetBody title={title}>
      {body ? <T s={14} lh={20} col={c.ink2}>{body}</T> : null}
      <View style={{ gap: 8, marginTop: 16 }}>
        <BtnS neg={neg} onPress={() => { closeSheet(); onConfirm(); }}>{action}</BtnS>
        <BtnS onPress={closeSheet}>{cancel}</BtnS>
      </View>
    </SheetBody>
  ));
/** Sheet content frame: title row with close. */
export const SheetBody = ({ title, sub, children, noClose, right }: { title?: string; sub?: string; children?: ReactNode; noClose?: boolean; right?: ReactNode }) => (
  <View>
    {title ? (
      <Row gap={12} style={{ marginBottom: 12 }}>
        <View style={{ flex: 1 }}><T v s={17} lh={22}>{title}</T>{sub ? <T s={12} lh={17} col={c.ink3}>{sub}</T> : null}</View>
        {right}
        {noClose ? null : <Tap onPress={closeSheet} label="Close" style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(120,120,128,.14)', alignItems: 'center', justifyContent: 'center' }}><Ms n="close" s={18} /></Tap>}
      </Row>
    ) : null}
    {children}
  </View>
);
/** Option row inside a sheet */
export const SheetRow = ({ icon, label, sub, onPress, neg, right, fill }: { icon?: string; label: string; sub?: string; onPress?: () => void; neg?: boolean; right?: ReactNode; fill?: boolean }) => (
  <Tap onPress={onPress} label={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, paddingVertical: 6 }}>
    {icon ? <Ms n={icon} fill={fill} col={neg ? c.negative : c.ink2} /> : null}
    <View style={{ flex: 1 }}><T s={15} lh={20} col={neg ? c.negative : c.ink}>{label}</T>{sub ? <T s={12} lh={16} col={c.ink3}>{sub}</T> : null}</View>
    {right}
  </Tap>
);

const OneSheet = ({ fn, top }: { fn: SheetFn; top: boolean }) => {
  const y = useRef(new Animated.Value(600)).current;
  const i = useSafeAreaInsets();
  const hh = useWindowDimensions().height;
  useEffect(() => { Animated.timing(y, { toValue: 0, duration: 280, easing: Easing.out(Easing.exp), useNativeDriver: true }).start(); }, []);
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6,
    onPanResponderMove: (_, g) => { if (g.dy > 0) y.setValue(g.dy); },
    onPanResponderRelease: (_, g) => { if (g.dy > 90) closeSheet(); else Animated.spring(y, { toValue: 0, useNativeDriver: true }).start(); },
  })).current;
  return (
    <View pointerEvents={top ? 'auto' : 'none'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }}>
      <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: y.interpolate({ inputRange: [0, 600], outputRange: [1, 0], extrapolate: 'clamp' }) }}><Pressable accessibilityLabel="Close" onPress={closeSheet} style={{ flex: 1, backgroundColor: c.scrim }} /></Animated.View>
      <KeyboardAvoidingView behavior="padding" style={{ maxHeight: '100%' }}>
        <Animated.View style={{ transform: [{ translateY: y }], margin: P.sheetInset, marginBottom: P.ios ? Math.max(8, i.bottom - 12) : 0, maxHeight: hh * 0.92, flexShrink: 1, backgroundColor: c.surface, borderRadius: P.sheetRadius, borderBottomLeftRadius: P.ios ? P.sheetRadius : 0, borderBottomRightRadius: P.ios ? P.sheetRadius : 0, boxShadow: shadow.overlay } as any}>
          <View {...pan.panHandlers} style={{ paddingTop: 10, paddingBottom: 12 }}><View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: c.inkOff, alignSelf: 'center' }} /></View>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: P.ios ? 24 : Math.max(24, i.bottom + 12) }}>{fn()}</ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
};
/** Mount once above the navigator. */
export const Hosts = () => {
  const { sheets, toast: t } = useUi();
  const i = useSafeAreaInsets();
  // Registered while a sheet is open: the newest back handler runs first, so this beats the navigator's.
  const open = sheets.length > 0;
  useEffect(() => {
    if (!open) return;
    const h = BackHandler.addEventListener('hardwareBackPress', () => { closeSheet(); return true; });
    return () => h.remove();
  }, [open]);
  return (
    <>
      {sheets.map((fn, idx) => <OneSheet key={idx} fn={fn} top={idx === sheets.length - 1} />)}
      {t ? (
        <View accessibilityRole="alert" style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(96, i.bottom + 88), minHeight: 48, borderRadius: 999, backgroundColor: c.inverse, flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingRight: 6, boxShadow: shadow.overlay } as any}>
          <T s={14} lh={19} col="#ffffff" style={{ flex: 1, paddingVertical: 12 }}>{t.text}</T>
          {t.undo ? <Tap label="Undo" onPress={() => { t.undo!(); useUi.setState({ toast: null }); }} style={{ height: 40, paddingHorizontal: 14, justifyContent: 'center' }}><T v s={14} lh={19} col={c.toastUndo}>Undo</T></Tap> : null}
        </View>
      ) : null}
    </>
  );
};

/** Paste button for link fields: fills the field from the clipboard. */
export const PasteBtn = ({ onPaste }: { onPaste: (s: string) => void }) => (
  <Tap label="Paste" style={{ height: 44, justifyContent: 'center', paddingHorizontal: 10 }} onPress={async () => { const t = (await Clipboard.getStringAsync()).trim(); t ? onPaste(t) : toast('Nothing to paste'); }}><T v s={14} lh={19} col={c.greenText}>Paste</T></Tap>
);

/* ---------- Date and time: one picker and one schedule sheet for the whole app ---------- */
const IosPicker = ({ title, value, onSet }: any) => {
  const [v, setV] = useState(new Date(value));
  return (
    <SheetBody title={title}>
      <DateTimePicker themeVariant="light" value={v} mode="datetime" display="spinner" minimumDate={new Date()} onValueChange={(_: any, d: Date) => setV(d)} />
      <BtnP style={{ marginTop: 8 }} onPress={() => { closeSheet(); onSet(v.getTime()); }}>Set date and time</BtnP>
    </SheetBody>
  );
};
/** Date then time. Android: two native dialogs. iOS: spinner in a sheet. Past times are refused. */
export const pickDateTime = (value: number, cb: (t: number) => void, title = 'Pick date and time') => {
  const ok = (t: number) => (t > Date.now() ? cb(t) : toast('Pick a later time'));
  const start = Math.max(value || 0, Date.now());
  if (P.ios) return openSheet(() => <IosPicker title={title} value={start} onSet={ok} />);
  DateTimePickerAndroid.open({ value: new Date(start), mode: 'date', minimumDate: new Date(), onValueChange: (_: any, day: Date) => {
    // The date dialog must finish closing before the time dialog can open.
    setTimeout(() => DateTimePickerAndroid.open({ value: new Date(start), mode: 'time', onValueChange: (__: any, tm: Date) => { const r = new Date(day); r.setHours(tm.getHours(), tm.getMinutes(), 0, 0); ok(r.getTime()); } }), 300);
  } });
};
export const tomorrow9 = () => days(1, 9);
/** Next Monday at 9 am, never tomorrow (that's already its own option). */
export const nextMonday9 = () => { const n = (8 - new Date().getDay()) % 7 || 7; return days(n === 1 ? 8 : n, 9); };
/** Quick options + custom, as Slack does it. */
export const openSchedule = ({ title = 'Schedule', value, onPick }: { title?: string; value?: number; onPick: (t: number) => void }) => {
  const done = (t: number) => { closeSheet(); onPick(t); };
  openSheet(() => (
    <SheetBody title={title}>
      <SheetRow icon="today" label="Tomorrow, 9 am" sub={fmtDate(tomorrow9())} onPress={() => done(tomorrow9())} />
      <SheetRow icon="event_upcoming" label="Next Monday, 9 am" sub={fmtDate(nextMonday9())} onPress={() => done(nextMonday9())} />
      <SheetRow icon="calendar_month" label="Pick date and time" right={<Ms n="chevron_right" col={c.ink3} />} onPress={() => pickDateTime(value || tomorrow9(), done)} />
    </SheetBody>
  ));
};
