/**
 * seed-content.mjs
 *
 * Seeds the MeetSweet platform with AI-generated creator content.
 * - Logs into 5 existing creator accounts
 * - Uploads AI-generated avatar + post images
 * - Creates a mix of free and paid posts for each creator
 *
 * Run: node scripts/seed-content.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const API = 'https://meetsweet-server.quizmi.space/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const url = `${API}${path.startsWith('/') ? path : '/' + path}`;
  const res = await fetch(url, options);
  let parsed;
  try { parsed = await res.json(); } catch { parsed = null; }
  if (!res.ok) {
    const msg = parsed?.error ?? parsed?.message ?? `HTTP ${res.status}`;
    throw new Error(`${res.status} ${msg} [${path}]`);
  }
  if (parsed && typeof parsed === 'object' && 'ok' in parsed && 'data' in parsed) {
    return parsed.data;
  }
  return parsed;
}

async function login(email, password) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return data.access_token ?? data.accessToken;
}

/**
 * Upload an image file via the server-side proxy endpoint.
 * Returns the media record: { id, url, ... }
 */
async function uploadImage(filePath, token) {
  const bytes = readFileSync(filePath);
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  const form = new FormData();
  const fileName = filePath.split('/').pop();
  form.append('file', blob, fileName);

  const res = await fetch(`${API}/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  let parsed;
  try { parsed = await res.json(); } catch { parsed = null; }
  if (!res.ok) {
    const msg = parsed?.error ?? parsed?.message ?? `HTTP ${res.status}`;
    throw new Error(`Upload failed: ${msg}`);
  }
  // Response shape: { ok, data: { media: { id, url, ... } } }
  const data = (parsed?.data ?? parsed);
  return data?.media ?? data;
}

/**
 * Try to upload via presigned R2 URL flow (3-step):
 *   1. GET /credentials/upload-url
 *   2. PUT to R2
 *   3. POST /media to register
 * Falls back to proxy upload on failure.
 */
async function uploadImageR2(filePath, token) {
  const bytes = readFileSync(filePath);
  const sizeBytes = bytes.length;
  const mime = 'image/jpeg';

  try {
    // Step 1 — get presigned PUT URL
    const qs = new URLSearchParams({ mime_type: mime, folder: 'posts', size_bytes: String(sizeBytes) });
    const cred = await apiFetch(`/credentials/upload-url?${qs}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const upload_url = cred.uploadUrl ?? cred.upload_url;
    const object_key = cred.key ?? cred.object_key;

    // Step 2 — PUT directly to R2
    const blob = new Blob([bytes], { type: mime });
    const putRes = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': mime, 'Content-Length': String(sizeBytes) },
      body: blob,
    });
    if (!putRes.ok) throw new Error(`R2 PUT failed: ${putRes.status}`);

    // Step 3 — register with API server
    const media = await apiFetch('/media', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ object_key, mime_type: mime, size_bytes: sizeBytes }),
    });
    if (!media?.id) throw new Error('No ID from /media registration');
    console.log(`  ✓ R2 upload: ${filePath.split('/').pop()} → id=${media.id}`);
    return media;
  } catch (err) {
    console.log(`  ⚠ R2 flow failed (${err.message}), trying proxy upload…`);
    return uploadImage(filePath, token);
  }
}

async function updateAvatar(avatarUrl, token) {
  return apiFetch('/users/me', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatar_url: avatarUrl }),
  });
}

