import * as React from "react";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Meridian round 2: wrap in the brand gradient ring (current user, hosts, #1). */
  ring?: boolean;
}

const sizeClasses = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
};

const gradients = [
  "from-[#9e9e9e] to-[#454549]",
  "from-[#6b7a90] to-[#2f4661]",
  "from-[#a9b4bf] to-[#4f5d6b]",
  "from-[#dedede] to-[#8c8c8c]",
  "from-[#F1D592] to-[#B07D1A]",
  "from-[#7d8a99] to-[#3d5a80]",
  "from-[#b0b0b5] to-[#6e6e74]",
  "from-[#a3a3a8] to-[#6b7a90]",
];

const getGradient = (name: string): string => {
  const hash = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export function UserAvatar({ name, avatarUrl, size = "md", className, ring = false }: UserAvatarProps) {
  const initials = getInitials(name);
  const gradient = getGradient(name);

  if (avatarUrl) {
    return (
      <div
        className={cn(
          "relative rounded-full overflow-hidden shrink-0",
          ring && "ring-2 ring-[#9e9e9e] ring-offset-2 ring-offset-background",
          sizeClasses[size],
          className
        )}
      >
        <img
          src={avatarUrl}
          alt={name}
          className="h-full w-full object-cover"
          onError={(e) => {
            // Fallback to initials if image fails to load
            const target = e.target as HTMLImageElement;
            target.style.display = "none";
            const parent = target.parentElement;
            if (parent) {
              parent.classList.add("bg-gradient-to-br", gradient);
              parent.innerHTML = `<span class="flex items-center justify-center h-full w-full font-semibold text-white">${initials}</span>`;
            }
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative rounded-full shrink-0 flex items-center justify-center font-semibold text-white bg-gradient-to-br",
        ring && "ring-2 ring-[#9e9e9e] ring-offset-2 ring-offset-background",
        gradient,
        sizeClasses[size],
        className
      )}
    >
      {initials}
    </div>
  );
}
