# Hive Coms prototype

Buzz, Chat and Resources for user testing. Expo SDK 58, React Navigation. Not production.
Source of truth: the Hive Buzz canvas and `../Hive Buzz, Chat and Resources — PRD for React Native build.md`.

## Run

```bash
npm install
npx expo start
```

Open in Expo Go (press `a` for an Android emulator, or scan the QR code).

## Sign in

- **Without Supabase (default):** `faculty@hive.test` or `student@hive.test`, password `hive1234`.
- **With Supabase:** copy `.env.example` to `.env`, add the project URL and anon key, restart with `npx expo start -c`. Local demo accounts then stop working.
  Create one faculty and one student in Supabase Auth. Set `role` in user metadata to `faculty` or `student` (or use an email containing "faculty"). Faculty maps to Anita Naik and student to Rohan Kamat in the seed.

Testing controls are on the Profile tab: Simulate no connection, Reset demo data, Sign out.

## Where things are

| File | What |
|---|---|
| `src/ui.tsx` | Shared components, sheets, toast |
| `src/theme.ts` | Hive DS tokens |
| `src/db.ts` | Local store and date helpers. All writes go through `mut()` |
| `src/seed.ts` | Base seed; each module also has a `seed*` function |
| `src/place.tsx` | Chat place header and tabs, `sendMessage()` |
| `src/buzz.tsx`, `chat.tsx`, `places.tsx`, `res.tsx` | Screens, keyed by artboard file stem |
| `assets/seed/` | Seed photos (`src/images.ts` maps the keys) |

Routes use artboard stems (`go('Res-F02-Folder', { folderId, chatId })`). An unregistered stem opens the Not part of flow screen.

## Corners cut for testing

- **Data is local to each phone.** Only login uses Supabase. Two phones don't see each other's messages; to test faculty and student together, use one phone and sign out between roles.
- No push, Edge Functions, cron, RLS or file storage. Notifications are rows in the local store; scheduled items fire when a feed or chat opens.
- File previews are seeded page text. Picked files keep their name and size; downloads are simulated.
- YouTube links open outside the app. Scan uses the plain camera. The OS share sheet isn't wired, so `Res-F06-ShareIn` opens from Add › Use sample files.
- Search for `ponytail:` in the code for each deliberate shortcut.

Seed portraits are from randomuser.me and other photos from Wikimedia Commons (demo use only; swap them before any public use).
