import React, { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import type { DailyTask, TaskCategory, TaskPriority } from '../types';

interface TasksPanelProps {
  tasks: DailyTask[];
  onCreateTask: (input: {
    title: string;
    category: TaskCategory;
    priority: TaskPriority;
    dueTime: string;
  }) => Promise<void>;
  onToggleTask: (id: string, completed: boolean) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
}

type TaskFilter = 'all' | 'pending' | 'high' | 'completed';

const CATEGORIES: TaskCategory[] = ['Quotidien', 'Sciences', 'Informatique', 'Analyse'];
const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'haute', label: 'Priorité haute' },
  { value: 'normale', label: 'Priorité normale' },
  { value: 'basse', label: 'Priorité basse' },
];

export const TasksPanel: React.FC<TasksPanelProps> = ({
  tasks,
  onCreateTask,
  onToggleTask,
  onDeleteTask,
}) => {
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TaskCategory>('Quotidien');
  const [priority, setPriority] = useState<TaskPriority>('normale');
  const [dueTime, setDueTime] = useState('14:00');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'pending') return !t.completed;
    if (filter === 'high') return t.priority === 'haute' && !t.completed;
    if (filter === 'completed') return t.completed;
    return true;
  });

  const pendingCount = tasks.filter((t) => !t.completed).length;
  const completedCount = tasks.filter((t) => t.completed).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onCreateTask({ title: title.trim(), category, priority, dueTime });
      setTitle('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="flex flex-col gap-5">
      {/* Header & Summary */}
      <div className="rounded-2xl border border-sky-900/40 bg-[#080E1A] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-white sm:text-lg">
              Gestion des Tâches Quotidiennes
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              <span className="font-mono tabular-nums text-sky-300">{pendingCount}</span> en cours
              <span className="mx-2" aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-slate-300">{completedCount}</span> terminées
              <span className="mx-2" aria-hidden="true">·</span>
              <span>Pilotable à la voix avec Gideon</span>
            </p>
          </div>

          <div
            role="group"
            aria-label="Filtrer les tâches"
            className="flex items-center rounded-lg border border-sky-900/40 bg-[#050810] p-0.5"
          >
            {[
              { id: 'all' as TaskFilter, label: 'Toutes' },
              { id: 'pending' as TaskFilter, label: 'À faire' },
              { id: 'high' as TaskFilter, label: 'Prioritaires' },
              { id: 'completed' as TaskFilter, label: 'Terminées' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`min-h-[34px] rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  filter === tab.id
                    ? 'bg-sky-500/20 text-sky-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Add Task Form */}
        <form onSubmit={handleSubmit} className="mt-4 grid gap-2.5 sm:grid-cols-12">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nouvelle tâche quotidienne..."
            className="min-h-[44px] rounded-xl border border-sky-900/50 bg-[#050810] px-3.5 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none sm:col-span-5"
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TaskCategory)}
            aria-label="Catégorie"
            className="min-h-[44px] rounded-xl border border-sky-900/50 bg-[#050810] px-3 text-xs text-slate-200 focus:border-sky-500 focus:outline-none sm:col-span-2"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            aria-label="Priorité"
            className="min-h-[44px] rounded-xl border border-sky-900/50 bg-[#050810] px-3 text-xs text-slate-200 focus:border-sky-500 focus:outline-none sm:col-span-2"
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            aria-label="Heure"
            placeholder="14:00"
            className="min-h-[44px] rounded-xl border border-sky-900/50 bg-[#050810] px-3 font-mono text-xs text-slate-200 focus:border-sky-500 focus:outline-none sm:col-span-1"
          />

          <button
            type="submit"
            disabled={isSubmitting || !title.trim()}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-sky-500 px-4 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-40 sm:col-span-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Ajouter
          </button>
        </form>
      </div>

      {/* Task List */}
      <div className="overflow-hidden rounded-2xl border border-sky-900/40 bg-[#080E1A]">
        {filteredTasks.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-400">
            Aucune tâche dans cette catégorie. Demandez à Gideon d’en planifier une à la voix.
          </div>
        ) : (
          <ul className="divide-y divide-sky-900/30">
            {filteredTasks.map((task) => {
              const priorityLabel =
                task.priority === 'haute'
                  ? '▲ Priorité haute'
                  : task.priority === 'basse'
                    ? 'Priorité basse'
                    : 'Priorité normale';
              const priorityColor =
                task.priority === 'haute' && !task.completed
                  ? 'text-amber-300'
                  : 'text-slate-400';

              return (
                <li
                  key={task.id}
                  className="flex min-h-[60px] items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#0B1120]"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <button
                      type="button"
                      onClick={() => onToggleTask(task.id, !task.completed)}
                      aria-label={
                        task.completed
                          ? `Marquer "${task.title}" comme à faire`
                          : `Marquer "${task.title}" comme terminée`
                      }
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                        task.completed
                          ? 'border-sky-500/60 bg-sky-500/20 text-sky-200'
                          : 'border-sky-900/60 bg-[#050810] text-transparent hover:border-sky-500/50'
                      }`}
                    >
                      <Check className="h-4 w-4" />
                    </button>

                    <div className="min-w-0 flex-1 pt-0.5">
                      <p
                        className={`text-sm font-medium leading-snug ${
                          task.completed ? 'text-slate-500 line-through' : 'text-slate-100'
                        }`}
                      >
                        {task.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                        <span className="text-sky-300/90">{task.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{task.dueTime}</span>
                        <span aria-hidden="true">·</span>
                        <span className={priorityColor}>{priorityLabel}</span>
                      </div>
                      {task.notes && (
                        <p className="mt-1 text-xs text-slate-400">{task.notes}</p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteTask(task.id)}
                    aria-label={`Supprimer "${task.title}"`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};
