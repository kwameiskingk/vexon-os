import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Play,
  Pause,
  RotateCcw,
  Plus,
  Edit3,
  Trash2,
  Star,
  StarOff,
  Monitor,
  Type,
  Gauge,
  FileText,
  Upload,
  X,
  Maximize2,
  Minimize2,
  SkipBack,
  SkipForward,
  Eye,
  Copy,
  ChevronLeft,
} from "lucide-react";

const CATEGORIES = [
  { value: "cold_call", label: "Cold Call" },
  { value: "follow_up", label: "Follow Up" },
  { value: "discovery", label: "Discovery" },
  { value: "objection_handling", label: "Objection Handling" },
  { value: "pitch", label: "Pitch" },
  { value: "general", label: "General" },
];

const CATEGORY_COLORS: Record<string, string> = {
  cold_call: "default",
  follow_up: "secondary",
  discovery: "default",
  objection_handling: "destructive",
  pitch: "default",
  general: "secondary",
};

interface Script {
  id: string;
  title: string;
  content: string;
  category: string;
  scroll_speed: number;
  font_size: number;
  is_favorite: boolean;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

type View = "library" | "editor" | "prompter";

export function TeleprompterTool() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [view, setView] = useState<View>("library");
  const [editingScript, setEditingScript] = useState<Script | null>(null);
  const [activeScript, setActiveScript] = useState<Script | null>(null);

  // Editor state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("cold_call");
  const [scrollSpeed, setScrollSpeed] = useState(3);
  const [fontSize, setFontSize] = useState(28);

