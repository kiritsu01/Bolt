import { useRef, useState } from "react";
import { Check, ChevronLeft, Copy, Download, Languages, Upload, Volume2, VolumeX } from "lucide-react";
import { backupSummary, decodeBackup, encodeBackup } from "@/game/backup";
import type { copy, Lang } from "@/game/i18n";
import type { Save } from "@/game/save";

type T = (typeof copy)[Lang];

/** Impostazioni: lingua, audio, esporta e importa il salvataggio (con conferma). */
export function SettingsPage({
  t,
  save,
  onBack,
  onToggleLang,
  onToggleSound,
  onImport,
  onToast,
}: {
  t: T;
  save: Save;
  onBack: () => void;
  onToggleLang: () => void;
  onToggleSound: () => void;
  onImport: (save: Save) => void;
  onToast: (msg: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState("");
  const [bad, setBad] = useState(false);
  const [pending, setPending] = useState<Save | null>(null);
  const exportRef = useRef<HTMLTextAreaElement | null>(null);
  const code = encodeBackup(save);

  async function copyCode() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(code);
      ok = true;
    } catch {
      const el = exportRef.current;
      if (el) {
        el.focus();
        el.select();
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
      }
    }
    if (ok) {
      setCopied(true);
      onToast(t.codeCopied);
    } else {
      exportRef.current?.select();
      onToast(t.shareFail);
    }
  }

  function tryImport() {
    const next = decodeBackup(pasted);
    if (!next) {
      setBad(true);
      return;
    }
    setBad(false);
    setPending(next);
  }

  const summary = pending ? backupSummary(pending) : null;

  return (
    <div className="safe-top safe-bot flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 items-center gap-2">
        <button type="button" aria-label={t.back} onClick={onBack} className="flex size-11 items-center justify-center rounded-full bg-surface text-fg">
          <ChevronLeft className="size-5" />
        </button>
        <h2 className="font-display text-xl font-extrabold">{t.settings}</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <div className="bolt-settings-list">
          <button type="button" className="bolt-setting-row" onClick={onToggleLang}>
            <Languages className="size-5 text-accent" />
            <span className="flex-1">{t.language}</span>
            <span className="text-muted">{t.lang === "English" ? "Italiano" : "English"}</span>
          </button>
          <button type="button" className="bolt-setting-row" onClick={onToggleSound} aria-pressed={save.sound}>
            {save.sound ? <Volume2 className="size-5 text-accent" /> : <VolumeX className="size-5 text-accent" />}
            <span className="flex-1">{t.sound}</span>
            <span className={save.sound ? "bolt-switch is-on" : "bolt-switch"} aria-hidden="true" />
            <span className="sr-only">{save.sound ? t.on : t.off}</span>
          </button>
        </div>

        <section className="bolt-setting-card">
          <h3 className="bolt-setting-title">
            <Download className="size-5 text-accent" />
            {t.exportTitle}
          </h3>
          <p className="text-sm text-pretty text-muted">{t.exportText}</p>
          <textarea
            ref={exportRef}
            className="bolt-code-box"
            value={code}
            readOnly
            rows={3}
            aria-label={t.exportTitle}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={() => void copyCode()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-display font-extrabold text-accent-ink"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? t.codeCopied : t.copyCode}
          </button>
        </section>

        <section className="bolt-setting-card">
          <h3 className="bolt-setting-title">
            <Upload className="size-5 text-accent" />
            {t.importTitle}
          </h3>
          <p className="text-sm text-pretty text-muted">{t.importText}</p>
          <textarea
            className="bolt-code-box"
            value={pasted}
            onChange={(e) => {
              setPasted(e.target.value);
              setBad(false);
            }}
            rows={3}
            placeholder={t.importPlaceholder}
            aria-label={t.importTitle}
            aria-invalid={bad}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          {bad ? (
            <p className="bolt-setting-error" role="alert">
              {t.importBad}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!pasted.trim()}
            onClick={tryImport}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-bg font-display font-semibold disabled:opacity-40"
          >
            <Upload className="size-4" />
            {t.importAction}
          </button>
        </section>
      </div>

      {pending && summary ? (
        <div className="scrim bolt-sheet-wrap bolt-sheet-top" onClick={(e) => e.target === e.currentTarget && setPending(null)}>
          <div className="bolt-rise bolt-sheet rounded-card bg-surface p-6 text-center" role="alertdialog" aria-modal="true" aria-label={t.importConfirmTitle}>
            <p className="font-display text-2xl font-extrabold">{t.importConfirmTitle}</p>
            <p className="mt-2 text-sm text-pretty text-muted">{t.importConfirmText(summary.level, summary.stars, summary.coins)}</p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  onImport(pending);
                  setPending(null);
                  setPasted("");
                  setCopied(false);
                }}
                className="flex h-12 items-center justify-center rounded-2xl bg-accent font-display font-extrabold text-accent-ink"
              >
                {t.importReplace}
              </button>
              <button type="button" onClick={() => setPending(null)} className="h-11 text-sm font-semibold text-muted">
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
