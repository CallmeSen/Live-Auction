import {
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  MAX_CHAT_MESSAGE_LENGTH,
} from './auction-chat.types';
import type { ConnectionStatus } from '../../features/auction-items/services/auctionItemSocketClient';

type AuctionChatInputProps = {
  connectionStatus: ConnectionStatus;
  canSend: boolean;
  sendChatMessage: (content: string) => boolean;
  serverError: string | null;
  onClearServerError?: () => void;
};

function getValidationError(content: string): string | null {
  const trimmed = content.trim();

  if (!trimmed) {
    return 'Tin nhắn không được để trống.';
  }

  if (trimmed.length > MAX_CHAT_MESSAGE_LENGTH) {
    return `Tin nhắn không được vượt quá ${MAX_CHAT_MESSAGE_LENGTH} ký tự.`;
  }

  return null;
}
export default function AuctionChatInput({
  connectionStatus,
  canSend,
  sendChatMessage,
  serverError,
  onClearServerError,
}: AuctionChatInputProps) {
  const [content, setContent] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const isConnected = connectionStatus === 'connected';
  const trimmedContent = content.trim();
  const canSubmit =
    canSend && isConnected && trimmedContent.length > 0;

  const submitMessage = () => {
    const error = getValidationError(content);

    if (error) {
      setValidationError(error);
      return;
    }

    const sent = sendChatMessage(content.trim());

    if (!sent) {
      setValidationError('Không thể gửi tin nhắn khi mất kết nối.');
      return;
    }

    setContent('');
    setValidationError(null);
    onClearServerError?.();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitMessage();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();

      if (canSubmit) {
        submitMessage();
      }
    }
  };

  const displayError = validationError ?? serverError;

  return (
    <div className="border-t border-[var(--color-border)] p-4">
      {!isConnected && (
        <p className="mb-3 text-xs text-[var(--color-danger)]">
          Chat is temporarily disconnected.
        </p>
      )}

      {!canSend && (
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          Đăng nhập để gửi tin nhắn. Bạn vẫn có thể xem trò chuyện trực tiếp.
        </p>
      )}

      {displayError && (
        <p className="mb-3 text-xs text-[var(--color-danger)]">
          {displayError}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <textarea
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            setValidationError(null);
            onClearServerError?.();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={2}
          maxLength={MAX_CHAT_MESSAGE_LENGTH}
          disabled={!canSend || !isConnected}
          className="min-h-[44px] flex-1 resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-bg)] hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </div>
  );
}
