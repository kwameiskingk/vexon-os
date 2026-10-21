import { UserRoleManagement } from "@/components/settings/UserRoleManagement";
import { PortalAccessManagement } from "@/components/settings/PortalAccessManagement";
import { UsefulLinksManagement } from "@/components/settings/UsefulLinksManagement";

export function UserAccessConsole() {
  return (
    <div className="dc-embed space-y-6">
      <UserRoleManagement />
      <PortalAccessManagement />
      <UsefulLinksManagement />
    </div>
  );
}
