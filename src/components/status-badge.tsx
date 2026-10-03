export function StatusBadge({ status }: { status: "draft" | "published" }) {
  return status === "published" ? (
    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">Published</span>
  ) : (
    <span className="rounded-full bg-border/60 px-2 py-0.5 text-xs font-medium text-muted">Draft</span>
  );
}
