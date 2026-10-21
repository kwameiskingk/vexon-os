import { useState, useEffect, memo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Send, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fetchOffboardedUserIds } from "@/hooks/useOffboardedUsers";

const MessageItem = memo(({ message, currentUserId }: any) => {
  const isOwn = message.sender_id === currentUserId;
  
  return (
    <div className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="text-xs">
          {message.profiles?.full_name?.substring(0, 2).toUpperCase() || 'UN'}
        </AvatarFallback>
      </Avatar>
      <div className={`flex flex-col gap-1 max-w-[70%] ${isOwn ? 'items-end' : ''}`}>
        <div className={`p-3 rounded-lg ${isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
          <p className="text-sm whitespace-pre-wrap break-words">{message.message}</p>
        </div>
        <p className="text-xs text-muted-foreground px-1">
          {format(new Date(message.created_at), 'h:mm a')}
        </p>
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

export function TeamMessaging() {
  const [message, setMessage] = useState('');
  const [recipientId, setRecipientId] = useState<string>('all-admins');
  const queryClient = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    }
  });

  const { data: currentUserRole } = useQuery({
    queryKey: ['current-user-role'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session?.user?.id)
        .limit(1);
      
      if (error) throw error;
      return data?.[0]?.role;
    },
    enabled: !!session?.user?.id,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['messaging-users', currentUserRole],
    queryFn: async () => {
      if (!currentUserRole) return [];
      
      const roles = currentUserRole === 'admin' ? ['admin' as const, 'setter' as const] : ['admin' as const];
      
      // First get user_roles
      const { data: allUserRoles, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', roles);

      if (roleError) throw roleError;
      if (!allUserRoles || allUserRoles.length === 0) return [];

      // Former employees are not message recipients.
      const offboarded = await fetchOffboardedUserIds();
      const userRoles = allUserRoles.filter(ur => !offboarded.has(ur.user_id));
      if (userRoles.length === 0) return [];

      // Then fetch profiles for those users
      const userIds = userRoles.map(ur => ur.user_id);
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      if (profileError) throw profileError;

      // Combine the data
      return userRoles.map(ur => {
        const profile = profiles?.find(p => p.id === ur.user_id);
        return {
          user_id: ur.user_id,
          role: ur.role,
          profiles: profile || { full_name: 'Unknown', email: '' }
        };
      }).filter(u => u.profiles.full_name !== 'Unknown');
    },
    enabled: !!currentUserRole,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['team-messages', recipientId],
    queryFn: async () => {
      let query = supabase
        .from('admin_messages')
        .select('*');

      // Filter based on selected recipient
      if (recipientId === 'all-admins') {
        // Setters see both: messages TO admins (they send) and messages TO setters (admins send to them)
        if (currentUserRole === 'setter') {
          query = query.or('recipient_role.eq.admin,recipient_role.eq.setter');
        } else {
          query = query.eq('recipient_role', 'admin');
        }
      } else if (recipientId === 'all-setters') {
        query = query.eq('recipient_role', 'setter');
      } else {
        // Individual chatroom: messages between current user and selected user
        query = query.or(`and(sender_id.eq.${session?.user?.id},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${session?.user?.id})`);
      }

      const { data: msgs, error: msgError } = await query
        .order('created_at', { ascending: true })
        .limit(50);

      if (msgError) throw msgError;
      if (!msgs || msgs.length === 0) return [];

      // Fetch sender profiles separately
      const senderIds = [...new Set(msgs.map(m => m.sender_id))];
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', senderIds);

      if (profileError) throw profileError;

      // Combine messages with profile data
      return msgs.map(msg => ({
        ...msg,
        profiles: profiles?.find(p => p.id === msg.sender_id) || { full_name: 'Unknown', email: '' }
      }));
    },
    enabled: !!session?.user?.id,
    staleTime: 30000,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('admin-messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_messages'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['team-messages'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const sendMessage = useMutation({
    mutationFn: async (data: { message: string; recipient_id: string | null; recipient_role: 'admin' | 'setter' | null }) => {
      const { error } = await supabase
        .from('admin_messages')
        .insert([{
          sender_id: session?.user?.id!,
          recipient_id: data.recipient_id,
          recipient_role: data.recipient_role as any,
          message: data.message
        }]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['team-messages'] });
      toast.success('Message sent');
    },
    onError: (error) => {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
    }
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const unreadMessages = messages.filter((msg: any) => 
        msg.sender_id !== session?.user?.id && 
        !msg.is_read &&
        (msg.recipient_id === session?.user?.id || msg.recipient_id === null)
      );

      if (unreadMessages.length === 0) return;

      const { error } = await supabase
        .from('admin_messages')
        .update({ is_read: true })
        .in('id', unreadMessages.map((m: any) => m.id));

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-messages'] });
      toast.success('All messages marked as read');
    },
    onError: (error) => {
      console.error('Failed to mark messages as read:', error);
      toast.error('Failed to mark messages as read');
    }
  });

  const handleSend = () => {
    if (!message.trim()) return;
    
    let recipient_id: string | null = null;
    let recipient_role: 'admin' | 'setter' | null = null;

    if (recipientId === 'all-admins') {
      recipient_role = 'admin';
    } else if (recipientId === 'all-setters') {
      recipient_role = 'setter';
    } else {
      recipient_id = recipientId;
    }

    sendMessage.mutate({
      message: message.trim(),
      recipient_id,
      recipient_role
    });
  };

  return (
    <Card className="flex flex-col h-[500px]">
      <CardHeader className="shrink-0">
        <div className="flex items-center justify-between mb-2">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Team Messaging
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => markAllAsRead.mutate()}
            disabled={markAllAsRead.isPending}
            className="gap-2"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        </div>
        <Select value={recipientId} onValueChange={setRecipientId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Send to..." />
          </SelectTrigger>
          <SelectContent>
            {currentUserRole === 'admin' && (
              <>
                <SelectItem value="all-admins">All Admins</SelectItem>
                <SelectItem value="all-setters">All Setters</SelectItem>
              </>
            )}
            {currentUserRole === 'setter' && (
              <SelectItem value="all-admins">All Admins</SelectItem>
            )}
            {allUsers
              .filter((user: any) => {
                // Exclude self
                if (user.user_id === session?.user?.id) return false;
                // Setters should only see admins
                if (currentUserRole === 'setter') return user.role === 'admin';
                // Admins can see everyone
                return true;
              })
              .map((user: any) => (
                <SelectItem key={user.user_id} value={user.user_id}>
                  {user.profiles.full_name} ({user.role})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </CardHeader>
      
      <CardContent className="flex flex-col flex-1 gap-3 p-4 overflow-hidden">
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No messages yet. Start the conversation!
              </p>
            ) : (
              messages.map((msg) => (
                <MessageItem 
                  key={msg.id} 
                  message={msg} 
                  currentUserId={session?.user?.id}
                />
              ))
            )}
          </div>
        </ScrollArea>
        
        <div className="flex gap-2 shrink-0">
          <Textarea
            placeholder="Type your message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="min-h-[60px] resize-none"
          />
          <Button 
            onClick={handleSend} 
            disabled={!message.trim() || sendMessage.isPending}
            size="icon"
            className="h-[60px] w-[60px] shrink-0"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
