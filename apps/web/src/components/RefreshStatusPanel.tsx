import { type JobEventPayload } from "@tagstudio/api-client";
import { Button } from "@tagstudio/ui";

type RefreshStatusPanelProps = {
  refreshStatus?: JobEventPayload | null;
  remuxStatus?: JobEventPayload | null;
  onStartRemux?: () => void;
  remuxPending?: boolean;
};

export function RefreshStatusPanel({
  refreshStatus,
  remuxStatus,
  onStartRemux,
  remuxPending = false
}: RefreshStatusPanelProps) {
  if (!refreshStatus && !remuxStatus) {
    return null;
  }

  return (
    <div className="mb-4 space-y-2">
      {refreshStatus ? (
        <section className="panel border-emerald-200/90 bg-emerald-50/60 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong>Refresh:</strong> {refreshStatus.status}
              {refreshStatus.message ? ` | ${refreshStatus.message}` : ""}
              {refreshStatus.progress_total
                ? ` | ${refreshStatus.progress_current}/${refreshStatus.progress_total}`
                : ""}
            </div>
            {refreshStatus.is_terminal &&
            refreshStatus.remux_candidates_count &&
            refreshStatus.remux_candidates_count > 0 &&
            onStartRemux ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">
                  {refreshStatus.remux_candidates_count} video(s) need remuxing to play in browser
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={remuxPending}
                  onClick={onStartRemux}
                >
                  {remuxPending ? "Remuxing..." : "Remux Now"}
                </Button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {remuxStatus ? (
        <section className="panel border-blue-200/90 bg-blue-50/60 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
          <strong>Remux:</strong> {remuxStatus.status}
          {remuxStatus.message ? ` | ${remuxStatus.message}` : ""}
          {remuxStatus.progress_total
            ? ` | ${remuxStatus.progress_current}/${remuxStatus.progress_total}`
            : ""}
        </section>
      ) : null}
    </div>
  );
}
