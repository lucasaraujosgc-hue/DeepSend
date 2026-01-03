
export interface Company {
  id: number;
  name: string;
  docNumber: string; // CPF or CNPJ
  type: 'CNPJ' | 'CPF' | 'MEI';
  email: string;
  whatsapp: string;
}

export enum TaskStatus {
  PENDING = 'pendente',
  IN_PROGRESS = 'em_andamento',
  DONE = 'concluida'
}

export enum TaskPriority {
  LOW = 'baixa',
  MEDIUM = 'media',
  HIGH = 'alta'
}

export interface Task {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  color: string;
  dueDate?: string;
  companyId?: number;
  // Recurrence fields
  recurrence?: 'nenhuma' | 'diaria' | 'semanal' | 'mensal' | 'trimestral' | 'semestral' | 'anual';
  dayOfWeek?: 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado' | 'domingo';
  recurrenceDate?: string;
  targetCompanyType?: 'normal' | 'mei'; 
}

export interface Document {
  id: number;
  name: string;
  category: string;
  competence: string;
  dueDate: string;
  status: 'pending' | 'sent';
  companyId: number;
  companyName: string;
  file?: File; // Optional, might be a manual matrix entry
  serverFilename?: string; // The file saved on server
  isManual?: boolean;
}

export interface ScheduledMessage {
  id: number;
  title: string;
  message?: string;
  nextRun: string;
  recurrence: string;
  active: boolean;
  type: 'message' | 'documents';
  channels: {
    email: boolean;
    whatsapp: boolean;
  };
  targetType: 'normal' | 'mei' | 'selected';
  selectedCompanyIds?: number[];
}

export interface UploadedFile {
  name: string;
  size: number;
  category: string;
  dueDate: string;
  file: File;
  serverFilename?: string;
}

export interface CategoryRule {
  day: number;
  rule: 'antecipado' | 'postergado' | 'quinto_dia_util' | 'ultimo_dia_util' | 'fixo';
}

export interface UserSettings {
  emailSignature: string;
  whatsappTemplate: string;
  visibleDocumentCategories: string[];
  customCategories: string[]; // Novas categorias criadas pelo usuário
  categoryKeywords: Record<string, string[]>;
  priorityCategories: string[]; 
  categoryRules: Record<string, CategoryRule>;
}
