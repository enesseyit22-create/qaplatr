import { AuthModal } from '@/components/AuthModal';
import type { AppDestination } from '@/lib/auth';

/** Üye kayıt / giriş akışı. */
export function UserRegister({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (destination?: AppDestination) => void;
}) {
  return (
    <AuthModal
      open={open}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}
