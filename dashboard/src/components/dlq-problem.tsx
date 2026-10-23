/** Why a failed message can't be retried, e.g. "unknown message type `SkillSync`", with the type in code style. */
export function DlqProblem({ problem }: { problem: string | null }) {
  if (!problem) return <>the worker can&apos;t read it</>;
  return (
    <>
      {problem.split("`").map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="font-mono text-xs">
            {part}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
