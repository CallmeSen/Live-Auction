import { formatDateTime } from '../../utils/formatDate';
import { getTimelineEntryText } from './auctionChatTimeline';
import type { AuctionChatTimelineEntry } from './auction-chat.types';
import { isUserTimelineEntry } from './auction-chat.types';

type AuctionChatTimelineItemProps = {
  entry: AuctionChatTimelineEntry;
};

export default function AuctionChatTimelineItem({
  entry,
}: AuctionChatTimelineItemProps) {
  if (isUserTimelineEntry(entry)) {
    return (
      <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <p className="text-sm font-semibold text-[var(--color-text)]">
          {entry.senderName}
        </p>

        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-text-soft)]">
          {entry.content}
        </p>

        <time
          dateTime={entry.timestamp}
          className="mt-2 block text-[11px] text-[var(--color-text-dim)]"
        >
          {formatDateTime(entry.timestamp)}
        </time>
      </article>
    );
  }

  const text = getTimelineEntryText(entry);

  return (
    <article className="mx-auto max-w-[92%] rounded-full bg-[var(--color-surface)]/80 px-4 py-2 text-center">
      <p className="whitespace-pre-wrap text-xs leading-5 text-[var(--color-text-muted)]">
        <span className="mr-1 text-[var(--color-primary)]">●</span>
        {text}
      </p>

      <time
        dateTime={entry.timestamp}
        className="mt-1 block text-[10px] text-[var(--color-text-dim)]"
      >
        {formatDateTime(entry.timestamp)}
      </time>
    </article>
  );
}
