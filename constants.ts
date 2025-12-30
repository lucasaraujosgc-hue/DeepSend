import { Company, Task, TaskStatus, TaskPriority, Document, ScheduledMessage, UserSettings } from './types';

export const DOCUMENT_CATEGORIES = [
  'Simples Nacional', 'Honorários', 'Contracheque', 'FGTS', 'INSS', 
  'Folha de Pagamento', 'Rescisão', 'Férias', 'Notas Fiscais', 'Parcelamento', 'Outros'
];

export const MOCK_COMPANIES: Company[] = [
  { id: 1, name: 'Tech Solutions Ltda', docNumber: '12.345.678/0001-90', type: 'CNPJ', email: 'contato@tech.com', whatsapp: '(11) 99999-0001' },
  { id: 2, name: 'Padaria do João', docNumber: '98.765.432/0001-10', type: 'MEI', email: 'joao@padaria.com', whatsapp: '(11) 99999-0002' },
  { id: 3, name: 'Consultoria Silva', docNumber: '111.222.333-44', type: 'CPF', email: 'silva@email.com', whatsapp: '(11) 99999-0003' },
];

export const MOCK_TASKS: Task[] = [
  { id: 1, title: 'Fechar Folha Tech Solutions', description: 'Calcular horas extras', status: TaskStatus.PENDING, priority: TaskPriority.HIGH, color: '#ef4444', companyId: 1, dueDate: '2023-10-05' },
  { id: 2, title: 'DAS Padaria', description: 'Gerar guia do MEI', status: TaskStatus.IN_PROGRESS, priority: TaskPriority.MEDIUM, color: '#3b82f6', companyId: 2, dueDate: '2023-10-20' },
  { id: 3, title: 'Imposto de Renda Silva', description: 'Coletar recibos', status: TaskStatus.DONE, priority: TaskPriority.LOW, color: '#10b981', companyId: 3 },
];

export const MOCK_DOCUMENTS: Document[] = [
  { id: 1, name: 'Folha_Pagamento_09_2023.pdf', category: 'Folha de Pagamento', competence: '09/2023', dueDate: '05/10/2023', status: 'pending', companyId: 1, companyName: 'Tech Solutions Ltda' },
  { id: 2, name: 'FGTS_09_2023.pdf', category: 'FGTS', competence: '09/2023', dueDate: '07/10/2023', status: 'sent', companyId: 1, companyName: 'Tech Solutions Ltda' },
  { id: 3, name: 'DAS_09_2023.pdf', category: 'Simples Nacional', competence: '09/2023', dueDate: '20/10/2023', status: 'pending', companyId: 2, companyName: 'Padaria do João' },
];

export const MOCK_MESSAGES: ScheduledMessage[] = [
  { 
    id: 1, 
    title: 'Lembrete de Honorários', 
    nextRun: '2023-10-10 09:00', 
    recurrence: 'mensal', 
    active: true, 
    type: 'message',
    channels: { email: true, whatsapp: true },
    targetType: 'normal'
  },
  { 
    id: 2, 
    title: 'Envio de Folha', 
    nextRun: '2023-10-05 14:00', 
    recurrence: 'mensal', 
    active: true, 
    type: 'documents',
    channels: { email: true, whatsapp: false },
    targetType: 'mei'
  },
];

export const DEFAULT_USER_SETTINGS: UserSettings = {
  emailSignature: `<html>
    <body style="font-family: Arial, sans-serif; color: #2c3e50; line-height: 1.6;">
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px;">
        <strong>Prezados (a),</strong><br>
            {mensagem_html}
        </div>
        <p>Atenciosamente,</p>
        <div style="margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee;">
            <strong>Lucas Araújo</strong><br>
            <span style="color: #555;">Contador | CRC-BA 046968/O</span><br>
            <strong>(75) 98120-0125</strong><br>
        </div>
    </body>
</html>`,
  whatsappTemplate: `Olá! Segue documento referente a {competencia}. Qualquer dúvida estamos à disposição.`,
  visibleDocumentCategories: [
    'Simples Nacional', 
    'Folha de Pagamento', 
    'FGTS', 
    'INSS', 
    'Honorários',
    'Notas Fiscais'
  ],
  categoryKeywords: {
    'FGTS': ['fgts mensal'],
    'Folha de Pagamento': ['Extrato Mensal'],
    'Parcelamento': ['Parcelamento'],
    'Simples Nacional': ['simples nacional', 'das'],
    'INSS': ['cp seguros', 'cp segurados'],
    'Notas Fiscais': ['nota fiscal'],
    'Honorários': ['um banco', 'cora.com.br']
  }
};