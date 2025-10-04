import { RoleGuard } from "./RoleGuard";

interface AdminOnlyProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function AdminOnly({ children, fallback }: AdminOnlyProps) {
  return (
    <RoleGuard allowedRoles={['admin']} fallback={fallback}>
      {children}
    </RoleGuard>
  );
}
