import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link2, Pencil, Trash2, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface UsefulLink {
  id: string;
  name: string;
  description: string | null;
  url: string;
  department: string;
  sort_order: number;
  is_active: boolean;
}

const emptyForm = {
  name: "",
  description: "",
  url: "",
  department: "acquisition",
  sort_order: 0,
  is_active: true,
};

export function UsefulLinksManagement() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UsefulLink | null>(null);
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);

  const { data: links = [], isLoading } = useQuery({
    queryKey: ["useful-links-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("setter_useful_links")
        .select("*")
        .order("department", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as UsefulLink[];
    },
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const cleanUrl = form.url.trim();
      if (!/^https?:\/\//i.test(cleanUrl)) {
        throw new Error("URL must start with http:// or https://");
      }
      if (!form.name.trim()) throw new Error("Name is required");

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        url: cleanUrl,
        department: form.department,
        sort_order: Number(form.sort_order) || 0,
        is_active: form.is_active,
      };

      if (editing) {
        const { error } = await supabase
          .from("setter_useful_links")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("setter_useful_links")
          .insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["useful-links-admin"] });
      qc.invalidateQueries({ queryKey: ["useful-links-setter"] });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      toast.success(editing ? "Link updated" : "Link added");
    },
    onError: (e: any) => toast.error(e.message || "Failed to save link"),
  });

  const toggleActive = useMutation({
    mutationFn: async (link: UsefulLink) => {
      const { error } = await supabase
        .from("setter_useful_links")
        .update({ is_active: !link.is_active })
        .eq("id", link.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["useful-links-admin"] });
      qc.invalidateQueries({ queryKey: ["useful-links-setter"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("setter_useful_links")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["useful-links-admin"] });
      qc.invalidateQueries({ queryKey: ["useful-links-setter"] });
      toast.success("Link deleted");
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (link: UsefulLink) => {
    setEditing(link);
    setForm({
      name: link.name,
      description: link.description || "",
      url: link.url,
      department: link.department,
      sort_order: link.sort_order,
      is_active: link.is_active,
    });
    setOpen(true);
  };

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-base">Setter Useful Links</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Curated quick-access links shown to setters in the Tools tab.
            </p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Add Link
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Link" : "Add Useful Link"}</DialogTitle>
              <DialogDescription>
                These appear under Tools → Useful Links for setters in the chosen department.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="ul-name">Name *</Label>
                <Input
                  id="ul-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Discovery Call Booking Link"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ul-desc">Description</Label>
                <Textarea
                  id="ul-desc"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Short description for the setter"
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ul-url">URL *</Label>
                <Input
                  id="ul-url"
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <Select
                    value={form.department}
                    onValueChange={(v) => setForm((f) => ({ ...f, department: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="acquisition">Acquisition</SelectItem>
                      <SelectItem value="fulfilment">Fulfilment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ul-sort">Sort Order</Label>
                  <Input
                    id="ul-sort"
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="ul-active" className="cursor-pointer">Active</Label>
                  <p className="text-xs text-muted-foreground">Inactive links are hidden from setters.</p>
                </div>
                <Switch
                  id="ul-active"
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => upsert.mutate()} disabled={upsert.isPending}>
                {editing ? "Save Changes" : "Add Link"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>URL</TableHead>
              <TableHead className="w-[80px]">Active</TableHead>
              <TableHead className="text-right w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!isLoading && links.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No links yet. Click "Add Link" to create one.</TableCell></TableRow>
            )}
            {links.map((link) => (
              <TableRow key={link.id}>
                <TableCell>
                  <div className="font-medium">{link.name}</div>
                  {link.description && (
                    <div className="text-xs text-muted-foreground line-clamp-1">{link.description}</div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">{link.department}</Badge>
                </TableCell>
                <TableCell className="max-w-[240px]">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1 text-sm truncate"
                  >
                    <span className="truncate">{link.url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </TableCell>
                <TableCell>
                  <Switch checked={link.is_active} onCheckedChange={() => toggleActive.mutate(link)} />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(link)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Delete "${link.name}"?`)) remove.mutate(link.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default UsefulLinksManagement;
