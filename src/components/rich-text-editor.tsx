"use client";

import Image from "@tiptap/extension-image";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRef, useState } from "react";
import { ACCEPTED_IMAGE_TYPES, uploadImage } from "./upload-image";

/**
 * Small rich-text editor for the intro, question help, answer and response
 * bodies. Only formatting the sanitizer allows is offered (see lib/sanitize),
 * including images uploaded to this app. Mount it only when visible;
 * collapsed drawers render nothing.
 */
export function RichTextEditor({
  id,
  label,
  value,
  onChange,
  quizId,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (html: string) => void;
  /** Tags uploaded images with their quiz (optional). */
  quizId?: number;
}) {
  const editor = useEditor({
    // Rendered only on the client; avoids a server/client mismatch.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [3, 4] },
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      // Pasted images from other sites are removed on save (only /media/... is kept).
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: value ?? "",
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        class: "rich-text min-h-24 px-3 py-2 focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  return (
    <div className="rounded-md border border-border bg-surface focus-within:border-brand">
      {editor && <Toolbar editor={editor} label={label} quizId={quizId} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor, label, quizId }: { editor: Editor; label: string; quizId?: number }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageStatus, setImageStatus] = useState<{ text: string; error: boolean } | null>(null);

  async function addImage(file: File) {
    setImageStatus({ text: "Uploading image…", error: false });
    try {
      const image = await uploadImage(file, quizId);
      const alt = window.prompt(
        "Describe the image for people who can't see it.\nLeave empty if it's decorative.",
        "",
      );
      if (alt === null) {
        setImageStatus(null); // cancelled
        return;
      }
      editor.chain().focus().setImage({ src: image.url, alt: alt.trim(), width: image.width, height: image.height }).run();
      setImageStatus({ text: "Image added.", error: false });
    } catch (error) {
      setImageStatus({ text: error instanceof Error ? error.message : "The image couldn't be added.", error: true });
    }
  }

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      link: e.isActive("link"),
    }),
  });

  const button = (name: string, text: React.ReactNode, active: boolean, run: () => void) => (
    <button
      type="button"
      aria-label={name}
      aria-pressed={active}
      title={name}
      onMouseDown={(e) => e.preventDefault()} // keep the editor's selection
      onClick={run}
      className={`min-w-8 rounded px-2 py-1 text-sm ${active ? "bg-brand/15 text-brand" : "text-muted hover:bg-border/50"}`}
    >
      {text}
    </button>
  );

  function editLink() {
    const current = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link address (leave empty to remove the link)", current ?? "https://");
    if (href === null) return;
    const chain = editor.chain().focus().extendMarkRange("link");
    if (href.trim() === "" || href.trim() === "https://") chain.unsetLink().run();
    else chain.setLink({ href: href.trim() }).run();
  }

  return (
    <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap gap-1 border-b border-border px-1 py-1">
      {button("Bold", <strong>B</strong>, state.bold, () => editor.chain().focus().toggleBold().run())}
      {button("Italic", <em>I</em>, state.italic, () => editor.chain().focus().toggleItalic().run())}
      {button("Underline", <u>U</u>, state.underline, () => editor.chain().focus().toggleUnderline().run())}
      {button("Bulleted list", "Bulleted", state.bulletList, () => editor.chain().focus().toggleBulletList().run())}
      {button("Numbered list", "Numbered", state.orderedList, () => editor.chain().focus().toggleOrderedList().run())}
      {button("Link", "Link", state.link, editLink)}
      {button("Clear formatting", "Clear", false, () => editor.chain().focus().unsetAllMarks().clearNodes().run())}
      {button("Image", "Image", false, () => fileRef.current?.click())}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow choosing the same file again
          if (file) void addImage(file);
        }}
      />
      {imageStatus && (
        <span role="status" className={`self-center px-1 text-xs ${imageStatus.error ? "text-danger" : "text-muted"}`}>
          {imageStatus.text}
        </span>
      )}
    </div>
  );
}
