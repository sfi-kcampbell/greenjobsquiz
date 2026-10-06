/** Counts answered questions, not the current position. */
export function Progress({ answered, total }: { answered: number; total: number }) {
  const percent = total > 0 ? Math.round((100 * answered) / total) : 0;
  return (
    <div className="flex items-center gap-3 text-sm text-muted">
      <div
        role="progressbar"
        aria-label="Questions answered"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answered}
        aria-valuetext={`${answered} of ${total} answered`}
        className="meter-track h-2 flex-1 overflow-hidden rounded-full bg-border"
      >
        <div className="meter-fill h-full rounded-full bg-brand motion-safe:transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <span className="shrink-0 tabular-nums">
        {answered} of {total} answered
      </span>
    </div>
  );
}