  // Prompter state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMirrored, setIsMirrored] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [prompterFontSize, setPrompterFontSize] = useState(28);
  const [prompterSpeed, setPrompterSpeed] = useState(3);
  const scrollRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter state
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch scripts
  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ["teleprompter-scripts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teleprompter_scripts")
        .select("*")
        .order("is_favorite", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Script[];
    },
  });

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async (script: { id?: string; title: string; content: string; category: string; scroll_speed: number; font_size: number }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (script.id) {
        const { error } = await supabase
          .from("teleprompter_scripts")
          .update({ title: script.title, content: script.content, category: script.category, scroll_speed: script.scroll_speed, font_size: script.font_size })
          .eq("id", script.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("teleprompter_scripts")
          .insert({ user_id: user.id, title: script.title, content: script.content, category: script.category, scroll_speed: script.scroll_speed, font_size: script.font_size });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teleprompter-scripts"] });
      toast({ title: "Saved", description: "Script saved successfully." });
      setView("library");
      resetEditor();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teleprompter_scripts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teleprompter-scripts"] });
      toast({ title: "Deleted", description: "Script deleted." });
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ id, is_favorite }: { id: string; is_favorite: boolean }) => {
      const { error } = await supabase.from("teleprompter_scripts").update({ is_favorite }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teleprompter-scripts"] }),
  });

  const resetEditor = () => {
    setTitle("");
    setContent("");
    setCategory("cold_call");
    setScrollSpeed(3);
    setFontSize(28);
    setEditingScript(null);
  };

  const openEditor = (script?: Script) => {
    if (script) {
      setEditingScript(script);
      setTitle(script.title);
      setContent(script.content);
      setCategory(script.category);
      setScrollSpeed(script.scroll_speed);
      setFontSize(script.font_size);
    } else {
      resetEditor();
    }
    setView("editor");
  };

  const openPrompter = (script: Script) => {
    setActiveScript(script);
    setPrompterFontSize(script.font_size);
    setPrompterSpeed(script.scroll_speed);
    setIsPlaying(false);
    setView("prompter");
    // Mark as last used
    supabase.from("teleprompter_scripts").update({ last_used_at: new Date().toISOString() }).eq("id", script.id).then();
  };

  const handleSave = () => {
    if (!title.trim()) {
      toast({ title: "Missing Title", description: "Please enter a script title.", variant: "destructive" });
      return;
    }
    if (!content.trim()) {
      toast({ title: "Missing Content", description: "Please enter script content.", variant: "destructive" });
      return;
    }
    saveMutation.mutate({
      id: editingScript?.id,
      title: title.trim(),
      content: content.trim(),
      category,
      scroll_speed: scrollSpeed,
      font_size: fontSize,
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".txt") && !file.name.endsWith(".md")) {
      toast({ title: "Unsupported Format", description: "Please upload a .txt or .md file.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setContent(text);
      if (!title.trim()) {
        setTitle(file.name.replace(/\.(txt|md)$/, ""));
      }
      toast({ title: "Imported", description: "Script content loaded from file." });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Teleprompter scroll animation
  const startScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const pixelsPerFrame = (prompterSpeed * 0.5);

    const step = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
        setIsPlaying(false);
        return;
      }
      el.scrollTop += pixelsPerFrame;
      animationRef.current = requestAnimationFrame(step);
    };
    animationRef.current = requestAnimationFrame(step);
  }, [prompterSpeed]);

  const stopScroll = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isPlaying) {
      startScroll();
    } else {
      stopScroll();
    }
    return stopScroll;
  }, [isPlaying, startScroll, stopScroll]);

  const resetScroll = () => {
    setIsPlaying(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const jumpScroll = (direction: "back" | "forward") => {
    if (!scrollRef.current) return;
    const jump = scrollRef.current.clientHeight * 0.5;
    scrollRef.current.scrollTop += direction === "forward" ? jump : -jump;
  };

  // Fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Keyboard shortcuts in prompter
  useEffect(() => {
    if (view !== "prompter") return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); setIsPlaying(p => !p); }
      if (e.code === "ArrowUp") { e.preventDefault(); jumpScroll("back"); }
      if (e.code === "ArrowDown") { e.preventDefault(); jumpScroll("forward"); }
      if (e.code === "KeyR") { e.preventDefault(); resetScroll(); }
      if (e.code === "KeyF") { e.preventDefault(); toggleFullscreen(); }
      if (e.code === "Escape" && !document.fullscreenElement) { setView("library"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [view, toggleFullscreen]);

  // Filtered scripts
  const filteredScripts = scripts.filter(s => {
    if (filterCategory !== "all" && s.category !== filterCategory) return false;
    if (searchQuery && !s.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // ---- VIEWS ----

  if (view === "editor") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setView("library"); resetEditor(); }}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h3 className="text-lg font-semibold font-heading">
            {editingScript ? "Edit Script" : "New Script"}
          </h3>
        </div>

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Cold Call Opener v2" />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Script Content *</Label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5 mr-1.5" /> Import .txt
                  </Button>
                  <input ref={fileInputRef} type="file" accept=".txt,.md" className="hidden" onChange={handleFileUpload} />
                </div>
              </div>
              <Textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder={"Hi [Name], this is [Your Name] from Meridian.\n\nI'm reaching out because...\n\n---\n\n[PAUSE - Let them respond]\n\n---\n\nThe reason I'm calling is..."}
                className="min-h-[300px] font-mono text-sm leading-relaxed"
              />
              <p className="text-xs text-muted-foreground">
                Tip: Use <code className="bg-muted px-1 rounded">---</code> for section breaks, <code className="bg-muted px-1 rounded">[BRACKETS]</code> for cues/pauses, and blank lines for breathing room.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Gauge className="h-3.5 w-3.5" /> Default Scroll Speed: {scrollSpeed}</Label>
                <Slider value={[scrollSpeed]} onValueChange={v => setScrollSpeed(v[0])} min={1} max={10} step={1} />
                <p className="text-xs text-muted-foreground">1 = very slow, 10 = fast</p>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Type className="h-3.5 w-3.5" /> Default Font Size: {fontSize}px</Label>
                <Slider value={[fontSize]} onValueChange={v => setFontSize(v[0])} min={16} max={48} step={2} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setView("library"); resetEditor(); }}>Cancel</Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save Script"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (view === "prompter" && activeScript) {
    const lines = activeScript.content.split("\n");

    return (
      <div ref={containerRef} className={`flex flex-col ${isFullscreen ? "fixed inset-0 z-50 bg-background" : "space-y-3"}`}>
        {/* Controls bar */}
        <div className={`flex items-center justify-between gap-3 px-4 py-2 rounded-lg bg-card border border-border ${isFullscreen ? "rounded-none" : ""}`}>
          <div className="flex items-center gap-2">
            {!isFullscreen && (
              <Button variant="ghost" size="sm" onClick={() => setView("library")}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
            <span className="text-sm font-medium truncate max-w-[200px]">{activeScript.title}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => jumpScroll("back")} title="Jump back (↑)">
              <SkipBack className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={isPlaying ? "destructive" : "default"}
              size="icon"
              className="h-9 w-9"
              onClick={() => setIsPlaying(p => !p)}
              title="Play/Pause (Space)"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => jumpScroll("forward")} title="Jump forward (↓)">
              <SkipForward className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={resetScroll} title="Reset (R)">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
              <Slider value={[prompterSpeed]} onValueChange={v => setPrompterSpeed(v[0])} min={1} max={10} step={1} className="w-20" />
              <span className="text-xs text-muted-foreground w-4">{prompterSpeed}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Type className="h-3.5 w-3.5 text-muted-foreground" />
              <Slider value={[prompterFontSize]} onValueChange={v => setPrompterFontSize(v[0])} min={16} max={64} step={2} className="w-20" />
              <span className="text-xs text-muted-foreground w-6">{prompterFontSize}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground cursor-pointer" htmlFor="mirror-toggle">Mirror</Label>
              <Switch id="mirror-toggle" checked={isMirrored} onCheckedChange={setIsMirrored} />
            </div>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={toggleFullscreen} title="Fullscreen (F)">
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Reading guide line */}
        <div className="relative flex-1 min-h-0">
          {/* Center guide */}
          <div className="absolute left-0 right-0 top-1/3 h-px bg-primary/30 z-10 pointer-events-none" />
          <div className="absolute left-0 right-0 top-1/3 -translate-y-1/2 h-16 bg-gradient-to-b from-primary/5 via-primary/10 to-primary/5 z-10 pointer-events-none" />

          {/* Top fade */}
          <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none" />
          {/* Bottom fade */}
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent z-10 pointer-events-none" />

          <div
            ref={scrollRef}
            className={`h-full overflow-y-auto scroll-smooth px-6 md:px-16 py-32 ${isMirrored ? "scale-x-[-1]" : ""}`}
            style={{ height: isFullscreen ? "calc(100vh - 56px)" : "60vh" }}
          >
            <div className="max-w-3xl mx-auto space-y-1" style={{ fontSize: `${prompterFontSize}px`, lineHeight: 1.6 }}>
              {lines.map((line, i) => {
                const trimmed = line.trim();
                if (trimmed === "---") {
                  return <hr key={i} className="border-border/50 my-6" />;
                }
                if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                  return (
                    <p key={i} className="text-primary font-bold text-center py-3 uppercase tracking-wide" style={{ fontSize: `${prompterFontSize * 0.7}px` }}>
                      {trimmed}
                    </p>
                  );
                }
                if (!trimmed) {
                  return <div key={i} className="h-6" />;
                }
                return (
                  <p key={i} className="text-foreground font-medium leading-relaxed">
                    {trimmed}
                  </p>
                );
              })}
              {/* Extra padding at end for scroll */}
              <div className="h-[50vh]" />
            </div>
          </div>
        </div>

        {/* Keyboard hints */}
        {!isFullscreen && (
          <div className="flex justify-center gap-4 text-xs text-muted-foreground py-1">
            <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Space</kbd> Play/Pause</span>
            <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">↑↓</kbd> Jump</span>
            <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">R</kbd> Reset</span>
            <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">F</kbd> Fullscreen</span>
          </div>
        )}
      </div>
    );
  }

  // ---- LIBRARY VIEW ----
  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
          <Input
            placeholder="Search scripts..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => openEditor()}>
            <Plus className="h-4 w-4 mr-1.5" /> New Script
          </Button>
        </div>
      </div>

      {/* Script cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4 h-32" />
            </Card>
          ))}
        </div>
      ) : filteredScripts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={scripts.length === 0 ? "No scripts yet" : "No scripts match your filter"}
          description={scripts.length === 0 ? "Create your first teleprompter script to get started." : "Try adjusting your search or category filter."}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredScripts.map(script => (
            <Card
              key={script.id}
              className="group hover:border-primary/30 transition-all cursor-pointer"
              onClick={() => openPrompter(script)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {script.is_favorite && <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 shrink-0" />}
                      <h4 className="font-semibold text-sm truncate">{script.title}</h4>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={CATEGORY_COLORS[script.category] as any || "secondary"} className="text-[10px]">
                        {CATEGORIES.find(c => c.value === script.category)?.label || script.category}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(script.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {script.content.slice(0, 120)}{script.content.length > 120 ? "..." : ""}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => toggleFavoriteMutation.mutate({ id: script.id, is_favorite: !script.is_favorite })}
                      title={script.is_favorite ? "Unfavorite" : "Favorite"}
                    >
                      {script.is_favorite ? <StarOff className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditor(script)} title="Edit">
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => deleteMutation.mutate(script.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/50">
                  <Button variant="default" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); openPrompter(script); }}>
                    <Play className="h-3 w-3 mr-1" /> Launch
                  </Button>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Gauge className="h-3 w-3" /> Speed {script.scroll_speed}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Type className="h-3 w-3" /> {script.font_size}px
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
