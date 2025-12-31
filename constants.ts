
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
  emailSignature: `<p>Atenciosamente,</p>
        <div style="margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee;">
            <strong>Lucas Araújo</strong><br>
            <span style="color: #555;">Contador | CRC-BA 046968/O</span><br>
            <strong>(75) 98120-0125</strong><br>
        </div>
    </body>
</html>`,
  whatsappTemplate: `_Esses arquivos também foram enviados por e-mail_

Atenciosamente,
Lucas Araújo`,
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
  },
  categoryRules: {
    'Simples Nacional': { day: 20, rule: 'postergado' },
    'FGTS': { day: 7, rule: 'antecipado' },
    'INSS': { day: 20, rule: 'antecipado' },
    'Honorários': { day: 10, rule: 'postergado' },
    'Folha de Pagamento': { day: 5, rule: 'quinto_dia_util' },
    'Contracheque': { day: 5, rule: 'quinto_dia_util' },
    'Parcelamento': { day: 0, rule: 'ultimo_dia_util' },
    'Notas Fiscais': { day: 1, rule: 'fixo' }, // Exemplo
  }
};
