/**
 * ShortsView - Video Shorts feed with full-height player, like & share actions.
 */

import React, { useState } from 'react';
import { Heart, MessageCircle, Share2, Music2 } from 'lucide-react';

export const ShortsView: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);

  const videos = [
    {
      id: 'v-1',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      creator: 'Alexa Rose',
      username: 'alexarose',
      caption: 'Sunset vibes by the beach! 🌅✨ #vlog #creator',
      likes: '12.4K',
      comments: '342',
    },
    {
      id: 'v-2',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      creator: 'Marcus Vance',
      username: 'marcusfitness',
      caption: 'High intensity workout challenge! 💪🔥 #fitness #goals',
      likes: '24.1K',
      comments: '890',
    },
  ];

  const current = videos[activeIndex];

  return (
    <div className="max-w-md mx-auto h-full flex flex-col items-center justify-center py-2 px-2 relative">
      <div className="w-full h-[calc(100vh-140px)] max-h-[750px] bg-black rounded-3xl overflow-hidden relative shadow-2xl">
        <video
          src={current.url}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        />

        {/* Overlay Info */}
        <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white flex justify-between items-end">
          <div className="space-y-2 max-w-[80%]">
            <h3 className="font-bold text-base">@{current.username}</h3>
            <p className="text-xs opacity-90 line-clamp-2">{current.caption}</p>
            <div className="flex items-center gap-2 text-xs opacity-75">
              <Music2 className="w-3.5 h-3.5 animate-spin" />
              <span>Original Audio - MeetSweet</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col items-center gap-4">
            <button type="button" className="flex flex-col items-center gap-1 group">
              <div className="p-3 rounded-full bg-black/40 group-hover:bg-rose-600 transition-colors">
                <Heart className="w-6 h-6 text-white" />
              </div>
              <span className="text-[11px] font-bold">{current.likes}</span>
            </button>

            <button type="button" className="flex flex-col items-center gap-1 group">
              <div className="p-3 rounded-full bg-black/40 group-hover:bg-purple-600 transition-colors">
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              <span className="text-[11px] font-bold">{current.comments}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveIndex((prev) => (prev + 1) % videos.length)}
              className="p-3 rounded-full bg-white/20 text-white font-bold text-xs hover:bg-white/40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
