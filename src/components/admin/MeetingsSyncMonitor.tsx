import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, Upload, AlertCircle, Star } from 'lucide-react';

export const MeetingsSyncMonitor = () => {
  const [uploading, setUploading] = useState(false);
  const [syncingScores, setSyncingScores] = useState(false);
  const [errors, setErrors] = useState<any[]>([]);
  const [lastScoresSync, setLastScoresSync] = useState<any>(null);
  const { toast } = useToast();

  const handleSyncMeetingScores = async () => {
    setSyncingScores(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-meeting-scores');
      if (error) throw error;
      setLastScoresSync(data);
      toast({
        title: 'Meeting Scores Synced',
        description: `Total: ${data.total} • Matched: ${data.matched} • Unmatched: ${data.unmatched}`,
      });
    } catch (error: any) {
      toast({ title: 'Score Sync Failed', description: error.message, variant: 'destructive' });
    } finally {
      setSyncingScores(false);
    }
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data, error } = await supabase.functions.invoke('import-meetings-csv', { body: formData });
      if (error) throw error;
      toast({
        title: 'CSV Import Complete',
        description: `Imported: ${data.imported}, Updated: ${data.updated}, Errors: ${data.errors}`,
      });
      if (data.errors > 0) loadErrors();
    } catch (error: any) {
      toast({ title: 'CSV Import Failed', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const loadErrors = async () => {
    const { data } = await supabase
      .from('sync_errors')
      .select('*')
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(10);
    setErrors(data || []);
  };

  const resolveError = async (errorId: string) => {
    await supabase.from('sync_errors').update({ resolved: true, resolved_at: new Date().toISOString() }).eq('id', errorId);
    loadErrors();
    toast({ title: 'Error Resolved' });
  };

  return (
    <div className="space-y-6">
      {/* Meeting Scores Sync */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Star className="h-5 w-5 text-amber-500" />
          Meeting Quality Scores Sync
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Pulls scores from the Google Sheet "Meeting Log" tab. One-way: sheet → app.
        </p>
        <Button onClick={handleSyncMeetingScores} disabled={syncingScores}>
          <RefreshCw className={`h-4 w-4 mr-2 ${syncingScores ? 'animate-spin' : ''}`} />
          {syncingScores ? 'Syncing...' : 'Sync Now'}
        </Button>
        {lastScoresSync && (
          <div className="mt-3 text-sm text-muted-foreground">
            Last sync: {lastScoresSync.total} rows • {lastScoresSync.matched} matched • {lastScoresSync.unmatched} unmatched
          </div>
        )}
      </Card>

      {/* Error Log */}
      {errors.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="text-destructive" size={20} />
            Sync Errors ({errors.length})
          </h3>
          <div className="space-y-3">
            {errors.map((error) => (
              <div key={error.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{error.source}</p>
                    <p className="text-sm text-muted-foreground mt-1">{error.error_reason}</p>
                    <p className="text-xs text-muted-foreground mt-2">{new Date(error.created_at).toLocaleString()}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => resolveError(error.id)}>Resolve</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
