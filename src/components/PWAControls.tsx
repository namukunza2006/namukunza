import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  onFallbackAction?: () => void;
  fallbackLabel?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  onFallbackAction,
  fallbackLabel = 'Voix Live',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    if (!onFallbackAction) return null;
    return (
      <button
        type="button"
        onClick={onFallbackAction}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 whitespace-nowrap shrink-0"
      >
        {fallbackLabel}
      </button>
    );
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Installer sur Android
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 whitespace-nowrap shrink-0"
      >
        <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
        App Android
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-sky-900/50 bg-[#0B1120] p-6 text-slate-100 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <h3 id="pwa-guide-title" className="font-display text-lg font-semibold text-white">
                Installer namukunzAI sur mobile
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Fermer"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {isIOS ? (
              <ol className="mt-4 space-y-2.5 text-sm leading-relaxed text-slate-300">
                <li>1. Appuyez sur le bouton Partager dans la barre Safari.</li>
                <li>2. Faites défiler et sélectionnez Sur l’écran d’accueil.</li>
                <li>3. Confirmez pour lancer namukunzAI en plein écran.</li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-2.5 text-sm leading-relaxed text-slate-300">
                <li>1. Ouvrez le menu de Chrome sur Android (icône ⋮ en haut à droite).</li>
                <li>2. Appuyez sur Installer l’application ou Ajouter à l’écran d’accueil.</li>
                <li>3. L’application autonome namukunzAI apparaîtra sur votre téléphone.</li>
              </ol>
            )}
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-6 min-h-[44px] w-full rounded-xl bg-sky-500 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400"
            >
              Compris
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 left-4 z-50 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-[#0B1120] px-3 py-2 text-xs font-medium text-amber-300 shadow-lg lg:bottom-4"
    >
      <span aria-hidden="true">▲</span>
      <span>Mode hors ligne — Tâches locales actives</span>
    </div>
  );
};
