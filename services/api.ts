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
  }
};
