import type { ReactNode } from "react";
import { formatOre } from "@/lib/money";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-rule bg-surface ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-rule-soft px-4 py-3">
      <h2 className="label">{title}</h2>
      {action}
    </div>
  );
}

export function PageTitle({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="display text-3xl sm:text-4xl">{title}</h1>
      {lead ? <p className="text-ink-soft text-[15px]">{lead}</p> : null}
    </div>
  );
}

/** Beløb med fortegnsfarve: rød når der skyldes, grøn når der er betalt ind. */
export function Money({
  ore,
  className = "",
  colored = true,
  showZeroDash = false,
}: {
  ore: number;
  className?: string;
  colored?: boolean;
  showZeroDash?: boolean;
}) {
  if (ore === 0 && showZeroDash) {
    return <span className={`num text-ink-faint ${className}`}>–</span>;
  }
  const color = !colored ? "" : ore > 0 ? "text-debt" : ore < 0 ? "text-credit" : "text-ink-faint";
  return <span className={`num ${color} ${className}`}>{formatOre(ore)}</span>;
}

export function Stat({
  label,
  ore,
  hint,
  tone = "neutral",
}: {
  label: string;
  ore: number;
  hint?: string;
  tone?: "neutral" | "debt" | "credit";
}) {
  const tones = {
    neutral: "text-ink",
    debt: "text-debt",
    credit: "text-credit",
  };
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-rule bg-surface px-4 py-4">
      <span className="label">{label}</span>
      <span className={`num text-2xl font-semibold sm:text-3xl ${tones[tone]}`}>
        {formatOre(ore)}
      </span>
      {hint ? <span className="text-[13px] text-ink-soft">{hint}</span> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "debt" | "credit";
}) {
  const tones = {
    neutral: "border-rule text-ink-soft",
    debt: "border-debt/40 bg-debt-bg text-debt",
    credit: "border-credit/40 bg-credit-bg text-credit",
  };
  return (
    <span
      className={`label inline-flex items-center rounded border px-1.5 py-0.5 ${tones[tone]}`}
      style={{ letterSpacing: "0.08em" }}
    >
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-[15px] text-ink-soft">{children}</p>;
}

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  const variants = {
    primary: "bg-ink text-paper hover:opacity-90",
    ghost: "border border-rule text-ink hover:bg-surface-2",
    danger: "border border-debt/50 text-debt hover:bg-debt-bg",
  };
  return (
    <button
      {...props}
      className={`inline-flex h-10 items-center justify-center rounded-md px-4 text-[15px] font-medium transition disabled:opacity-50 ${variants[variant]} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="text-[13px] text-ink-soft">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "h-10 w-full rounded-md border border-rule bg-surface px-3 text-[15px] text-ink placeholder:text-ink-faint";
