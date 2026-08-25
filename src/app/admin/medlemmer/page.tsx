import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getActiveSeason } from "@/lib/sync";
import { getAllTeams, getAssignmentsByMember, getMemberList } from "@/lib/queries";
import { Badge, Button, Card, CardHeader, PageTitle, inputClass } from "@/components/ui";
import { AddMemberForm, AssignmentForm } from "@/components/admin-forms";
import { regenerateCodeAction, updateMemberAction } from "../actions";

export default async function MembersPage() {
  await requireAdmin();
  const season = await getActiveSeason();

  const [memberRows, teams, assignmentsByMember] = await Promise.all([
    getMemberList(),
    getAllTeams(),
    season ? getAssignmentsByMember(season.id) : Promise.resolve(new Map<number, number[]>()),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-[14px] text-ink-soft underline">
          ← Admin
        </Link>
        <PageTitle
          title="Medlemmer og hold"
          lead="Loginkoder, rettigheder og hvem der har hvilke hold i denne sæson."
        />
      </div>

      <Card>
        <CardHeader title="Tilføj medlem" />
        <AddMemberForm />
      </Card>

      {memberRows.map((member) => (
        <Card key={member.id}>
          <CardHeader
            title={member.name}
            action={
              <span className="flex items-center gap-2">
                {member.isAdmin ? <Badge>Admin</Badge> : null}
                {!member.isActive ? <Badge tone="debt">På pause</Badge> : null}
              </span>
            }
          />
          <div className="flex flex-col gap-4 p-4">
            <form action={updateMemberAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={member.id} />
              <div className="min-w-[9rem] flex-1">
                <label className="flex flex-col gap-1.5">
                  <span className="label">Navn</span>
                  <input name="name" defaultValue={member.name} className={inputClass} />
                </label>
              </div>
              <label className="flex h-10 items-center gap-2 text-[14px]">
                <input type="checkbox" name="isAdmin" defaultChecked={member.isAdmin} />
                Admin
              </label>
              <label className="flex h-10 items-center gap-2 text-[14px]">
                <input type="checkbox" name="isActive" defaultChecked={member.isActive} />
                Aktiv
              </label>
              <Button type="submit" variant="ghost">
                Gem
              </Button>
            </form>

            <div className="flex flex-wrap items-center gap-3">
              <span className="label">Loginkode</span>
              <span className="num rounded border border-rule px-2 py-1 text-[15px] tracking-[0.2em]">
                {member.loginCode}
              </span>
              <form action={regenerateCodeAction}>
                <input type="hidden" name="id" value={member.id} />
                <button type="submit" className="text-[13px] text-ink-soft underline">
                  Lav en ny kode
                </button>
              </form>
            </div>

            {season ? (
              <div className="flex flex-col gap-2 border-t border-rule-soft pt-4">
                <span className="label">Hold i {season.name}</span>
                <AssignmentForm
                  memberId={member.id}
                  teams={teams}
                  selected={assignmentsByMember.get(member.id) ?? []}
                />
              </div>
            ) : null}
          </div>
        </Card>
      ))}

      {teams.length === 0 ? (
        <p className="text-[14px] text-ink-soft">
          Der er ingen hold i databasen endnu. Hent kampene under{" "}
          <Link href="/admin/maaneder" className="text-debt underline">
            Måneder og synk
          </Link>
          , så kommer holdene med.
        </p>
      ) : null}
    </div>
  );
}
