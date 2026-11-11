"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { ArrowRight, LoaderCircle, ShieldAlert, Sparkles, X } from "lucide-react";

type ReviewItem = { label: string; before?: string; after?: string; value?: string };

type WorkspaceActionDialogProps = {
  open: boolean;
  eyebrow?: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  details?: ReviewItem[];
  input?: Pick<InputHTMLAttributes<HTMLInputElement>, "autoComplete" | "inputMode" | "maxLength" | "placeholder" | "spellCheck"> & {
    label: string;
    requiredValue?: string;
  };
  onCancel: () => void;
  onConfirm: (inputValue: string) => Promise<void>;
};

export function WorkspaceActionDialog({
  open,
  eyebrow = "CONFIRM ACTION",
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  details,
  input,
  onCancel,
  onConfirm,
}: WorkspaceActionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const [inputValue, setInputValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);

  function dismiss() {
    if (pending) return;
    setInputValue("");
    setError("");
    onCancel();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || (input?.requiredValue && inputValue !== input.requiredValue)) return;
    setPending(true);
    setError("");
    try {
      await onConfirm(inputValue);
      setInputValue("");
      onCancel();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The action could not be completed. Try again.");
    } finally {
      setPending(false);
    }
  }

  const canConfirm = !pending && (!input || (inputValue.trim().length > 0 && (!input.requiredValue || inputValue === input.requiredValue)));

  return (
    <dialog
      ref={dialogRef}
      className={`workspace-action-dialog${destructive ? " is-destructive" : ""}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); dismiss(); }}
      onClick={(event) => { if (event.target === event.currentTarget) dismiss(); }}
    >
      <div className="workspace-action-dialog-inner">
        <div className="workspace-action-dialog-topline">
          <span className="workspace-action-dialog-icon">{destructive ? <ShieldAlert size={19} /> : <Sparkles size={18} />}</span>
          <button className="workspace-action-dialog-close" type="button" onClick={dismiss} disabled={pending} aria-label="Close dialog"><X size={17} /></button>
        </div>
        <p className="workspace-action-dialog-eyebrow">{eyebrow}</p>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId} className="workspace-action-dialog-description">{description}</p>

        {!!details?.length && <dl className="workspace-action-dialog-details">
          {details.map((item) => <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.before !== undefined || item.after !== undefined ? <><span>{item.before || "(empty)"}</span><ArrowRight size={13} aria-hidden="true" /><strong>{item.after || "(empty)"}</strong></> : item.value}</dd>
          </div>)}
        </dl>}

        <form onSubmit={submit}>
          {input && <label htmlFor={inputId}>
            <span>{input.label}</span>
            {input.requiredValue && <code>{input.requiredValue}</code>}
            <input
              id={inputId}
              autoFocus
              autoComplete={input.autoComplete || "off"}
              inputMode={input.inputMode}
              maxLength={input.maxLength}
              placeholder={input.placeholder}
              required
              spellCheck={input.spellCheck ?? false}
              value={inputValue}
              onChange={(event) => { setInputValue(event.target.value); setError(""); }}
            />
          </label>}
          {error && <p className="workspace-action-dialog-error" role="alert">{error}</p>}
          <div className="workspace-action-dialog-actions">
            <button type="button" onClick={dismiss} disabled={pending}>{cancelLabel}</button>
            <button type="submit" className="workspace-action-confirm" disabled={!canConfirm}>
              {pending && <LoaderCircle className="site-spin" size={14} />}
              {pending ? "Working…" : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
