import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { resetDemo } from "../demo/reset-demo";
import { InfoIcon } from "./icons";
import { Button } from "./ui";

type ResetStep = "idle" | "confirming" | "running";

const RESET_ID = "demo-reset-button";
const CANCEL_ID = "demo-reset-cancel";

/**
 * Demo-only reset (T-708). Two steps inside the page (no window.confirm): "Reset demo", then
 * "Confirm reset" or "Cancel". resetDemo() reloads the page on success; on failure nothing local
 * is deleted and the reason is shown with neutral styling.
 */
export function ResetDemoButton() {
  const { t } = useTranslation();
  const [step, setStep] = useState<ResetStep>("idle");
  const [failure, setFailure] = useState<string | null>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    // Keyboard users land on the safe option when the confirmation appears,
    // and back on "Reset demo" after cancelling or after a failure.
    if (step === "confirming") document.getElementById(CANCEL_ID)?.focus();
    if (step === "idle" && returnFocus.current) {
      returnFocus.current = false;
      document.getElementById(RESET_ID)?.focus();
    }
  }, [step]);

  async function handleConfirm() {
    setStep("running");
    setFailure(null);
    try {
      await resetDemo();
    } catch (error) {
      console.error("Demo reset failed", error);
      setFailure(error instanceof Error ? error.message : String(error));
      returnFocus.current = true;
      setStep("idle");
    }
  }

  function handleCancel() {
    returnFocus.current = true;
    setStep("idle");
  }

  return (
    <div className="flex max-w-xs flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {step === "idle" ? (
          <Button
            id={RESET_ID}
            variant="secondary"
            aria-describedby="demo-reset-note"
            onClick={() => {
              setFailure(null);
              setStep("confirming");
            }}
          >
            {t("demoReset.button")}
          </Button>
        ) : (
          <>
            <Button variant="secondary" disabled={step === "running"} onClick={() => void handleConfirm()}>
              {step === "running" ? t("demoReset.running") : t("demoReset.confirm")}
            </Button>
            <Button id={CANCEL_ID} variant="ghost" disabled={step === "running"} onClick={handleCancel}>
              {t("demoReset.cancel")}
            </Button>
          </>
        )}
      </div>
      <p id="demo-reset-note" className="text-xs text-fg-muted">
        {t("demoReset.note")}
      </p>
      <div role="status" aria-live="polite">
        {failure !== null && (
          <p className="flex items-start gap-1.5 text-xs text-fg-muted">
            <InfoIcon className="mt-0.5 size-4 shrink-0" />
            <span>{t("demoReset.failed", { reason: failure })}</span>
          </p>
        )}
      </div>
    </div>
  );
}
