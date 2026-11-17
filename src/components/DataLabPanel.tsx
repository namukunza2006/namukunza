import React, { useRef, useState } from 'react';
import { BarChart3, FileUp, Plus, Volume2, X } from 'lucide-react';
import type { DataAnalysisResult, TaskCategory, TaskPriority } from '../types';

interface DataLabPanelProps {
  onSpeakSummary: (text: string) => void;
  onAddRecommendationTask: (input: {
    title: string;
    category: TaskCategory;
    priority: TaskPriority;
  }) => Promise<void>;
}

const SAMPLE_DATASETS = [
  {
    name: 'Télémétrie Réseau & Latence P99',
    focus: 'Détecter les pics de latence, corréler la saturation CPU et recommander une architecture de mise en cache.',
    data: `timestamp,latency_p99_ms,throughput_rps,cpu_util_pct,error_rate_pct
10:00,42,1240,38,0.12
10:15,48,1390,44,0.14
10:30,63,1680,58,0.21
10:45,129,2150,82,0.89
11:00,284,2490,94,2.45
11:15,312,2410,96,3.10
11:30,95,1820,66,0.42
11:45,51,1420,45,0.15`,
  },
  {
    name: 'Cinétique Enzymatique & Rendement',
    focus: 'Modéliser le seuil thermique optimal et identifier la dénaturation au-delà de 55°C.',
    data: `temperature_C,reaction_rate_umol_min,substrate_conversion_pct,stability_index
20,14.2,32.5,99.4
25,21.8,47.0,99.1
30,33.4,64.2,98.6
37,48.9,84.5,97.8
45,56.1,91.2,94.0
50,53.8,88.6,86.5
55,39.2,69.4,68.2
60,18.5,38.0,41.0`,
  },
];

