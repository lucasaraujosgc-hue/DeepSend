import { Company, Task, Document } from '../types';

const API_URL = '/api';

export const api = {
  // Companies
  getCompanies: async (): Promise<Company[]> => {
    const res = await fetch(`${API_URL}/companies`);
    if (!res.ok) throw new Error('Failed to fetch companies');
    return res.json();
  },

  saveCompany: async (company: Partial<Company>): Promise<{ success: boolean; id: number }> => {
    const res = await fetch(`${API_URL}/companies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(company),
    });
    return res.json();
  },

  deleteCompany: async (id: number): Promise<void> => {
    await fetch(`${API_URL}/companies/${id}`, { method: 'DELETE' });
  },

  // Tasks (Kanban)
  getTasks: async (): Promise<Task[]> => {
    const res = await fetch(`${API_URL}/tasks`);
    if (!res.ok) throw new Error('Failed to fetch tasks');
    return res.json();
  },

  saveTask: async (task: Partial<Task>): Promise<{ success: boolean; id: number }> => {
    const res = await fetch(`${API_URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    });
    return res.json();
  },

  deleteTask: async (id: number): Promise<void> => {
    await fetch(`${API_URL}/tasks/${id}`, { method: 'DELETE' });
  },

  // Document Status
  getDocumentStatuses: async (competence: string): Promise<any[]> => {
    const res = await fetch(`${API_URL}/documents/status?competence=${competence}`);
    return res.json();
  },

  updateDocumentStatus: async (companyId: number, category: string, competence: string, status: string): Promise<void> => {
    await fetch(`${API_URL}/documents/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, category, competence, status }),
    });
  },

  // WhatsApp
  getWhatsAppStatus: async (): Promise<{ status: string; qr: string | null; info?: any }> => {
    const res = await fetch(`${API_URL}/whatsapp/status`);
    return res.json();
  },

  disconnectWhatsApp: async (): Promise<void> => {
    await fetch(`${API_URL}/whatsapp/disconnect`, { method: 'POST' });
  },

  // Envio de E-mail
  sendEmail: async (data: { to: string; subject: string; html: string; attachments: File[] }): Promise<any> => {
    const formData = new FormData();
    formData.append('to', data.to);
    formData.append('subject', data.subject);
    formData.append('html', data.html);
    data.attachments.forEach(file => formData.append('attachments', file));

    const res = await fetch(`${API_URL}/send-email`, {
      method: 'POST',
      body: formData
    });
    return res.json();
  },

  // Envio de WhatsApp
  sendWhatsApp: async (data: { to: string; message: string; attachments: File[] }): Promise<any> => {
    const formData = new FormData();
    formData.append('to', data.to);
    formData.append('message', data.message);
    data.attachments.forEach(file => formData.append('attachments', file));

    const res = await fetch(`${API_URL}/whatsapp/send`, {
      method: 'POST',
      body: formData
    });
    return res.json();
  },

  // Envio em Massa
  bulkSend: async (data: { companyIds: number[]; subject: string; message: string; channels: { email: boolean; whatsapp: boolean } }): Promise<any> => {
    const res = await fetch(`${API_URL}/bulk-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }
};