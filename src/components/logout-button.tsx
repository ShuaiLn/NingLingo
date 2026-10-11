"use client";
import { signOut } from "@/app/login/actions";
export function LogoutButton() { return <form action={signOut}><button className="button secondary" type="submit">Sign out</button></form>; }
