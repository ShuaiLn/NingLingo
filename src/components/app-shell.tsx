"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ChartNoAxesCombined, GraduationCap, LayoutDashboard, LibraryBig, Settings, SpellCheck, Sprout, ChevronDown, Globe2, Sparkles } from "lucide-react";
import { LANGUAGES } from "@/domain/languages";
import type { LanguageCode } from "@/domain/models";
import { useAppData } from "./app-provider";
import { useAudioStopOnChange } from "./audio-button";
import { LogoutButton } from "./logout-button";
const navigation = [{ slug: "", label: "Dashboard", icon: LayoutDashboard }, { slug: "vocabulary", label: "Vocabulary", icon: LibraryBig }, { slug: "quiz", label: "Quiz", icon: Sparkles }, { slug: "reading", label: "Reading", icon: BookOpen }, { slug: "grammar", label: "Grammar", icon: GraduationCap }, { slug: "alphabet", label: "Alphabet", icon: SpellCheck }, { slug: "progress", label: "Progress", icon: ChartNoAxesCombined }, { slug: "settings", label: "Settings", icon: Settings }];
export function AppShell({ language, children }: { language: LanguageCode; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { profile, repos, error } = useAppData(language);
  useAudioStopOnChange(path);
  const current = path.split("/")[2] ?? "";
  const localDate = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: profile.timezone }).format(new Date());
  const nav = navigation.map(item => <Link key={item.slug} href={`/${language}${item.slug ? `/${item.slug}` : ""}`} className={`nav-item ${(item.slug === current || (!item.slug && current === "dashboard")) ? "active" : ""}`} aria-current={item.slug === current ? "page" : undefined}><item.icon size={19} strokeWidth={1.7}/><span>{item.label}</span></Link>);
  return <div className="app-shell" data-language={language}>
    <aside className="sidebar"><Link href={`/${language}`} className="brand"><span className="brand-mark"><Sprout size={23}/></span><span>ninglingo<span className="brand-dot">.</span></span></Link><div className="language-control"><label className="eyebrow" htmlFor="language-select">I’M LEARNING</label><div className="language-select-wrap"><span className="language-glyph" aria-hidden>{LANGUAGES[language].glyph}</span><select id="language-select" value={language} onChange={event => router.push(`/${event.target.value}${current && current !== "dashboard" ? `/${current}` : ""}`)}>{Object.entries(LANGUAGES).map(([code, config]) => <option key={code} value={code}>{config.name} · {config.nativeName}</option>)}</select><ChevronDown size={14}/></div></div><p className="nav-caption">YOUR PRACTICE</p><nav aria-label="Main navigation">{nav}</nav><div className="sidebar-bottom"><div className="grow-note"><Sprout size={22}/><p>A little every day<br/><strong>goes a long way.</strong></p></div><Link href={`/${language}/settings`} className="profile-link"><span className="avatar">{profile.displayName.slice(0, 1)}</span><span><strong>{profile.displayName}</strong><small>Personal workspace</small></span><Settings size={16}/></Link></div></aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><Globe2 size={15}/><span>Your language space</span><span className="slash">/</span><strong lang={language}>{LANGUAGES[language].nativeName}</strong></div><div className="topbar-right"><span className="local-indicator"><span/> {repos.getStorageStatus().startsWith("Cloud") ? "Cloud workspace" : "Local workspace"}</span>{repos.getStorageStatus().startsWith("Cloud") && <LogoutButton/>}<time>{localDate}</time></div></header><div className="mobile-header"><Link href={`/${language}`} className="brand"><span className="brand-mark"><Sprout size={21}/></span>ninglingo.</Link><select aria-label="Learning language" value={language} onChange={event => router.push(`/${event.target.value}${current ? `/${current}` : ""}`)}>{Object.entries(LANGUAGES).map(([code, config]) => <option key={code} value={code}>{config.name}</option>)}</select></div><nav className="mobile-nav" aria-label="Mobile navigation">{nav}</nav><main className="page-content">{error && <p className="notice error" role="alert">{error}</p>}{repos.getStorageStatus().startsWith("Memory") && <p className="notice" role="status">{repos.getStorageStatus()}</p>}{!error && children}</main><footer className="app-footer"><span>Made for your own pace.</span><span>{LANGUAGES[language].nativeName} · {profile.timezone}</span></footer></div>
  </div>;
}
