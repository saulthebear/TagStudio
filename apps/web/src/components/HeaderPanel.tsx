type HeaderPanelProps = {
  apiBaseUrl: string;
  healthStatus: string | undefined;
};

export function HeaderPanel({ apiBaseUrl, healthStatus }: HeaderPanelProps) {
  return (
    <header className="panel mb-4">
      <h1 className="m-0 text-3xl font-semibold tracking-tight">TagStudio Web Foundation</h1>
      <p className="mb-0 mt-2 text-sm opacity-80">
        Browser-first renderer with a local Python API backend.
      </p>
      <p className="mb-0 mt-2 text-xs">
        API: {apiBaseUrl} | Health: {healthStatus ?? "checking..."}
      </p>
    </header>
  );
}
