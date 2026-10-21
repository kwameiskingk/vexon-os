import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Copy, Check, Webhook, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/close-webhook`;

export function CloseWebhookSetup() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [webhookResponse, setWebhookResponse] = useState<any>(null);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(WEBHOOK_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied!",
      description: "Webhook URL copied to clipboard",
    });
  };

  const createWebhook = async () => {
    setLoading(true);
    try {
      const closeApiKey = prompt("Enter your Close API Key:");
      if (!closeApiKey) {
        setLoading(false);
        return;
      }

      const response = await fetch("https://api.close.com/api/v1/webhook/", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(closeApiKey + ":")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: WEBHOOK_URL,
          events: [
            { object_type: "lead", action: "created" },
            { object_type: "activity.call", action: "created" }
          ],
          verify_ssl: true
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create webhook: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      setWebhookResponse(data);
      
      toast({
        title: "Success!",
        description: `Webhook created with ID: ${data.id}`,
      });

      if (data.signature_key) {
        toast({
          title: "Important!",
          description: "Save the signature_key as CLOSE_SIGNATURE_KEY secret in your environment",
          duration: 10000,
        });
      }
    } catch (error) {
      console.error("Error creating webhook:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create webhook",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Webhook className="h-5 w-5" />
          Close Webhook Setup
        </CardTitle>
        <CardDescription>
          Configure real-time webhook integration with Close CRM
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This webhook replaces the old polling-based sync system. Once configured, KPIs will update in real-time as calls and leads are created in Close.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="webhook-url">Webhook Endpoint URL</Label>
          <div className="flex gap-2">
            <Input
              id="webhook-url"
              value={WEBHOOK_URL}
              readOnly
              className="font-mono text-sm"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={copyToClipboard}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Button 
            onClick={createWebhook} 
            disabled={loading}
            className="w-full"
          >
            {loading ? "Creating..." : "Create Webhook in Close"}
          </Button>
          <p className="text-sm text-muted-foreground">
            This will register the webhook with Close CRM for the following events:
          </p>
          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
            <li>Lead created</li>
            <li>Call activity created</li>
          </ul>
        </div>

        {webhookResponse && (
          <Alert>
            <AlertDescription className="space-y-2">
              <div className="font-semibold">Webhook Created Successfully!</div>
              <div className="space-y-1 text-sm">
                <div><strong>ID:</strong> {webhookResponse.id}</div>
                <div><strong>URL:</strong> {webhookResponse.url}</div>
                {webhookResponse.signature_key && (
                  <div className="p-2 bg-muted rounded mt-2">
                    <strong>Signature Key:</strong>
                    <code className="block mt-1 text-xs break-all">
                      {webhookResponse.signature_key}
                    </code>
                    <p className="text-xs mt-2 text-muted-foreground">
                      Save this as CLOSE_SIGNATURE_KEY in your secrets for webhook verification
                    </p>
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="pt-4 border-t">
          <h4 className="font-semibold text-sm mb-2">Manual Setup Instructions</h4>
          <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
            <li>Copy the webhook URL above</li>
            <li>Go to Close CRM → Settings → Webhooks</li>
            <li>Create a new webhook subscription</li>
            <li>Subscribe to "Lead Created" and "Call Activity Created" events</li>
            <li>Save the signature_key as CLOSE_SIGNATURE_KEY secret</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
