import { useEffect, useRef } from 'react';
import AuctionChatTimelineItem from './AuctionChatTimelineItem';
import type { AuctionChatTimelineEntry } from './auction-chat.types';

type AuctionChatMessageListProps = {
  timelineEntries: AuctionChatTimelineEntry[];
};

export default function AuctionChatMessageList({
  timelineEntries,
}: AuctionChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timelineEntries]);

  if (timelineEntries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-[var(--color-text-dim)]">
        Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện.
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {timelineEntries.map((entry) => (
        <AuctionChatTimelineItem key={entry.id} entry={entry} />
      ))}

      <div ref={bottomRef} />
    </div>
  );
}
