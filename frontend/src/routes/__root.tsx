import { createRootRoute, Outlet, Link } from '@tanstack/react-router';
import { PreviewCanvas } from '../components/preview/PreviewCanvas';
import { TableSettingsBar } from '../components/preview/TableSettingsBar';
import { OctoPrintController } from '../components/print/OctoPrintController';

const TABS = [
  { to: '/gallery', label: 'Gallery' },
  { to: '/custom', label: 'Custom' },
  { to: '/print', label: 'Print' },
] as const;

function RootLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <OctoPrintController />
      {/* ── LEFT PANEL ── */}
      <div className="flex w-[300px] min-w-[300px] flex-col overflow-hidden border-r border-panel-border bg-panel">
        <div className="flex border-b border-panel-border">
          {TABS.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              className="flex-1 border-b-2 border-transparent px-1 py-2.5 text-center text-[0.75rem] tracking-wide text-ink-muted hover:text-ink-dim [&.active]:border-accent [&.active]:text-accent"
              activeProps={{ className: 'active' }}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </div>

      {/* ── RIGHT VIEWER — instantiated once, sibling of Outlet above, so it
           never unmounts on tab navigation ── */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-2.5">
        <TableSettingsBar />
        <PreviewCanvas />
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
