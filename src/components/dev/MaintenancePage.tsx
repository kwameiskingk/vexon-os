import { useEffect, useState } from "react";

interface Props {
  message?: string | null;
}

export function MaintenancePage({ message }: Props) {
  const [dots, setDots] = useState("");
  useEffect(() => {
    const i = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 500);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="min-h-screen bg-[#08090C] text-[#e3e3e6] flex items-center justify-center px-6 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(168,85,247,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.07) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      <div className="relative max-w-lg w-full text-center space-y-8">
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-2 border-violet-500/40 animate-ping absolute inset-0" />
            <div className="w-20 h-20 rounded-full border-2 border-violet-500 flex items-center justify-center relative">
              <div className="w-3 h-3 rounded-full bg-violet-400 animate-pulse" />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[11px] tracking-[0.3em] uppercase text-violet-400 font-mono">
            System Maintenance
          </p>
          <h1 className="text-4xl md:text-5xl font-light tracking-tight">
            We'll be right back{dots}
          </h1>
          <p className="text-base text-[#7C849A] leading-relaxed">
            {message ||
              "Dev is making improvements to keep things running smoothly. You'll be back in your dashboard in a few minutes."}
          </p>
        </div>

        <div className="pt-4">
          <button
            onClick={() => window.location.reload()}
            className="font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-2 rounded border border-violet-500/40 text-violet-400 hover:bg-violet-500/10 transition-colors"
          >
            ↻ Try again
          </button>
        </div>

        <p className="text-[10px] font-mono text-[#7C849A]/60 tracking-widest">
          [STATUS: OFFLINE] · {new Date().toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
