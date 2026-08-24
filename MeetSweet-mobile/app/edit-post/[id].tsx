/**
 * Edit Post Screen — /edit-post/[id]
 *
 * Editable fields: caption, visibility.
 * On save: updates backend, calls markEdited() to propagate to all feeds.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import {
  ArrowLeft,
  Check,
  Eye,
  Lock,
  Users,
  ChatCircle,
  type Icon,
} from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { getPost, editPost, type Post } from '@/services/posts';
import { setCommentsEnabled } from '@/services/comment-room-service';
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
  // Comment Room setting — Comments ON/OFF
  const [commentsEnabled, setCommentsEnabledState] = useState(true);

  // ── Load post ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getPost(id)
      .then((p) => {
        setPost(p);
        // Hydrate the editable value from the fetched post. Without this,
        // opening Edit Post rendered an empty caption and saving it erased the
        // existing text even when the user only changed visibility.
        setCaption(p.caption ?? '');
        if (p.visibility === 'public' || p.visibility === 'subscribers' || p.visibility === 'draft') {
          setVisibility(p.visibility);
        }
        setCommentsEnabledState(p.commentsEnabled ?? true);
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
      // Comments ON/OFF is a Comment Room setting (backend enforces it on
      // submission). The Comment Room stays associated with the post even when
      // disabled, so it can be re-enabled later.
      if (post.commentRoomId) {
        await setCommentsEnabled(id, commentsEnabled);
      }
      markEdited(id, {
        caption: caption.trim(),
        visibility,
        commentsEnabled,
      } as any);
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
          <MsPressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
            <ArrowLeft size={20} color={T.TEXT} />
          </MsPressable>
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
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <MsPressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
            <ArrowLeft size={20} color={T.TEXT} />
          </MsPressable>
          <Text style={styles.topTitle}>Edit Post</Text>
          <MsPressable
            style={[styles.saveTopBtn, saving && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={saving}
            hitSlop={12}
          >
            {saving
              ? <ActivityIndicator size="small" color={T.ACCENT} />
              : <Text style={styles.saveTopLabel}>Save</Text>}
          </MsPressable>
        </View>

        <KeyboardAwareScrollViewCompat
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
                  <MsPressable
                    key={opt.value}
                    style={[styles.visRow, active && styles.visRowActive]}
                    onPress={() => setVisibility(opt.value)}
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
                  </MsPressable>
                );
              })}
            </View>
          </View>

          {/* ── Comments ON/OFF (Comment Room setting) ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Comments</Text>
            <View style={styles.commentsSettingRow}>
              <View style={[styles.visIconWrap, { backgroundColor: T.SURFACE_2 }]}>
                <ChatCircle size={15} color={commentsEnabled ? T.ACCENT : T.TEXT_2} />
              </View>
              <View style={styles.visText}>
                <Text style={[styles.visLabel, commentsEnabled && styles.visLabelActive]}>
                  Allow comments
                </Text>
                <Text style={styles.visDesc}>
                  {commentsEnabled
                    ? 'Viewers can comment on this post'
                    : 'Comments are hidden; the Comment Room stays associated and can be re-enabled later'}
                </Text>
              </View>
              <MsPressable
                onPress={() => setCommentsEnabledState((v) => !v)}
                    style={[
                  styles.switch,
                  commentsEnabled && styles.switchOn,
                ]}
                accessibilityLabel="Toggle comments"
              >
                <View style={[styles.switchThumb, commentsEnabled && styles.switchThumbOn]} />
              </MsPressable>
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
          <MsPressable
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={T.BG} size="small" />
            ) : (
              <>
                <Check size={17} color={T.BG} weight="bold" />
                <Text style={styles.saveBtnLabel}>Save Changes</Text>
              </>
            )}
          </MsPressable>
        </KeyboardAwareScrollViewCompat>
      </View>
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

  // Comments toggle
  commentsSettingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    padding: 14,
  },
  switch: {
    width: 46,
    height: 28,
    borderRadius: 14,
    backgroundColor: T.SURFACE_2,
    padding: 3,
    justifyContent: 'center',
  },
  switchOn: { backgroundColor: T.ACCENT },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: T.TEXT_3,
    alignSelf: 'flex-start',
  },
  switchThumbOn: {
    backgroundColor: '#fff',
    alignSelf: 'flex-end',
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