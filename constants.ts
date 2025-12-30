import { Company, Task, TaskStatus, TaskPriority, Document, ScheduledMessage, UserSettings } from './types';

export const DOCUMENT_CATEGORIES = [
  'Simples Nacional', 'Honorários', 'Contracheque', 'FGTS', 'INSS', 
  'Folha de Pagamento', 'Rescisão', 'Férias', 'Notas Fiscais', 'Parcelamento', 'Outros'
];

export const MOCK_COMPANIES: Company[] = [];

export const MOCK_TASKS: Task[] = [];

export const MOCK_DOCUMENTS: Document[] = [];

export const MOCK_MESSAGES: ScheduledMessage[] = [];

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