"use client";
import { useActionState } from "react";
import Link from "next/link";
import { signUp } from "@/app/signup/actions";
import type { SignupState } from "@/lib/auth";

const initial: SignupState = { status: "idle" };
export function SignupForm({ destination }: { destination: string }) {
  const [state, action, pending] = useActionState(signUp, initial);
  if (state.status === "success") return <div className="stack"><p className="notice" role="status" data-testid="signup-message">{state.message}</p><Link className="button" href={state.destination ?? destination}>Continue to workspace</Link></div>;
  return <form action={action} className="settings-form" aria-busy={pending}>
    <input type="hidden" name="next" value={destination}/>
    <label className="field">Email<input type="email" name="email" autoComplete="email" required maxLength={254} defaultValue={state.email}/></label>
    <label className="field">Password<input type="password" name="password" autoComplete="new-password" required minLength={6} maxLength={256} aria-describedby="password-help"/></label>
    <p id="password-help" className="field-help">Use a unique password with at least 6 characters. Additional account security requirements may apply.</p>
    <label className="field">Confirm password<input type="password" name="confirmation" autoComplete="new-password" required minLength={6} maxLength={256}/></label>
    {state.message && !pending && <p className={`notice${state.status === "error" ? " error" : ""}`} data-testid="signup-message" data-error-code={state.errorCode} data-error-status={state.errorStatus} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
    <button className="button" type="submit" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
  </form>;
}
