import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Search, Send, Inbox, MessageSquare, User, Linkedin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { smartleadSentiment } from "@/lib/coldOutbound";
import { useMessageSentiment } from "@/hooks/useMessageSentiment";

const MessageSentimentChip = ({ text }: { text: string }) => {
  const { data, isLoading } = useMessageSentiment(text, { channel: "linkedin" });
  if (isLoading) {
    return <span className="text-[10px] text-muted-foreground/60 mt-1 italic">analysing…</span>;
  }
  if (!data || data === "unclassified") return null;
  const meta = smartleadSentiment(data);
  return (
    <span className={cn("inline-flex items-center gap-1 mt-1.5 text-[10px] px-1.5 py-0.5 rounded border w-fit", meta.color)}>
      {meta.dot} {meta.label}
    </span>
  );
};


const heyreachApi = async (action: string, params: Record<string, any> = {}) => {
  const { data, error } = await supabase.functions.invoke("heyreach-api", {
    body: { action, ...params },
  });
  if (error) throw error;
  return data;
};

const GTMInbox = () => {
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [selectedSenderId, setSelectedSenderId] = useState<string>("");
  const [replyMessage, setReplyMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Fetch ALL LinkedIn sender accounts from HeyReach (live), so every inbox is accessible
  const { data: sendersData } = useQuery({
    queryKey: ["heyreach-all-senders"],
    queryFn: () => heyreachApi("get-senders", { offset: 0, limit: 200 }),
    staleTime: 5 * 60 * 1000,
  });

  const senders = (() => {
    const raw = sendersData?.items || sendersData || [];
    if (!Array.isArray(raw)) return [];
    return raw
      .map((s: any) => {
        const id = s.id ?? s.linkedInAccountId ?? s.heyreach_sender_id;
        const name =
          s.fullName ||
          [s.firstName, s.lastName].filter(Boolean).join(" ").trim() ||
          s.emailAddress ||
          s.sender_name ||
          `Account ${id}`;
        const email = s.emailAddress || s.sender_email || "";
        return id ? { id: String(id), name, email } : null;
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
  })();

  // Set default sender
  useEffect(() => {
    if (senders.length > 0 && !selectedSenderId) {
      setSelectedSenderId(senders[0].id);
    }
  }, [senders, selectedSenderId]);


  // Fetch conversations
  const { data: conversationsData, isLoading: convLoading } = useQuery({
    queryKey: ["heyreach-conversations", selectedSenderId, debouncedSearch],
    queryFn: () =>
      heyreachApi("get-conversations", {
        linkedInAccountId: selectedSenderId ? Number(selectedSenderId) : undefined,
        searchText: debouncedSearch || undefined,
        limit: 30,
      }),
    enabled: !!selectedSenderId,
    staleTime: 30 * 1000,
  });

  const conversations = conversationsData?.items || conversationsData || [];

  // Fetch recent HeyReach reply events with sentiment, indexed by prospect_linkedin_url
  const { data: sentimentEvents } = useQuery({
    queryKey: ["heyreach-sentiment-events", selectedSenderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gtm_heyreach_events")
        .select("prospect_linkedin_url, sentiment, received_at")
        .not("sentiment", "is", null)
        .order("received_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60 * 1000,
  });

  const sentimentByUrl: Record<string, string> = {};
  (sentimentEvents || []).forEach((e: any) => {
    if (e.prospect_linkedin_url && e.sentiment && !sentimentByUrl[e.prospect_linkedin_url]) {
      sentimentByUrl[e.prospect_linkedin_url] = e.sentiment;
    }
  });


  // Extract conversationId and accountId from selected conversation
  const selectedConvId = selectedConversation?.id;
  const selectedAccountId = selectedConversation?.linkedInAccountId || (selectedSenderId ? Number(selectedSenderId) : undefined);

  // Fetch chatroom using GET /inbox/GetChatroom/:accountId/:conversationId
  const { data: chatroom, isLoading: chatroomLoading } = useQuery({
    queryKey: ["heyreach-chatroom", selectedAccountId, selectedConvId],
    queryFn: () =>
      heyreachApi("get-chatroom", {
        accountId: selectedAccountId,
        conversationId: selectedConvId,
      }),
    enabled: !!selectedConvId && !!selectedAccountId,
    staleTime: 15 * 1000,
  });

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatroom]);

  // Send message mutation using conversationId
  const sendMutation = useMutation({
    mutationFn: (message: string) =>
      heyreachApi("send-message", {
        linkedInAccountId: selectedAccountId,
        conversationId: selectedConvId,
        message,
      }),
    onSuccess: () => {
      toast.success("Message sent");
      setReplyMessage("");
      queryClient.invalidateQueries({
        queryKey: ["heyreach-chatroom", selectedAccountId, selectedConvId],
      });
    },
    onError: (err: any) => toast.error(err.message || "Failed to send message"),
  });

  const handleSend = () => {
    if (!replyMessage.trim()) return;
    sendMutation.mutate(replyMessage.trim());
  };

  const messages = chatroom?.messages || [];

  // Get LinkedIn URL from conversation for external link
  const selectedLinkedInUrl = selectedConversation?.correspondentProfile?.profileUrl;

  return (
    <DashboardLayout role="admin">
      <div className="space-y-4">
        <PageHeader title="Inbox" subtitle="LinkedIn conversations via HeyReach" />

        {/* Sender selector */}
        <div className="flex items-center gap-3">
          <Select value={selectedSenderId} onValueChange={setSelectedSenderId}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Select sender account" />
            </SelectTrigger>
            <SelectContent>
              {senders.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>

          </Select>
        </div>

        {/* Two-panel layout */}
        <div className="flex gap-4 h-[calc(100vh-260px)] min-h-[500px]">
          {/* Left panel — Conversation list */}
          <div className="w-[360px] flex-shrink-0 flex flex-col glass-card overflow-hidden">
            <div className="p-3 border-b border-border/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              {convLoading ? (
                <div className="p-3 space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-[72px] rounded-xl" />
                  ))}
                </div>
              ) : Array.isArray(conversations) && conversations.length > 0 ? (
                <div className="p-1.5 space-y-0.5">
                  {conversations.map((conv: any, idx: number) => {
                    const profile = conv.correspondentProfile || {};
                    const isSelected = selectedConversation?.id === conv.id;
                    const name = profile.firstName
                      ? `${profile.firstName} ${profile.lastName || ""}`.trim()
                      : "Unknown";
                    const company = profile.companyName || "";
                    const isUnread = conv.read === false;
                    const profileUrl = profile.profileUrl || profile.linkedInUrl || "";
                    const sentimentRaw = profileUrl ? sentimentByUrl[profileUrl] : undefined;
                    const sentiment = sentimentRaw ? smartleadSentiment(sentimentRaw) : null;

                    return (
                      <button
                        key={conv.id || idx}
                        onClick={() => setSelectedConversation(conv)}
                        className={cn(
                          "w-full text-left p-3 rounded-xl transition-all",
                          isSelected
                            ? "bg-primary/10 border border-primary/20"
                            : "hover:bg-white/[0.04] border border-transparent"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                            <User className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-foreground truncate">
                                {name}
                              </span>
                              {isUnread && (
                                <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                              )}
                            </div>
                            {company && (
                              <p className="text-[11px] text-muted-foreground truncate">
                                {company}
                              </p>
                            )}
                            {conv.lastMessageText && (
                              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {conv.lastMessageText}
                              </p>
                            )}
                            {sentiment && (
                              <span className={cn("inline-flex items-center gap-1 mt-1 text-[10px] px-1.5 py-0.5 rounded border", sentiment.color)}>
                                {sentiment.dot} {sentiment.label}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );

                  })}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <Inbox className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-40" />
                  <p className="text-xs text-muted-foreground">No conversations found</p>
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Right panel — Message thread */}
          <div className="flex-1 flex flex-col glass-card overflow-hidden">
            {selectedConversation ? (
              <>
                {/* Header */}
                <div className="p-4 border-b border-border/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                      <User className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {selectedConversation.correspondentProfile?.firstName}{" "}
                        {selectedConversation.correspondentProfile?.lastName || ""}
                      </h3>
                      {selectedConversation.correspondentProfile?.companyName && (
                        <p className="text-[11px] text-muted-foreground">
                          {selectedConversation.correspondentProfile.companyName}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const s = selectedLinkedInUrl ? sentimentByUrl[selectedLinkedInUrl] : undefined;
                      if (!s) return null;
                      const meta = smartleadSentiment(s);
                      return (
                        <span className={cn("text-[10px] px-2 py-0.5 rounded border", meta.color)}>
                          {meta.dot} {meta.label}
                        </span>
                      );
                    })()}
                    {selectedLinkedInUrl && (
                      <a
                        href={selectedLinkedInUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
                      >
                        <Linkedin className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>


                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                  {chatroomLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 rounded-xl" />
                      ))}
                    </div>
                  ) : Array.isArray(messages) && messages.length > 0 ? (
                    <div className="space-y-3">
                      {messages.map((msg: any, idx: number) => {
                        // Per docs: sender is null when message is from "me" (the linked account)
                        const isOutgoing = msg.sender === null || msg.sender === undefined;
                        return (
                          <div
                            key={idx}
                            className={cn(
                              "max-w-[75%] p-3 rounded-2xl text-sm",
                              isOutgoing
                                ? "ml-auto bg-primary text-primary-foreground rounded-br-md"
                                : "mr-auto bg-muted text-foreground rounded-bl-md"
                            )}
                          >
                            <p className="whitespace-pre-wrap">{msg.body || msg.text || msg.message}</p>
                            {msg.createdAt && (
                              <p
                                className={cn(
                                  "text-[10px] mt-1",
                                  isOutgoing ? "text-primary-foreground/70" : "text-muted-foreground"
                                )}
                              >
                                {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                              </p>
                            )}
                            {!isOutgoing && (msg.body || msg.text || msg.message) && (
                              <MessageSentimentChip text={msg.body || msg.text || msg.message} />
                            )}
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-xs text-muted-foreground">No messages in this thread</p>
                    </div>
                  )}
                </ScrollArea>

                {/* Compose */}
                <div className="p-3 border-t border-border/50">
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Type a reply..."
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      className="min-h-[44px] max-h-[120px] resize-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      onClick={handleSend}
                      disabled={!replyMessage.trim() || sendMutation.isPending}
                      className="h-11 w-11 flex-shrink-0"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
                  <p className="text-sm text-muted-foreground">Select a conversation to view messages</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default GTMInbox;
