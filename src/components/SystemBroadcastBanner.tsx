import { useState } from "react";
import { X, Megaphone, AlertTriangle, AlertOctagon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSystemBroadcasts, type SystemBroadcast } from "@/hooks/useSystemBroadcasts";

const styleFor = (severity: string) => {
  switch (severity) {
    case "critical":
      return {
        bg: "bg-red-600 text-white",
        Icon: AlertOctagon,
      };
    case "warn":
      return {
        bg: "bg-amber-500 text-black",
        Icon: AlertTriangle,
      };
    default:
      return {
        bg: "bg-sky-600 text-white",
        Icon: Megaphone,
      };
  }
};

export function SystemBroadcastBanner() {
  const { user, userRoles } = useAuth();
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const broadcasts = useSystemBroadcasts(userRoles || []);

  if (!user) return null;

  const visible: SystemBroadcast[] = broadcasts.filter((b) => !dismissed[b.id]);
  if (visible.length === 0) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] flex flex-col">
      {visible.map((b) => {
        const { bg, Icon } = styleFor(b.severity);
        return (
          <div
            key={b.id}
            className={`${bg} px-4 py-2 flex items-start gap-3 shadow-md`}
          >
            <Icon className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">{b.title}</p>
              {b.message && (
                <p className="text-xs opacity-90 leading-snug mt-0.5">
                  {b.message}
                </p>
              )}
            </div>
            <button
              onClick={() => setDismissed((d) => ({ ...d, [b.id]: true }))}
              className="opacity-80 hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
