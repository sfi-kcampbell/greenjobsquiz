"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

/**
 * Small rich-text editor for answer, question-help and response bodies.
 * Only formatting the sanitizer allows is offered (see lib/sanitize).
 * Mount it only when visible; collapsed drawers render nothing.
 */
export function RichTextEditor({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (html: string) => void;
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
      {editor && <Toolbar editor={editor} label={label} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor, label }: { editor: Editor; label: string }) {
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
    </div>
  );
}
