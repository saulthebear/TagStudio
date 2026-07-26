type HeaderPanelProps = {
  apiBaseUrl: string;
  healthStatus: string | undefined;
};

export function HeaderPanel({ apiBaseUrl, healthStatus }: HeaderPanelProps) {
  return (
    <header className="panel mb-5 border-blue-100/80 bg-gradient-to-r from-white via-white to-blue-50/70 dark:border-blue-900/60 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/80">
      <p className="mb-2 inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
        Tailwind CSS v4 Revamp
      </p>
      <h1 className="m-0 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">TagStudio Web Foundation</h1>
      <p className="mb-0 mt-2 text-sm text-slate-600 dark:text-slate-300">
        Browser-first renderer with a local Python API backend.
      </p>
      <p className="mb-0 mt-2 text-xs text-slate-500 dark:text-slate-400">
        API: {apiBaseUrl} | Health: {healthStatus ?? "checking..."}
      </p>
    </header>
  );
}
