import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Linkedin,
  Building2,
  MessageSquare,
  CheckCircle2,
  XCircle,
  PhoneOff,
  ThumbsDown,
  HeartHandshake,
  Loader2,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow, format } from "date-fns";

type Outcome = "meeting_booked" | "not_booked" | "no_answer" | "not_interested" | "needs_nurturing";

const outcomeConfig: Record<Outcome, { label: string; icon: React.ReactNode; color: string }> = {
  meeting_booked: {
    label: "Meeting Booked",
    icon: <CalendarDays className="h-5 w-5" />,
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20",
  },
  not_booked: {
    label: "Not Booked",
    icon: <XCircle className="h-5 w-5" />,
    color: "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20",
  },
  no_answer: {
    label: "No Answer",
    icon: <PhoneOff className="h-5 w-5" />,
    color: "bg-muted text-muted-foreground border-border hover:bg-accent",
  },
  not_interested: {
    label: "Not Interested",
    icon: <ThumbsDown className="h-5 w-5" />,
    color: "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20",
  },
  needs_nurturing: {
    label: "Needs Nurturing",
    icon: <HeartHandshake className="h-5 w-5" />,
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20",
  },
};

interface ChatMessage {
  body: string;
  createdAt: string;
  isOutgoing: boolean;
  senderName: string;
}