function InteractiveTelemetryChart({ analysis }: { analysis: DataAnalysisResult }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const points = analysis.chartData.slice(0, 12);

  if (points.length === 0) return null;

  const width = 640;
  const height = 240;
  const padX = 48;
  const padY = 28;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const allValues = points.flatMap((p) => [p.value, p.secondaryValue]);
  const maxVal = Math.max(...allValues, 1);
  const minVal = Math.min(...allValues, 0);
  const span = Math.max(maxVal - minVal, 1e-6);

  const getX = (idx: number) =>
    points.length === 1 ? padX + plotW / 2 : padX + (idx / (points.length - 1)) * plotW;
  const getY = (val: number) => padY + plotH - ((val - minVal) / span) * plotH;

  if (analysis.chartType === 'radar' && points.length >= 3) {
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(plotW, plotH) * 0.42;
    const levels = [0.25, 0.5, 0.75, 1];

    const polyPoints = (accessor: (p: (typeof points)[number]) => number) =>
      points
        .map((p, i) => {
          const angle = (i / points.length) * Math.PI * 2 - Math.PI / 2;
          const norm = Math.max(0.05, (accessor(p) - minVal) / span);
          return `${cx + Math.cos(angle) * radius * norm},${cy + Math.sin(angle) * radius * norm}`;
        })
        .join(' ');

    return (
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full cursor-crosshair">
          {levels.map((lvl) => (
            <polygon
              key={lvl}
              points={points
                .map((_, i) => {
                  const angle = (i / points.length) * Math.PI * 2 - Math.PI / 2;
                  return `${cx + Math.cos(angle) * radius * lvl},${cy + Math.sin(angle) * radius * lvl}`;
                })
                .join(' ')}
              fill="none"
              stroke="rgba(56, 189, 248, 0.16)"
              strokeWidth="1"
            />
          ))}
          {points.map((p, i) => {
            const angle = (i / points.length) * Math.PI * 2 - Math.PI / 2;
            const lx = cx + Math.cos(angle) * (radius + 20);
            const ly = cy + Math.sin(angle) * (radius + 16);
            return (
              <g key={i}>
                <line
                  x1={cx}
                  y1={cy}
                  x2={cx + Math.cos(angle) * radius}
                  y2={cy + Math.sin(angle) * radius}
                  stroke="rgba(56, 189, 248, 0.18)"
                />
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-slate-400 font-mono text-[10px]"
                >
                  {p.label.slice(0, 10)}
                </text>
              </g>
            );
          })}
          <polygon
            points={polyPoints((p) => p.value)}
            fill="rgba(56, 189, 248, 0.22)"
            stroke="#38BDF8"
            strokeWidth="2"
          />
          <polygon
            points={polyPoints((p) => p.secondaryValue)}
            fill="rgba(245, 158, 11, 0.12)"
            stroke="#F59E0B"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        </svg>
      </div>
    );
  }

  const primaryPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.value).toFixed(1)}`)
    .join(' ');
  const secondaryPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.secondaryValue).toFixed(1)}`)
    .join(' ');

  const hovered = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-56 w-full cursor-crosshair select-none"
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padY + plotH * (1 - t);
          const val = minVal + span * t;
          return (
            <g key={t}>
              <line
                x1={padX}
                y1={y}
                x2={width - padX}
                y2={y}
                stroke="rgba(56, 189, 248, 0.12)"
                strokeWidth="1"
              />
              <text
                x={padX - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-slate-500 font-mono text-[10px] tabular-nums"
              >
                {val >= 100 ? Math.round(val) : val.toFixed(1)}
              </text>
            </g>
          );
        })}

        {analysis.chartType === 'bar' ? (
          points.map((p, i) => {
            const barGroupW = plotW / points.length;
            const barW = Math.max(8, barGroupW * 0.32);
            const cx = padX + i * barGroupW + barGroupW / 2;
            const y1 = getY(p.value);
            const y2 = getY(p.secondaryValue);
            return (
              <g key={i} onMouseEnter={() => setHoveredIdx(i)}>
                <rect
                  x={cx - barW - 1}
                  y={y1}
                  width={barW}
                  height={Math.max(2, padY + plotH - y1)}
                  rx="2"
                  fill="#38BDF8"
                  fillOpacity="0.85"
                />
                <rect
                  x={cx + 1}
                  y={y2}
                  width={barW}
                  height={Math.max(2, padY + plotH - y2)}
                  rx="2"
                  fill="#F59E0B"
                  fillOpacity="0.7"
                />
                <text
                  x={cx}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-slate-400 font-mono text-[10px]"
                >
                  {p.label.slice(0, 7)}
                </text>
              </g>
            );
          })
        ) : (
          <>
            <path d={secondaryPath} fill="none" stroke="#F59E0B" strokeWidth="1.75" strokeDasharray="5 4" />
            <path d={primaryPath} fill="none" stroke="#38BDF8" strokeWidth="2.25" />
            {points.map((p, i) => {
              const x = getX(i);
              const y = getY(p.value);
              return (
                <g key={i} onMouseEnter={() => setHoveredIdx(i)}>
                  <rect
                    x={x - plotW / (points.length * 2)}
                    y={padY}
                    width={plotW / points.length}
                    height={plotH}
                    fill="transparent"
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r={hoveredIdx === i ? 5 : 3}
                    fill="#E0F2FE"
                    stroke="#0EA5E9"
                    strokeWidth="2"
                  />
                  <text
                    x={x}
                    y={height - 6}
                    textAnchor="middle"
                    className="fill-slate-400 font-mono text-[10px]"
                  >
                    {p.label.slice(0, 7)}
                  </text>
                </g>
              );
            })}
          </>
        )}

        {hoveredIdx !== null && analysis.chartType !== 'bar' && (
          <line
            x1={getX(hoveredIdx)}
            y1={padY}
            x2={getX(hoveredIdx)}
            y2={padY + plotH}
            stroke="rgba(224, 242, 254, 0.35)"
            strokeDasharray="3 3"
          />
        )}
      </svg>

      {hovered && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-900/40 bg-[#050810] px-3 py-1.5 font-mono text-xs tabular-nums">
          <span className="text-slate-300">{hovered.label}</span>
          <span className="text-sky-300">
            {analysis.chartPrimaryLabel}: {hovered.value}
          </span>
          <span className="text-amber-300">
            {analysis.chartSecondaryLabel}: {hovered.secondaryValue}
          </span>
        </div>
      )}
    </div>
  );
}

