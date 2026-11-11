import { LoaderCircle } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="workspace-loading" aria-live="polite" aria-busy="true">
      <LoaderCircle size={19} className="site-spin" aria-hidden="true" />
      <span>Loading workspace data…</span>
    </div>
  );
}
