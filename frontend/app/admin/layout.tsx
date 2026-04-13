export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full bg-neutral-100 dark:bg-neutral-900">
      <div className="mx-auto w-full max-w-5xl px-paper-4 py-paper-12">
        {children}
      </div>
    </div>
  );
}