export const DataLabPanel: React.FC<DataLabPanelProps> = ({
  onSpeakSummary,
  onAddRecommendationTask,
}) => {
  const [datasetText, setDatasetText] = useState(SAMPLE_DATASETS[0].data);
  const [focusPrompt, setFocusPrompt] = useState(SAMPLE_DATASETS[0].focus);
  const [attachment, setAttachment] = useState<{
    mimeType: string;
    data: string;
    name: string;
  } | null>(null);
  const [analysis, setAnalysis] = useState<DataAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedIndices, setAddedIndices] = useState<number[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (
      file.type.startsWith('text/') ||
      /\.(csv|json|txt|log|md|py|ts|js)$/i.test(file.name)
    ) {
      const textReader = new FileReader();
      textReader.onload = () => {
        setDatasetText(typeof textReader.result === 'string' ? textReader.result : '');
        setAttachment(null);
      };
      textReader.readAsText(file);
    } else {
      const dataReader = new FileReader();
      dataReader.onload = () => {
        const res = typeof dataReader.result === 'string' ? dataReader.result : '';
        const base64 = res.includes(',') ? res.split(',')[1] : '';
        if (base64) {
          setAttachment({ mimeType: file.type || 'application/octet-stream', data: base64, name: file.name });
        }
      };
      dataReader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const runAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsAnalyzing(true);
    setAddedIndices([]);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetText,
          focusPrompt,
          attachment: attachment ?? undefined,
        }),
      });
      const json = (await res.json()) as { analysis?: DataAnalysisResult; error?: string };
      if (!res.ok || !json.analysis) {
        throw new Error(json.error || 'Échec de l’analyse.');
      }
      setAnalysis(json.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur analytique.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCreateTask = async (rec: string, idx: number) => {
    await onAddRecommendationTask({
      title: rec,
      category: 'Analyse',
      priority: 'haute',
    });
    setAddedIndices((prev) => [...prev, idx]);
  };

  return (
    <section className="flex flex-col gap-5">
      {/* Input Console */}
      <form
        onSubmit={runAnalysis}
        className="rounded-2xl border border-sky-900/40 bg-[#080E1A] p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-white sm:text-lg">
              Synthèse de Données en Temps Réel
            </h2>
            <p className="text-xs text-slate-400">
              Importez un jeu CSV, JSON, logs techniques ou une image scientifique.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {SAMPLE_DATASETS.map((sample) => (
              <button
                key={sample.name}
                type="button"
                onClick={() => {
                  setDatasetText(sample.data);
                  setFocusPrompt(sample.focus);
                  setAttachment(null);
                }}
                className="min-h-[36px] rounded-lg border border-sky-900/50 bg-[#0B1120] px-3 text-xs font-medium text-sky-200 transition-colors hover:border-sky-500/50"
              >
                {sample.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <input
            type="text"
            value={focusPrompt}
            onChange={(e) => setFocusPrompt(e.target.value)}
            placeholder="Axe d'analyse (ex: anomalies, corrélation, prévision)..."
            className="min-h-[44px] w-full rounded-xl border border-sky-900/50 bg-[#050810] px-3.5 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          />

          <textarea
            value={datasetText}
            onChange={(e) => setDatasetText(e.target.value)}
            rows={5}
            placeholder="Collez vos données brutes (CSV, JSON, séries temporelles, mesures)..."
            className="w-full rounded-xl border border-sky-900/50 bg-[#050810] p-3.5 font-mono text-xs leading-relaxed text-sky-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          />

          {attachment && (
            <div className="flex items-center justify-between rounded-lg border border-sky-800/50 bg-[#0B1120] px-3 py-2 text-xs text-sky-200">
              <span className="truncate">Fichier chargé : {attachment.name}</span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="ml-2 p-1 text-slate-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,.txt,.log,.md,.py,.ts,.js,image/*,.pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-sky-900/50 bg-[#0B1120] px-4 text-xs font-medium text-slate-200 transition-colors hover:border-sky-500/50"
            >
              <FileUp className="h-4 w-4 text-sky-400" aria-hidden="true" />
              Charger un fichier
            </button>

            <button
              type="submit"
              disabled={isAnalyzing}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-sky-500 px-5 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50"
            >
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              {isAnalyzing ? 'Synthèse en cours...' : 'Analyser & Synthétiser'}
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-xs font-medium text-rose-400">✖ {error}</p>
        )}
      </form>

      {/* Structured Analysis Output */}
      {analysis && (
        <div className="space-y-5">
          {/* Executive Synthesis */}
          <div className="rounded-2xl border border-sky-900/40 bg-[#080E1A] p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-sky-300">{analysis.domain}</p>
                <h3 className="mt-0.5 font-display text-lg font-semibold text-white">
                  {analysis.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onSpeakSummary(analysis.executiveSummary)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-sky-700/50 bg-[#0B1120] px-3.5 text-xs font-semibold text-sky-200 transition-colors hover:bg-slate-800"
              >
                <Volume2 className="h-4 w-4" aria-hidden="true" />
                Lire la synthèse
              </button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-200">
              {analysis.executiveSummary}
            </p>
          </div>

          {/* 4-Column Precision Metric Strip */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {analysis.keyMetrics.map((m, idx) => {
              const statusGlyph =
                m.status === 'critique'
                  ? '✖ Critique'
                  : m.status === 'attention'
                    ? '▲ Attention'
                    : '● Nominal';
              const statusTone =
                m.status === 'critique'
                  ? 'text-rose-400'
                  : m.status === 'attention'
                    ? 'text-amber-300'
                    : 'text-emerald-400';

              return (
                <div
                  key={idx}
                  className="rounded-xl border border-sky-900/40 bg-[#0B1120] p-4"
                >
                  <p className="truncate text-xs font-medium text-slate-400">{m.label}</p>
                  <div className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="font-mono text-2xl font-semibold tabular-nums text-white">
                      {m.value}
                    </span>
                    <span className="font-mono text-xs text-slate-400">{m.unit}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 font-mono text-xs tabular-nums">
                    <span className="text-slate-300">{m.delta}</span>
                    <span className={statusTone}>{statusGlyph}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* SVG Visualization */}
          <div className="rounded-2xl border border-sky-900/40 bg-[#080E1A] p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-display text-sm font-semibold text-white">
                {analysis.chartTitle}
              </h4>
              <div className="flex items-center gap-4 font-mono text-xs text-slate-400">
                <span className="text-sky-300">— {analysis.chartPrimaryLabel}</span>
                <span className="text-amber-300">-- {analysis.chartSecondaryLabel}</span>
              </div>
            </div>
            <InteractiveTelemetryChart analysis={analysis} />
          </div>

          {/* Findings & Recommendations */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-sky-900/40 bg-[#080E1A] p-4 sm:p-5">
              <h4 className="font-display text-sm font-semibold text-white">
                Observations scientifiques
              </h4>
              <div className="mt-3 divide-y divide-sky-900/30">
                {analysis.findings.map((f, idx) => (
                  <div key={idx} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-sky-200">{f.heading}</p>
                      <span className="font-mono text-xs tabular-nums text-slate-400">
                        {f.confidence}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">{f.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-sky-900/40 bg-[#080E1A] p-4 sm:p-5">
              <h4 className="font-display text-sm font-semibold text-white">
                Actions recommandées
              </h4>
              <div className="mt-3 divide-y divide-sky-900/30">
                {analysis.recommendations.map((rec, idx) => {
                  const alreadyAdded = addedIndices.includes(idx);
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <p className="text-xs leading-relaxed text-slate-200">{rec}</p>
                      <button
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => handleCreateTask(rec, idx)}
                        className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-sky-800/60 bg-[#0B1120] px-2.5 text-xs font-medium text-sky-200 transition-colors hover:border-sky-500/60 disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        {alreadyAdded ? 'Ajoutée' : 'Tâche'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
