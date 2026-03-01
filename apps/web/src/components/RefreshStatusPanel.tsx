import { type JobEventPayload } from "@tagstudio/api-client";

type RefreshStatusPanelProps = {
  refreshStatus: JobEventPayload;
};

export function RefreshStatusPanel({ refreshStatus }: RefreshStatusPanelProps) {
  return (
    <section className="panel mb-4 text-sm">
      <strong>Refresh:</strong> {refreshStatus.status}
      {refreshStatus.message ? ` | ${refreshStatus.message}` : ""}
      {refreshStatus.progress_total
        ? ` | ${refreshStatus.progress_current}/${refreshStatus.progress_total}`
        : ""}
    </section>
  );
}
