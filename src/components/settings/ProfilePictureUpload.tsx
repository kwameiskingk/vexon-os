import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ProfilePictureUploadProps {
  userId: string;
  currentAvatarUrl: string | null;
  userName: string;
  onUploadSuccess: (url: string | null) => void;
  /** Demo surfaces (acting-as SDR, 3 Sep): preview the picked image locally.
   * Nothing is uploaded to storage and no profile row is touched. */
  demo?: boolean;
}

export const ProfilePictureUpload = ({
  userId,
  currentAvatarUrl,
  userName,
  onUploadSuccess,
  demo,
}: ProfilePictureUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    if (demo) {
      // Local preview only: an object URL the browser holds until the page goes.
      onUploadSuccess(URL.createObjectURL(file));
      toast.success("Profile picture updated", { description: "Demo data only. Nothing was saved." });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      // Create unique file name
      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("profile-pictures")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("profile-pictures")
        .getPublicUrl(filePath);

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);

      if (updateError) throw updateError;

      onUploadSuccess(publicUrl);
      toast.success("Profile picture updated!");
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload image");
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = async () => {
    if (demo) {
      onUploadSuccess(null);
      toast.success("Profile picture removed", { description: "Demo data only. Nothing was saved." });
      return;
    }
    setUploading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", userId);

      if (error) throw error;

      onUploadSuccess(null);
      toast.success("Profile picture removed");
    } catch (error: any) {
      toast.error(error.message || "Failed to remove image");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Label>Profile Picture</Label>
      <div className="flex items-center gap-4">
        <UserAvatar
          name={userName || "User"}
          avatarUrl={currentAvatarUrl}
          size="xl"
        />
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            disabled={uploading}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Camera className="h-4 w-4 mr-2" />
            )}
            {uploading ? "Uploading..." : "Upload Photo"}
          </Button>
          {currentAvatarUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={uploading}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Recommended: Square image, max 5MB
      </p>
    </div>
  );
};
