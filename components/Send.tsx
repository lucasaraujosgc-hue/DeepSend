
import React, { useState, useEffect } from 'react';
import { Send as SendIcon, Mail, MessageCircle, FileText, Trash, Clock, Check, Info, ArrowLeft, X, CheckSquare, Calendar, Loader2 } from 'lucide-react';
import { Document, Company } from '../types';
import { api } from '../services/api';

interface SendProps {
  documents: Document[];
  onSendDocuments: (ids: number[]) => void;
  onNavigateToDocuments: () => void;
}

const Send: React.FC<SendProps> = ({ documents, onSendDocuments, onNavigateToDocuments }) => {
  const [competence, setCompetence] = useState('09/2023');
  const [subject, setSubject] = useState('Documentos Contábeis');
  const [message, setMessage] = useState('Prezados, seguem em anexo os documentos solicitados.');
  
  const [sendEmail, setSendEmail] = useState(true);
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  
  const [selectedDocs, setSelectedDocs] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleChannels, setScheduleChannels] = useState({ email: true, whatsapp: false });

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  useEffect(() => {
    setLoadingCompanies(true);
    api.getCompanies()
        .then(data => setCompanies(data))
        .catch(err => console.error(err))
        .finally(() => setLoadingCompanies(false));
  }, []);

  const pendingDocs = documents.filter(doc => doc.status === 'pending' && doc.competence === competence);

  const docsByCompany = pendingDocs.reduce((acc, doc) => {
    if (!acc[doc.companyId]) acc[doc.companyId] = [];
    acc[doc.companyId].push(doc);
    return acc;
  }, {} as Record<number, Document[]>);

  const getCompanyDetails = (id: number) => companies.find(c => c.id === id);

  const toggleDocSelection = (id: number) => setSelectedDocs(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);

  const toggleCompanySelection = (companyId: number, companyDocs: Document[]) => {
    const allSelected = companyDocs.every(d => selectedDocs.includes(d.id));
    if (allSelected) {
      const idsToRemove = companyDocs.map(d => d.id);
      setSelectedDocs(prev => prev.filter(id => !idsToRemove.includes(id)));
    } else {
      const idsToAdd = companyDocs.map(d => d.id);
      setSelectedDocs(prev => [...new Set([...prev, ...idsToAdd])]);
    }
  };

  const handleSend = async () => {
    if (selectedDocs.length === 0) return alert('Selecione documentos.');
    if (!sendEmail && !sendWhatsapp) return alert('Selecione canal de envio.');

    setIsProcessing(true);
    try {
      // Agrupar documentos selecionados por empresa para enviar um único contato por empresa
      const selectedByCompany = selectedDocs.reduce((acc, docId) => {
          const doc = documents.find(d => d.id === docId);
          if (doc) {
              if (!acc[doc.companyId]) acc[doc.companyId] = [];
              acc[doc.companyId].push(doc);
          }
          return acc;
      }, {} as Record<number, Document[]>);

      // Fix: Cast Object.entries to correct tuple array to avoid 'unknown' docs value
      for (const [compId, docs] of Object.entries(selectedByCompany) as [string, Document[]][]) {
          const company = getCompanyDetails(Number(compId));
          if (!company) continue;

          const files = docs.map(d => d.file).filter(f => !!f) as File[];

          if (sendEmail && company.email) {
              await api.sendEmail({
                  to: company.email,
                  subject,
                  html: `<p>${message}</p>`,
                  attachments: files
              });
          }

          if (sendWhatsapp && company.whatsapp) {
              await api.sendWhatsApp({
                  to: company.whatsapp,
                  message,
                  attachments: files
              });
          }
      }

      onSendDocuments(selectedDocs);
      setSelectedDocs([]);
      alert('Documentos enviados com sucesso!');
    } catch (e) {
      alert("Erro ao enviar: " + (e as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const allPendingIds = pendingDocs.map(d => d.id);
  const isGlobalSelected = allPendingIds.length > 0 && allPendingIds.every(id => selectedDocs.includes(id));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2">
          <SendIcon className="w-6 h-6 text-blue-600" /> Envio de Documentos
          <span className="text-base font-normal text-gray-500">- Competência: {competence}</span>
      </h2>

      <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                  <label className="block text-sm font-semibold mb-1">Assunto</label>
                  <input type="text" className="w-full border rounded-lg px-3 py-2" value={subject} onChange={e => setSubject(e.target.value)} />
              </div>
              <div>
                  <label className="block text-sm font-semibold mb-1">Competência</label>
                  <input type="text" className="w-full border rounded-lg px-3 py-2" value={competence} onChange={e => setCompetence(e.target.value)} />
              </div>
          </div>
          <div>
              <label className="block text-sm font-semibold mb-1">Mensagem</label>
              <textarea className="w-full border rounded-lg px-3 py-2 h-20" value={message} onChange={e => setMessage(e.target.value)} />
          </div>
      </div>

      <div className="space-y-4">
          {/* Fix: Explicitly cast Object.entries to [string, Document[]][] to avoid 'unknown' type issues with companyDocs */}
          {(Object.entries(docsByCompany) as [string, Document[]][]).map(([companyId, companyDocs]) => {
              const company = getCompanyDetails(Number(companyId));
              return (
                  <div key={companyId} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                      <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
                          <div>
                              <div className="font-bold">{company?.name || `Empresa ID: ${companyId}`}</div>
                              <div className="text-xs opacity-90">{company?.email} | {company?.whatsapp}</div>
                          </div>
                          <button onClick={() => toggleCompanySelection(Number(companyId), companyDocs)} className="bg-blue-700 px-3 py-1 rounded text-xs">
                              {companyDocs.every(d => selectedDocs.includes(d.id)) ? 'Desmarcar Todos' : 'Selecionar Todos'}
                          </button>
                      </div>
                      <table className="w-full text-sm">
                          <tbody className="divide-y">
                              {companyDocs.map(doc => (
                                  <tr key={doc.id}>
                                      <td className="p-3 w-10">
                                          <input type="checkbox" checked={selectedDocs.includes(doc.id)} onChange={() => toggleDocSelection(doc.id)} />
                                      </td>
                                      <td className="p-3 font-medium">{doc.name}</td>
                                      <td className="p-3 text-gray-500">{doc.category}</td>
                                      <td className="p-3 text-gray-500">{doc.dueDate}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              );
          })}
      </div>

      <div className="bg-white p-6 rounded-xl border flex flex-col md:flex-row gap-6 items-center justify-between">
          <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
                  <span className="flex items-center gap-1 text-sm font-bold"><Mail className="w-4 h-4 text-blue-500" /> E-mail</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={sendWhatsapp} onChange={e => setSendWhatsapp(e.target.checked)} />
                  <span className="flex items-center gap-1 text-sm font-bold"><MessageCircle className="w-4 h-4 text-green-500" /> WhatsApp</span>
              </label>
          </div>
          <div className="flex gap-3">
              <button onClick={onNavigateToDocuments} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={handleSend} disabled={isProcessing} className="bg-blue-600 text-white px-8 py-2 rounded-lg font-bold disabled:opacity-50 flex items-center gap-2">
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendIcon className="w-4 h-4" />}
                  Enviar Agora
              </button>
          </div>
      </div>
    </div>
  );
};

export default Send;
