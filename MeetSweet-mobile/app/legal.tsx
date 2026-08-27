/**
 * Legal — in-app Privacy Policy and Terms of Service.
 *
 * MeetSweet documents itself: no external "go to our website" dead-ends for
 * basic legal info. This screen renders the full privacy policy or terms of
 * service in the app's own design language (dark surface, brand gradient
 * header), opened from Settings → About, the sign-up welcome screen, and the
 * Information Center.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/safe-back';
import { ArrowLeft } from 'phosphor-react-native';
import { T, AppGradients } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { GradientText } from '@/components/GradientText';

const SUPPORT_EMAIL = 'meetsweetsupport@gmail.com';

// ─── Content ─────────────────────────────────────────────────────────────────

interface Section {
  heading: string;
  body: string[];
}

interface Doc {
  title: string;
  updated: string;
  intro: string;
  sections: Section[];
}

const PRIVACY: Doc = {
  title: 'Privacy Policy',
  updated: 'Last updated: 26 August 2026',
  intro:
    'MeetSweet ("we", "us") is a community platform where creators share posts, videos, Shorts and albums, and where members can subscribe, message privately and support the creators they follow. This policy explains what information we collect, why we collect it, and the choices you have.',
  sections: [
    {
      heading: '1. Information we collect',
      body: [
        'Account information — your name, email address and password (stored securely, never in plain text) when you create an account.',
        'Profile information — your username, display name, bio, avatar and any details you add to your profile.',
        'Content you create — posts, Shorts, videos, albums, comments, private messages and media you upload.',
        'Payment information — when you fund your wallet or pay a creator, payment processing is handled by our payment provider; we do not store full card numbers.',
        'Usage information — which content you view, interact with and subscribe to, so we can power feeds and recommendations.',
        'Device information — platform, operating system and a device identifier where needed to deliver notifications and secure your session.',
      ],
    },
    {
      heading: '2. How we use your information',
      body: [
        'To run the platform: show your feed, deliver messages and notifications, process payments and withdrawals, and keep your account secure.',
        'To personalise your experience: recommend creators and content you are likely to enjoy.',
        'To communicate with you: account updates, security alerts and, if you contact support, to respond to you.',
        'To improve MeetSweet: understand how the app is used so we can fix issues and build better features.',
        'We never sell your personal information.',
      ],
    },
    {
      heading: '3. Content you share',
      body: [
        'Your posts, Shorts, videos, albums and comments are visible to other members according to the visibility you choose (public, subscribers or your chosen tier).',
        'Private messages are visible only to the people in that conversation.',
        'You keep ownership of the content you create; you grant MeetSweet the limited rights needed to host, display and deliver it on the platform.',
        'You can delete your own content at any time. Deleted content is removed from public view.',
      ],
    },
    {
      heading: '4. Payments and wallet',
      body: [
        'Wallet funding, purchases, subscriptions and creator payouts are processed by our payment provider.',
        'We collect the minimum payment details needed to complete a transaction and to support withdrawals and refunds.',
        'Your earnings and payout details (such as a bank account) are used only to process your withdrawals.',
      ],
    },
    {
      heading: '5. Notifications',
      body: [
        'With your permission we send device notifications for new messages, likes, comments, payments and upload progress.',
        'You can manage or disable notifications at any time in Settings and in your device settings.',
      ],
    },
    {
      heading: '6. How we protect your information',
      body: [
        'We use encryption in transit, secure session handling, two-factor authentication options, and follow industry-standard practices to protect account data.',
        'No method of transmission is 100% secure, but we work hard to keep your information safe.',
      ],
    },
    {
      heading: '7. Your choices and rights',
      body: [
        'You can update your profile and settings at any time.',
        'You can control who can message you, the visibility of your account, and notification preferences.',
        'You can request deletion of your account from Settings; this removes your profile and content from the platform.',
        'Where applicable, you can request access to or deletion of your personal information by contacting support.',
      ],
    },
    {
      heading: '8. Contact us',
      body: [
        'Questions about this policy or your data? Email us at meetsweetsupport@gmail.com and we will respond within 24 hours on business days.',
      ],
    },
  ],
};

const TERMS: Doc = {
  title: 'Terms of Service',
  updated: 'Last updated: 26 August 2026',
  intro:
    'Welcome to MeetSweet. By creating an account or using the app, you agree to these Terms of Service. Please read them carefully — they govern your use of the platform.',
  sections: [
    {
      heading: '1. Using MeetSweet',
      body: [
        'You must be at least 13 years old to use MeetSweet.',
        'You are responsible for the account credentials you create and for everything done through your account.',
        'You agree to use MeetSweet lawfully and not to disrupt, abuse, or interfere with the platform or other users.',
      ],
    },
    {
      heading: '2. Your content',
      body: [
        'You are responsible for the content you post — posts, Shorts, videos, albums, comments and messages.',
        'Do not post content that is illegal, infringes someone else’s rights, or that is designed to deceive, harass or harm others.',
        'You keep ownership of your content and grant MeetSweet the limited rights needed to host and display it on the platform.',
        'We may remove content that violates these terms or applicable law.',
      ],
    },
    {
      heading: '3. Creators, subscriptions and paid content',
      body: [
        'Creators set their own subscription prices and paid-message prices. These are paid through your MeetSweet wallet.',
        'Subscriptions renew automatically until cancelled. When a renewal fails, access is handled as described in the app.',
        'Albums and paid media are purchased separately; access is tied to your account.',
        'Creator earnings are paid out according to the withdrawal rules shown in the app (minimum withdrawal, processing time and any fees).',
      ],
    },
    {
      heading: '4. Payments and wallet',
      body: [
        'Funding your wallet, buying content and subscribing are processed by our payment provider.',
        'All purchases are final unless required otherwise by law. Please check what you are buying before confirming.',
        'Do not attempt to circumvent payments, manipulate earnings, or use the platform to conduct prohibited financial activity.',
      ],
    },
    {
      heading: '5. Acceptable conduct',
      body: [
        'Be respectful: do not send unsolicited or harassing messages, spam, or abusive content.',
        'Do not attempt to access other users’ accounts, scrape the platform, or interfere with its security.',
        'Do not use MeetSweet to distribute malware, phishing links, or content intended to deceive.',
        'We may suspend or terminate accounts that violate these rules.',
      ],
    },
    {
      heading: '6. Intellectual property',
      body: [
        'The MeetSweet name, logo, design and the app itself are our property or the property of our licensors.',
        'You may not copy, modify, or reuse MeetSweet branding without permission.',
      ],
    },
    {
      heading: '7. Disclaimers and limitation of liability',
      body: [
        'MeetSweet is provided “as is”. We do not guarantee uninterrupted or error-free service.',
        'To the maximum extent permitted by law, we are not liable for indirect or consequential damages arising from your use of the platform.',
        'Nothing in these terms limits liability that cannot be limited by law.',
      ],
    },
    {
      heading: '8. Changes to these terms',
      body: [
        'We may update these terms from time to time. Material changes will be reflected in the app, and continued use after changes means you accept the updated terms.',
      ],
    },
    {
      heading: '9. Contact us',
      body: [
        'Questions about these terms? Email us at meetsweetsupport@gmail.com and we will respond within 24 hours on business days.',
      ],
    },
  ],
};

const DOCS: Record<string, Doc> = {
  privacy: PRIVACY,
  terms: TERMS,
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LegalScreen() {
  const insets = useSafeAreaInsets();
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const document = DOCS[doc ?? ''] ?? PRIVACY;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[AppGradients.brand[0], AppGradients.brand[3]]}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <ArrowLeft size={20} color="#FFFFFF" weight="bold" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{document.title}</Text>
          <View style={styles.backBtn} />
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <GradientText text={document.title} style={styles.title} />
        <Text style={styles.updated}>{document.updated}</Text>
        <Text style={styles.intro}>{document.intro}</Text>

        {document.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading}>{section.heading}</Text>
            {section.body.map((line, i) => (
              <Text key={i} style={styles.bodyText}>{line}</Text>
            ))}
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Questions? Email {SUPPORT_EMAIL} — we respond within 24 hours on business days.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontFamily: T.FONT.semibold,
    fontSize: 16,
  },
  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: 22,
    paddingTop: 24,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Poppins_700Bold',
    textAlign: 'left',
    letterSpacing: -0.4,
  },
  updated: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },
  intro: {
    marginTop: 18,
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    lineHeight: 22,
  },
  section: {
    marginTop: 24,
    gap: 10,
  },
  heading: {
    fontSize: 16,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    letterSpacing: -0.2,
  },
  bodyText: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    lineHeight: 21,
  },
  footer: {
    marginTop: 30,
    padding: 16,
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER,
  },
  footerText: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    lineHeight: 20,
    textAlign: 'center',
  },
});