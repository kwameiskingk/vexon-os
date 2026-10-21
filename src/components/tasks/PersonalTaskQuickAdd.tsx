import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useCreatePersonalTask } from "@/hooks/useTaskInstances";

export const PersonalTaskQuickAdd = () => {
  const [title, setTitle] = useState("");
  const create = useCreatePersonalTask();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim() },
      { onSuccess: () => setTitle("") }
    );
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2 mt-3">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a personal task..."
        className="h-9"
      />
      <Button type="submit" size="sm" disabled={!title.trim() || create.isPending}>
        <Plus className="h-4 w-4 mr-1" /> Add
      </Button>
    </form>
  );
};
