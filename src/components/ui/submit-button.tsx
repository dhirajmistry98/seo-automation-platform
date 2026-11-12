"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

/**
 * Submit button for server-action forms (`<form action={serverAction}>`).
 * While the form is submitting it disables itself and shows the shared button spinner (`[data-loading]` in globals.css).
 */
export function SubmitButton({ disabled, children, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">) {
  const { pending } = useFormStatus();
  return (
    <button {...props} type="submit" disabled={pending || disabled} aria-busy={pending || undefined} data-loading={pending ? "" : undefined}>
      {children}
    </button>
  );
}
