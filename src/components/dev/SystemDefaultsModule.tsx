// Dev Centre › Settings (15 Oct 2026): only what something reads.
//   Client contact: CSM name, email, phone (client Communications tab).
//   Daily forms: Start of day and End of day, on/off, roles, time; honoured
//     by the pop-ups and by the Forms page.
// Gone: dead company/branding/timezone/currency/sender fields, the midday
// report, feature flags (no consumer; table dropped by migration 20261015180000).

import { SystemDefaults } from "@/components/settings/SystemDefaults";
import { FormPopupSettings } from "@/components/settings/FormPopupSettings";

export function SystemDefaultsModule() {
  return (
    <div className="space-y-6">
      <SystemDefaults />
      <FormPopupSettings />
    </div>
  );
}
