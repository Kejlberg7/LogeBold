"use client";

import { useActionState } from "react";
import { bootstrapAdminAction, loginAction, type LoginState } from "./actions";
import { Button, Field, inputClass } from "@/components/ui";

const initial: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Loginkode" hint="Du har fået en kode på seks tegn af admin.">
        <input
          name="code"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="6 tegn"
          className={`${inputClass} num text-lg tracking-[0.2em] uppercase`}
        />
      </Field>
      {state.error ? <p className="text-[15px] text-debt">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Logger ind ..." : "Log ind"}
      </Button>
    </form>
  );
}

export function BootstrapForm() {
  const [state, action, pending] = useActionState(bootstrapAdminAction, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Dit navn">
        <input name="name" className={inputClass} placeholder="F.eks. Kejlberg" />
      </Field>
      <Field label="Vælg din loginkode" hint="Den bruger du fremover til at logge ind.">
        <input
          name="code"
          autoCapitalize="characters"
          spellCheck={false}
          className={`${inputClass} num uppercase tracking-[0.2em]`}
        />
      </Field>
      {state.error ? <p className="text-[15px] text-debt">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Opretter ..." : "Opret mig som admin"}
      </Button>
    </form>
  );
}
