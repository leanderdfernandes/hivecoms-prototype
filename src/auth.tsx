// Email + password login. Uses Supabase Auth when EXPO_PUBLIC_SUPABASE_URL is set; otherwise local demo accounts (see README).
import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, ScrollView, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { BtnP, Field, IB, Screen, T } from './ui';
import { c } from './theme';
import { setSession } from './db';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL, anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const supabase = url && anon ? createClient(url, anon, { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }) : null;

// The role comes from the signed-in user: set user_metadata.role = "faculty" | "student" in Supabase, or use an email containing "faculty".
// ponytail: both real accounts map to the demo world's Anita and Rohan until profiles live in Supabase.
const asRole = (email?: string | null, meta?: any): 'faculty' | 'student' => (meta?.role === 'faculty' || /faculty/i.test(email || '') ? 'faculty' : 'student');
const enter = (r: 'faculty' | 'student') => setSession(r === 'faculty' ? 'p-anita' : 'p-rohan', r);
const LOCAL = { 'faculty@hive.test': 'faculty', 'student@hive.test': 'student' } as const;
const LOCAL_PW = 'hive1234', LOCAL_KEY = 'hive-local-session';

export async function restoreSession() {
  if (supabase) { const { data } = await supabase.auth.getSession(); if (data.session) enter(asRole(data.session.user.email, data.session.user.user_metadata)); return; }
  const r = await AsyncStorage.getItem(LOCAL_KEY).catch(() => null);
  if (r === 'faculty' || r === 'student') enter(r);
}
export async function signOut() {
  if (supabase) await supabase.auth.signOut(); else await AsyncStorage.removeItem(LOCAL_KEY);
  setSession(null, null);
}

export const Login = () => {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [show, setShow] = useState(false);
  const submit = async () => {
    setErr(''); setBusy(true);
    const e = email.trim().toLowerCase();
    try {
      if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: e, password: pw });
        if (error) throw error;
        enter(asRole(data.user.email, data.user.user_metadata));
      } else {
        const r = (LOCAL as any)[e];
        if (!r || pw !== LOCAL_PW) throw new Error('bad');
        await AsyncStorage.setItem(LOCAL_KEY, r); enter(r);
      }
    } catch (x: any) {
      const m = x?.message || '';
      setErr(/network|fetch/i.test(m) ? "Couldn't reach Hive. Check your connection and try again." : m === 'bad' || x?.code === 'invalid_credentials' ? "That email and password don't match." : m);
    }
    setBusy(false);
  };
  return (
    <Screen>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
        <Image source={require('../assets/icon.png')} accessibilityIgnoresInvertColors style={{ width: 72, height: 72, alignSelf: 'center', marginBottom: 8 }} />
        <T v s={22} lh={28} center>Sign in to Hive</T>
        <T s={14} lh={20} col={c.ink2} center style={{ marginBottom: 12 }}>Use your college email and password.</T>
        <View style={{ gap: 4 }}><T s={13} lh={18} w="600" col={c.ink2}>Email</T><Field value={email} onChangeText={setEmail} placeholder="you@college.edu" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" autoComplete="email" accessibilityLabel="Email" /></View>
        <View style={{ gap: 4 }}><T s={13} lh={18} w="600" col={c.ink2}>Password</T><View style={{ justifyContent: 'center' }}><Field value={pw} onChangeText={setPw} placeholder="Password" secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} textContentType="password" autoComplete="password" onSubmitEditing={submit} accessibilityLabel="Password" style={{ paddingRight: 48 }} /><IB n={show ? 'visibility_off' : 'visibility'} col={c.ink2} label={show ? 'Hide password' : 'Show password'} onPress={() => setShow(!show)} style={{ position: 'absolute', right: 2 }} /></View></View>
        {err ? <T s={13} lh={18} col={c.negative} style={{ marginTop: 2 }}>{err}</T> : null}
        <BtnP onPress={submit} disabled={busy || !email || !pw} style={{ marginTop: 8 }}>{busy ? 'Signing in…' : 'Sign in'}</BtnP>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
};
