/**
 * ExploreView - Explore creators, categories, and trending posts.
 */

import React, { useState, useEffect } from 'react';
import { Search, Sparkles, Flame, ShieldCheck, User as UserIcon } from 'lucide-react';
import { User, Post } from '../../types';
import { getTrendingCreators, getExploreCategories } from '../../services/explore';

interface ExploreViewProps {
  onOpenCreator: (username: string) => void;
}

export const ExploreView: React.FC<ExploreViewProps> = ({ onOpenCreator }) => {
  const [query, setQuery] = useState('');
  const [creators, setCreators] = useState<User[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const [cList, catList] = await Promise.all([
          getTrendingCreators(),
          getExploreCategories(),
        ]);
        setCreators(cList.length > 0 ? cList : getSampleCreators());
        setCategories(catList);
      } catch {
        setCreators(getSampleCreators());
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredCreators = creators.filter((c) => {
    if (!query.trim()) return true;
    const name = c.name.toLowerCase();
    const username = c.username.toLowerCase();
    const q = query.toLowerCase();
    return name.includes(q) || username.includes(q);
  });

  return (
    <div className="max-w-4xl mx-auto py-4 px-3 sm:px-4 space-y-6">
      {/* Header & Search */}
      <div className="space-y-3">
        <h1 className="text-xl font-black tracking-tight text-stone-900 dark:text-stone-100">
          Explore Creators
        </h1>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search creators by name, username, or niche..."
            className="w-full bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 text-xs rounded-2xl pl-9 pr-4 py-3 outline-none border border-stone-200 dark:border-stone-800 shadow-2xs focus:border-rose-400"
          />
        </div>
      </div>

      {/* Categories Horizontal Scroll */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:border-rose-400 shrink-0 shadow-2xs cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-rose-500" />
            <span>{cat.name}</span>
          </button>
        ))}
      </div>

      {/* Grid of Trending Creators */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-rose-500 fill-current" />
          <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
            Trending Content Creators
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {filteredCreators.map((creator) => (
            <div
              key={creator.id}
              onClick={() => onOpenCreator(creator.username)}
              className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-2xs hover:shadow-md hover:border-rose-300 transition-all cursor-pointer flex flex-col items-center text-center relative overflow-hidden group"
            >
              <img
                src={creator.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300'}
                alt={creator.name}
                className="w-20 h-20 rounded-full object-cover border-2 border-rose-500 group-hover:scale-105 transition-transform"
                referrerPolicy="no-referrer"
              />

              <div className="mt-3">
                <div className="flex items-center justify-center gap-1">
                  <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100 group-hover:text-rose-600 transition-colors">
                    {creator.name}
                  </h3>
                  {creator.isVerified && <ShieldCheck className="w-4 h-4 text-blue-500 fill-current" />}
                </div>
                <p className="text-xs text-stone-400">@{creator.username}</p>
              </div>

              {creator.bio && (
                <p className="text-xs text-stone-600 dark:text-stone-400 mt-2 line-clamp-2 leading-relaxed">
                  {creator.bio}
                </p>
              )}

              <button
                type="button"
                className="mt-4 w-full py-2 px-4 rounded-xl font-bold text-xs bg-rose-600 text-white hover:bg-rose-700 transition-colors shadow-2xs"
              >
                View Profile
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

function getSampleCreators(): User[] {
  return [
    {
      id: 'c-1',
      name: 'Alexa Rose',
      username: 'alexarose',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300',
      bio: 'Fashion model, lifestyle vlogger & digital artist. Weekly exclusive content!',
      isCreator: true,
      isVerified: true,
      subscribersCount: 1420,
    },
    {
      id: 'c-2',
      name: 'Marcus Vance',
      username: 'marcusfitness',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300',
      bio: 'Fitness coach & powerlifter. Custom workout plans and daily motivation.',
      isCreator: true,
      isVerified: true,
      subscribersCount: 980,
    },
    {
      id: 'c-3',
      name: 'Elena Rostova',
      username: 'elenacosplay',
      avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300',
      bio: 'Anime & game cosplay artist. High resolution photo albums and tutorials.',
      isCreator: true,
      isVerified: true,
      subscribersCount: 2300,
    },
  ];
}
