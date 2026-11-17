export type TaskPriority = 'haute' | 'normale' | 'basse';

export type TaskCategory = 'Sciences' | 'Informatique' | 'Analyse' | 'Quotidien';

export interface DailyTask {
  id: string;
  title: string;
  category: TaskCategory;
  priority: TaskPriority;
  dueTime: string;
  notes: string;
  completed: boolean;
  createdAt: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ExecutedTaskAction {
  action: 'create' | 'toggle' | 'delete' | 'list';
  summary: string;
  task?: DailyTask;
}

export interface DataAnalysisMetric {
  label: string;
  value: string;
  unit: string;
  delta: string;
  status: 'nominal' | 'attention' | 'critique';
}

export interface DataChartPoint {
  label: string;
  value: number;
  secondaryValue: number;
}

export interface DataFinding {
  heading: string;
  detail: string;
  confidence: string;
}

export interface DataAnalysisResult {
  title: string;
  domain: string;
  executiveSummary: string;
  keyMetrics: DataAnalysisMetric[];
  chartType: 'line' | 'bar' | 'radar';
  chartTitle: string;
  chartPrimaryLabel: string;
  chartSecondaryLabel: string;
  chartData: DataChartPoint[];
  findings: DataFinding[];
  recommendations: string[];
}
