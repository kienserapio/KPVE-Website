import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  error?: string;
  as?: "input" | "textarea";
  rows?: number;
  className?: string;
};

const controlBase =
  "peer w-full border-b bg-transparent pb-3 text-muted-3 outline-none transition-colors duration-300 placeholder:text-white/25";

/**
 * The KPVE form field — underline that fills gold on focus.
 *
 * Promoted out of components/sections/Contact.tsx so forms elsewhere share one
 * input treatment instead of re-implementing it.
 */
export function Field({
  label,
  name,
  placeholder,
  type = "text",
  required = true,
  defaultValue,
  error,
  as = "input",
  rows = 4,
  className,
}: FieldProps) {
  const errorId = error ? `${name}-error` : undefined;

  const controlClass = cn(
    controlBase,
    error ? "border-danger focus:border-danger" : "border-white/15 focus:border-gold",
    as === "textarea" && "resize-y",
  );

  return (
    <label className={cn("group flex flex-col gap-3", className)}>
      <span className="text-lg font-medium text-white">
        {label} {required && <span className="text-gold">*</span>}
      </span>

      {as === "textarea" ? (
        <textarea
          name={name}
          rows={rows}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={controlClass}
        />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={controlClass}
        />
      )}

      <span
        className={cn(
          "h-px w-0 transition-all duration-300 peer-focus:w-full",
          error ? "w-full bg-danger" : "bg-gold",
        )}
      />

      {error && (
        <span id={errorId} className="text-sm text-danger">
          {error}
        </span>
      )}
    </label>
  );
}
