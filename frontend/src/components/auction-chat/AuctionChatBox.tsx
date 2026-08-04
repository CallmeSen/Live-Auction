import AuctionChatInput, {
  getConnectionStatusLabel,
} from './AuctionChatInput';
import AuctionChatMessageList from './AuctionChatMessageList';
import type { AuctionChatTimelineEntry } from './auction-chat.types';
import type { ConnectionStatus } from '../../features/auction-items/services/auctionItemSocketClient';

type AuctionChatBoxProps = {
  connectionStatus: ConnectionStatus;
  timelineEntries: AuctionChatTimelineEntry[];
  sendChatMessage: (content: string) => boolean;
  canSend: boolean;
  lastError: string | null;
  onClearLastError?: () => void;
};

export default function AuctionChatBox({
  connectionStatus,
  timelineEntries,
  sendChatMessage,
  canSend,
  lastError,
  onClearLastError,
}: AuctionChatBoxProps) {
  const statusLabel = getConnectionStatusLabel(connectionStatus);
  const isConnected = connectionStatus === 'connected';

  return (
    <section className="flex h-[32rem] flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-alt)]">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">
          Live Chat
        </h2>

        <span
          className={`text-xs ${
            isConnected
              ? 'text-[var(--color-primary)]'
              : 'text-[var(--color-text-muted)]'
          }`}
        >
          {statusLabel}
        </span>
      </header>

      <AuctionChatMessageList timelineEntries={timelineEntries} />

      <AuctionChatInput
        connectionStatus={connectionStatus}
        canSend={canSend}
        sendChatMessage={sendChatMessage}
        serverError={lastError}
        onClearServerError={onClearLastError}
      />
    </section>
  );
}
