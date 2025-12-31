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
  const [subject, setSubject] = useState('Folha de Pagamento');
  const [message, setMessage] = useState('Segue em anexo os seguintes documentos:');
  
  // Instant Send State
  const [sendEmail, setSendEmail] = useState(true);
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  
  // Selection State
  const [selectedDocs, setSelectedDocs] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Scheduling State
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleChannels, setScheduleChannels] = useState({ email: true, whatsapp: false });

  // Real Company Data
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  useEffect(() => {
    setLoadingCompanies(true);
    api.getCompanies()
        .then(data => setCompanies(data))
        .catch(err => console.error(err))
        .finally(() => setLoadingCompanies(false));
  }, []);

  // Filter documents: pending AND matches competence
  const pendingDocs = documents.filter(doc => 
    doc.status === 'pending' && 
    doc.competence === competence
  );

  // Group by Company
  const docsByCompany = pendingDocs.reduce((acc, doc) => {
    if (!acc[doc.companyId]) {
      acc[doc.companyId] = [];
    }
    acc[doc.companyId].push(doc);
    return acc;
  }, {} as Record<number, Document[]>);

  const getCompanyDetails = (id: number) => companies.find(c => c.id === id);

  const toggleDocSelection = (id: number) => {
    setSelectedDocs(prev => 
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  const toggleCompanySelection = (companyId: number, companyDocs: Document[]) => {
    const allSelected = companyDocs.every(d => selectedDocs.includes(d.id));
    if (allSelected) {
      // Deselect all for this company
      const idsToRemove = companyDocs.map(d => d.id);
      setSelectedDocs(prev => prev.filter(id => !idsToRemove.includes(id)));
    } else {
      // Select all for this company
      const idsToAdd = companyDocs.map(d => d.id);
      setSelectedDocs(prev => [...new Set([...prev, ...idsToAdd])]);
    }
  };

  const toggleSelectGlobal = () => {
      const allPendingIds = pendingDocs.map(d => d.id);
      const allSelected = allPendingIds.length > 0 && allPendingIds.every(id => selectedDocs.includes(id));

      if (allSelected) {
          setSelectedDocs([]);
      } else {
          setSelectedDocs(allPendingIds);
      }
  };

  const handleSend = () => {
    if (selectedDocs.length === 0) {
      alert('Selecione pelo menos um documento para enviar.');
      return;
    }
    if (!sendEmail && !sendWhatsapp) {
      alert('Selecione pelo menos um método de envio (E-mail ou WhatsApp).');
      return;
    }

    setIsProcessing(true);
    setTimeout(() => {
      onSendDocuments(selectedDocs);
      setIsProcessing(false);
      setSelectedDocs([]);
      alert('Documentos enviados com sucesso!');
    }, 1500);
  };

  const handleOpenSchedule = () => {
     if (selectedDocs.length === 0) {
      alert('Selecione pelo menos um documento para agendar.');
      return;
    }
    // Initialize modal state
    setScheduleChannels({ email: sendEmail, whatsapp: sendWhatsapp });
    setShowScheduleModal(true);
  };

  const confirmSchedule = () => {
      if (!scheduleDate) {
          alert("Por favor, selecione uma data e hora.");
          return;
      }
      if (!scheduleChannels.email && !scheduleChannels.whatsapp) {
          alert("Selecione pelo menos um canal de envio.");
          return;
      }

      setShowScheduleModal(false);
      
      // Simulate Backend Schedule Creation
      console.log("Agendamento Criado:", {
          documents: selectedDocs,
          date: scheduleDate,
          channels: scheduleChannels,
          smtpUser: "EMAIL_USER_ENV_VAR", // Simulated
          smtpPass: "EMAIL_PASS_ENV_VAR"  // Simulated
      });

      alert(`Agendamento realizado com sucesso para ${scheduleDate}!`);
      setSelectedDocs([]);
      setScheduleDate('');
  }

  const allPendingIds = pendingDocs.map(d => d.id);
  const isGlobalSelected = allPendingIds.length > 0 && allPendingIds.every(id => selectedDocs.includes(id));

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <SendIcon className="w-6 h-6 text-blue-600" /> Envio de Documentos
            <span className="text-base font-normal text-gray-500">- Competência: {competence}</span>
        </h2>
      </div>

      <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg flex items-center gap-2">
         <MessageCircle className="w-5 h-5" /> 
         Status WhatsApp: <span className="text-green-600 font-bold">Conectado</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
         <div className="bg-gray-50 p-4 border-b border-gray-100">
             <h5 className="font-bold text-gray-700 flex items-center gap-2">
                 <Mail className="w-5 h-5" /> Configuração do Envio
             </h5>
         </div>
         <div className="p-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                 <div>
                     <label className="block text-sm font-semibold text-gray-700 mb-1">Assunto do E-mail*</label>
                     <div className="flex">
                         <span className="px-3 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg flex items-center text-gray-500">
                             <Check className="w-4 h-4" />
                         </span>
                         <input 
                            type="text" 
                            className="w-full border border-gray-300 rounded-r-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                         />
                     </div>
                 </div>
                 <div>
                     <label className="block text-sm font-semibold text-gray-700 mb-1">Competência</label>
                     <div className="flex">
                         <span className="px-3 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg flex items-center text-gray-500">
                             <Clock className="w-4 h-4" />
                         </span>
                         <input 
                            type="text" 
                            className="w-full border border-gray-300 rounded-r-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                            value={competence}
                            onChange={(e) => {
                                let val = e.target.value.replace(/\D/g, '');
                                if (val.length > 2) val = val.substring(0, 2) + '/' + val.substring(2, 6);
                                setCompetence(val);
                            }}
                         />
                     </div>
                 </div>
             </div>
             <div>
                 <label className="block text-sm font-semibold text-gray-700 mb-1">Mensagem*</label>
                 <textarea 
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 h-24 outline-none focus:ring-2 focus:ring-blue-500"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                 />
             </div>
         </div>
      </div>

      <div className="mb-4">
          <div className="flex justify-between items-center border-b pb-2 mb-4">
              <h4 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <FileText className="w-6 h-6 text-blue-600" /> Documentos Pendentes
                  {loadingCompanies && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
              </h4>
              {pendingDocs.length > 0 && (
                  <button 
                    onClick={toggleSelectGlobal}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors
                        ${isGlobalSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                      <CheckSquare className="w-4 h-4" />
                      {isGlobalSelected ? 'Desmarcar Todos' : 'Selecionar Todos (Geral)'}
                  </button>
              )}
          </div>

          {Object.keys(docsByCompany).length === 0 ? (
              <div className="bg-blue-50 text-blue-700 p-4 rounded-lg flex items-center gap-2">
                  <Info className="w-5 h-5" /> Não há documentos pendentes para envio nesta competência.
                  <button onClick={onNavigateToDocuments} className="font-bold hover:underline">Voltar</button>
              </div>
          ) : (
              Object.entries(docsByCompany).map(([companyIdStr, companyDocsRaw]) => {
                  const companyId = Number(companyIdStr);
                  const companyDocs = companyDocsRaw as Document[];
                  const company = getCompanyDetails(companyId);
                  const allSelected = companyDocs.every(d => selectedDocs.includes(d.id));

                  return (
                      <div key={companyId} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4">
                          <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
                              <div>
                                  <h5 className="font-bold text-lg">{company?.name || `Empresa ID: ${companyId}`}</h5>
                                  <div className="text-sm opacity-90 flex gap-3">
                                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {company?.email || 'N/A'}</span>
                                      <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {company?.whatsapp || 'N/A'}</span>
                                  </div>
                              </div>
                              <label className="flex items-center gap-2 cursor-pointer bg-blue-700 px-3 py-1 rounded hover:bg-blue-800 transition-colors">
                                  <input 
                                    type="checkbox" 
                                    className="rounded text-blue-600 w-4 h-4"
                                    checked={allSelected}
                                    onChange={() => toggleCompanySelection(companyId, companyDocs)}
                                  />
                                  <span className="text-sm font-medium">Selecionar todos</span>
                              </label>
                          </div>
                          <div className="p-0">
                              <table className="w-full text-sm">
                                  <thead className="bg-gray-50 text-gray-600">
                                      <tr>
                                          <th className="px-4 py-3 w-10">
                                              {/* Toggle All Placeholder */}
                                          </th>
                                          <th className="px-4 py-3 text-left">Documento</th>
                                          <th className="px-4 py-3 text-left">Categoria</th>
                                          <th className="px-4 py-3 text-left">Vencimento</th>
                                          <th className="px-4 py-3 text-center">Status</th>
                                          <th className="px-4 py-3 text-center">Ações</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                      {companyDocs.map(doc => (
                                          <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                                              <td className="px-4 py-3 text-center">
                                                  <input 
                                                    type="checkbox" 
                                                    className="rounded text-blue-600 w-4 h-4"
                                                    checked={selectedDocs.includes(doc.id)}
                                                    onChange={() => toggleDocSelection(doc.id)}
                                                  />
                                              </td>
                                              <td className="px-4 py-3 font-medium text-gray-800 flex items-center gap-2">
                                                  <FileText className="w-4 h-4 text-blue-500" />
                                                  {doc.name || 'Sem nome'}
                                              </td>
                                              <td className="px-4 py-3">
                                                  <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600 font-medium">
                                                      {doc.category}
                                                  </span>
                                              </td>
                                              <td className="px-4 py-3 text-gray-600">
                                                  {doc.dueDate ? <span className="bg-gray-50 px-2 py-1 rounded border">{doc.dueDate}</span> : <span className="text-gray-400">Não informado</span>}
                                              </td>
                                              <td className="px-4 py-3 text-center">
                                                  <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs font-bold uppercase">
                                                      Pendente
                                                  </span>
                                              </td>
                                              <td className="px-4 py-3 text-center">
                                                  <button className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors" title="Remover">
                                                      <Trash className="w-4 h-4" />
                                                  </button>
                                              </td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  );
              })
          )}
      </div>

      {Object.keys(docsByCompany).length > 0 && (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4">
                <div className="bg-gray-50 p-4 border-b border-gray-100">
                    <h5 className="font-bold text-gray-700 flex items-center gap-2">
                        <SendIcon className="w-5 h-5" /> Opções de Envio Imediato
                    </h5>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                            <input 
                                type="checkbox" 
                                className="w-5 h-5 rounded text-blue-600"
                                checked={sendEmail}
                                onChange={(e) => setSendEmail(e.target.checked)}
                            />
                            <div className="flex flex-col">
                                <span className="font-bold text-gray-800 flex items-center gap-2"><Mail className="w-4 h-4 text-blue-500" /> Enviar por E-mail</span>
                            </div>
                        </label>
                        <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                            <input 
                                type="checkbox" 
                                className="w-5 h-5 rounded text-green-600"
                                checked={sendWhatsapp}
                                onChange={(e) => setSendWhatsapp(e.target.checked)}
                            />
                            <div className="flex flex-col">
                                <span className="font-bold text-gray-800 flex items-center gap-2"><MessageCircle className="w-4 h-4 text-green-500" /> Enviar por WhatsApp</span>
                            </div>
                        </label>
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
                <button onClick={onNavigateToDocuments} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2 font-medium">
                    <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <div className="flex gap-3">
                    <button 
                        onClick={handleOpenSchedule}
                        className="px-6 py-2 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 flex items-center gap-2 font-bold"
                    >
                        <Clock className="w-5 h-5" /> Agendar Envio
                    </button>
                    <button 
                        onClick={handleSend}
                        disabled={isProcessing}
                        className="px-8 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-500/20 flex items-center gap-2 font-bold disabled:opacity-70"
                    >
                        {isProcessing ? (
                            <><div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div> Enviando...</>
                        ) : (
                            <><SendIcon className="w-5 h-5" /> Enviar Agora</>
                        )}
                    </button>
                </div>
            </div>
          </>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
                      <h5 className="font-bold flex items-center gap-2"><Clock className="w-5 h-5" /> Agendar Envio de Documentos</h5>
                      <button onClick={() => setShowScheduleModal(false)} className="hover:bg-blue-700 p-1 rounded"><X className="w-5 h-5" /></button>
                  </div>
                  <div className="p-6 space-y-4">
                      
                      {/* Selected Items Summary */}
                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                          <h6 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                             <FileText className="w-4 h-4" /> Resumo da Seleção
                          </h6>
                          <div className="text-sm text-gray-600">
                             Você está agendando o envio de <strong>{selectedDocs.length} documentos</strong>.
                          </div>
                      </div>

                      {/* Date & Time Picker */}
                      <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Data e Hora do Envio*</label>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input 
                                type="datetime-local" 
                                className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" 
                                value={scheduleDate}
                                onChange={(e) => setScheduleDate(e.target.value)}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">O sistema enviará automaticamente neste horário.</p>
                      </div>

                      {/* Channels Selection */}
                      <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Canais de Envio*</label>
                          <div className="grid grid-cols-2 gap-4">
                             <label className={`border rounded-lg p-3 flex items-center gap-2 cursor-pointer transition-colors ${scheduleChannels.email ? 'bg-blue-50 border-blue-500' : 'hover:bg-gray-50'}`}>
                                 <input 
                                    type="checkbox" 
                                    className="w-4 h-4 text-blue-600 rounded"
                                    checked={scheduleChannels.email}
                                    onChange={(e) => setScheduleChannels({...scheduleChannels, email: e.target.checked})}
                                 />
                                 <span className="font-medium text-sm flex items-center gap-1"><Mail className="w-4 h-4" /> E-mail</span>
                             </label>

                             <label className={`border rounded-lg p-3 flex items-center gap-2 cursor-pointer transition-colors ${scheduleChannels.whatsapp ? 'bg-green-50 border-green-500' : 'hover:bg-gray-50'}`}>
                                 <input 
                                    type="checkbox" 
                                    className="w-4 h-4 text-green-600 rounded"
                                    checked={scheduleChannels.whatsapp}
                                    onChange={(e) => setScheduleChannels({...scheduleChannels, whatsapp: e.target.checked})}
                                 />
                                 <span className="font-medium text-sm flex items-center gap-1"><MessageCircle className="w-4 h-4" /> WhatsApp</span>
                             </label>
                          </div>
                      </div>
                  </div>
                  <div className="p-4 border-t flex justify-end gap-3 bg-gray-50">
                      <button onClick={() => setShowScheduleModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg font-medium">Cancelar</button>
                      <button onClick={confirmSchedule} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold">Confirmar Agendamento</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Send;