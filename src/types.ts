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

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ExecutedTaskAction {
  action: 'create' | 'toggle' | 'delete' | 'list';
  summary: string;
  task?: DailyTask;
}

export type AvatarEmotionState =
  | 'neutral'
  | 'curious'
  | 'focused'
  | 'analytical'
  | 'resolved'
  | 'warm'
  | 'alert';

export interface SentimentMetadata {
  state: AvatarEmotionState;
  intensity: number;
  complexity: number;
  intent: string;
}

export interface VisemeKeyframe {
  timeMs: number;
  durationMs: number;
  viseme: string;
  phoneme: string;
  weight: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  sources?: GroundingSource[];
  actions?: ExecutedTaskAction[];
  mode?: 'voice' | 'text';
  attachmentName?: string;
  sentiment?: SentimentMetadata;
  isStreaming?: boolean;
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

export type GideonState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type ActiveTab = 'gideon' | 'sciences' | 'donnees' | 'taches';

export type ThinkingDepth = 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';
