import type { ButtonHTMLAttributes, ComponentType, ReactNode } from "react";
import type { IconProps } from "./icons";
import { Reveal } from "./motion";

/** Shared building blocks so later screens reuse the same card and button styles. */

type ButtonVariant = "primary" | "secondary" | "ghost";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:brightness-110",
  secondary: "border border-border text-fg hover:bg-surface-raised",
  ghost: "text-fg hover:bg-surface-raised",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = "primary", className = "", type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

/** T-711: the card enters softly once, when it mounts (never on the periodic data reads). */
export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <Reveal as="section" className="rounded-card border border-border bg-surface p-4 shadow-lg shadow-canvas/40 md:p-6">
      {title && <h2 className="mb-3 text-xl font-semibold">{title}</h2>}
      {children}
    </Reveal>
  );
}

interface PageHeaderProps {
  title: string;
  description: string;
  icon: ComponentType<IconProps>;
}

/** T-711: common page title (section icon, title, description and a thin accent rule). */
export function PageHeader({ title, description, icon: Icon }: PageHeaderProps) {
  return (
    <header>
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-card border border-border bg-surface-raised text-accent">
          <Icon className="size-5" />
        </span>
        <h1 className="min-w-0 text-2xl font-semibold break-words md:text-3xl">{title}</h1>
      </div>
      <div className="title-rule mt-3 h-px w-full max-w-md" aria-hidden="true" />
      <p className="mt-2 text-fg-muted">{description}</p>
    </header>
  );
}
