import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Underline-only input with the label above; the underline turns gradient on focus. */
export const InputV2 = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; wrapperClassName?: string }>(
  ({ label, hint, wrapperClassName, className, id, ...rest }, ref) => (
    <label htmlFor={id} className={cn("block text-[11.5px] text-[var(--dim)]", wrapperClassName)}>
      {label}
      {hint && <small className="ml-1 text-[var(--dim2)]">{hint}</small>}
      <input
        ref={ref}
        id={id}
        className={cn(
          "mt-1 block w-full border-0 border-b border-[var(--line2)] bg-transparent py-[6px] font-body text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--dim2)] focus:[border-image:var(--grad)_1]",
          className,
        )}
        {...rest}
      />
    </label>
  ),
);
InputV2.displayName = "InputV2";
