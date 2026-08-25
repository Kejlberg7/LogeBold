import Link from "next/link";
import type { MatchRow } from "@/lib/queries";
import { formatDateTime } from "@/lib/dates";
import { Money } from "./ui";

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Ikke spillet",
  TIMED: "Ikke spillet",
  IN_PLAY: "I gang",
  PAUSED: "Pause",
  POSTPONED: "Udsat",
  SUSPENDED: "Afbrudt",
  CANCELLED: "Aflyst",
};

function TeamName({
  name,
  bold,
  className = "",
}: {
  name: string;
  bold: boolean;
  className?: string;
}) {
  return (
    <span className={`${bold ? "font-semibold" : ""} ${className}`}>{name}</span>
  );
}

export function MatchList({ matches }: { matches: MatchRow[] }) {
  return (
    <ul>
      {matches.map((match) => {
        const played = match.homeGoals !== null && match.awayGoals !== null;
        const homeWon = played && match.homeGoals! > match.awayGoals!;
        const awayWon = played && match.awayGoals! > match.homeGoals!;
        const statusLabel = played ? null : (STATUS_LABELS[match.status] ?? match.status);

        return (
          <li key={match.id} className="border-b border-rule-soft px-4 py-3 last:border-b-0">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 text-[15px]">
                <TeamName name={match.homeTeam.shortName} bold={homeWon} />
                <span className="text-ink-faint"> – </span>
                <TeamName name={match.awayTeam.shortName} bold={awayWon} />
              </div>
              {played ? (
                <span className="num shrink-0 text-[15px] font-semibold">
                  {match.homeGoals}–{match.awayGoals}
                </span>
              ) : (
                <span className="shrink-0 text-[13px] text-ink-soft">{statusLabel}</span>
              )}
            </div>

            <div className="mt-0.5 text-[13px] text-ink-soft">{formatDateTime(match.kickoff)}</div>

            {match.charges.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1">
                {match.charges.map((charge, i) => {
                  const team =
                    charge.teamId === match.homeTeam.id
                      ? match.homeTeam.shortName
                      : match.awayTeam.shortName;
                  return (
                    <li
                      key={`${charge.memberId}-${charge.teamId}-${i}`}
                      className="flex items-baseline justify-between gap-3 text-[14px]"
                    >
                      <Link
                        href={`/medlem/${charge.memberId}`}
                        className="truncate text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink"
                      >
                        {charge.memberName} <span className="text-ink-faint">({team})</span>
                      </Link>
                      <Money ore={charge.amountOre} className="text-[14px]" />
                    </li>
                  );
                })}
              </ul>
            ) : played ? (
              <p className="mt-1 text-[13px] text-ink-faint">Ingen betalte for denne kamp.</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
