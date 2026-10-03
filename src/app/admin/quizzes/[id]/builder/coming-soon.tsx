export function ComingSoon({ what, phase }: { what: string; phase: number }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-muted">
      {what} arrive{what.endsWith("s") ? "" : "s"} in Phase {phase}.
    </div>
  );
}
