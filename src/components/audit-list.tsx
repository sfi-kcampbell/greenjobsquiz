import type { auditEvents } from "@/lib/db/schema";

type Row = typeof auditEvents.$inferSelect;

const when = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

/** Activity rows: when (UTC), who, quiz, what. */
export function AuditList({ rows, showQuiz = true }: { rows: Row[]; showQuiz?: boolean }) {
  if (rows.length === 0) return <p className="text-muted">No activity yet.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">When (UTC)</th>
            <th scope="col" className="px-4 py-2 font-medium">Who</th>
            {showQuiz && <th scope="col" className="px-4 py-2 font-medium">Quiz</th>}
            <th scope="col" className="px-4 py-2 font-medium">What</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap px-4 py-2 text-muted">
                <time dateTime={r.at.toISOString()}>{when.format(r.at)}</time>
              </td>
              <td className="px-4 py-2">{r.actorEmail}</td>
              {showQuiz && <td className="px-4 py-2">{r.quizTitle ?? <span className="text-muted">—</span>}</td>}
              <td className="px-4 py-2">{r.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
