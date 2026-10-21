import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { useSetterProfile } from "@/hooks/useSetterProfile";

interface Props {
  setter: NonNullable<ReturnType<typeof useSetterProfile>["setter"]>;
  updateNotes: ReturnType<typeof useSetterProfile>["updateNotes"];
}

export default function NotesTab({ setter, updateNotes }: Props) {
  const [text, setText] = useState(setter.notes || "");

  useEffect(() => {
    setText(setter.notes || "");
  }, [setter.notes]);

  // Autosave debounce
  useEffect(() => {
    if (text === (setter.notes || "")) return;
    const t = setTimeout(() => {
      updateNotes.mutate(text);
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Manager Notes & Stipulations</span>
            <span className="text-xs text-muted-foreground font-normal">
              {updateNotes.isPending ? "Saving…" : "Autosaves"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Stipulations are stored at the top with a timestamp prefix. Add any free-form notes below.
          </p>
          <Textarea
            placeholder="Type notes about this setter…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            className="font-mono text-xs"
          />
          <Button size="sm" onClick={() => updateNotes.mutate(text)} disabled={updateNotes.isPending}>
            Save Now
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
