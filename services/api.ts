
import { Company, Task, Document } from '../types';

const API_URL = '/api';

export const api = {
  // Authentication
  login: async (user: string, pass: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, password: pass }),
      });
      
      if (!res.ok) return false;
      
      const data = await res.json();
      return data.success === true;
    } catch (error) {
      console.error("Login failed", error);
      return false;
    }
  },

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

  // Upload Real
  uploadFile: async (file: File): Promise<{ filename: string; originalName: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData
    });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  },

  // Send Documents Real
  sendDocuments: async (payload: { documents: any[], subject: string, messageBody: string, channels: any, emailSignature?: string, whatsappTemplate?: string }): Promise<any> => {
    const res = await fetch(`${API_URL}/send-documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return res.json();
  },

  // Dashboard Data
  getRecentSends: async (): Promise<any[]> => {
    const res = await fetch(`${API_URL}/recent-sends`);
    return res.json();
  },

  // WhatsApp
  getWhatsAppStatus: async (): Promise<{ status: string; qr: string | null; info?: any }> => {
    const res = await fetch(`${API_URL}/whatsapp/status`);
    return res.json();
  },

  disconnectWhatsApp: async (): Promise<void> => {
    await fetch(`${API_URL}/whatsapp/disconnect`, { method: 'POST' });
  }
};
