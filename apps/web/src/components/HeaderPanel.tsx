type HeaderPanelProps = {
  apiBaseUrl: string;
  healthStatus: string | undefined;
};

export function HeaderPanel({ apiBaseUrl, healthStatus }: HeaderPanelProps) {
  return (
    <header className="panel mb-5 border-blue-100/80 bg-gradient-to-r from-white via-white to-blue-50/70">
      <p className="mb-2 inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
        Tailwind CSS v4 Revamp
      </p>
      <h1 className="m-0 text-3xl font-semibold tracking-tight text-slate-900">TagStudio Web Foundation</h1>
      <p className="mb-0 mt-2 text-sm text-slate-600">
        Browser-first renderer with a local Python API backend.
      </p>
      <p className="mb-0 mt-2 text-xs text-slate-500">
        API: {apiBaseUrl} | Health: {healthStatus ?? "checking..."}
      </p>
    </header>
  );
}
