"use client";

import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { Avatar } from "@/components/profile/avatar";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api/client";
import { updateOwnProfile, uploadAvatar } from "@/lib/api/profiles";
import type { PublicProfile } from "@/lib/api/types";

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

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
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload acontece na hora (sem esperar o "Salvar" do formulário) — o
  // resultado já é a foto de verdade validada pelo backend, não uma URL
  // digitada às cegas.
  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setError("Formato não suportado. Envie JPEG, PNG ou WEBP.");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setError("A imagem precisa ter até 5 MB.");
      return;
    }

    setError(null);
    setUploadingAvatar(true);
    try {
      const updated = await uploadAvatar(file);
      setAvatarUrl(updated.avatarUrl);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível enviar a foto.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateOwnProfile({ displayName });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar o perfil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Editar perfil">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <Avatar displayName={displayName || profile.displayName} avatarUrl={avatarUrl} className="size-16" textClassName="text-2xl" />
          <div>
            <Button type="button" variant="secondary" size="sm" loading={uploadingAvatar} onClick={() => fileInputRef.current?.click()}>
              <Camera className="size-4" aria-hidden />
              Trocar foto
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Nome de exibição" htmlFor="profile-name">
            <Input id="profile-name" required maxLength={80} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" loading={saving} className="mt-1">
            Salvar
          </Button>
        </form>
      </div>
    </Modal>
  );
}
