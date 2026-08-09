import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routeTree } from './routeTree.gen';
import { initWasm } from './lib/wasmClient';
import { useTableStore } from './store/tableStore';
import './styles/index.css';

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const queryClient = new QueryClient();

function App() {
  const [wasmReady, setWasmReady] = useState(false);
  const [wasmError, setWasmError] = useState<string | null>(null);

  useEffect(() => {
    initWasm()
      .then(() => {
        // WASM's table-dims static always starts fresh on load — push
        // whatever was restored from localStorage (or the defaults) once,
        // before anything tries to generate a pattern.
        useTableStore.getState().pushDimsToWasm();
        setWasmReady(true);
      })
      .catch((e: unknown) => setWasmError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (wasmError) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg text-danger">
        Failed to load pattern engine: {wasmError}
      </div>
    );
  }

  if (!wasmReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg text-ink-muted">
        Loading…
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
