"use client";

import { useState } from "react";
import { formatOre, formatOreBare } from "@/lib/money";
import { Money } from "./ui";

export type OutstandingRow = {
  memberId: number;
  name: string;
  matchOre: number;
  fineOre: number;
  adjustmentOre: number;
  paidOre: number;
  balanceOre: number;
};

/** Ren tekst til beskeden i logegruppen — navn og beløb, pænt på linje. */
function buildText(rows: OutstandingRow[], heading: string): string {
  if (rows.length === 0) return `${heading}\n\nAlle har betalt.`;
  const width = Math.max(...rows.map((r) => r.name.length), 5);
  const body = rows.map((r) => `${r.name.padEnd(width)}  ${formatOre(r.balanceOre)}`).join("\n");
  const total = rows.reduce((sum, r) => sum + r.balanceOre, 0);
  return `${heading}\n\n${body}\n\n${"I alt".padEnd(width)}  ${formatOre(total)}`;
}

export function OutstandingTable({
  rows,
  settled,
  heading,
}: {
  rows: OutstandingRow[];
  settled: string[];
  heading: string;
}) {
  const [copied, setCopied] = useState(false);
  const total = rows.reduce((sum, r) => sum + r.balanceOre, 0);

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildText(rows, heading));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-[15px] text-ink-soft">
        Alle har betalt. Det sker ikke tit.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-rule">
              <th className="label px-4 py-2 text-left font-normal">Medlem</th>
              <th className="label hidden px-2 py-2 text-right font-normal sm:table-cell">
                I alt
              </th>
              <th className="label hidden px-2 py-2 text-right font-normal sm:table-cell">
                Bøder
              </th>
              <th className="label hidden px-2 py-2 text-right font-normal sm:table-cell">
                Betalt
              </th>
              <th className="label px-4 py-2 text-right font-normal">Skylder</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.memberId} className="border-b border-rule-soft last:border-b-0">
                <td className="px-4 py-2.5 text-[15px]">{row.name}</td>
                <td className="num hidden whitespace-nowrap px-2 py-2.5 text-right text-ink-soft sm:table-cell">
                  {/* Alt hvad der er opkrævet: kampe, bøder og reguleringer. */}
                  {row.matchOre + row.fineOre + row.adjustmentOre === 0
                    ? "–"
                    : formatOreBare(row.matchOre + row.fineOre + row.adjustmentOre)}
                </td>
                <td className="num hidden whitespace-nowrap px-2 py-2.5 text-right text-ink-soft sm:table-cell">
                  {row.fineOre === 0 ? "–" : formatOreBare(row.fineOre)}
                </td>
                <td className="num hidden whitespace-nowrap px-2 py-2.5 text-right text-ink-soft sm:table-cell">
                  {row.paidOre === 0 ? "–" : formatOreBare(row.paidOre)}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  <Money ore={row.balanceOre} className="text-[15px]" />
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink">
              <td className="px-4 py-2.5 text-[15px] font-semibold">I alt</td>
              <td className="hidden sm:table-cell" />
              <td className="hidden sm:table-cell" />
              <td className="hidden sm:table-cell" />
              <td className="whitespace-nowrap px-4 py-2.5 text-right">
                <Money ore={total} className="text-[15px] font-semibold" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule-soft px-4 py-3">
        <span className="text-[13px] text-ink-soft">
          {settled.length > 0
            ? `Betalt op: ${settled.join(", ")}`
            : "Ingen er betalt helt op endnu."}
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