async function createPost(data, token) {
  const result = await apiFetch('/posts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  // Response shape: { post: { id, ... } }
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
        paid: false,
      },
      {
        caption: '🔐 Exclusive: full unedited shoot from this weekend. Every angle, every take. Subscribers only 💕 #Exclusive #Subscribers',
        visibility: 'subscribers',
        paid: true,
        unlock_price: 150,
      },
      {
        caption: 'Morning ritual 🌅 coffee, journaling, and a quick selfie before the chaos begins. How do you start your day?',
        visibility: 'public',
        paid: false,
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
        paid: false,
      },
      {
        caption: "💎 Premium look book: 24 photos from the studio session last Friday. These are the ones I almost didn't post 👀 #LookBook #Premium",
        visibility: 'subscribers',
        paid: true,
        unlock_price: 200,
      },
      {
        caption: 'Studio session day 3 ✏️ building something big — teaser incoming this weekend. Who\'s excited? #ComingSoon #Studio',
        visibility: 'public',
        paid: false,
      },
      {
        caption: '🌿 Slow living content for my inner peace era. No hustle, just vibes today 🧘‍♀️ #SlowLiving #Mindful',
        visibility: 'public',
        paid: false,
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
        paid: false,
      },
      {
        caption: '🔒 Intimate Q&A session + 30 exclusive photos from my boudoir shoot. Only for my inner circle 🌹',
        visibility: 'subscribers',
        paid: true,
        unlock_price: 300,
      },
      {
        caption: 'Rainy day, cozy fits, and way too much matcha 🍵 this is my reset routine #CosyVibes #RainyDay',
        visibility: 'public',
        paid: false,
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
        caption: '📸 Paris trip photo dump — 3 days, 40 rolls (digital, don\'t worry lol). Thread below 🗼 #Paris #Wanderlust #PhotoDump',
        visibility: 'public',
        paid: false,
      },
      {
        caption: '✈️ Full Paris vlog + 50 behind-the-scenes photos. The ones that didn\'t make Instagram 😈 #Exclusive #BTS #Paris',
        visibility: 'subscribers',
        paid: true,
        unlock_price: 250,
      },
      {
        caption: 'Self-portrait study 🪞 experimenting with mirrors and natural light. What do you think of this direction? #Photography #SelfPortrait',
        visibility: 'public',
        paid: false,
      },
      {
        caption: '🌊 Beach content is always the move. Summer never really ends when you manifest correctly ☀️ #BeachVibes #SummerForever',
        visibility: 'public',
        paid: false,
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
        paid: false,
      },
      {
        caption: '💌 Full body of work from the Malibu shoot — 45 photos, 3 outfits. My best work yet and it\'s all here for you 🌴',
        visibility: 'subscribers',
        paid: true,
        unlock_price: 350,
      },
      {
        caption: 'Caught in the act of not caring 😂 real life > curated feed any day #Authentic #RealLife #NoFilter',
        visibility: 'public',
        paid: false,
      },
      {
        caption: '🎬 Short film teaser I\'ve been working on for 3 months. Drop a 🎬 if you want the full cut this Friday #ShortFilm #Creative',
        visibility: 'public',
        paid: false,
      },
    ],
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function seedCreator(creator) {
  const { email, password, username } = creator;
  const avatarPath = resolve(ROOT, 'assets/generated', creator.avatarFile);
  const postPath   = resolve(ROOT, 'assets/generated', creator.postFile);

  console.log(`\n┌── ${username} (${email})`);

  // 1. Login
  let token;
  try {
    token = await login(email, password);
    console.log(`│  ✓ Logged in`);
  } catch (err) {
    console.error(`│  ✗ Login failed: ${err.message} — skipping`);
    return;
  }

  // 2. Upload avatar
  let avatarUrl = null;
  try {
    const avatarMedia = await uploadImageR2(avatarPath, token);
    avatarUrl = avatarMedia?.url ?? null;
    if (avatarUrl) {
      await updateAvatar(avatarUrl, token);
      console.log(`│  ✓ Avatar updated`);
    }
  } catch (err) {
    console.warn(`│  ⚠ Avatar upload skipped: ${err.message}`);
  }

  // 3. Upload post image (shared by all posts from this creator this session)
  let mediaId = null;
  try {
    const postMedia = await uploadImageR2(postPath, token);
    mediaId = postMedia?.id ?? null;
    if (mediaId) console.log(`│  ✓ Post image uploaded → id=${mediaId}`);
  } catch (err) {
    console.warn(`│  ⚠ Post image upload failed: ${err.message} — creating text-only posts`);
  }

  // 4. Create posts
  for (const postDef of creator.posts) {
    await sleep(400); // be gentle with the API
    try {
      const postData = {
        caption: postDef.caption,
        visibility: postDef.visibility,
        ...(mediaId ? { media_ids: [mediaId] } : {}),
        ...(postDef.paid && postDef.unlock_price ? { unlock_price: postDef.unlock_price } : {}),
      };
      const result = await createPost(postData, token);
      const price = postDef.unlock_price ? `💰 ${postDef.unlock_price} credits` : '🆓 free';
      const vis   = postDef.visibility;
      console.log(`│  ✓ Post created [${vis}][${price}] id=${result?.id ?? '?'}`);
    } catch (err) {
      console.error(`│  ✗ Post failed: ${err.message}`);
    }
  }

  console.log(`└── done`);
}

async function main() {
  console.log('🌱 MeetSweet content seeder');
  console.log(`   API: ${API}`);
  console.log(`   Creators: ${CREATORS.length}`);
  console.log('');

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
