import 'react-native-url-polyfill/auto';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold } from '@expo-google-fonts/poppins';
import { c, P, shadow } from './src/theme';
import { BtnP, BtnS, Hdr, Hosts, Ms, Pic, Screen, T, Tap, closeAllSheets, Row, Sw, confirmSheet, toast, Body, Sec, Li } from './src/ui';
import { go, known, navRef } from './src/nav';
import { byId, loadDb, meId, resetDb, setOffline, useData, useOffline, useRole, where } from './src/db';
import { openDm, personLine, openChat, openSupport } from './src/place';
import { seed } from './src/seed';
import { Login, restoreSession, signOut } from './src/auth';
import { screens as buzz, roots as buzzRoots } from './src/buzz';
import { screens as chat, roots as chatRoots } from './src/chat';
import { screens as places } from './src/places';
import { screens as res } from './src/res';
import { screens as call } from './src/call';

const Stack = createNativeStackNavigator<any>();
const Tabs = createBottomTabNavigator<any>();
const all: Record<string, React.ComponentType<any>> = { ...buzz, ...chat, ...places, ...res, ...call };
Object.keys(all).forEach(k => known.add(k));
known.add('NotPartOfFlow'); known.add('Profile');

/** PRD 10.2 Bucket B: back + destination's name + one centred line. */
const NotPartOfFlow = ({ route }: any) => (
  <Screen><Hdr title={route.params?.title} /><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><T s={15} col={c.ink2}>Not part of flow</T></View></Screen>
);
const CoursesTab = () => <Screen><Hdr noBack big title="Courses" /><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><T s={15} col={c.ink2}>Not part of flow</T></View></Screen>;
/** Basic profile: picture, name, role line, clubs. Others get Message; your own keeps the testing controls (testers need a way out, flagged in README). */
const ProfileView = ({ userId, tab }: { userId: string; tab?: boolean }) => {
  useData();
  const off = useOffline(), u = byId('profiles', userId), mine = userId === meId();
  const clubs = where('club_members', m => m.user_id === userId).map(m => ({ m, club: byId('clubs', m.club_id) })).concat(where('clubs', k => k.coordinator_id === userId).map(club => ({ m: { role: 'coordinator' }, club })));
  const chatOf = (clubId: string) => where('chats', x => x.kind === 'club' && x.club_id === clubId)[0];
  if (!u) return <Screen><Hdr title="Profile" /></Screen>;
  return (
    <Screen>
      {tab ? <Hdr noBack big title="Profile" /> : <Hdr title="" />}
      <Body pad={tab ? 110 : 24}>
        <View style={{ alignItems: 'center', paddingTop: 12, paddingHorizontal: 24 }}>
          <Pic size={96} img={u.img} name={u.full_name} fac={u.role === 'faculty'} />
          <T v s={22} lh={30} center style={{ marginTop: 14 }}>{u.full_name}</T>
          <T s={14} lh={20} col={c.ink2} center>{personLine(u)}</T>
          {u.roll_number ? <T s={13} lh={18} col={c.ink3} center>Roll {u.roll_number}</T> : null}
          {!mine ? <BtnP icon="chat_bubble" style={{ marginTop: 16, alignSelf: 'stretch' }} onPress={() => openDm(u.id)}>Message</BtnP> : null}
        </View>
        {clubs.length || mine ? <><Sec>Clubs</Sec>{clubs.map(({ m, club }) => {
          const ch = chatOf(club.id);
          return (
            <Tap key={club.id} label={club.name} disabled={!ch} onPress={() => ch && openChat(ch.id, 'Posts')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16 }}>
              <Pic size={40} shape="course" img={club.img} name={club.name} />
              <View style={{ flex: 1 }}><T s={15} lh={20} w="500">{club.name}</T><T s={12} lh={16} col={c.ink3}>{m.role === 'coordinator' ? 'Faculty coordinator' : m.role === 'lead' ? 'Lead' : 'Member'}</T></View>
              <Ms n="chevron_right" col={c.ink3} />
            </Tap>
          );
        })}
        {mine ? <Li min={56} style={{ paddingHorizontal: 16 }} left={<View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}><Ms n="explore" s={22} col={c.greenText} /></View>}
          title="Explore clubs" sub="See every club at your college" chevron onPress={() => go('BuzzClubs')} /> : null}</> : null}
        {mine ? <>
          <Sec>Help</Sec>
          <Li min={60} style={{ paddingHorizontal: 16 }} left={<View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}><Ms n="support_agent" s={22} col={c.greenText} /></View>}
            title="Hive Support" sub="Report a problem or ask a question" chevron onPress={openSupport} />
          <Sec>Testing</Sec>
          <View style={{ paddingHorizontal: 16, gap: 8 }}>
            <Row gap={12} style={{ minHeight: 48 }}><T s={15} style={{ flex: 1 }}>Simulate no connection</T><Sw label="Simulate no connection" on={off} onChange={setOffline} /></Row>
            <BtnS onPress={() => confirmSheet({ title: 'Reset demo data?', body: 'Everything goes back to the seed on this phone.', action: 'Reset demo data', onConfirm: async () => { await resetDb(seed); toast('Demo data reset'); } })}>Reset demo data</BtnS>
            <BtnS onPress={signOut}>Sign out</BtnS>
          </View>
        </> : null}
      </Body>
    </Screen>
  );
};
const ProfileTab = () => <ProfileView tab userId={meId()} />;
const ProfileScreen = ({ route }: any) => <ProfileView userId={route.params?.userId ?? meId()} />;

