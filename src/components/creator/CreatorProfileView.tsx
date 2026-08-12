/**
 * CreatorProfileView - Full Creator Profile with subscription tiers, albums, and posts.
 */

import React, { useState, useEffect } from 'react';
import { ArrowLeft, ShieldCheck, Sparkles, Lock, MessageSquare, Image, CheckCircle, RefreshCw } from 'lucide-react';
import { User, Post, Album } from '../../types';
import { getCreatorProfile, subscribeToCreator, purchaseAlbum } from '../../services/creator';

interface CreatorProfileViewProps {
  username: string;
  onBack: () => void;
  onOpenChatWithUser: (userId: string) => void;
}

export const CreatorProfileView: React.FC<CreatorProfileViewProps> = ({
  username,
  onBack,
  onOpenChatWithUser,
}) => {
  const [creator, setCreator] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tiers, setTiers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'albums' | 'tiers'>('posts');

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const data = await getCreatorProfile(username);
        setCreator(data.creator);
        setPosts(data.posts.length > 0 ? data.posts : getSampleCreatorPosts());
        setAlbums(data.albums.length > 0 ? data.albums : getSampleAlbums());
        setTiers(data.tiers);
      } catch {
        // Fallback
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [username]);

  const handleSubscribe = async (tierId: string) => {
    try {
      await subscribeToCreator(creator?.id || 'c-1', tierId);
      alert('Successfully subscribed to tier!');
    } catch (err: any) {
      alert(err.message || 'Subscription failed');
    }
  };

  const handlePurchaseAlbum = async (albumId: string) => {
    try {
      await purchaseAlbum(albumId);
      setAlbums((prev) =>
        prev.map((a) => (a.id === albumId ? { ...a, isPurchased: true } : a))
      );
      alert('Successfully purchased album!');
    } catch (err: any) {
      alert(err.message || 'Purchase failed');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12 text-stone-400">
        <RefreshCw className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-4 px-3 sm:px-4 space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-600 dark:text-stone-300 hover:text-rose-600 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </button>

      {/* Header Profile Card */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-2xs relative">
        <div className="h-32 bg-gradient-to-r from-rose-500 via-purple-600 to-indigo-600" />

        <div className="px-6 pb-6 pt-0 relative flex flex-col sm:flex-row items-center sm:items-end justify-between gap-4 -mt-12 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4">
            <img
              src={creator?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300'}
              alt={creator?.name}
              className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-stone-900 shadow-md"
              referrerPolicy="no-referrer"
            />
            <div>
              <div className="flex items-center justify-center sm:justify-start gap-1.5">
                <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">{creator?.name}</h1>
                <ShieldCheck className="w-5 h-5 text-blue-500 fill-current" />
              </div>
              <p className="text-xs text-stone-400">@{creator?.username}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => creator?.id && onOpenChatWithUser(creator.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-stone-900 dark:text-stone-100 font-bold text-xs"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Chat</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tiers')}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md"
            >
              <Sparkles className="w-4 h-4" />
              <span>Subscribe</span>
            </button>
          </div>
        </div>

        {creator?.bio && (
          <p className="px-6 pb-4 text-xs text-stone-600 dark:text-stone-400 border-t border-stone-100 dark:border-stone-800/80 pt-3">
            {creator.bio}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-200 dark:border-stone-800">
        <button
          type="button"
          onClick={() => setActiveTab('posts')}
          className={`py-3 px-6 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'posts'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
          }`}
        >
          Posts ({posts.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('albums')}
          className={`py-3 px-6 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'albums'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
          }`}
        >
          Albums ({albums.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('tiers')}
          className={`py-3 px-6 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'tiers'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
          }`}
        >
          Subscription Tiers
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'posts' && (
        <div className="space-y-4">
          {posts.map((p) => (
            <div key={p.id} className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-200 dark:border-stone-800 space-y-2">
              <p className="text-xs text-stone-800 dark:text-stone-200">{p.caption}</p>
              {p.mediaUrls.length > 0 && (
                <img src={p.mediaUrls[0]} alt="Post" className="rounded-xl max-h-80 w-full object-cover" />
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'albums' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {albums.map((album) => (
            <div key={album.id} className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 overflow-hidden p-4 space-y-3">
              <img src={album.coverUrl} alt={album.title} className="h-44 w-full object-cover rounded-2xl" />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-stone-900 dark:text-stone-100">{album.title}</h4>
                  <p className="text-xs text-stone-400">{album.mediaCount} items</p>
                </div>
                {album.isPurchased ? (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">Unlocked</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handlePurchaseAlbum(album.id)}
                    className="px-4 py-2 rounded-full text-xs font-bold bg-rose-600 text-white hover:bg-rose-700"
                  >
                    Buy ${album.price}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'tiers' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {tiers.map((tier) => (
            <div key={tier.id} className="bg-white dark:bg-stone-900 rounded-3xl p-6 border border-rose-200 dark:border-stone-800 shadow-md space-y-4">
              <div>
                <h3 className="font-bold text-base text-rose-600">{tier.name}</h3>
                <p className="text-2xl font-black text-stone-900 dark:text-stone-100 mt-1">${tier.price} <span className="text-xs font-normal text-stone-400">/ month</span></p>
              </div>

              <div className="space-y-2">
                {tier.perks.map((perk: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-stone-700 dark:text-stone-300">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>{perk}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleSubscribe(tier.id)}
                className="w-full py-3 rounded-2xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 shadow-sm"
              >
                Subscribe Now
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function getSampleCreatorPosts(): Post[] {
  return [
    {
      id: 'cp-1',
      caption: 'Exclusive sunset photo shoot gallery! Thank you to all my supporters. ❤️',
      mediaUrls: ['https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800'],
      likesCount: 189,
      commentsCount: 14,
      createdAt: new Date().toISOString(),
      author: { id: 'c-1', name: 'Alexa Rose', username: 'alexarose', avatarUrl: null },
    },
  ];
}

function getSampleAlbums(): Album[] {
  return [
    {
      id: 'alb-1',
      title: 'Summer Solstice Gallery',
      coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600',
      mediaCount: 18,
      price: 15.0,
      isPurchased: false,
      createdAt: new Date().toISOString(),
      creator: { id: 'c-1', name: 'Alexa Rose', username: 'alexarose', avatarUrl: null },
    },
  ];
}
