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
        <div className="flex items-stretch border-b border-panel-border">
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
          <a
            href="https://github.com/ananth-racherla/sandscript"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub"
            title="View source on GitHub"
            className="flex flex-none items-center border-b-2 border-transparent px-2.5 text-ink-muted hover:text-ink-dim"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
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
