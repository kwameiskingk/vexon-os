import { useUserDisplayName } from "@/hooks/useUserDisplayName";

export function useGreeting() {
  const { firstName } = useUserDisplayName();

  const getGreeting = () => {
    const ukTime = new Date().toLocaleString("en-US", {
      timeZone: "Europe/London",
      hour: "numeric",
      hour12: false,
    });
    const hour = parseInt(ukTime);
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const greeting = getGreeting();
  return {
    greeting,
    firstName,
    fullGreeting: `${greeting}, ${firstName}`,
  };
}
