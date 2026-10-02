export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="brand page-brand">
      <p className="eyebrow">Samsungdang DojoLog · 수련자</p>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}
