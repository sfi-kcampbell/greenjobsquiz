"use client";

import type { ComponentProps } from "react";

/** A submit button that asks for confirmation before its form submits. */
export function ConfirmSubmit({
  confirmMessage,
  onClick,
  ...props
}: ComponentProps<"button"> & { confirmMessage: string }) {
  return (
    <button
      type="submit"
      {...props}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
        onClick?.(event);
      }}
    />
  );
}
