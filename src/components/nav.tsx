"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Oversigt" },
  { href: "/mig", label: "Min side" },
  { href: "/kampe", label: "Kampe" },
  { href: "/tabel", label: "Stilling" },
];

export function Nav({ isAdmin, memberName }: { isAdmin: boolean; memberName: string }) {
  const pathname = usePathname();
  const items = isAdmin ? [...ITEMS, { href: "/admin", label: "Admin" }] : ITEMS;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="display text-lg">
            LogeBold
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-1.5 text-[15px] transition ${
                  isActive(item.href)
                    ? "bg-surface-2 font-medium text-ink"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <span className="text-[13px] text-ink-soft sm:text-[14px]">{memberName}</span>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-rule bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden">
        <div className="flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 py-3 text-center text-[13px] transition ${
                isActive(item.href) ? "font-semibold text-ink" : "text-ink-soft"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
