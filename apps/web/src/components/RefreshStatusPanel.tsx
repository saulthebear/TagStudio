import { type JobEventPayload } from "@tagstudio/api-client";

type RefreshStatusPanelProps = {
  refreshStatus: JobEventPayload;
};

export function RefreshStatusPanel({ refreshStatus }: RefreshStatusPanelProps) {
  return (
    <section className="panel mb-4 border-emerald-200/90 bg-emerald-50/60 text-sm text-emerald-900">
      <strong>Refresh:</strong> {refreshStatus.status}
      {refreshStatus.message ? ` | ${refreshStatus.message}` : ""}
      {refreshStatus.progress_total
        ? ` | ${refreshStatus.progress_current}/${refreshStatus.progress_total}`
        : ""}
    </section>
  );
}
