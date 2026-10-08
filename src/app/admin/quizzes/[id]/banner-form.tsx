"use client";

import { useActionState, useState } from "react";
import { ACCEPTED_IMAGE_TYPES, uploadImage } from "@/components/upload-image";
import type { FormState } from "@/lib/content/action-result";
import { updateBannerAction } from "../actions";

type Banner = { mediaId: string; url: string; alt: string; width: number | null; height: number | null } | null;

export function BannerForm({ quizId, banner }: { quizId: number; banner: Banner }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateBannerAction.bind(null, quizId), {});
  const [image, setImage] = useState(banner);
  const [alt, setAlt] = useState(banner?.alt ?? "");
  const [decorative, setDecorative] = useState(banner !== null && banner.alt === "");
  const [upload, setUpload] = useState<{ busy?: boolean; error?: string }>({});

  async function choose(file: File | undefined) {
    if (!file) return;
    setUpload({ busy: true });
    try {
      const up = await uploadImage(file, quizId);
      setImage({ mediaId: up.id, url: up.url, alt, width: up.width, height: up.height });
      setUpload({});
    } catch (error) {
      setUpload({ error: (error as Error).message });
    }
  }

  return (
    <form action={action} className="flex flex-col gap-4 text-sm">
      <p className="max-w-2xl text-muted">
        Shown across the top of the quiz, its embed and shared results. PNG, JPEG, WebP or GIF, up to 2 MB; a wide
        image (about 1200 × 300) works best.
      </p>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.url}
          alt="Banner preview"
          width={image.width ?? undefined}
          height={image.height ?? undefined}
          className="h-auto max-h-48 w-auto max-w-full rounded-md border border-border object-contain"
        />
      ) : (
        <p className="text-muted">No banner.</p>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="banner-file" className="font-medium">
          {image ? "Replace image" : "Choose image"}
        </label>
        <input
          id="banner-file"
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          onChange={(e) => {
            void choose(e.target.files?.[0]);
            e.target.value = "";
          }}
          aria-describedby="banner-upload-status"
        />
        <p id="banner-upload-status" role="status" className={upload.error ? "text-danger" : "text-muted"}>
          {upload.busy ? "Uploading…" : (upload.error ?? "")}
        </p>
      </div>
      <input type="hidden" name="mediaId" value={image?.mediaId ?? ""} />
      {image && (
        <div className="flex flex-col gap-1">
          <label htmlFor="banner-alt" className="font-medium">
            Description (alt text)
          </label>
          <input
            id="banner-alt"
            name="alt"
            value={decorative ? "" : alt}
            disabled={decorative}
            onChange={(e) => setAlt(e.target.value)}
            maxLength={300}
            aria-describedby="banner-alt-hint"
            aria-invalid={state.fieldErrors?.alt ? true : undefined}
            className="max-w-xl rounded-md border border-border bg-surface px-2 py-1.5 disabled:opacity-60"
          />
          <p id="banner-alt-hint" className="text-muted">
            What the image shows, for people who can&apos;t see it.
          </p>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="decorative" checked={decorative} onChange={(e) => setDecorative(e.target.checked)} />
            Decorative (screen readers skip it)
          </label>
          {state.fieldErrors?.alt && <p className="text-danger">{state.fieldErrors.alt}</p>}
        </div>
      )}
      {state.fieldErrors?.mediaId && <p className="text-danger">{state.fieldErrors.mediaId}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || upload.busy || !image}
          className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save banner"}
        </button>
        {banner && (
          <button
            type="submit"
            name="intent"
            value="remove"
            disabled={pending}
            onClick={() => {
              setImage(null);
              setAlt("");
              setDecorative(false);
            }}
            className="rounded-md border border-border px-4 py-2 font-medium hover:bg-border/40 disabled:opacity-60"
          >
            Remove banner
          </button>
        )}
        <p role="status" className={state.error ? "text-danger" : "text-brand"}>
          {state.error ?? state.message ?? ""}
        </p>
      </div>
    </form>
  );
}
