import fs from 'fs';
import path from 'path';
import type { DailyTask, TaskCategory, TaskPriority } from './types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

const DEFAULT_TASKS: DailyTask[] = [
  {
    id: 'task-init-1',
    title: 'Synthétiser les métriques de latence du cluster distribué',
    category: 'Informatique',
    priority: 'haute',
    dueTime: '09:30',
    notes: 'Identifier les goulots d’étranglement P99 et proposer une optimisation de cache.',
    completed: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'task-init-2',
    title: 'Vérifier les équations de diffusion thermique non linéaire',
    category: 'Sciences',
    priority: 'normale',
    dueTime: '14:00',
    notes: 'Contrôler la stabilité numérique du schéma de Crank-Nicolson.',
    completed: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'task-init-3',
    title: 'Revue quotidienne de veille quantique et IA embarquée',
    category: 'Quotidien',
    priority: 'basse',
    dueTime: '18:00',
    notes: 'Résumé vocal rapide avec namukunzAI en fin de journée.',
    completed: true,
    createdAt: new Date().toISOString(),
  },
];

function ensureStore(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(DEFAULT_TASKS, null, 2), 'utf-8');
  }
}

export function listTasks(): DailyTask[] {
  ensureStore();
  try {
    const raw = fs.readFileSync(TASKS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [...DEFAULT_TASKS];
  }
}

function saveTasks(tasks: DailyTask[]): void {
  ensureStore();
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
}

export function createTask(input: {
  title: string;
  category?: TaskCategory;
  priority?: TaskPriority;
  dueTime?: string;
  notes?: string;
}): DailyTask {
  const tasks = listTasks();
  const validCategories: TaskCategory[] = ['Sciences', 'Informatique', 'Analyse', 'Quotidien'];
  const validPriorities: TaskPriority[] = ['haute', 'normale', 'basse'];

  const category = input.category && validCategories.includes(input.category) ? input.category : 'Quotidien';
  const priority = input.priority && validPriorities.includes(input.priority) ? input.priority : 'normale';

  const newTask: DailyTask = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: input.title.trim(),
    category,
    priority,
    dueTime: (input.dueTime || '').trim() || 'Aujourd’hui',
    notes: (input.notes || '').trim(),
    completed: false,
    createdAt: new Date().toISOString(),
  };

  const next = [newTask, ...tasks];
  saveTasks(next);
  return newTask;
}

export function updateTask(
  idOrQuery: string,
  patch: Partial<Pick<DailyTask, 'title' | 'category' | 'priority' | 'dueTime' | 'notes' | 'completed'>>
): DailyTask | null {
  const tasks = listTasks();
  const normalized = idOrQuery.trim().toLowerCase();
  const idx = tasks.findIndex(
    (t) => t.id === idOrQuery || t.title.toLowerCase().includes(normalized)
  );
  if (idx === -1) return null;

  const updated: DailyTask = {
    ...tasks[idx],
    ...patch,
  };
  tasks[idx] = updated;
  saveTasks(tasks);
  return updated;
}

export function toggleTask(idOrQuery: string, completed?: boolean): DailyTask | null {
  const tasks = listTasks();
  const normalized = idOrQuery.trim().toLowerCase();
  const idx = tasks.findIndex(
    (t) => t.id === idOrQuery || t.title.toLowerCase().includes(normalized)
  );
  if (idx === -1) return null;

  const nextCompleted = typeof completed === 'boolean' ? completed : !tasks[idx].completed;
  tasks[idx] = { ...tasks[idx], completed: nextCompleted };
  saveTasks(tasks);
  return tasks[idx];
}

export function deleteTask(idOrQuery: string): DailyTask | null {
  const tasks = listTasks();
  const normalized = idOrQuery.trim().toLowerCase();
  const idx = tasks.findIndex(
    (t) => t.id === idOrQuery || t.title.toLowerCase().includes(normalized)
  );
  if (idx === -1) return null;

  const [removed] = tasks.splice(idx, 1);
  saveTasks(tasks);
  return removed;
}
