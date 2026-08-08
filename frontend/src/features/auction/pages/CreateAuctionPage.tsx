import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { CatalogApi, RulesDto } from '../../../services/serverless/catalogApi';
import { ServerlessApiError } from '../../../services/serverless/contracts';
import { useCatalogApi } from '../../../services/serverless/useCatalogApi';

const MAX_MONEY_CENTS = 100_000_000_000n;

type RuleForm = {
  minIncrement: string;
  maxIncrement: string;
  antiSnipeWindowSeconds: string;
  antiSnipeExtendSeconds: string;
  maxExtensions: string;
  publicHistoryLimit: string;
};

const initialRules: RuleForm = {
  minIncrement: '1',
  maxIncrement: '1000',
  antiSnipeWindowSeconds: '30',
  antiSnipeExtendSeconds: '60',
  maxExtensions: '10',
  publicHistoryLimit: '20',
};

function moneyCents(value: string): bigint | null {
  const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const cents = BigInt(match[1]) * 100n + BigInt(fraction || '0');
  return cents <= MAX_MONEY_CENTS ? cents : null;
}

function boundedInteger(value: string, minimum: number, maximum: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function conflictCode(error: unknown): string {
  return error instanceof ServerlessApiError ? ` (${error.code})` : '';
}

type CreateAuctionPageProps = {
  catalogApi?: CatalogApi;
};

export default function CreateAuctionPage({ catalogApi }: CreateAuctionPageProps) {
  const api = useCatalogApi(catalogApi);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState<RuleForm>(initialRules);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [rulesSaved, setRulesSaved] = useState(false);
  const [createOutcomeUnknown, setCreateOutcomeUnknown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const updateRule = (field: keyof RuleForm, value: string) => {
    setRules((current) => ({ ...current, [field]: value }));
  };

  const validatedRules = (): RulesDto | null => {
    const minIncrement = moneyCents(rules.minIncrement);
    const maxIncrement = moneyCents(rules.maxIncrement);
    if (minIncrement === null || minIncrement <= 0n) {
      setError('Bước giá tối thiểu phải lớn hơn 0 và có tối đa 2 chữ số thập phân.');
      return null;
    }
    if (maxIncrement === null || maxIncrement <= 0n) {
      setError('Bước giá tối đa không hợp lệ.');
      return null;
    }
    if (maxIncrement < minIncrement) {
      setError('Bước giá tối đa phải lớn hơn hoặc bằng bước giá tối thiểu.');
      return null;
    }

    const antiSnipeWindow = boundedInteger(rules.antiSnipeWindowSeconds, 0, 3600);
    const antiSnipeExtend = boundedInteger(rules.antiSnipeExtendSeconds, 0, 3600);
    const maxExtensions = boundedInteger(rules.maxExtensions, 0, 100);
    const publicHistoryLimit = boundedInteger(rules.publicHistoryLimit, 0, 100);
    if (
      antiSnipeWindow === null
      || antiSnipeExtend === null
      || maxExtensions === null
      || publicHistoryLimit === null
    ) {
      setError('Giới hạn thời gian hoặc số lần gia hạn không hợp lệ.');
      return null;
    }

    return {
      min_increment: rules.minIncrement.trim(),
      max_increment: rules.maxIncrement.trim(),
      anti_snipe_window_s: antiSnipeWindow,
      anti_snipe_extend_s: antiSnipeExtend,
      max_extensions: maxExtensions,
      public_history_limit: publicHistoryLimit,
    };
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || rulesSaved || createOutcomeUnknown) return;

    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();
    if (!normalizedTitle || normalizedTitle.length > 200) {
      setError('Tên phiên phải có từ 1 đến 200 ký tự.');
      return;
    }
    if (normalizedDescription.length > 2000) {
      setError('Mô tả không được vượt quá 2000 ký tự.');
      return;
    }
    const payload = validatedRules();
    if (!payload) return;

    setSubmitting(true);
    setError('');
    let sessionId = createdSessionId;

    if (!sessionId) {
      try {
        const created = await api.createSession({
          title: normalizedTitle,
          description: normalizedDescription,
        });
        sessionId = created.sessionId;
        setCreatedSessionId(sessionId);
      } catch (requestError) {
        const knownFailure = requestError instanceof ServerlessApiError
          && requestError.status >= 400
          && requestError.status < 500
          && requestError.code !== 'INVALID_ENVELOPE';
        if (knownFailure) {
          setError(`Không thể tạo bản nháp.${conflictCode(requestError)}`);
        } else {
          setCreateOutcomeUnknown(true);
          setError(
            'Kết quả tạo bản nháp chưa xác định. Hãy kiểm tra danh sách phiên trước khi thử lại.',
          );
        }
        setSubmitting(false);
        return;
      }
    }

    try {
      await api.putRules(sessionId, payload);
      setRulesSaved(true);
    } catch (requestError) {
      setError(
        `Phiên nháp ${sessionId} đã tạo nhưng chưa lưu được quy tắc.${conflictCode(requestError)}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <p className="font-mono-tag text-xs uppercase text-[var(--color-primary)]">
        Kênh người bán
      </p>
      <h1 className="mt-3 font-display text-4xl">Tạo phiên đấu giá</h1>

      {error && (
        <div role="alert" className="mt-7 border-y border-[var(--color-danger-solid)]/60 py-4 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {createOutcomeUnknown && (
        <Link
          to="/my-auctions"
          className="mt-4 inline-block text-sm text-[var(--color-primary)]"
        >
          Kiểm tra danh sách phiên
        </Link>
      )}

      {rulesSaved && createdSessionId ? (
        <section className="mt-9 border-y border-[var(--color-success-border)] py-10">
          <h2 className="font-display text-2xl">Bản nháp và quy tắc đã sẵn sàng</h2>
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            Mã phiên: {createdSessionId}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to={`/auction-sessions/${encodeURIComponent(createdSessionId)}/items/create`}
              className="rounded-md bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-[var(--color-bg)]"
            >
              Thêm vật phẩm
            </Link>
            <Link
              to="/my-auctions"
              className="rounded-md border border-[var(--color-border-strong)] px-5 py-3 text-sm"
            >
              Về danh sách phiên
            </Link>
          </div>
        </section>
      ) : (
        <form onSubmit={handleSubmit} className="mt-9 grid gap-8 lg:grid-cols-2">
          <section className="space-y-5 border-t border-[var(--color-border)] pt-6">
            <h2 className="font-display text-2xl">Thông tin phiên</h2>
            <label className="block text-sm">
              <span className="text-[var(--color-text-muted)]">Tên phiên</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                required
                className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--color-text-muted)]">Mô tả</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2000}
                rows={6}
                className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3"
              />
            </label>
          </section>

          <section className="space-y-5 border-t border-[var(--color-border)] pt-6">
            <h2 className="font-display text-2xl">Quy tắc trả giá</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <RuleInput label="Bước giá tối thiểu" value={rules.minIncrement} onChange={(value) => updateRule('minIncrement', value)} />
              <RuleInput label="Bước giá tối đa" value={rules.maxIncrement} onChange={(value) => updateRule('maxIncrement', value)} />
              <RuleInput label="Cửa sổ chống sniping (giây)" value={rules.antiSnipeWindowSeconds} onChange={(value) => updateRule('antiSnipeWindowSeconds', value)} />
              <RuleInput label="Thời gian gia hạn (giây)" value={rules.antiSnipeExtendSeconds} onChange={(value) => updateRule('antiSnipeExtendSeconds', value)} />
              <RuleInput label="Số lần gia hạn tối đa" value={rules.maxExtensions} onChange={(value) => updateRule('maxExtensions', value)} />
              <RuleInput label="Giới hạn lịch sử công khai" value={rules.publicHistoryLimit} onChange={(value) => updateRule('publicHistoryLimit', value)} />
            </div>
            <button
              type="submit"
              disabled={submitting || createOutcomeUnknown}
              className="w-full rounded-md bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-[var(--color-bg)] disabled:opacity-50"
            >
              {createOutcomeUnknown
                ? 'Chờ xác minh'
                : submitting
                ? 'Đang lưu...'
                : createdSessionId
                  ? 'Thử lưu lại quy tắc'
                  : 'Tạo bản nháp'}
            </button>
          </section>
        </form>
      )}
    </main>
  );
}

type RuleInputProps = {
  label: string;
  value: string;
  onChange(value: string): void;
};

function RuleInput({ label, value, onChange }: RuleInputProps) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3"
      />
    </label>
  );
}
