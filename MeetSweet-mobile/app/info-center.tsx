/**
 * MeetSweet Information Center — the in-app help/FAQ hub.
 *
 * A new user (or anyone curious) can open this and learn how practically every
 * part of MeetSweet works, without being sent to an external website. Content
 * is grouped into categories, each expanded inline into readable, structured
 * explanations (headings, short paragraphs, bullets, numbered steps). It's
 * searchable across every category so a specific question surfaces fast.
 *
 * All wording is grounded in the current implementation (services + screens),
 * NOT the marketing copy or an old product description.
 */
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CaretRight,
  MagnifyingGlass,
  Question,
  X,
} from 'phosphor-react-native';
import { goBack } from '@/lib/safe-back';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { T, alpha } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

// ─── Content model ────────────────────────────────────────────────────────────
//
// Each Q&A answer is a list of blocks. Growable so answers stay readable
// instead of becoming a wall of text.
type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'li'; text: string }
  | { kind: 'step'; text: string };

type Entry = { q: string; a: Block[] };
type Category = { id: string; title: string; blurb: string; entries: Entry[] };

// ─── Content ─────────────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    blurb: 'What MeetSweet is and how to get going.',
    entries: [
      {
        q: 'What is MeetSweet?',
        a: [
          { kind: 'p', text: 'MeetSweet is a creator platform built around direct connections. Creators share exclusive posts, videos and albums, sell access through subscriptions and paid media, and chat privately with the people who support them.' },
          { kind: 'p', text: 'It is split between two sides:' },
          { kind: 'li', text: 'For fans — discover creators, subscribe, buy content, and talk privately.' },
          { kind: 'li', text: 'For creators — publish content, earn from subscriptions and paid media, and withdraw your earnings to a Nigerian bank.' },
        ],
      },
      {
        q: 'How does the platform work?',
        a: [
          { kind: 'p', text: 'Almost everything on MeetSweet is monetised directly between you and the creators you follow:' },
          { kind: 'li', text: 'Content is posted to feeds (Home, Explore, Shorts) and is free or subscriber-only.' },
          { kind: 'li', text: 'Subscriptions unlock a creator’s full subscriber-only feed and let you message them.' },
          { kind: 'li', text: 'Creators can sell albums and individual private-message media with a price.' },
          { kind: 'li', text: 'Payment uses your in-app Naira wallet, funded from a card, to buy access instantly.' },
        ],
      },
      {
        q: 'How do I create an account?',
        a: [
          { kind: 'step', text: 'Open the app and pick Sign Up on the welcome screen.' },
          { kind: 'step', text: 'Enter your name, email and a password (at least 8 characters).' },
          { kind: 'step', text: 'Verify your email with the code we send you.' },
          { kind: 'step', text: 'Set up your profile — username, bio and photo.' },
          { kind: 'step', text: 'Use the 2FA screen on any sign-in if you have two-factor authentication turned on.' },
        ],
      },
      {
        q: 'How do profiles work?',
        a: [
          { kind: 'p', text: 'Your profile shows your name, username, bio, photo, and everything you post. You can choose who can see it:' },
          { kind: 'li', text: 'Everyone — anyone can view it.' },
          { kind: 'li', text: 'Subscribers only — only your subscribers see the full profile.' },
          { kind: 'li', text: 'Nobody — your profile is completely private.' },
          { kind: 'p', text: 'Creators additionally see profile analytics in their dashboard and a wallet entry point for earnings.' },
        ],
      },
      {
        q: 'How do recommendations work?',
        a: [
          { kind: 'p', text: 'Explore shows you creators and content from across MeetSweet, organised into categories. You can also search every creator by name or @handle — exact names rank first.' },
          { kind: 'p', text: 'From a post you can choose Not Interested or Hide Creator, which removes that content (and that creator) from your feeds for your account.' },
        ],
      },
      {
        q: 'How do creators work?',
        a: [
          { kind: 'li', text: 'Anyone can become a creator by paying a one-time activation fee.' },
          { kind: 'li', text: 'Creators get subscriber tools: post videos and shorts, sell albums, price private-message media, and run a dashboard with earnings.' },
          { kind: 'li', text: 'Creator profiles are subscriber-gated — non-subscribers see the profile and subscribe options, but not the creator’s content.' },
          { kind: 'li', text: 'Creators withdraw earnings to a Nigerian bank account.' },
        ],
      },
    ],
  },
  {
    id: 'posts',
    title: 'Posts',
    blurb: 'Text, images, feeds, comments and replies.',
    entries: [
      {
        q: 'What is a normal post?',
        a: [
          { kind: 'p', text: 'A post is a text caption with an optional image, published to your followers’ Home feed and your profile. Posts are the everyday format — short thoughts, announcements and photos.' },
        ],
      },
      {
        q: 'How do I create a post?',
        a: [
          { kind: 'step', text: 'Tap the Create button and choose Post.' },
          { kind: 'step', text: 'Write a caption and optionally add a photo.' },
          { kind: 'step', text: 'Choose a visibility: Free, Subscriber or Subscriber+ (creators only).' },
          { kind: 'step', text: 'Add categories and tags, then Publish.' },
        ],
      },
      {
        q: 'How do posts appear in the feed?',
        a: [
          { kind: 'p', text: 'Free posts show in the Home feed for everyone. Subscriber and Subscriber+ posts show in your subscribers’ feeds and are locked for everyone else. Your own published posts also appear on your profile.' },
        ],
      },
      {
        q: 'How do comments and replies work?',
        a: [
          { kind: 'p', text: 'Every post has a comments section. You can leave a comment or reply directly to someone else’s comment. Comments are live — new ones appear as they arrive, and you can like them too.' },
        ],
      },
      {
        q: 'How do likes work on posts?',
        a: [
          { kind: 'p', text: 'Tap the like icon on any post to like it. The like updates immediately and the count reflects everyone’s likes across the app. You can unlike a post any time.' },
        ],
      },
    ],
  },
  {
    id: 'shorts',
    title: 'Shorts',
    blurb: 'Short vertical videos, reactions and Explore.',
    entries: [
      {
        q: 'What is a Short?',
        a: [
          { kind: 'p', text: 'A Short is a short, vertical video (under 60 seconds) that lives in the Shorts feed. Shorts are always free and public — they do not use the subscriber tiers.' },
        ],
      },
      {
        q: 'How do I upload a Short?',
        a: [
          { kind: 'step', text: 'Tap Create and choose Shorts.' },
          { kind: 'step', text: 'Select or record a vertical video up to 60 seconds.' },
          { kind: 'step', text: 'Add a caption and optional tags.' },
          { kind: 'step', text: 'Publish — it appears in Shorts and on your profile.' },
        ],
      },
      {
        q: 'How do people interact with Shorts?',
        a: [
          { kind: 'p', text: 'Viewers can like a Short, comment on it, and reply to comments, just like posts. Likes and comments count toward the Short’s totals shown on the video.' },
        ],
      },
      {
        q: 'How do Shorts appear in Explore?',
        a: [
          { kind: 'p', text: 'Shorts are surfaced in the Explore feed alongside posts and long-form videos, so people can discover them without opening Shorts specifically. They are always free to watch and share.' },
        ],
      },
    ],
  },
  {
    id: 'albums',
    title: 'Albums',
    blurb: 'Curated collections that creators sell.',
    entries: [
      {
        q: 'What is an album?',
        a: [
          { kind: 'p', text: 'An album is a curated collection of images and videos sold as a single item. Unlike a normal post (free feed content), an album always has a price on MeetSweet.' },
        ],
      },
      {
        q: 'How do albums differ from normal posts?',
        a: [
          { kind: 'li', text: 'Posts are caption + one optional image, shown in the free feed.' },
          { kind: 'li', text: 'Albums gather many photos/videos behind one purchase price and are created through the dedicated album flow.' },
        ],
      },
      {
        q: 'How do creators create albums?',
        a: [
          { kind: 'step', text: 'Open Create and choose Album (creators only).' },
          { kind: 'step', text: 'Give the album a title and description.' },
          { kind: 'step', text: 'Add the photos and videos that make up the collection.' },
          { kind: 'step', text: 'Set a price, then publish.' },
        ],
      },
      {
        q: 'How does album pricing and access work?',
        a: [
          { kind: 'p', text: 'An album is purchase-only: viewers see the cover and price, then pay from their wallet to unlock it. Payment is confirmed with the server before access is granted — a locked album shows no preview of the items inside.' },
          { kind: 'p', text: 'Once purchased, the album (and every item in it) stays unlocked for you.' },
        ],
      },
    ],
  },
  {
    id: 'creators',
    title: 'Creators & Subscriptions',
    blurb: 'Becoming a creator, subscriptions and earnings.',
    entries: [
      {
        q: 'How does someone become a creator?',
        a: [
          { kind: 'step', text: 'Open the Become a Creator flow.' },
          { kind: 'step', text: 'Pay the one-time activation fee of ₦1,000 (the checkout opens in your browser).' },
          { kind: 'step', text: 'Tap Verify Payment to confirm the transaction with the server.' },
          { kind: 'step', text: 'Your account is now a creator — the server is the authority, and it refreshes everywhere automatically.' },
        ],
      },
      {
        q: 'How do creator subscriptions work?',
        a: [
          { kind: 'p', text: 'A creator can offer one or two tiers:' },
          { kind: 'li', text: 'Subscriber — the core tier: subscriber-only posts and videos, direct messaging, and the exclusive feed.' },
          { kind: 'li', text: 'Subscriber+ — a premium tier with everything in Subscriber plus exclusive Subscriber+ content and priority support.' },
          { kind: 'p', text: 'Subscribing is controlled by the server. Subscribing again to an already-active subscription returns the existing one without a second charge.' },
        ],
      },
      {
        q: 'How do I subscribe to a creator?',
        a: [
          { kind: 'step', text: 'Open the creator’s profile and tap Subscribe.' },
          { kind: 'step', text: 'Choose Subscriber or Subscriber+.' },
          { kind: 'step', text: 'Pay for it with your wallet (top up your wallet first if the balance is short).' },
          { kind: 'step', text: 'The creator’s full feed and direct messaging unlock immediately.' },
        ],
      },
      {
        q: 'How do I cancel or upgrade?',
        a: [
          { kind: 'p', text: 'From the creator’s Subscribe sheet you can upgrade from Subscriber to Subscriber+, or unsubscribe. Unsubscribing is confirmed with the server before you lose access.' },
        ],
      },
      {
        q: 'What do creators see in the dashboard?',
        a: [
          { kind: 'p', text: 'The dashboard shows you:' },
          { kind: 'li', text: 'Total revenue and active subscribers.' },
          { kind: 'li', text: 'Period stats — views, likes, new subscribers and revenue over time.' },
          { kind: 'li', text: 'An earnings breakdown by source: subscriptions, private messages and albums.' },
          { kind: 'li', text: 'Your subscriber list and creator settings.' },
        ],
      },
      {
        q: 'How do creator earnings and withdrawals work?',
        a: [
          { kind: 'p', text: 'Earnings accrue in your creator wallet from subscriptions, album sales and paid private-message media. When you’re ready to cash out:' },
          { kind: 'step', text: 'Open Payouts from the creator dashboard/wallet.' },
          { kind: 'step', text: 'Add your Nigerian bank details (name is verified with your bank).' },
          { kind: 'step', text: 'Enter an amount (minimum ₦1,000, not more than your available balance).' },
          { kind: 'step', text: 'Confirm — a Paystack OTP is sent to your email if required to finalise.' },
          { kind: 'p', text: 'Withdrawals are processed within about 24 hours and sent to your bank. Funds stay reserved until the transfer goes through, and you can track each withdrawal’s status (pending, processing, completed or failed) in your history.' },
        ],
      },
    ],
  },
  {
    id: 'messaging',
    title: 'Private Messaging',
    blurb: 'Direct messages, paid media and controls.',
    entries: [
      {
        q: 'Who can send private messages?',
        a: [
          { kind: 'p', text: 'Private messaging on MeetSweet is subscriber-based:' },
          { kind: 'li', text: 'Fans can message creators they subscribe to (private messaging is a subscriber ability).' },
          { kind: 'li', text: 'Creators can also start a conversation with their own subscribers.' },
          { kind: 'li', text: 'Only active subscriptions appear as messaging options — a cancelled or expired subscription is not available.' },
        ],
      },
      {
        q: 'Is private messaging free?',
        a: [
          { kind: 'p', text: 'Delivering a message is covered by being a subscriber. Creators can optionally activate paid messaging in their settings, setting a price a fan pays to deliver one message into their inbox.' },
        ],
      },
      {
        q: 'How do creators set their messaging price?',
        a: [
          { kind: 'step', text: 'Open Creator Settings.' },
          { kind: 'step', text: 'Turn on “Private Inbox”.' },
          { kind: 'step', text: 'Set the price a fan pays per delivered message (in Naira).' },
        ],
      },
      {
        q: 'How do conversations and replies work?',
        a: [
          { kind: 'p', text: 'Messaging is a thread: an original message with a running reply history, shown as a chat. Either participant can reply at any time. New replies appear live, and unread rows are marked read as you open them.' },
          { kind: 'p', text: 'There is a Waiting area for messages from senders you muted — you approve them into your inbox, allow the sender, or block them.' },
        ],
      },
      {
        q: 'How does paid media work in messages?',
        a: [
          { kind: 'p', text: 'A creator can attach media to a reply and price it. The recipient who hasn’t bought it sees it locked; tapping Unlock charges their wallet once, atomically, and grants access. Only the creator participant in the thread can price attachments.' },
        ],
      },
      {
        q: 'How do blocking, deleting and delivery status work?',
        a: [
          { kind: 'li', text: 'Block — a blocked sender can no longer send you private messages.' },
          { kind: 'li', text: 'Mute / Set to waiting — future messages from that sender queue in Waiting for your approval.' },
          { kind: 'li', text: 'Delete — the original sender deleting removes the correspondence for both of you; the recipient deleting hides it from their inbox only.' },
          { kind: 'li', text: 'Status — messages track sent, read, replied and waiting states so you know where a conversation stands.' },
        ],
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payments & Wallet',
    blurb: 'Funding, paying and how money moves.',
    entries: [
      {
        q: 'How do I fund my wallet?',
        a: [
          { kind: 'p', text: 'Open Wallet and add money from your card. Your wallet balance is what pays for subscriptions, albums and paid media — keep it topped up so purchases go through instantly.' },
        ],
      },
      {
        q: 'What can I pay for?',
        a: [
          { kind: 'li', text: 'Creator subscriptions (Subscriber / Subscriber+).' },
          { kind: 'li', text: 'Paid private-message media (unlock a priced attachment).' },
          { kind: 'li', text: 'Albums (one price for a whole collection).' },
        ],
      },
      {
        q: 'How are purchases processed?',
        a: [
          { kind: 'p', text: 'Purchases debit your wallet and are confirmed with the server before access is granted — success is never assumed locally. Buying something you already own is a no-op (no double charge), and a short wallet shows “Top up wallet” instead of letting the purchase go through.' },
        ],
      },
      {
        q: 'How do creators get paid?',
        a: [
          { kind: 'p', text: 'Subscription, album and paid-media earnings accumulate in the creator’s wallet. Creators withdraw them to a Nigerian bank account from the Payouts screen (minimum ₦1,000 per withdrawal).' },
        ],
      },
      {
        q: 'How long do withdrawals take?',
        a: [
          { kind: 'p', text: 'Processing generally takes up to 24 hours, after which the money is sent to your bank. Withdrawals typically arrive within 1–3 business days. Funds stay reserved until the transfer is processed, and every request is tracked as pending, processing, completed or failed.' },
        ],
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    blurb: 'What you’re told, and how.',
    entries: [
      {
        q: 'What are notifications?',
        a: [
          { kind: 'p', text: 'Notifications keep you informed of activity around your account: new likes, comments, mentions/tags, private messages, subscription changes and wallet/payment events.' },
        ],
      },
      {
        q: 'How do previews and tapping work?',
        a: [
          { kind: 'p', text: 'Each notification shows a preview of the content it’s about (for example the media thumbnail or message text). Tapping it routes you straight to the relevant screen — the post, video, short, album or thread it refers to. “View” only navigates; whether it’s marked read is handled when you open the notification list.' },
        ],
      },
      {
        q: 'How do read actions work?',
        a: [
          { kind: 'p', text: 'Marking a notification read removes it from your unread badge. There is also a mark-all-read action, and you can delete individual notifications. Read state stays in sync across your devices.' },
        ],
      },
      {
        q: 'How do device notification settings work?',
        a: [
          { kind: 'p', text: 'The app requests permission for device notifications when you first use it (and registers the device token with the server). In Settings you control which kinds you receive — likes, messages, mentions, etc. Foreground notifications show as banners while you’re in the app; when the app is closed they arrive as system notifications and tapping one opens the right screen.' },
        ],
      },
    ],
  },
  {
    id: 'account',
    title: 'Account & Security',
    blurb: 'Profile, password, 2FA and privacy.',
    entries: [
      {
        q: 'What can I manage in profile settings?',
        a: [
          { kind: 'p', text: 'Your display name, bio, username and email. Username availability is checked live, and changing it updates your profile everywhere immediately.' },
        ],
      },
      {
        q: 'How do I change my password?',
        a: [
          { kind: 'step', text: 'Open Settings → Password.' },
          { kind: 'step', text: 'Enter your current password and a new one (at least 8 characters, with a strength meter).' },
          { kind: 'step', text: 'Save — the update is confirmed with the server before it reports success.' },
        ],
      },
      {
        q: 'How does two-factor authentication (2FA) work?',
        a: [
          { kind: 'p', text: '2FA adds a second step to signing in. When enabled, after entering your password the app emails a 6-digit code to your account; you enter that code to finish signing in.' },
          { kind: 'p', text: 'To enable or disable it, open Settings → Two-Factor Authentication, verify with your password and a code we email you.' },
        ],
      },
      {
        q: 'How do I control account security?',
        a: [
          { kind: 'li', text: 'Active Sessions — see your current device and sign out all other devices at once.' },
          { kind: 'li', text: 'Profile visibility — choose Everyone, Subscribers only, or Nobody.' },
          { kind: 'li', text: 'Delete Account — permanently remove your account and all your data (confirm with your password).' },
        ],
      },
      {
        q: 'What creator settings are available?',
        a: [
          { kind: 'p', text: 'Creators control their private-inbox price, who can message them, who can comment, who can see content, whether subscriptions are enabled, and the Subscriber / Subscriber+ prices.' },
        ],
      },
      {
        q: 'How do I manage notification settings?',
        a: [
          { kind: 'p', text: 'In Settings you can toggle push notifications overall and each category (messages, likes, mentions, marketing). These preferences are saved to your account and applied app-wide.' },
        ],
      },
    ],
  },
  {
    id: 'uploads',
    title: 'Uploading & Background Uploads',
    blurb: 'Publishing media and uploading in the background.',
    entries: [
      {
        q: 'How do background uploads work?',
        a: [
          { kind: 'p', text: 'When you start uploading content (a video, Short or album media) you can choose Upload in background while it’s in progress. That keeps your upload going while you leave the screen and use the rest of MeetSweet.' },
          { kind: 'li', text: 'Your upload is preserved — it is never cancelled or restarted when you leave.' },
          { kind: 'li', text: 'A notification shows the upload’s progress, and a completion notification confirms when it finishes.' },
          { kind: 'li', text: 'If an upload fails you get a failure notification with a retry option — it never silently aborts.' },
          { kind: 'p', text: 'You can return to the upload screen later and rediscover any uploads still in progress, with their file name, type and status.' },
        ],
      },
      {
        q: 'What video sizes are supported?',
        a: [
          { kind: 'p', text: 'Long-form videos are not limited to five minutes on MeetSweet. Uploads stream directly from your device in parts for large files, so size is not a barrier — pick your video and publish.' },
        ],
      },
    ],
  },
];

// ─── Render helper ────────────────────────────────────────────────────────────

function BlockText({ block }: { block: Block }) {
  switch (block.kind) {
    case 'h':
      return <Text style={s.blockHead}>{block.text}</Text>;
    case 'li':
      return (
        <View style={s.blockLi}>
          <View style={s.liDot} />
          <Text style={s.blockLiText}>{block.text}</Text>
        </View>
      );
    case 'step':
      return (
        <View style={s.blockStep}>
          <Text style={s.stepNum}>•</Text>
          <Text style={s.blockLiText}>{block.text}</Text>
        </View>
      );
    default:
      return <Text style={s.blockP}>{block.text}</Text>;
  }
}

function EntryCard({ entry }: { entry: Entry }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={s.entry}>
      <Pressable
        style={s.entryHeader}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={entry.q}
      >
        <View style={s.entryTextWrap}>
          <View style={s.qRow}>
            <Question size={15} weight="fill" color={T.PRIMARY_LIGHT} />
            <Text style={s.entryTitle}>{entry.q}</Text>
          </View>
        </View>
        <View style={[s.chevron, open && s.chevronOpen]}>
          <CaretRight size={15} color={T.TEXT_2} weight="bold" />
        </View>
      </Pressable>
      {open ? (
        <View style={s.entryBody}>
          {entry.a.map((b, i) => (
            <BlockText key={i} block={b} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function InfoCenterScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.map((cat) => ({
      ...cat,
      entries: cat.entries.filter(
        (e) => e.q.toLowerCase().includes(q) ||
          e.a.some((b) => (b.text?.toLowerCase() ?? '').includes(q)),
      ),
    })).filter((cat) => cat.entries.length > 0);
  }, [query]);

  const toggleCategory = (id: string) =>
    setOpenCategories((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <X size={20} color={T.TEXT} />
        </Pressable>
        <View style={s.headerTitleWrap}>
          <LinearGradient
            colors={['#FF8C00', '#FF1493', '#800080']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.headerGradient}
            pointerEvents="none"
          />
          <Text style={s.headerTitle}>Information Center</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <MagnifyingGlass size={18} color={T.TEXT_3} weight="bold" />
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search a question…"
          placeholderTextColor={T.TEXT_3}
          selectionColor={T.CARET}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <X size={16} color={T.TEXT_3} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 40 }]}
      >
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No results</Text>
            <Text style={s.emptySub}>Try a different search, or browse the categories below.</Text>
          </View>
        ) : (
          filtered.map((cat) => {
            const open = openCategories[cat.id];
            return (
              <View key={cat.id} style={s.category}>
                <Pressable
                  style={s.categoryHeader}
                  onPress={() => toggleCategory(cat.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !!open }}
                >
                  <View style={s.categoryIcon}>
                    <BrandGradientFill />
                    <Question size={16} color="#FFFFFF" weight="fill" />
                  </View>
                  <View style={s.categoryText}>
                    <Text style={s.categoryTitle}>{cat.title}</Text>
                    <Text style={s.categoryBlurb}>{cat.blurb}</Text>
                  </View>
                  <View style={[s.categoryChevron, open && s.categoryChevronOpen]}>
                    <CaretRight size={16} color={T.TEXT_2} weight="bold" />
                  </View>
                </Pressable>
                {open || query.trim().length > 0 ? (
                  <View style={s.categoryBody}>
                    {cat.entries.map((entry) => (
                      <EntryCard key={entry.q} entry={entry} />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })
        )}

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            Still need help? You can contact support from Settings → Help.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: T.FONT.bold,
    color: '#FFFFFF',
    letterSpacing: -0.3,
    textAlign: 'center',
  },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 18,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER,
  },
  searchInput: {
    flex: 1,
    color: T.TEXT,
    fontSize: 14,
    fontFamily: T.FONT.regular,
    height: '100%',
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },

  scrollContent: { paddingHorizontal: 18, paddingTop: 4 },

  category: {
    marginBottom: 14,
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  categoryIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryText: { flex: 1 },
  categoryTitle: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.TEXT },
  categoryBlurb: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2, marginTop: 1 },
  categoryChevron: {
    transform: [{ rotate: '90deg' }],
  },
  categoryChevronOpen: {
    transform: [{ rotate: '-90deg' }],
  },
  categoryBody: { borderTopWidth: 1, borderTopColor: T.BORDER },

  entry: { borderBottomWidth: 1, borderBottomColor: T.BORDER },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  entryTextWrap: { flex: 1 },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryTitle: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
    lineHeight: 19,
  },
  chevron: { transform: [{ rotate: '90deg' }] },
  chevronOpen: { transform: [{ rotate: '-90deg' }] },

  entryBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  blockP: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    lineHeight: 20,
  },
  blockHead: {
    fontSize: 12.5,
    fontFamily: T.FONT.semibold,
    color: T.PRIMARY_LIGHT,
    marginTop: 2,
  },
  blockLi: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  liDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: alpha(T.ACCENT, 0.9),
    marginTop: 7,
  },
  blockLiText: {
    flex: 1,
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    lineHeight: 20,
  },
  blockStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  stepNum: {
    width: 16,
    fontSize: 13,
    fontFamily: T.FONT.bold,
    color: T.ACCENT,
    lineHeight: 20,
    textAlign: 'center',
  },

  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontFamily: T.FONT.semibold, color: T.TEXT },
  emptySub: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 260,
  },

  footer: { alignItems: 'center', paddingTop: 20 },
  footerText: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
});