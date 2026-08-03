import { useEffect, useRef, useState } from 'react';
import type { AuthRole } from '../../auth/types';
import BidForm from '../../components/auction/BidForm';
import type { AuctionEvent } from '../../realtime/protocol';
import type { ConnectionState } from './useAuctionRoom';

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const DEFAULT_MIN_INCREMENT = '1';
const DEFAULT_TIMEOUT_MS = 10_000;

export type PendingBid = {
  requestId: string;
  amount: string;
  state: 'sending' | 'queued';
  sentAt: number;
};

type BidOutcome = {
  kind: 'accepted' | 'error';
  message: string;
};

export type BidPanelProps = {
  itemId?: string;
  connectionState: ConnectionState;
  currentPrice: string | null;
  minimumBidIncrement?: string;
  lastEvent: AuctionEvent | null;
  role?: AuthRole;
  sendBid(amount: string, requestId: string): boolean;
  timeoutMs?: number;
  now?: () => number;
};

const defaultNow = () => Date.now();

type DecimalParts = {
  digits: string;
  scale: number;
};

function decimalParts(value: string): DecimalParts | null {
  const trimmed = value.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) return null;
  const match = /^(?<integer>\d+)(?:\.(?<fraction>\d+))?(?:[eE](?<exponent>[+-]?\d+))?$/.exec(trimmed);
  if (!match?.groups) return null;
  const integer = match.groups.integer;
  const fraction = match.groups.fraction ?? '';
  const exponent = Number(match.groups.exponent ?? '0');
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 128) return null;
  let digits = `${integer}${fraction}`.replace(/^0+(?=\d)/, '');
  let scale = fraction.length - exponent;
  if (scale < 0) {
    digits += '0'.repeat(-scale);
    scale = 0;
  }
  return { digits, scale };
}

function compareDecimals(left: string, right: string): number | null {
  const leftParts = decimalParts(left);
  const rightParts = decimalParts(right);
  if (!leftParts || !rightParts) return null;
  const scale = Math.max(leftParts.scale, rightParts.scale);
  const leftValue = BigInt(leftParts.digits) * 10n ** BigInt(scale - leftParts.scale);
  const rightValue = BigInt(rightParts.digits) * 10n ** BigInt(scale - rightParts.scale);
  return leftValue === rightValue ? 0 : leftValue > rightValue ? 1 : -1;
}

function addDecimals(left: string, right: string): string {
  const leftParts = decimalParts(left) ?? { digits: '0', scale: 0 };
  const rightParts = decimalParts(right) ?? { digits: '0', scale: 0 };
  const scale = Math.max(leftParts.scale, rightParts.scale);
  const total = BigInt(leftParts.digits) * 10n ** BigInt(scale - leftParts.scale)
    + BigInt(rightParts.digits) * 10n ** BigInt(scale - rightParts.scale);
  if (scale === 0) return total.toString();
  const text = total.toString().padStart(scale + 1, '0');
  return `${text.slice(0, -scale) || '0'}.${text.slice(-scale)}`;
}

function rejectionMessage(reason: string): string {
  switch (reason) {
    case 'REJECTED_LOW_INCREMENT':
      return 'Giá thấp hơn bước giá tối thiểu.';
    case 'REJECTED_NOT_LIVE':
      return 'Phiên đấu giá không còn LIVE.';
    case 'REJECTED_SELLER_BID':
      return 'Người bán không thể tự trả giá.';
    case 'REJECTED_MAX_EXTENSION':
      return 'Phiên đấu giá đã hết lượt gia hạn.';
    default:
      return 'Giá bị từ chối. Vui lòng kiểm tra trạng thái phiên.';
  }
}