const SetterHeyreachReply = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");

  // Fetch the event
  const { data: event, isLoading } = useQuery({
    queryKey: ["heyreach-event", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gtm_heyreach_events")
        .select("*")
        .eq("id", eventId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  // Fetch conversation messages from HeyReach
  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ["heyreach-conversation", eventId, event?.sender_email, event?.prospect_name],
    queryFn: async () => {
      if (!event?.sender_email) return [];

      // 1. Get the sender's heyreach_sender_id from gtm_sender_accounts
      const { data: senderAccount } = await supabase
        .from("gtm_sender_accounts")
        .select("heyreach_sender_id")
        .eq("sender_email", event.sender_email)
        .maybeSingle();

      if (!senderAccount?.heyreach_sender_id) {
        console.warn("No heyreach_sender_id found for sender:", event.sender_email);
        return [];
      }

      const accountId = Number(senderAccount.heyreach_sender_id);

      // 2. Search conversations for this prospect
      const { data: convData, error: convError } = await supabase.functions.invoke("heyreach-api", {
        body: {
          action: "get-conversations",
          linkedInAccountId: accountId,
          searchText: event.prospect_name || "",
          limit: 10,
        },
      });

      if (convError) {
        console.error("Error fetching conversations:", convError);
        return [];
      }

      // Find matching conversation - the API returns an array or object with items
      const conversations = Array.isArray(convData) ? convData : (convData?.items || convData?.data || []);
      
      if (!conversations.length) {
        console.warn("No conversations found for prospect:", event.prospect_name);
        return [];
      }

      // Pick the first matching conversation
      const conversation = conversations[0];
      const conversationId = conversation.id || conversation.conversationId;

      if (!conversationId) {
        console.warn("No conversation ID found");
        return [];
      }

      // 3. Fetch chatroom messages
      const { data: chatroomData, error: chatroomError } = await supabase.functions.invoke("heyreach-api", {
        body: {
          action: "get-chatroom",
          accountId: accountId,
          conversationId: conversationId,
        },
      });

      if (chatroomError) {
        console.error("Error fetching chatroom:", chatroomError);
        return [];
      }

      // Extract messages from chatroom response
      const rawMessages = chatroomData?.messages || chatroomData?.items || (Array.isArray(chatroomData) ? chatroomData : []);
      
      // Log first message structure to understand the format
      if (rawMessages.length > 0) {
        console.log("[HeyReach Chatroom] Sample message structure:", JSON.stringify(rawMessages[0]).substring(0, 500));
        console.log("[HeyReach Chatroom] Total messages:", rawMessages.length);
      }

      // Determine outgoing using HeyReach sender semantics + fallback patterns
      return rawMessages.map((msg: any) => {
        const senderRaw = msg.sender;
        const senderType =
          typeof senderRaw === "string"
            ? senderRaw.toUpperCase()
            : typeof senderRaw?.type === "string"
              ? senderRaw.type.toUpperCase()
              : "";

        const senderLinkedInAccountId =
          typeof senderRaw?.linkedInAccountId !== "undefined"
            ? Number(senderRaw.linkedInAccountId)
            : null;

        const direction = typeof msg.direction === "string" ? msg.direction.toLowerCase() : "";
        const messageType = typeof msg.type === "string" ? msg.type.toUpperCase() : "";

        const isOutgoing =
          senderType === "ME" ||
          senderLinkedInAccountId === accountId ||
          msg.isOutgoing === true ||
          direction === "outgoing" ||
          messageType === "SENT" ||
          (!senderRaw && senderType !== "CORRESPONDENT");

        return {
          body: msg.body || msg.text || msg.message || "",
          createdAt: msg.createdAt || msg.created_at || msg.timestamp || "",
          isOutgoing,
          senderName: isOutgoing
            ? (event?.sender_name || "You")
            : (typeof senderRaw === "object" && senderRaw?.firstName
                ? `${senderRaw.firstName} ${senderRaw.lastName || ""}`.trim()
                : (event?.prospect_name || "Prospect")),
        };
      }) as ChatMessage[];
    },
    enabled: !!event?.sender_email && !!event?.prospect_name,
    retry: false,
    staleTime: 60000,
  });

  // Check if already actioned
  const { data: existingAction } = useQuery({
    queryKey: ["heyreach-reply-action", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("heyreach_reply_actions" as any)
        .select("*")
        .eq("event_id", eventId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOutcome || !user?.id || !eventId) throw new Error("Missing data");

      let meetingId: string | null = null;

      if (selectedOutcome === "meeting_booked") {
        if (!meetingDate || !meetingTime) throw new Error("Please select a date and time");

        const { data: meetingData, error: meetingError } = await supabase
          .from("meetings")
          .insert({
            prospect_name: event?.prospect_name || "Unknown",
            prospect_email: "",
            company_name: event?.prospect_company || "Unknown",
            prospect_linkedin: event?.prospect_linkedin_url || "",
            meeting_date: meetingDate,
            meeting_time: meetingTime,
            logged_by_setter_id: user.id,
            setter_id: user.id,
            notes: "Booked via HeyReach",
            status: "pending",
            department: "acquisition",
          })
          .select("id")
          .single();

        if (meetingError) throw meetingError;
        meetingId = meetingData.id;
      }

      const { error: actionError } = await supabase
        .from("heyreach_reply_actions" as any)
        .insert({
          event_id: eventId,
          setter_user_id: user.id,
          outcome: selectedOutcome,
          meeting_date: selectedOutcome === "meeting_booked" ? meetingDate : null,
          meeting_time: selectedOutcome === "meeting_booked" ? meetingTime : null,
          meeting_id: meetingId,
        });

      if (actionError) throw actionError;

      const senderName = event?.sender_name || "Setter";
      const prospectName = event?.prospect_name || "prospect";
      const outcomeLabel = outcomeConfig[selectedOutcome].label;

      await supabase.from("gtm_heyreach_events").insert({
        event_type: `setter_action_${selectedOutcome}`,
        campaign_id: event?.campaign_id || "",
        campaign_name: event?.campaign_name || "",
        sender_name: senderName,
        sender_email: event?.sender_email || "",
        prospect_name: prospectName,
        prospect_linkedin_url: event?.prospect_linkedin_url || "",
        prospect_company: event?.prospect_company || "",
        message_preview:
          selectedOutcome === "meeting_booked"
            ? `${senderName} booked a meeting with ${prospectName} for ${meetingDate} at ${meetingTime}`
            : `${senderName} marked ${prospectName} as "${outcomeLabel}"`,
        payload: {
          source: "setter_reply_action",
          outcome: selectedOutcome,
          original_event_id: eventId,
          meeting_id: meetingId,
        },
      });
    },
    onSuccess: () => {
      toast.success("Response submitted successfully");
      queryClient.invalidateQueries({ queryKey: ["heyreach-reply-action", eventId] });
      navigate("/setter");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to submit response");
    },
  });

  const payload = event?.payload as any;
  const position = payload?.lead?.position || "";

  if (isLoading) {
    return (
      <DashboardLayout role="setter">
        <div className="space-y-4 max-w-2xl mx-auto">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!event) {
    return (
      <DashboardLayout role="setter">
        <div className="max-w-2xl mx-auto text-center py-20">
          <p className="text-muted-foreground">Event not found.</p>
          <Button variant="ghost" onClick={() => navigate("/setter")} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const alreadyActioned = !!existingAction;

  return (
    <DashboardLayout role="setter">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Back button */}
        <Button variant="ghost" size="sm" onClick={() => navigate("/setter")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>

        {/* Prospect info card */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                {event.prospect_name || "Unknown Prospect"}
              </h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {event.prospect_company && (
                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" /> {event.prospect_company}
                  </span>
                )}
                {position && (
                  <span className="text-sm text-muted-foreground">{position}</span>
                )}
              </div>
            </div>
            {event.prospect_linkedin_url && (
              <a
                href={event.prospect_linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
              >
                <Linkedin className="h-4 w-4" />
              </a>
            )}
          </div>

          {event.campaign_name && (
            <div className="text-xs text-muted-foreground">
              Campaign: <span className="text-foreground">{event.campaign_name}</span>
              {event.sender_name && <> · via <span className="text-foreground">{event.sender_name}</span></>}
            </div>
          )}
        </div>

        {/* Conversation history */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Conversation
            </h2>
          </div>

          {messagesLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading conversation...</span>
            </div>
          ) : messages && messages.length > 0 ? (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-3 pr-2">
                {messages.map((msg, idx) => {
                  const timestamp = msg.createdAt ? (() => {
                    try {
                      const d = new Date(msg.createdAt);
                      return isNaN(d.getTime()) ? "" : format(d, "MMM d, h:mm a");
                    } catch { return ""; }
                  })() : "";

                  return (
                    <div
                      key={idx}
                      className={`flex ${msg.isOutgoing ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          msg.isOutgoing
                            ? "bg-primary/10 text-foreground rounded-br-md"
                            : "bg-muted border border-border text-foreground rounded-bl-md"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-muted-foreground">
                            {msg.senderName}
                          </span>
                          {timestamp && (
                            <span className="text-xs text-muted-foreground/60">{timestamp}</span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap">{msg.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <p className="text-sm">Unable to load conversation history.</p>
              <p className="text-xs mt-1">The sender account may not be linked to HeyReach.</p>
            </div>
          )}
        </div>

        {/* Already actioned state */}
        {alreadyActioned ? (
          <div className="glass-card p-6 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
            <p className="text-sm text-foreground font-medium">You've already responded to this reply</p>
            <Badge variant="outline" className="text-xs">
              {outcomeConfig[(existingAction as any).outcome as Outcome]?.label || (existingAction as any).outcome}
            </Badge>
          </div>
        ) : (
          <>
            {/* Action buttons */}
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                What's the outcome?
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(Object.entries(outcomeConfig) as [Outcome, typeof outcomeConfig[Outcome]][]).map(
                  ([key, config]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedOutcome(key)}
                      className={`flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${
                        selectedOutcome === key
                          ? `${config.color} ring-2 ring-primary/30`
                          : "bg-secondary border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {config.icon}
                      <span className="text-sm font-medium">{config.label}</span>
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Meeting date/time picker */}
            {selectedOutcome === "meeting_booked" && (
              <div className="glass-card p-5 space-y-4">
                <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  Meeting Details
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="meeting-date">Date</Label>
                    <Input
                      id="meeting-date"
                      type="date"
                      value={meetingDate}
                      onChange={(e) => setMeetingDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meeting-time">Time</Label>
                    <Input
                      id="meeting-time"
                      type="time"
                      value={meetingTime}
                      onChange={(e) => setMeetingTime(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Submit */}
            {selectedOutcome && (
              <Button
                onClick={() => submitMutation.mutate()}
                disabled={
                  submitMutation.isPending ||
                  (selectedOutcome === "meeting_booked" && (!meetingDate || !meetingTime))
                }
                className="w-full"
                size="lg"
              >
                {submitMutation.isPending ? "Submitting..." : "Submit Response"}
              </Button>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default SetterHeyreachReply;
