// The cold-calling training modules on the SDR deck's "Watch the
// cold-calling videos" card (6 Oct 2026, Elena and the owner).
//
// Elena's ask in the 6 Oct catch-up: "one module and then there's like
// three videos and then you have to watch all and then you go to the next
// module". The videos are from Grant Cardone's Mastering the Cold Call
// (permission confirmed by the owner, 6 Oct). Elena chose which ones; folders
// 05 (The Cold Call Process, to avoid confusion with our own process) and
// 07 (Cold Call Objections) are left out. Titles are clean (no source
// numbering); files ship with the app at 720p under
// public/onboarding/sdr/cold-calling.

export interface TrainingVideo {
  id: string;
  title: string;
  /** Site-relative, served with the app. */
  src: string;
  seconds: number;
}

export interface TrainingModule {
  id: string;
  title: string;
  videos: TrainingVideo[];
}

const v = (id: string, title: string, seconds: number): TrainingVideo => ({
  id,
  title,
  src: `/onboarding/sdr/cold-calling/${id}.mp4`,
  seconds,
});

export const COLD_CALLING_MODULES: TrainingModule[] = [
  {
    id: "m1",
    title: "Cold Calling Basics",
    videos: [
      v("m1-the-cold-call", "The Cold Call", 431),
      v("m1-why-you-hate-cold-calls", "Why You Hate Cold Calls", 552),
      v("m1-why-the-cold-call-is-so-important", "Why the Cold Call Is So Important", 415),
    ],
  },
  {
    id: "m2",
    title: "Types of Calls",
    videos: [
      v("m2-outbound-cold-call", "Outbound Cold Call", 646),
      v("m2-outbound-referral-call", "Outbound Referral Call", 546),
      v("m2-outbound-follow-up-call", "Outbound Follow-Up Call", 501),
    ],
  },
  {
    id: "m3",
    title: "Preparing for the Cold Call",
    videos: [
      v("m3-define-a-contact", "Define a Contact", 203),
      v("m3-call-preparation", "Call Preparation That Will Guarantee Your Success", 300),
      v("m3-your-script", "Your Script", 368),
      v("m3-role-play-every-day", "Role Play Every Day", 416),
      v("m3-prepare-for-objections", "Prepare for Objections", 602),
      v("m3-take-notes", "Take Notes", 333),
      v("m3-8-ways-to-guarantee-success", "8 Ways to Guarantee Your Success on the Call", 445),
    ],
  },
  {
    id: "m4",
    title: "Getting Past the Gatekeeper",
    videos: [
      v("m4-what-is-the-gatekeeper", "What Is the Gatekeeper", 297),
      v("m4-act-the-part", "Act the Part", 362),
      v("m4-kill-the-small-talk", "Kill the Small Talk Until You Need It", 125),
      v("m4-power-greeting-for-the-gatekeeper", "The Power Greeting for the Gatekeeper", 233),
    ],
  },
  {
    id: "m5",
    title: "Daily Success Rituals",
    videos: [
      v("m5-get-focused", "Get Focused: Eye on the Prize", 146),
      v("m5-know-your-call-calculations", "Know Your Call Calculations", 153),
      v("m5-start-your-day-with-training", "Start Your Day With Training and Role Play", 217),
    ],
  },
  {
    id: "m6",
    title: "Advanced Cold Call Tips",
    videos: [
      v("m6-key-to-cold-calling-success", "The Key to Cold Calling Success", 299),
      v("m6-identify-the-influencers", "Identify the Influencers", 210),
      v("m6-bring-in-back-up", "Bring In Back-Up for the Discovery", 207),
      v("m6-rapid-response-is-key", "Rapid Response Is Key", 227),
      v("m6-follow-up-facts", "Understanding the Follow-Up Facts", 130),
    ],
  },
];

/** Which SDR cards play as a module course. */
const MODULES_BY_STEP: Record<string, TrainingModule[]> = {
  watch_cold_calling_videos: COLD_CALLING_MODULES,
};

export function trainingModulesFor(stepKey: string): TrainingModule[] | null {
  return MODULES_BY_STEP[stepKey] ?? null;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "{first_name}" in card copy becomes the starter's first name (6 Oct). */
export function withFirstName(text: string | null, firstName: string): string | null {
  return text ? text.replace(/\{first_name\}/g, firstName) : text;
}
