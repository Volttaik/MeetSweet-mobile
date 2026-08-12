/**
 * FeedView - Main Home Social Feed with Post Cards, Like/Comment, and Create Post Modal.
 */

import React, { useState, useEffect } from 'react';
import { Heart, MessageCircle, Share2, Plus, Lock, ShieldCheck, Image, Send } from 'lucide-react';
import { Post, Comment } from '../../types';
import { getFeed, createPost, toggleLikePost, getPostComments, addPostComment } from '../../services/posts';

interface FeedViewProps {
  onOpenCreator: (username: string) => void;
  onOpenChatWithUser: (userId: string) => void;
}

export const FeedView: React.FC<FeedViewProps> = ({ onOpenCreator, onOpenChatWithUser }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCaption, setNewCaption] = useState('');
  const [selectedPostComments, setSelectedPostComments] = useState<{ post: Post; comments: Comment[] } | null>(null);
  const [commentText, setCommentText] = useState('');

  const fetchFeed = async () => {
    try {
      setIsLoading(true);
      const list = await getFeed();
      setPosts(list.length > 0 ? list : getSamplePosts());
    } catch {
      setPosts(getSamplePosts());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, []);

  const handleLike = async (postId: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          const nextIsLiked = !p.isLiked;
          return {
            ...p,
            isLiked: nextIsLiked,
            likesCount: nextIsLiked ? p.likesCount + 1 : Math.max(0, p.likesCount - 1),
          };
        }
        return p;
      })
    );
    try {
      await toggleLikePost(postId);
    } catch {
      // Ignore
    }
  };

  const handleCreatePost = async () => {
    if (!newCaption.trim()) return;
    try {
      const created = await createPost({ caption: newCaption });
      setPosts((prev) => [created, ...prev]);
      setNewCaption('');
      setShowCreateModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to create post');
    }
  };

  const handleOpenComments = async (post: Post) => {
    try {
      const comments = await getPostComments(post.id);
      setSelectedPostComments({ post, comments });
    } catch {
      setSelectedPostComments({ post, comments: [] });
    }
  };

  const handleAddComment = async () => {
    if (!selectedPostComments || !commentText.trim()) return;
    try {
      const newComment = await addPostComment(selectedPostComments.post.id, commentText);
      setSelectedPostComments((prev) =>
        prev ? { ...prev, comments: [...prev.comments, newComment] } : null
      );
      setCommentText('');
    } catch (err: any) {
      alert(err.message || 'Failed to add comment');
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-4 px-3 sm:px-4 space-y-6">
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-2 border-b border-stone-200 dark:border-stone-800">
        <h1 className="text-xl font-black tracking-tight text-rose-600">MeetSweet Feed</h1>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-md transition-transform active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Post</span>
        </button>
      </div>

      {/* Feed List */}
      <div className="space-y-6">
        {posts.map((post) => (
          <div
            key={post.id}
            className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-2xs overflow-hidden"
          >
            {/* Author Row */}
            <div className="flex items-center justify-between p-4">
              <div
                onClick={() => onOpenCreator(post.author.username)}
                className="flex items-center gap-3 cursor-pointer group"
              >
                <img
                  src={post.author.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                  alt={post.author.name}
                  className="w-11 h-11 rounded-full object-cover border border-stone-200 dark:border-stone-700 group-hover:scale-105 transition-transform"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-stone-900 dark:text-stone-100 group-hover:text-rose-600 transition-colors">
                      {post.author.name}
                    </span>
                    {post.author.isCreator && (
                      <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-500 text-white uppercase">
                        Creator
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-400">@{post.author.username}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onOpenChatWithUser(post.author.id)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-stone-100 dark:bg-stone-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 transition-colors"
              >
                Chat
              </button>
            </div>

            {/* Media */}
            {post.mediaUrls.length > 0 && (
              <div className="relative bg-black">
                {post.isExclusive && !post.unlocked ? (
                  <div className="h-72 flex flex-col items-center justify-center text-center p-6 bg-stone-900 text-white space-y-3">
                    <Lock className="w-10 h-10 text-rose-500" />
                    <p className="font-bold text-base">Subscriber Exclusive Post</p>
                    <p className="text-xs text-stone-400 max-w-xs">
                      Subscribe to @{post.author.username} or unlock for ${post.price}
                    </p>
                    <button
                      type="button"
                      onClick={() => onOpenCreator(post.author.username)}
                      className="px-6 py-2.5 rounded-full bg-rose-600 text-white font-bold text-xs"
                    >
                      Unlock Post
                    </button>
                  </div>
                ) : (
                  <img
                    src={post.mediaUrls[0]}
                    alt="Post media"
                    className="w-full max-h-[500px] object-cover"
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>
            )}

            {/* Content & Actions */}
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-4 text-stone-600 dark:text-stone-300">
                <button
                  type="button"
                  onClick={() => handleLike(post.id)}
                  className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                    post.isLiked ? 'text-rose-600' : 'hover:text-rose-600'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${post.isLiked ? 'fill-current text-rose-600' : ''}`} />
                  <span>{post.likesCount}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenComments(post)}
                  className="flex items-center gap-1.5 text-xs font-semibold hover:text-rose-600 cursor-pointer"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>{post.commentsCount}</span>
                </button>
              </div>

              <p className="text-sm text-stone-800 dark:text-stone-200 leading-relaxed">{post.caption}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Create Post Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-base text-stone-900 dark:text-stone-100">Create New Post</h3>
            <textarea
              rows={4}
              value={newCaption}
              onChange={(e) => setNewCaption(e.target.value)}
              placeholder="What's on your mind? Share updates with your followers..."
              className="w-full bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 p-3 rounded-2xl text-xs outline-none border border-transparent focus:border-rose-400"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreatePost}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700"
              >
                Publish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comments Drawer Modal */}
      {selectedPostComments && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedPostComments(null)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-2xl space-y-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
              <h3 className="font-bold text-sm">Comments</h3>
              <button type="button" onClick={() => setSelectedPostComments(null)}>✕</button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {selectedPostComments.comments.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <img
                    src={c.user.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                    alt={c.user.name}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                  <div className="bg-stone-100 dark:bg-stone-800 p-2.5 rounded-2xl flex-1 text-xs">
                    <p className="font-bold text-stone-900 dark:text-stone-100">{c.user.name}</p>
                    <p className="text-stone-700 dark:text-stone-300 mt-0.5">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment..."
                className="flex-1 bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-xs rounded-full px-4 py-2 outline-none"
              />
              <button
                type="button"
                onClick={handleAddComment}
                className="p-2 bg-rose-600 text-white rounded-full hover:bg-rose-700"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function getSamplePosts(): Post[] {
  return [
    {
      id: 'p-1',
      caption: 'Exclusive BTS photo shoot from today’s golden hour session! 🌸✨ Hope you all love it!',
      mediaUrls: ['https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=1000'],
      likesCount: 342,
      commentsCount: 28,
      isLiked: false,
      createdAt: new Date().toISOString(),
      author: {
        id: 'u-1',
        name: 'Alexa Rose',
        username: 'alexarose',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300',
        isCreator: true,
      },
    },
    {
      id: 'p-2',
      caption: 'New workout routine and nutrition guide dropped for all my VIP supporters! 💪🔥',
      mediaUrls: ['https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=1000'],
      likesCount: 512,
      commentsCount: 45,
      isLiked: true,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      author: {
        id: 'u-2',
        name: 'Marcus Vance',
        username: 'marcusfitness',
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300',
        isCreator: true,
      },
    },
  ];
}
