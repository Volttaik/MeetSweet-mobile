/**
 * seed-content.mjs  (v2 — presigned R2 flow with download URLs)
 *
 * For each creator:
 *   1. Login
 *   2. Upload avatar → get 7-day download URL → PATCH /users/me
 *   3. Upload post image → get 7-day download URL
 *   4. POST /api/posts with inline media object (url + blob_path + type)
 *
 * Run: node scripts/seed-content.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const API  = 'https://meetsweet.space/api';

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const url = `${API}${path.startsWith('/') ? path : '/' + path}`;
  const res = await fetch(url, options);
  let parsed;
  try { parsed = await res.json(); } catch { parsed = null; }
  if (!res.ok) {
    const msg = parsed?.error ?? parsed?.message ?? `HTTP ${res.status}`;
    throw new Error(`${res.status} ${msg} [${path}]`);
  }
  if (parsed && typeof parsed === 'object' && 'ok' in parsed && 'data' in parsed) return parsed.data;
  return parsed;
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'X-Client-App-Id': 'meetsweet-mobile',
    'Content-Type': 'application/json',
  };
}

async function login(email, password) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'X-Client-App-Id': 'meetsweet-mobile', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return data.access_token ?? data.accessToken;
}

/** Step 1 of R2 flow: get presigned PUT URL + object key */
async function getUploadUrl(mimeType, folder, token) {
  const qs = new URLSearchParams({ mime_type: mimeType, folder });
  const data = await apiFetch(`/credentials/upload-url?${qs}`, {
    headers: authHeaders(token),
  });
  // API returns uploadUrl + key (camelCase)
  const uploadUrl = data.uploadUrl ?? data.upload_url;
  const key = data.key ?? data.object_key;
  if (!uploadUrl || !key) throw new Error('credentials/upload-url returned unexpected shape');
  return { uploadUrl, key };
}

/** Step 2 of R2 flow: PUT file bytes directly to R2 */
async function putToR2(uploadUrl, filePath, mimeType) {
  const bytes = readFileSync(filePath);
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: bytes,
  });
  if (!res.ok) throw new Error(`R2 PUT failed: ${res.status}`);
  return bytes.length;
}

/** Step 3 of R2 flow: get 7-day presigned download URL */
async function getDownloadUrl(key, token) {
  const qs = new URLSearchParams({ key });
  const data = await apiFetch(`/credentials/download-url?${qs}`, {
    headers: authHeaders(token),
  });
  const url = data.url ?? data.downloadUrl;
  if (!url) throw new Error('credentials/download-url returned no url');
  return url;
}

/**
 * Full R2 upload: PUT → get download URL.
 * Returns { url (https presigned), key, sizeBytes }.
 */
async function uploadViaR2(filePath, mimeType, folder, token) {
  const { uploadUrl, key } = await getUploadUrl(mimeType, folder, token);
  const sizeBytes = await putToR2(uploadUrl, filePath, mimeType);
  const url = await getDownloadUrl(key, token);
  return { url, key, sizeBytes };
}

async function updateAvatar(avatarUrl, token) {
  return apiFetch('/users/me', {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ avatar_url: avatarUrl }),
  });
}

/**
 * Create a post with an inline media object (url + blob_path + type).
 * This bypasses the broken media_ids update path on the live server.
 */
