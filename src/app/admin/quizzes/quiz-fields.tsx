"use client";

import { useState } from "react";
import { TextField } from "@/components/form-field";
import { slugify } from "@/lib/content/validation";

/**
 * Title + slug inputs. The slug follows the title until someone edits it by
 * hand, so new quizzes get a sensible URL without extra typing.
 */
export function QuizFields({
  idPrefix,
  defaultTitle = "",
  defaultSlug,
  errors,
}: {
  idPrefix: string;
  defaultTitle?: string;
  defaultSlug?: string;
  errors?: Record<string, string>;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [slug, setSlug] = useState(defaultSlug ?? slugify(defaultTitle));
  const [slugTouched, setSlugTouched] = useState(defaultSlug !== undefined);

  return (
    <>
      <TextField
        id={`${idPrefix}-title`}
        name="title"
        label="Title"
        required
        maxLength={120}
        value={title}
        error={errors?.title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (!slugTouched) setSlug(slugify(e.target.value));
        }}
        className="min-w-60 flex-1"
      />
      <TextField
        id={`${idPrefix}-slug`}
        name="slug"
        label="URL slug"
        required
        maxLength={80}
        value={slug}
        error={errors?.slug}
        hint={`/quizzes/${slug || "…"}`}
        onChange={(e) => {
          setSlug(e.target.value);
          setSlugTouched(true);
        }}
        className="min-w-60 flex-1"
      />
    </>
  );
}
