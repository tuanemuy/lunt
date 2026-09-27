import type { ReactNode } from "react";

export type Fact = {
  term: string;
  description: ReactNode;
};

/** Term / value pairs (application contents, summaries): stacked on mobile, side by side from `md`. */
export function FactList({ facts }: { facts: ReadonlyArray<Fact> }) {
  return (
    <dl className="m-facts">
      {facts.map((fact) => (
        <div className="m-facts__row" key={fact.term}>
          <dt className="m-facts__term">{fact.term}</dt>
          <dd className="m-facts__desc">{fact.description}</dd>
        </div>
      ))}
    </dl>
  );
}
