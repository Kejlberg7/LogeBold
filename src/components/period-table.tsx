"use client";

import Link from "next/link";
import { useState } from "react";
import { formatOre, formatOreBare } from "@/lib/money";
import { Money } from "./ui";
import type { MemberPeriodStatus } from "@/lib/queries";

const STATUS_LABELS: Record<MemberPeriodStatus["status"], string> = {
  betalt: "Betalt",
  delvist: "Delvist",
  mangler: "Mangler",
  intet: "Intet opkrævet",
};

type SortKey = "name" | "chargedOre" | "coveredOre" | "outstandingOre" | "status";
type SortDirection = "asc" | "desc";

const SORTABLE_COLUMNS: {
  key: SortKey;
  label: string;
  align: "left" | "right";
}[] = [
  { key: "name", label: "Medlem", align: "left" },
  { key: "chargedOre", label: "Opkrævet", align: "right" },
  { key: "coveredOre", label: "Betalt", align: "right" },
  { key: "outstandingOre", label: "Mangler", align: "right" },
  { key: "status", label: "Status", align: "right" },
];

function compareRows(a: MemberPeriodStatus, b: MemberPeriodStatus, key: SortKey): number {
  if (key === "name") return a.name.localeCompare(b.name, "da");
  if (key === "status") return STATUS_LABELS[a.status].localeCompare(STATUS_LABELS[b.status], "da");
  return a[key] - b[key];
}

/** Beskeden til logegruppen: kun dem der mangler, navn og beløb. */
function buildText(rows: MemberPeriodStatus[], heading: string): string {
  const missing = rows.filter((r) => r.outstandingOre > 0);
  if (missing.length === 0) return `${heading}\n\nAlle har betalt.`;
  const width = Math.max(...missing.map((r) => r.name.length), 5);
  const body = missing
    .map((r) => `${r.name.padEnd(width)}  ${formatOre(r.outstandingOre)}`)
    .join("\n");
  const total = missing.reduce((sum, r) => sum + r.outstandingOre, 0);
  return `${heading}\n\n${body}\n\n${"I alt".padEnd(width)}  ${formatOre(total)}`;
}

export function PeriodTable({
  rows,
  heading,
}: {
  rows: MemberPeriodStatus[];
  heading: string;
}) {
  const [copied, setCopied] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection } | null>(null);

  // Medlemmer uden opkrævning i måneden fylder kun i tabellen.
  const shown = rows.filter((r) => r.chargedOre > 0);
  const missing = shown.filter((r) => r.outstandingOre > 0);
  const paid = shown.filter((r) => r.outstandingOre <= 0);
  const totalOutstanding = missing.reduce((sum, r) => sum + r.outstandingOre, 0);

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildText(shown, heading));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  if (shown.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-[15px] text-ink-soft">
        Der er ikke opkrævet noget i denne måned.
      </p>
    );
  }

  // Dem der mangler står øverst — det er dem beskeden handler om.
  const ordered = sort
    ? [...shown].sort((a, b) => {
        const compared = compareRows(a, b, sort.key);
        return (sort.direction === "asc" ? compared : -compared) || a.name.localeCompare(b.name, "da");
      })
    : [...missing, ...paid];

  function toggleSort(key: SortKey) {
    setSort((current) => ({
      key,
      direction: current?.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-rule">
              {SORTABLE_COLUMNS.map(({ key, label, align }) => (
                <th
                  key={key}
                  aria-sort={sort?.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  className={`label ${key === "name" ? "px-4" : "px-2"} py-2 font-normal ${align === "left" ? "text-left" : "text-right"}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(key)}
                    className="inline-flex items-center gap-1 hover:text-ink focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    {label}
                    <span aria-hidden="true" className="w-3 text-center">
                      {sort?.key === key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((row) => (
              <tr
                key={row.memberId}
                className="border-b border-rule-soft transition last:border-b-0 hover:bg-surface-2"
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={`/medlem/${row.memberId}`}
                    className="block text-[15px] underline decoration-rule underline-offset-4"
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="num whitespace-nowrap px-2 py-2.5 text-right text-ink-soft">
                  {formatOreBare(row.chargedOre)}
                </td>
                <td className="num whitespace-nowrap px-2 py-2.5 text-right text-ink-soft">
                  {row.coveredOre === 0 ? "–" : formatOreBare(row.coveredOre)}
                </td>
                <td className="whitespace-nowrap px-2 py-2.5 text-right">
                  <Money ore={row.outstandingOre} showZeroDash className="text-[15px]" />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right text-[13px] text-ink-soft">
                  {STATUS_LABELS[row.status]}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink">
              <td className="px-4 py-2.5 text-[15px] font-semibold">I alt</td>
              <td />
              <td />
              <td className="whitespace-nowrap px-2 py-2.5 text-right">
                <Money ore={totalOutstanding} className="text-[15px] font-semibold" />
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule-soft px-4 py-3">
        <span className="text-[13px] text-ink-soft">
          {missing.length === 0
            ? "Alle har betalt for måneden."
            : `${missing.length} af ${shown.length} mangler at betale.`}
        </span>
        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-rule px-3 py-1.5 text-[14px] text-ink-soft transition hover:text-ink"
        >
          {copied ? "Kopieret" : "Kopiér som tekst"}
        </button>
      </div>
    </>
  );
}