export default function BidPanel({
  itemId = 'item-1',
  connectionState,
  currentPrice,
  minimumBidIncrement = DEFAULT_MIN_INCREMENT,
  lastEvent,
  role,
  sendBid,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = defaultNow,
}: BidPanelProps) {
  const increment = decimalParts(minimumBidIncrement)
    ? minimumBidIncrement
    : DEFAULT_MIN_INCREMENT;
  const price = decimalParts(currentPrice ?? '0') ? currentPrice ?? '0' : '0';
  const suggestedAmount = addDecimals(price, increment);
  const previousSuggestedRef = useRef(suggestedAmount);
  const [amount, setAmount] = useState(suggestedAmount);
  const [userEdited, setUserEdited] = useState(false);
  const [pending, setPending] = useState<PendingBid | null>(null);
  const pendingRef = useRef<PendingBid | null>(null);
  const [outcome, setOutcome] = useState<BidOutcome | null>(null);
  const handledEventRef = useRef<AuctionEvent | null>(null);

  useEffect(() => {
    if (suggestedAmount === previousSuggestedRef.current) return;
    const preserveHigherEdit = userEdited
      && compareDecimals(amount, previousSuggestedRef.current) === 1;
    if (!preserveHigherEdit) {
      setAmount(suggestedAmount);
      setUserEdited(false);
    }
    previousSuggestedRef.current = suggestedAmount;
  }, [amount, suggestedAmount, userEdited]);

  useEffect(() => {
    if (!pending) return;
    const requestId = pending.requestId;
    const timer = window.setTimeout(() => {
      if (pendingRef.current?.requestId !== requestId) return;
      pendingRef.current = null;
      setPending(null);
      setOutcome({ kind: 'error', message: 'Yêu cầu trả giá đã hết thời gian chờ.' });
    }, Math.max(0, timeoutMs - Math.max(0, now() - pending.sentAt)));
    return () => window.clearTimeout(timer);
  }, [now, pending, timeoutMs]);

  useEffect(() => {
    if (!lastEvent || lastEvent === handledEventRef.current) return;
    handledEventRef.current = lastEvent;
    if (!pending || lastEvent.item_id !== itemId || lastEvent.type === 'room_joined') return;

    if (lastEvent.type === 'bid_queued' && lastEvent.request_id === pending.requestId) {
      const requestId = pending.requestId;
      queueMicrotask(() => {
        if (pendingRef.current?.requestId !== requestId) return;
        setPending((current) => current?.requestId === requestId
          ? { ...current, state: 'queued' }
          : current);
      });
      return;
    }

    if (lastEvent.type === 'price_update' && lastEvent.request_id === pending.requestId) {
      const requestId = pending.requestId;
      queueMicrotask(() => {
        if (pendingRef.current?.requestId !== requestId) return;
        pendingRef.current = null;
        setPending(null);
        setOutcome({ kind: 'accepted', message: 'Đặt giá thành công.' });
      });
      return;
    }

    if (lastEvent.type === 'bid_result' && lastEvent.request_id === pending.requestId) {
      const requestId = pending.requestId;
      const message = rejectionMessage(lastEvent.reason);
      queueMicrotask(() => {
        if (pendingRef.current?.requestId !== requestId) return;
        pendingRef.current = null;
        setPending(null);
        setOutcome({ kind: 'error', message });
      });
    }
  }, [itemId, lastEvent, pending]);

  if (role !== 'USER') return null;

  const submit = () => {
    setOutcome(null);
    if (pending) return;
    if (!decimalParts(amount) || compareDecimals(amount, '0') !== 1) {
      setOutcome({ kind: 'error', message: 'Vui lòng nhập số tiền hợp lệ.' });
      return;
    }
    if (compareDecimals(amount, suggestedAmount) !== 1 && compareDecimals(amount, suggestedAmount) !== 0) {
      setOutcome({ kind: 'error', message: `Giá tối thiểu là ${suggestedAmount}.` });
      return;
    }
    if (connectionState !== 'joined') {
      setOutcome({ kind: 'error', message: 'Phiên chưa sẵn sàng nhận trả giá.' });
      return;
    }

    const requestId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : '';
    if (!requestId || !sendBid(amount, requestId)) {
      setOutcome({ kind: 'error', message: 'Không thể gửi trả giá lúc này.' });
      return;
    }
    const nextPending = { requestId, amount, state: 'sending' as const, sentAt: now() };
    pendingRef.current = nextPending;
    setPending(nextPending);
  };

  const statusMessage = pending?.state === 'queued'
    ? 'Đang chờ xác nhận...'
    : pending
      ? 'Đang gửi...'
      : outcome?.kind === 'accepted'
        ? outcome.message
        : null;

  return (
    <div className="min-w-0">
      <BidForm
        amount={amount}
        currentPrice={currentPrice}
        minimumAmount={suggestedAmount}
        disabled={pending !== null || connectionState !== 'joined'}
        onAmountChange={(nextAmount) => {
          setAmount(nextAmount);
          setUserEdited(true);
          setOutcome(null);
        }}
        onSubmit={submit}
      />
      {statusMessage && (
        <p role="status" aria-live="polite" className="mt-3 text-xs text-[var(--color-text-muted)]">
          {statusMessage}
        </p>
      )}
      {outcome?.kind === 'error' && (
        <p role="alert" className="mt-3 text-xs text-[var(--color-danger)]">
          {outcome.message}
        </p>
      )}
    </div>
  );
}