async function createPost(data, mediaObj, token) {
  const body = {
    caption: data.caption,
    visibility: data.visibility,
    ...(data.unlock_price ? { unlock_price: data.unlock_price } : {}),
    ...(mediaObj ? {
      media: [{
        url: mediaObj.url,
        blob_path: mediaObj.key,
        type: 'image',
        mime_type: 'image/jpeg',
        size_bytes: mediaObj.sizeBytes,
      }],
    } : {}),
  };
  const result = await apiFetch('/posts', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return result?.post ?? result;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Creator definitions ───────────────────────────────────────────────────────

const CREATORS = [
  {
    email: 'luna_ms_test@tempmail.dev',
    password: 'Test@12345',
    username: 'luna_creates_ms',
    avatarFile: 'luna_avatar.jpg',
    postFile: 'luna_post.jpg',
    posts: [
      {
        caption: '✨ Golden hour magic — the light hit different today. Shot this between takes on set 🎬 #BehindTheScenes #GoldenHour #ContentCreator',
        visibility: 'public',
      },
      {
        caption: '🔐 Exclusive: full unedited shoot from this weekend. Every angle, every take. Subscribers only 💕 #Exclusive #Subscribers',
        visibility: 'subscribers',
        unlock_price: 150,
      },
      {
        caption: 'Morning ritual 🌅 coffee, journaling, and a quick selfie before the chaos begins. How do you start your day?',
        visibility: 'public',
      },
    ],
  },
  {
    email: 'maya_ms_test@tempmail.dev',
    password: 'Test@12345',
    username: 'maya_content_ms',
    avatarFile: 'maya_avatar.jpg',
    postFile: 'maya_post.jpg',
    posts: [
      {
        caption: '🎨 New mood board drop — colour palette for the Spring collection. Obsessed with how this came together 🌸 #Aesthetic #MoodBoard #Creative',
        visibility: 'public',
      },
      {
        caption: "💎 Premium look book: 24 photos from the studio session last Friday. These are the ones I almost didn't post 👀 #LookBook #Premium",
        visibility: 'subscribers',
        unlock_price: 200,
      },
      {
        caption: "Studio session day 3 ✏️ building something big — teaser incoming this weekend. Who's excited? #ComingSoon #Studio",
        visibility: 'public',
      },
      {
        caption: '🌿 Slow living content for my inner peace era. No hustle, just vibes today 🧘‍♀️ #SlowLiving #Mindful',
        visibility: 'public',
      },
    ],
  },
  {
    email: 'sophie_ms_test@tempmail.dev',
    password: 'Test@12345',
    username: 'sophie_stories_ms',
    avatarFile: 'sophie_avatar.jpg',
    postFile: 'sophie_post.jpg',
    posts: [
      {
        caption: 'The dress. The light. The moment 💫 Sometimes everything just aligns perfectly. #OOTD #Fashion #Vibes',
        visibility: 'public',
      },
      {
        caption: '🔒 Intimate Q&A session + 30 exclusive photos from my boudoir shoot. Only for my inner circle 🌹',
        visibility: 'subscribers',
        unlock_price: 300,
      },
      {
        caption: 'Rainy day, cozy fits, and way too much matcha 🍵 this is my reset routine #CosyVibes #RainyDay',
        visibility: 'public',
      },
    ],
  },
  {
    email: 'emma_ms_test@tempmail.dev',
    password: 'Test@12345',
    username: 'emma_exclusive_ms',
    avatarFile: 'emma_avatar.jpg',
    postFile: 'emma_post.jpg',
    posts: [
      {
        caption: '📸 Paris trip photo dump — 3 days, 40 rolls (digital, worry not lol). Thread below 🗼 #Paris #Wanderlust #PhotoDump',
        visibility: 'public',
      },
      {
        caption: '✈️ Full Paris vlog + 50 behind-the-scenes photos. The ones that never made Instagram 😈 #Exclusive #BTS #Paris',
        visibility: 'subscribers',
        unlock_price: 250,
      },
      {
        caption: 'Self-portrait study 🪞 experimenting with mirrors and natural light. What do you think of this direction? #Photography #SelfPortrait',
        visibility: 'public',
      },
      {
        caption: '🌊 Beach content is always the move. Summer never really ends when you manifest correctly ☀️ #BeachVibes #SummerForever',
        visibility: 'public',
      },
    ],
  },
  {
    email: 'chloe_ms_test@tempmail.dev',
    password: 'Test@12345',
    username: 'chloe_crafted_ms',
    avatarFile: 'chloe_avatar.jpg',
    postFile: 'chloe_post.jpg',
    posts: [
      {
        caption: 'New era, new content 🦋 so happy to finally be creating what I actually want to make. This is the rebrand 💪 #NewEra #Authentic',
        visibility: 'public',
      },
      {
        caption: '💌 Full body of work from the Malibu shoot — 45 photos, 3 outfits. My best work yet and it\'s all here for you 🌴',
        visibility: 'subscribers',
        unlock_price: 350,
      },
      {
        caption: 'Caught in the act of not caring 😂 real life beats curated feed any day #Authentic #RealLife #NoFilter',
        visibility: 'public',
      },
      {
        caption: '🎬 Short film teaser I\'ve been working on for 3 months. Drop a 🎬 if you want the full cut this Friday #ShortFilm #Creative',
        visibility: 'public',
      },
    ],
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function seedCreator(creator) {
  const { email, password, username } = creator;
  const avatarPath = resolve(ROOT, 'assets/generated', creator.avatarFile);
  const postPath   = resolve(ROOT, 'assets/generated', creator.postFile);

  console.log(`\n┌── ${username}`);

  // 1. Login
  let token;
  try {
    token = await login(email, password);
    console.log(`│  ✓ Logged in`);
  } catch (err) {
    console.error(`│  ✗ Login failed: ${err.message} — skipping`);
    return;
  }

  // 2. Upload avatar → update profile
  try {
    const { url: avatarUrl } = await uploadViaR2(avatarPath, 'image/jpeg', 'avatars', token);
    await updateAvatar(avatarUrl, token);
    console.log(`│  ✓ Avatar updated`);
  } catch (err) {
    console.warn(`│  ⚠ Avatar skipped: ${err.message}`);
  }

  // 3. Upload post image ONCE (all posts share this image)
  let postMedia = null;
  try {
    postMedia = await uploadViaR2(postPath, 'image/jpeg', 'posts', token);
    console.log(`│  ✓ Post image uploaded`);
  } catch (err) {
    console.warn(`│  ⚠ Post image upload failed: ${err.message} — text-only posts`);
  }

  // 4. Create posts
  for (const postDef of creator.posts) {
    await sleep(400);
    try {
      const result = await createPost(postDef, postMedia, token);
      const price  = postDef.unlock_price ? `💰 ${postDef.unlock_price} credits` : '🆓 free';
      console.log(`│  ✓ [${postDef.visibility}][${price}] id=${result?.id ?? '?'}`);
    } catch (err) {
      console.error(`│  ✗ Post failed: ${err.message}`);
    }
  }

  console.log(`└── done`);
}

async function main() {
  console.log('🌱 MeetSweet content seeder v2 (R2 presigned + inline media)');
  console.log(`   API: ${API}`);
  for (const creator of CREATORS) {
    await seedCreator(creator);
    await sleep(800);
  }
  console.log('\n✅ Seeding complete!\n');
}

main().catch(err => {
  console.error('\n💥 Fatal:', err.message);
  process.exit(1);
});
