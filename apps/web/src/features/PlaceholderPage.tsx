import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui";

interface PlaceholderPageProps {
  title: string;
  description: string;
  children?: ReactNode;
}

/** Common layout for the provisional sections of T-103. */
export function PlaceholderPage({ title, description, children }: PlaceholderPageProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
        <p className="mt-1 text-fg-muted">{description}</p>
      </header>
      <Card>
        <p className="text-sm text-fg-muted">{t("pages.placeholder")}</p>
      </Card>
      {children}
    </div>
  );
}
