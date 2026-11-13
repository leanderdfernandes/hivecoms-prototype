// Global navigation so sheets and stores can navigate without hooks. Route names = artboard file stems.
import { createNavigationContainerRef, StackActions } from '@react-navigation/native';

export const navRef = createNavigationContainerRef<any>();
export const known = new Set<string>(); // filled by App.tsx from the screen registry

/** Push a screen by artboard stem. Unknown stems land on the Not part of flow placeholder (nothing is a dead tap). */
export function go(stem: string, params?: any) {
  if (!navRef.isReady()) return;
  if (!known.has(stem)) { console.warn('Not built:', stem); return navRef.dispatch(StackActions.push('NotPartOfFlow', { title: stem })); }
  navRef.dispatch(StackActions.push(stem, params));
}
/** Replace the current screen (tab switches inside a chat place keep the back stack flat). */
export function swap(stem: string, params?: any) {
  if (!navRef.isReady()) return;
  navRef.dispatch(StackActions.replace(known.has(stem) ? stem : 'NotPartOfFlow', known.has(stem) ? params : { title: stem }));
}
export const back = () => { if (navRef.isReady() && navRef.canGoBack()) navRef.goBack(); };
export const npf = (title: string) => go('NotPartOfFlow', { title });
export const goTab = (tab: 'Courses' | 'Buzz' | 'Chat' | 'Profile') => { if (navRef.isReady()) navRef.navigate('Tabs', { screen: tab }); };
