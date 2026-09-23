import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { getSession } from "@/lib/auth";
import { Nav } from "@/components/nav";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LogeBold",
  description: "Logens regnskab for Premier League-sæsonen",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eff1ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1210" },
  ],
};

// Vercel sætter commit-sha'en på hvert deploy — så kan man se hvilken version der kører.
const commitSha = process.env.VERCEL_GIT_COMMIT_SHA;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();

  return (
    <html lang="da">
      <body className={`${bricolage.variable} ${plexMono.variable}`}>
        <Nav isAdmin={session?.isAdmin ?? false} memberName={session?.name} />
        <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6 sm:pb-16 sm:pt-8">
          {children}
          <footer className="mt-10 text-center text-[12px] text-ink-faint">
            {commitSha ? (
              <a
                href={`https://github.com/Kejlberg7/LogeBold/commit/${commitSha}`}
                className="hover:text-ink-soft"
              >
                Version {commitSha.slice(0, 7)}
              </a>
            ) : (
              "Version lokal"
            )}
          </footer>
        </main>
      </body>
    </html>
  );
}
