// Ops Command → Metrics (11 Sep, Elena's ask): both departments on the same
// board CSM Command uses — acquisition first, then fulfilment — with the
// gear opening the daily-entry cards for whichever department she picks.
// Replaces the one-setter-at-a-time carousel and the separate
// /ops-command/metrics/input page (which now redirects here).

import { DepartmentMetricsBoard } from "@/components/metrics/DepartmentMetricsBoard";

export default function OpsCommandMetrics() {
  return (
    <DepartmentMetricsBoard
      departments={["acquisition", "fulfilment"]}
      title="Ops Command · Metrics"
      subtitle="Both teams' previous day at a glance — dials & talk time from Close, convos, warm leads & meetings from the daily entry"
      inputTitle="Metrics input"
    />
  );
}
