/* Mineral Signal design: graphite control plane, mineral-green verified signals, asymmetric workspace, visible lifecycle boundaries. */
import { useMemo, useState, type ReactNode } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import {
  Activity, AlertTriangle, Boxes, BrainCircuit, ChevronRight, CircleDot, Command, Cpu,
  Database, FileCode2, FolderKanban, GitBranch, LayoutDashboard, LifeBuoy, Network,
  PackageCheck, PanelLeftClose, PanelLeftOpen, PlugZap, Rocket, Search, Settings2,
  ShieldCheck, Sparkles, Terminal, Workflow, X
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";

const sections = [
  { label: "Control plane", items: [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/applications", label: "Applications", icon: Boxes },
    { href: "/pathways", label: "Pathways", icon: Network },
    { href: "/capabilities", label: "Capabilities", icon: CircleDot },
    { href: "/compose", label: "Compose", icon: GitBranch },
    { href: "/plugins", label: "Plugins", icon: PlugZap },
    { href: "/projects", label: "Projects", icon: FolderKanban },
  ]},
  { label: "Service plane", items: [
    { href: "/ai", label: "AI Studio", icon: BrainCircuit },
    { href: "/data", label: "Data & Events", icon: Database },
    { href: "/devices", label: "Devices", icon: Cpu },
    { href: "/workflows", label: "Workflows", icon: Workflow },
    { href: "/audit", label: "Audit & Security", icon: ShieldCheck },
  ]},
];

function Brand({ collapsed }: { collapsed: boolean }) {
  return <Link href="/" className="brand" aria-label="ONENESS Control Center">
    <img className="brand-mark-image" src="/manus-storage/oneness-mark_88f7b815.png" alt="" />
    {!collapsed && <span><strong>ONENESS</strong><small>CONTROL CENTER</small></span>}
  </Link>;
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const [location] = useLocation();
  return <aside className={`sidebar ${collapsed ? "is-collapsed" : ""}`}>
    <div className="sidebar-top"><Brand collapsed={collapsed} /><button className="icon-button rail-toggle" onClick={onToggle} aria-label="Toggle navigation">{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button></div>
    <nav className="side-nav">
      {sections.map(section => <div className="nav-group" key={section.label}>
        {!collapsed && <div className="nav-label">{section.label}</div>}
        {section.items.map(item => { const Icon = item.icon; const active = item.href === "/" ? location === "/" : location.startsWith(item.href); return <Link key={item.href} href={item.href} className={`nav-item ${active ? "active" : ""}`} title={collapsed ? item.label : undefined}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{active && <i />}</Link>; })}
      </div>)}
    </nav>
    <div className="sidebar-bottom">
      <Link href="/settings" className="nav-item"><Settings2 size={17} /><span>Settings</span></Link>
      {!collapsed && <div className="rail-status"><span className="live-dot" /> All systems nominal <span className="mono">v0.4.2</span></div>}
    </div>
  </aside>;
}

function Topbar({ onMobileMenu }: { onMobileMenu: () => void }) {
  return <header className="topbar">
    <button className="mobile-menu icon-button" onClick={onMobileMenu} aria-label="Open menu"><Command size={17} /></button>
    <div className="crumb"><span className="mono">workspace</span><ChevronRight size={14} /><strong>control-center</strong></div>
    <div className="top-actions"><label className="search"><Search size={16} /><input placeholder="Search platform" /><kbd>⌘ K</kbd></label><button className="icon-button notify" aria-label="Notifications"><Activity size={17} /><b /></button><div className="avatar">OG</div></div>
  </header>;
}

function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  return <div className="app-shell"><div className={`mobile-scrim ${mobileOpen ? "show" : ""}`} onClick={() => setMobileOpen(false)} /><div className={mobileOpen ? "mobile-open" : ""}><Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} /></div><div className={`main-frame ${collapsed ? "rail-collapsed" : ""}`}><Topbar onMobileMenu={() => setMobileOpen(true)} /><main className="workspace">{children}</main></div><Toaster /></div>;
}

