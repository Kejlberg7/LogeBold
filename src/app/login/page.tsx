import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { members } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { Card, PageTitle } from "@/components/ui";
import { BootstrapForm, LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/");

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(members);
  const needsSetup = count === 0;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pt-10">
      <PageTitle
        title="LogeBold"
        lead={
          needsSetup
            ? "Ingen er oprettet endnu. Opret dig selv som admin, så du kan sætte sæsonen op."
            : "Logens regnskab for Premier League-sæsonen."
        }
      />
      <Card className="p-5">{needsSetup ? <BootstrapForm /> : <LoginForm />}</Card>
    </div>
  );
}
