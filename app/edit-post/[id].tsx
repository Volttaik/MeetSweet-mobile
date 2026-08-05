/**
 * Edit Post Screen — /edit-post/[id]
 *
 * Editable fields: caption, visibility.
 * On save: updates backend, calls markEdited() to propagate to all feeds.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Check,
  Eye,
  Lock,
  Users,
  type Icon,
} from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { getPost, editPost, type Post } from '@/services/posts';
import { usePostActions } from '@/contexts/PostActionsContext';
import { toast } from '@/components/MsToast';

// ─── Visibility options ───────────────────────────────────────────────────────

const VISIBILITY_OPTIONS: Array<{
  value: 'public' | 'subscribers' | 'draft';
  label: string;
  description: string;
  Icon: Icon;
}> = [
  { value: 'public',      label: 'Public',      description: 'Everyone can see this post',     Icon: Eye },
  { value: 'subscribers', label: 'Subscribers',  description: 'Only your subscribers can view', Icon: Users },
  { value: 'draft',       label: 'Draft',        description: 'Only visible to you',            Icon: Lock },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EditPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { markEdited } = usePostActions();

  const [post,       setPost]       = useState<Post | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);

  // Editable fields
  const [caption,    setCaption]    = useState('');
  const [visibility, setVisibility] = useState<'public' | 'subscribers' | 'draft'>('public');

  // ── Load post ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getPost(id)
      .then(({ post: p }) => {
        setPost(p);
        setCaption(p.caption ?? '');
        setVisibility(p.visibility);
        // Initialise tier from the post's stored tier, or fall back from visibility
      })
      .catch(() => toast.error('Could not load post'))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!post || !id) return;
    setSaving(true);
    try {
      await editPost(id, {
        caption: caption.trim(),
        visibility,
      });
      markEdited(id, {
        caption: caption.trim(),
        visibility,
      });
      toast.success('Post updated');
      router.back();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save changes');
    } finally {
      setSaving(false);
    }
  };

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
            <ArrowLeft size={20} color={T.TEXT} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Edit Post</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={T.TEXT_2} />
        </View>
      </View>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
            <ArrowLeft size={20} color={T.TEXT} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Edit Post</Text>
          <TouchableOpacity
            style={[styles.saveTopBtn, saving && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={saving}
            hitSlop={12}
          >
            {saving
              ? <ActivityIndicator size="small" color={T.ACCENT} />
              : <Text style={styles.saveTopLabel}>Save</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Caption ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Caption</Text>
            <View style={styles.captionWrap}>
              <TextInput
                style={styles.captionInput}
                value={caption}
                onChangeText={setCaption}
                placeholder="What's this post about?"
                placeholderTextColor={T.TEXT_3}
                multiline
                maxLength={2200}
                textAlignVertical="top"
                selectionColor="#888"
              />
              <Text style={styles.charCount}>{caption.length}/2200</Text>
            </View>
          </View>

          {/* ── Visibility ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Visibility</Text>
            <View style={styles.visibilityGroup}>
              {VISIBILITY_OPTIONS.map((opt) => {
                const active = opt.value === visibility;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.visRow, active && styles.visRowActive]}
                    onPress={() => setVisibility(opt.value)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.visIconWrap, active && styles.visIconWrapActive]}>
                      <opt.Icon size={15} color={active ? T.ACCENT : T.TEXT_2} />
                    </View>
                    <View style={styles.visText}>
                      <Text style={[styles.visLabel, active && styles.visLabelActive]}>
                        {opt.label}
                      </Text>
                      <Text style={styles.visDesc}>{opt.description}</Text>
                    </View>
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active && <View style={styles.radioDot} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Post type info (read-only) ── */}
          {post?.contentType ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Post type</Text>
              <Text style={styles.infoValue}>{post.contentType.toUpperCase()}</Text>
              <Text style={styles.infoNote}>
                Post type, media files, and thumbnails cannot be changed after publishing.
              </Text>
            </View>
          ) : null}

          {/* ── Save button ── */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={T.BG} size="small" />
            ) : (
              <>
                <Check size={17} color={T.BG} weight="bold" />
                <Text style={styles.saveBtnLabel}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontSize: 16,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.2,
  },
  saveTopBtn: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  saveTopLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.BG,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 28,
  },

  section: { gap: 10 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_2,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // Caption
  captionWrap: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    padding: 14,
    gap: 8,
  },
  captionInput: {
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    minHeight: 120,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'right',
  },

  // Visibility
  visibilityGroup: { gap: 8 },
  visRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    padding: 14,
  },
  visRowActive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  visIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visIconWrapActive: { backgroundColor: T.ACCENT_LIGHT },
  visText: { flex: 1, gap: 2 },
  visLabel: {
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },
  visLabelActive: { color: T.TEXT, fontFamily: T.FONT.semibold },
  visDesc: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: T.TEXT_3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: T.ACCENT },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: T.ACCENT,
  },

  // Audience tier
  tierRow: { flexDirection: 'row', gap: 8 },
  tierOpt: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    gap: 3,
  },
  tierLabel: {
    fontSize: 12,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },
  tierDesc: {
    fontSize: 10,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },
  tierHint: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    marginTop: 2,
  },

  // Info card
  infoCard: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    padding: 14,
    gap: 4,
  },
  infoLabel: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 13,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },
  infoNote: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    lineHeight: 16,
    marginTop: 4,
  },

  // Save button
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.ACCENT,
    ...T.SHADOWS.medium,
  },
  saveBtnLabel: {
    fontSize: 16,
    fontFamily: T.FONT.semibold,
    color: T.BG,
  },
});
