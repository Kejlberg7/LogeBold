"use client";

import { useMemo, useState } from "react";
import { Button } from "./ui";

export type RequestLine = {
  name: string;
  ore: number;
  /** Hvad beløbet består af — vises i den detaljerede udgave. */
  parts: { label: string; ore: number }[];
};

export type RequestList = {
  key: string;
  label: string;
  heading: string;
  lines: RequestLine[];
};

function formatKr(ore: number): string {
  const kr = ore === 0 ? 0 : ore / 100;
  const body = new Intl.NumberFormat("da-DK", {
    minimumFractionDigits: ore % 100 === 0 ? 0 : 2,
    maximumFractionDigits: ore % 100 === 0 ? 0 : 2,
  }).format(kr);
  return `${body} kr`;
}

function buildText(list: RequestList, detailed: boolean): string {
  if (list.lines.length === 0) {
    return `${list.heading}\n\nAlle er betalt. Godt gået.`;
  }

  const total = list.lines.reduce((sum, l) => sum + l.ore, 0);

  if (!detailed) {
    const width = Math.max(...list.lines.map((l) => l.name.length), 5);
    const body = list.lines
      .map((l) => `${l.name.padEnd(width)}  ${formatKr(l.ore)}`)
      .join("\n");
    return `${list.heading}\n\n${body}\n\n${"I alt".padEnd(width)}  ${formatKr(total)}`;
  }

  // Detaljeret: hver person får sine egne linjer, så man kan se hvad beløbet dækker.
  const partWidth = Math.max(
    ...list.lines.flatMap((l) => l.parts.map((p) => p.label.length + 2)),
    5,
  );
  const body = list.lines
    .map((l) => {
      const parts = l.parts
        .filter((p) => p.ore !== 0)
        .map((p) => `  ${p.label.padEnd(partWidth - 2)}  ${formatKr(p.ore)}`)
        .join("\n");
      const head = `${l.name}: ${formatKr(l.ore)}`;
      return parts ? `${head}\n${parts}` : head;
    })
    .join("\n\n");

  return `${list.heading}\n\n${body}\n\nI alt: ${formatKr(total)}`;
}

export function PaymentRequest({ lists }: { lists: RequestList[] }) {
  const [selected, setSelected] = useState(lists[0]?.key ?? "");
  const [detailed, setDetailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const list = lists.find((l) => l.key === selected) ?? lists[0];
  const text = useMemo(() => (list ? buildText(list, detailed) : ""), [list, detailed]);

  if (!list) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Uden adgang til udklipsholderen markerer vi teksten, så man selv kan kopiere.
      const field = document.getElementById("opgoerelse") as HTMLTextAreaElement | null;
      field?.select();
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex gap-1.5 pb-1">
          {lists.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSelected(item.key)}
              className={`shrink-0 rounded-md border px-3 py-1.5 text-[14px] transition ${
                item.key === selected
                  ? "border-ink bg-ink text-paper"
                  : "border-rule text-ink-soft hover:text-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tekstfelt frem for kun visning: så kan man både kopiere og rette til inden afsendelse. */}
      <textarea
        id="opgoerelse"
        readOnly
        value={text}
        rows={Math.min(20, text.split("\n").length + 1)}
        className="num w-full resize-y rounded-md border border-rule bg-surface-2 p-3 text-[13.5px] leading-relaxed text-ink"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={copy}>
          {copied ? "Kopieret" : "Kopiér listen"}
        </Button>
        <label className="flex items-center gap-2 text-[14px] text-ink-soft">
          <input
            type="checkbox"
            checked={detailed}
            onChange={(e) => setDetailed(e.target.checked)}
          />
          Vis hvad beløbet dækker
        </label>
        <span className="text-[13px] text-ink-soft">
          {list.lines.length === 0
            ? "Ingen skylder noget."
            : `${list.lines.length} ${list.lines.length === 1 ? "person" : "personer"}`}
        </span>
      </div>
    </div>
  );
}
