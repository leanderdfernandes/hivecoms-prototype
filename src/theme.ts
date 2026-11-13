// Hive DS tokens (project/ds/hive/tokens.json + artboard CSS). No other colours (G5).
import { Platform } from 'react-native';

export const c = {
  green: '#65a66f', greenZone: '#e6f2e3', greenWash: '#eef6ec', greenSoft: '#f5faf3', greenText: '#387342',
  onFill: '#ffffff', honey: '#edc752', ink: '#3f4045', ink2: '#5d6166', ink3: '#6b7075', inkOff: '#b9bec2',
  page: '#fbfbfb', surface: '#ffffff', sunken: '#f1f4f5', inverse: '#25282c', track: '#e8edef', line: '#e8ecee',
  caution: '#b45309', cautionBg: '#fdf0e1', negative: '#bd3a26', positive: '#1f7a3d', scrim: 'rgba(0,0,0,.28)',
  search: 'rgba(120,120,128,.12)', toastUndo: '#8fcb98',
  // Brand palette (Hive brand sheet)
  yellow: '#f4dd97', yellowSoft: '#fcf4d9', yellowText: '#7a5a0c', blueText: '#2b6672', blue: '#bfe0e7', blueSoft: '#e9f2f4', mint: '#e5f3e8', present: '#99d4a2',
};
export const shadow = {
  card: '0 0 0 1px rgba(16,24,40,.07), 0 1px 2px rgba(16,24,40,.04)',
  overlay: '0 0 0 1px rgba(16,24,40,.06), 0 16px 32px rgba(16,24,40,.14), 0 44px 90px -24px rgba(16,24,40,.32)',
  button: 'inset 0 1px 0 rgba(255,255,255,.35), 0 1px 2px rgba(16,24,40,.14), 0 4px 10px -4px rgba(76,126,84,.35)',
  glass: 'inset 0 1px 0 rgba(255,255,255,.6), 0 0 0 1px rgba(16,17,20,.06), 0 8px 32px rgba(16,17,20,.10)',
};
export const f = { p4: 'Poppins_400Regular', p5: 'Poppins_500Medium', p6: 'Poppins_600SemiBold', p7: 'Poppins_700Bold', ms: 'MS', msFill: 'MSFill' };
const ios = Platform.OS === 'ios';
// G3 platform switches. Status bar height comes from safe-area insets, not a fake bar.
export const P = {
  ios, android: !ios, backIcon: ios ? 'chevron_left' : 'arrow_back', fabBottom: ios ? 44 : 24,
  sheetInset: ios ? 8 : 0, sheetRadius: ios ? 36 : 28, tabH: ios ? 88 : 80,
};
