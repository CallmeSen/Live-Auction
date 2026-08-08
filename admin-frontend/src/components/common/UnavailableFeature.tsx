type UnavailableFeatureProps = {
  title: string;
  detail: string;
};

export default function UnavailableFeature({ title, detail }: UnavailableFeatureProps) {
  return (
    <section className="mx-auto flex min-h-[65vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Serverless scope</span>
      <h1 className="mt-4 font-display text-4xl">{title}</h1>
      <p className="mt-4 text-sm leading-6 text-[var(--color-text-muted)]">{detail}</p>
    </section>
  );
}
