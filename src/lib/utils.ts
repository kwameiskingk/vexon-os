import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const STANDARD_COUNTRIES = [
  "United States",
  "United Kingdom", 
  "Canada",
  "Europe",
  "Middle East"
] as const;

export function capitalizeSetterName(email: string | null | undefined): string {
  if (!email) return "Unknown";
  const username = email.split("@")[0] || "Unknown";
  return username
    .split(/[._-]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
