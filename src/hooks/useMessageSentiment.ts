// Live per-message sentiment classification is currently DISABLED
// (avoids consuming the hosted builder AI credits). The hook is kept as a no-op so
// existing call sites continue to work. To re-enable, restore the previous
// implementation that called the `classify-message-sentiment` edge function.
export const useMessageSentiment = (
  _body: string | undefined | null,
  _opts: { channel?: "email" | "linkedin"; enabled?: boolean } = {},
) => {
  return { data: undefined as string | undefined, isLoading: false } as const;
};