function Composer() {
  const [selected, setSelected] = useState(["identity", "organisations", "authorization"]);
  const modules = ["identity", "organisations", "authorization", "audit", "ai", "risk-scoring"];
  return <div className="page-grid"><div className="page-main"><PageHeading eyebrow="Composition plane / 01" title="Compose the next verified system." description="Resolve a pathway into a dependency-ordered plan before materialization. The graph is the contract." action={<button className="primary-action" onClick={() => setSelected([...selected, "audit"])}><GitBranch size={16} /> Compose application</button>} />
    <section className="panel composer-panel"><div className="panel-head"><div><span className="eyebrow">Pathway</span><h3>Enterprise</h3></div><span className="status-pill green"><span /> foundation</span></div><div className="capability-picker">{modules.map(id => <button key={id} className={`capability-chip ${selected.includes(id) ? "selected" : ""}`} onClick={() => setSelected(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])}><span className="chip-check">{selected.includes(id) ? "✓" : ""}</span>{id}<small>{id === "risk-scoring" ? "plugin" : "native"}</small></button>)}</div><div className="graph-stage"><div className="graph-meta"><span>Dependency graph</span><span className="mono">{selected.length} modules / resolved</span></div><div className="graph-line">{selected.map((id, i) => <div className="graph-node-wrap" key={id}><div className={`graph-node ${id === "risk-scoring" ? "plugin-node" : ""}`}><span>{i + 1}</span>{id}</div>{i < selected.length - 1 && <div className="graph-connector" />}</div>)}</div></div></section>
  </div><ContextPanel title="Resolution preview"><Signal label="Unresolved" value="0" tone="green" /><Signal label="Future modules" value="1" tone="amber" /><Signal label="Provenance" value="native + plugin" tone="green" /><div className="context-note"><AlertTriangle size={16} /><p>Materialization stays gated until the plan contains no unresolved capability identifiers.</p></div></ContextPanel></div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <div className="page-heading"><div><span className="eyebrow"><i />{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
function ContextPanel({ title, children }: { title: string; children: ReactNode }) { return <aside className="context-panel"><div className="context-title"><span className="eyebrow">Live context</span><h3>{title}</h3></div>{children}</aside>; }
function Signal({ label, value, tone }: { label: string; value: string; tone: string }) { return <div className="signal-row"><span>{label}</span><strong className={tone}>{value}</strong></div>; }
function Stat({ label, value, detail, icon: Icon, accent }: { label: string; value: string; detail: string; icon: any; accent?: string }) { return <div className="stat-card"><div className={`stat-icon ${accent || ""}`}><Icon size={17} /></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function ActivityRow({ title, meta, status, tone = "green" }: { title: string; meta: string; status: string; tone?: string }) { return <div className="activity-row"><div className="activity-mark"><span className={tone} /></div><div><strong>{title}</strong><small className="mono">{meta}</small></div><span className={`status-text ${tone}`}>{status}</span></div>; }

function Dashboard() { return <div className="page-grid"><div className="page-main"><PageHeading eyebrow="Control plane / overview" title="Operational clarity, from pathway to production." description="A quiet command surface for pathway discovery, capability composition, and governed application generation." action={<Link href="/compose" className="primary-action"><Sparkles size={16} /> Start composition</Link>} /><div className="stat-grid"><Stat label="Platform health" value="98%" detail="+2.4% this cycle" icon={Activity} accent="mint" /><Stat label="Applications" value="12" detail="4 materialized today" icon={Boxes} /><Stat label="Capabilities" value="47" detail="18 native / 29 future" icon={CircleDot} /><Stat label="External plugins" value="08" detail="All validated" icon={PlugZap} accent="amber" /></div><section className="panel activity-panel"><div className="panel-head"><div><span className="eyebrow">System activity</span><h3>Recent operations</h3></div><Link href="/audit" className="text-link">View audit <ChevronRight size={14} /></Link></div><ActivityRow title="Enterprise App" meta="materialized · 2m ago" status="ready" /><ActivityRow title="Procurement App" meta="composed · 14m ago" status="resolved" /><ActivityRow title="Acme Risk" meta="plugin loaded · 31m ago" status="validated" /><ActivityRow title="AI Capability" meta="awaiting dependency · 1h ago" status="pending" tone="amber" /></section></div><ContextPanel title="Platform status"><div className="health-score"><div><strong>98</strong><span>/ 100</span></div><div className="health-ring"><span>nominal</span></div></div><div className="context-section"><span className="eyebrow">Lifecycle</span><Signal label="Generated" value="12" tone="green" /><Signal label="Validated" value="09" tone="green" /><Signal label="Preview" value="03" tone="amber" /><Signal label="Production" value="00" tone="muted" /></div><div className="context-note mint-note"><ShieldCheck size={16} /><p>External capabilities are pinned, validated, and provenance-tagged.</p></div></ContextPanel></div>; }

function ListPage({ kind }: { kind: string }) { const data: Record<string, { title: string; eyebrow: string; desc: string; icon: any; items: [string,string,string,string][] }> = { applications: { title: "Applications in motion.", eyebrow: "Application plane / registry", desc: "Track generated systems from first composition through validated delivery.", icon: Boxes, items: [["Enterprise Portal", "enterprise", "Ready", "identity · organisations · authorization"], ["Procurement Hub", "procurement", "Composed", "identity · storage · audit"], ["Risk Console", "enterprise + plugin", "Draft", "identity · risk-scoring"]] }, pathways: { title: "Find the right starting point.", eyebrow: "Control plane / pathways", desc: "Every ONENESS pathway is a composed system boundary with visible capability intent.", icon: Network, items: [["Enterprise", "foundation", "8 capabilities", "identity · organisations · authorization"], ["Procurement", "foundation", "5 capabilities", "rfq · supplier-lifecycle · audit"], ["Digital Twin", "foundation", "5 capabilities", "twin-state · simulation · alerts"]] }, capabilities: { title: "A marketplace of system primitives.", eyebrow: "Composition plane / capabilities", desc: "Native, plugin, and future modules are shown together without hiding their origin.", icon: CircleDot, items: [["Identity", "native", "partial", "authentication · profiles"], ["Authorization", "native", "partial", "rbac · abac · policy-engine"], ["Risk Scoring", "plugin:acme-risk@1.0.0", "partial", "risk-models · decision-support"], ["Advanced Banking", "roadmap", "future", "settlement · reconciliation"]] }, plugins: { title: "Keep the extension surface governed.", eyebrow: "Control plane / plugins", desc: "External packages are trusted application code, explicitly registered and provenance-visible.", icon: PlugZap, items: [["Acme Risk", "acme-risk", "Validated", "8 capabilities · pinned v1.0.0"], ["AI Analytics", "ai-analytics", "Validated", "5 capabilities · pinned v2.1.0"], ["Commerce Bridge", "commerce-bridge", "Pending", "3 capabilities · awaiting review"]] }, projects: { title: "Generated projects, made legible.", eyebrow: "Application plane / projects", desc: "Browse composition manifests and generated capability modules before deployment.", icon: FolderKanban, items: [["enterprise-app", "materialized", "Build passed", "14 files · 3 modules"], ["procurement-app", "validated", "Tests passed", "12 files · 3 modules"], ["risk-console", "draft", "Not validated", "16 files · 4 modules"]] }, audit: { title: "Know what changed and why.", eyebrow: "Service plane / audit", desc: "A durable operational timeline for composition, plugins, materialization, and deployment gates.", icon: ShieldCheck, items: [["User authenticated", "20:14", "verified", "session · user_123"], ["Enterprise composition created", "20:15", "recorded", "pathway · enterprise"], ["Plugin loaded", "20:16", "recorded", "acme-risk@1.0.0"], ["Application materialized", "20:17", "recorded", "enterprise-app"]] }, deployment: { title: "Move forward without skipping a gate.", eyebrow: "Delivery plane / deployment", desc: "Generated is not production. The platform keeps validation, preview, approval, and production distinct.", icon: Rocket, items: [["Enterprise App", "generated", "Ready", "typecheck · build · tests passed"], ["Procurement App", "validated", "Preview next", "security review pending"], ["Risk Console", "draft", "Blocked", "unresolved plugin dependency"]] } }; const view = data[kind] || data.applications; const Icon = view.icon; return <div className="page-grid"><div className="page-main"><PageHeading eyebrow={view.eyebrow} title={view.title} description={view.desc} action={kind === "applications" ? <Link href="/compose" className="primary-action"><Sparkles size={16} /> New application</Link> : undefined} /><section className="panel list-panel"><div className="list-toolbar"><div className="search compact"><Search size={15} /><input placeholder={`Search ${kind}`} /></div><span className="mono muted">{view.items.length.toString().padStart(2, "0")} records</span></div>{view.items.map(([title, meta, status, detail]) => <div className="resource-row" key={title}><div className="resource-route"><span /></div><div className="resource-icon"><Icon size={17} /></div><div className="resource-main"><strong>{title}</strong><span className="mono">{meta}</span><small>{detail}</small></div><span className={`status-pill ${status.toLowerCase().includes("future") || status.toLowerCase().includes("pending") || status.toLowerCase().includes("blocked") ? "amber" : status.toLowerCase().includes("draft") ? "muted" : "green"}`}><span />{status}</span><ChevronRight size={16} className="row-arrow" /></div>)}</section></div><ContextPanel title={`${kind} summary`}><Signal label="Active" value={kind === "audit" ? "24" : "09"} tone="green" /><Signal label="Pending review" value="03" tone="amber" /><Signal label="Future scope" value="07" tone="muted" /><div className="context-note"><FileCode2 size={16} /><p>Open a record to inspect its manifest, dependencies, and provenance trail.</p></div></ContextPanel></div>; }

function Placeholder({ kind }: { kind: string }) { const titles: Record<string,string> = { ai: "AI Studio is capability-controlled.", data: "Data and events, in one trace.", devices: "Devices with a visible twin state.", workflows: "Workflows that show every gate.", settings: "Settings that keep the runtime honest." }; return <div className="page-grid"><div className="page-main"><PageHeading eyebrow={`Service plane / ${kind}`} title={titles[kind] || "Settings"} description="This control-center surface is scaffolded for the next platform integration phase." /><section className="empty-state panel"><div className="empty-orbit"><Terminal size={28} /></div><span className="eyebrow">Coming next</span><h3>Native platform surface</h3><p>The UI boundary is ready. Runtime providers, event adapters, and policy-backed actions remain intentionally gated until their services are implemented.</p><button className="secondary-action" onClick={() => undefined}><LifeBuoy size={15} /> Read the boundary</button></section></div><ContextPanel title="Boundary"><Signal label="UI shell" value="ready" tone="green" /><Signal label="Runtime adapter" value="future" tone="amber" /></ContextPanel></div>; }

function Router() { return <Switch><Route path="/" component={Dashboard} /><Route path="/compose" component={Composer} /><Route path="/applications"><ListPage kind="applications" /></Route><Route path="/pathways"><ListPage kind="pathways" /></Route><Route path="/capabilities"><ListPage kind="capabilities" /></Route><Route path="/plugins"><ListPage kind="plugins" /></Route><Route path="/projects"><ListPage kind="projects" /></Route><Route path="/audit"><ListPage kind="audit" /></Route><Route path="/deployment"><ListPage kind="deployment" /></Route><Route path="/:kind"><Placeholder kind="ai" /></Route><Route component={NotFound} /></Switch>; }

export default function App() { return <ThemeProvider defaultTheme="dark"><TooltipProvider><AppShell><Router /></AppShell></TooltipProvider></ThemeProvider>; }