const TAB: Record<string, [string, string]> = { Courses: ['school', 'Courses'], Buzz: ['campaign', 'Buzz'], Chat: [P.ios ? 'chat_bubble' : 'forum', 'Chat'], Profile: ['person', 'Profile'] };
/** iOS floating glass pill, Android bottom bar (artboard nav). */
const TabBar = ({ state, navigation }: any) => {
  const i = useSafeAreaInsets();
  const items = state.routes.map((r: any, idx: number) => {
    const on = state.index === idx, [icon, label] = TAB[r.name];
    const press = () => navigation.navigate(r.name);
    return P.ios ? (
      <Tap key={r.name} onPress={press} label={label} style={{ flex: 1, alignItems: 'center', gap: 1, paddingTop: 6, paddingBottom: 5, borderRadius: 28, backgroundColor: on ? 'rgba(120,120,128,.16)' : undefined }}>
        <Ms n={icon} s={24} fill={on} col={on ? c.green : c.ink} /><T s={10} lh={13} w="600" col={on ? c.greenText : c.ink}>{label}</T>
      </Tap>
    ) : (
      <Tap key={r.name} onPress={press} label={label} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <View key={on ? 'on' : 'off'} style={{ width: 64, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: on ? c.green : 'transparent' }}><Ms n={icon} s={24} fill={on} col={on ? c.onFill : c.ink2} /></View>
        <T s={12} lh={16} w={on ? '700' : '500'} col={on ? c.ink : c.ink2}>{label}</T>
      </Tap>
    );
  });
  return P.ios
    ? <View style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(i.bottom, 16), flexDirection: 'row', padding: 4, borderRadius: 34, backgroundColor: 'rgba(255,255,255,.94)', boxShadow: shadow.glass } as any}>{items}</View>
    : <View style={{ height: 68 + i.bottom, paddingBottom: i.bottom, flexDirection: 'row', backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line }}>{items}</View>;
};
const Home = () => {
  const role = useRole();
  const B = buzzRoots[role === 'faculty' ? 'faculty' : 'student'], C = chatRoots[role === 'faculty' ? 'faculty' : 'student'];
  return (
    <Tabs.Navigator id={undefined as any} initialRouteName="Buzz" backBehavior="initialRoute" tabBar={p => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="Courses" component={CoursesTab} />
      <Tabs.Screen name="Buzz" component={B} />
      <Tabs.Screen name="Chat" component={C} />
      <Tabs.Screen name="Profile" component={ProfileTab} />
    </Tabs.Navigator>
  );
};

export default function App() {
  const [fonts] = useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold, MS: require('./assets/fonts/MS.ttf'), MSFill: require('./assets/fonts/MSFill.ttf') });
  const [ready, setReady] = useState(false);
  const role = useRole();
  useEffect(() => { (async () => { await loadDb(seed); await restoreSession(); setReady(true); })(); }, []);
  useEffect(() => closeAllSheets(), [role]);
  if (!fonts || !ready) return <View style={{ flex: 1, backgroundColor: c.page }} />;
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {!role ? <Login /> : (
        <NavigationContainer ref={navRef} key={role} linking={{ prefixes: ['hive://', 'https://hive.app'], config: { screens: { [role === 'faculty' ? 'FacultyPost' : 'StudentPost']: 'buzz/:postId' } } } as any}>
          <Stack.Navigator id={undefined as any} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.page } }}>
            <Stack.Screen name="Tabs" component={Home} />
            <Stack.Screen name="NotPartOfFlow" component={NotPartOfFlow} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            {Object.entries(all).map(([k, C]) => <Stack.Screen key={k} name={k} component={C} />)}
          </Stack.Navigator>
        </NavigationContainer>
      )}
      <Hosts />
    </SafeAreaProvider>
  );
}
