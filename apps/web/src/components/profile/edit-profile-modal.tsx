"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api/client";
import { updateOwnProfile } from "@/lib/api/profiles";
import type { PublicProfile } from "@/lib/api/types";

export function EditProfileModal({
  open,
  onOpenChange,
  profile,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: PublicProfile;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await updateOwnProfile({ displayName, avatarUrl: avatarUrl || undefined });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar o perfil.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Editar perfil">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nome de exibição" htmlFor="profile-name">
          <Input id="profile-name" required maxLength={80} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label="URL do avatar (opcional)" htmlFor="profile-avatar">
          <Input id="profile-avatar" type="url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
        </Field>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={loading} className="mt-1">
          Salvar
        </Button>
      </form>
    </Modal>
  );
}
