import React, { useState, useEffect } from 'react';
import { Mail, MessageCircle, Calendar, Send, CheckSquare, Square, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
import { Company } from '../types';
import { api } from '../services/api';

const BulkSend: React.FC = () => {
  const [companyType, setCompanyType] = useState<'normal' | 'mei'>('normal');
  const [schedule, setSchedule] = useState(false);
  const [subject, setSubject] = useState('Comunicado Importante');
  const [message, setMessage] = useState(`Prezados,\n\nGostaríamos de informar que...\n\nAtenciosamente,\nEquipe Contábil`);
  const [channels, setChannels] = useState({ email: true, whatsapp: false });
  
  // Real Data
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState<number[]>([]);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    setLoading(true);
    api.getCompanies()
        .then(data => {
            setCompanies(data);
            const defaultTypeIds = data.filter(c => c.type !== 'MEI').map(c => c.id);
            setSelectedCompanies(defaultTypeIds);
        })
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
  }, []);

  const filteredCompanies = companies.filter(c => {
      if (companyType === 'normal') return c.type !== 'MEI';
      return c.type === 'MEI';
  });

  const toggleSelectAll = () => {
      const filteredIds = filteredCompanies.map(c => c.id);
      const allSelected = filteredIds.every(id => selectedCompanies.includes(id));
      if (allSelected) {
          setSelectedCompanies(prev => prev.filter(id => !filteredIds.includes(id)));
      } else {
          setSelectedCompanies(prev => [...new Set([...prev, ...filteredIds])]);
      }
  };

  const toggleCompany = (id: number) => {
      setSelectedCompanies(prev => prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]);
  };
  
  const handleSendNow = async () => {
      const currentSelected = selectedCompanies.filter(id => filteredCompanies.some(c => c.id === id));
      if (currentSelected.length === 0) return alert("Selecione pelo menos uma empresa.");
      if (!channels.email && !channels.whatsapp) return alert("Selecione pelo menos um canal.");

      setSending(true);
      setResult(null);
      try {
          const res = await api.bulkSend({
              companyIds: currentSelected,
              subject,
              message,
              channels
          });
          setResult(res);
          alert(`Envio concluído! Emails: ${res.email}, WhatsApp: ${res.whatsapp}`);
      } catch (e) {
          alert("Erro no envio em massa: " + e.message);
      } finally {
          setSending(false);
      }
  };

  const areAllFilteredSelected = filteredCompanies.length > 0 && filteredCompanies.every(c => selectedCompanies.includes(c.id));

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-6">
       <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Send className="w-6 h-6 text-blue-600" /> Envio em Massa
        </h1>
        <p className="text-gray-500">Envie comunicados ou documentos para múltiplas empresas.</p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de Empresa</label>
              <div className="flex gap-4">
                  <label className={`flex-1 border rounded-lg p-3 cursor-pointer transition-colors ${companyType === 'normal' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'hover:bg-gray-50'}`}>
                      <input type="radio" name="type" className="hidden" checked={companyType === 'normal'} onChange={() => setCompanyType('normal')} />
                      <div className="font-semibold">Empresas Normais</div>
                      <div className="text-xs opacity-75">LTDA, S.A, Lucro Real/Presumido</div>
                  </label>
                  <label className={`flex-1 border rounded-lg p-3 cursor-pointer transition-colors ${companyType === 'mei' ? 'bg-purple-50 border-purple-500 text-purple-700' : 'hover:bg-gray-50'}`}>
                      <input type="radio" name="type" className="hidden" checked={companyType === 'mei'} onChange={() => setCompanyType('mei')} />
                      <div className="font-semibold">Empresas MEI</div>
                      <div className="text-xs opacity-75">Microempreendedor Individual</div>
                  </label>
              </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Assunto do E-mail</label>
                  <input 
                    type="text" 
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" 
                    value={subject} 
                    onChange={e => setSubject(e.target.value)} 
                  />
              </div>
              <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Opções de Envio</label>
                  <div className="flex gap-4 pt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" className="rounded text-blue-600 w-4 h-4" checked={channels.email} onChange={e => setChannels({...channels, email: e.target.checked})} />
                          <span className="flex items-center gap-1 text-sm"><Mail className="w-4 h-4" /> E-mail</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" className="rounded text-green-600 w-4 h-4" checked={channels.whatsapp} onChange={e => setChannels({...channels, whatsapp: e.target.checked})} />
                          <span className="flex items-center gap-1 text-sm"><MessageCircle className="w-4 h-4" /> WhatsApp</span>
                      </label>
                  </div>
              </div>
          </div>

          <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Mensagem</label>
              <textarea 
                className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 h-32"
                value={message}
                onChange={e => setMessage(e.target.value)}
              ></textarea>
          </div>

          <div className="mb-6">
              <div className="flex justify-between items-center mb-2 bg-gray-100 p-2 rounded-t-lg border-b border-gray-200">
                  <h3 className="font-bold text-gray-700 px-2">Empresas Destinatárias ({selectedCompanies.filter(id => filteredCompanies.some(c => c.id === id)).length})</h3>
                  <button onClick={toggleSelectAll} className="text-sm text-blue-600 hover:underline px-2 font-medium">
                      {areAllFilteredSelected ? 'Desmarcar Todas' : 'Selecionar Todas'}
                  </button>
              </div>
              <div className="border border-gray-200 rounded-b-lg max-h-60 overflow-y-auto">
                  {filteredCompanies.length === 0 ? (
                      <div className="p-4 text-center text-gray-500">Nenhuma empresa encontrada para este tipo.</div>
                  ) : filteredCompanies.map(company => (
                      <div key={company.id} className="flex items-center p-3 border-b last:border-0 hover:bg-gray-50">
                          <input 
                            type="checkbox" 
                            checked={selectedCompanies.includes(company.id)}
                            onChange={() => toggleCompany(company.id)}
                            className="w-4 h-4 rounded text-blue-600 mr-3"
                          />
                          <div className="flex-1">
                              <div className="font-medium text-sm text-gray-900">{company.name}</div>
                              <div className="text-xs text-gray-500">{company.email} • {company.whatsapp}</div>
                          </div>
                          <div className="text-xs text-gray-400 font-mono">{company.docNumber}</div>
                      </div>
                  ))}
              </div>
          </div>

          {result && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <h4 className="font-bold flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> Relatório do Último Envio</h4>
                  <p>Enviados por E-mail: {result.email}</p>
                  <p>Enviados por WhatsApp: {result.whatsapp}</p>
                  {result.errors.length > 0 && (
                      <div className="mt-2">
                          <p className="font-bold text-red-600">Erros:</p>
                          <ul className="list-disc pl-4 text-red-500">
                              {result.errors.slice(0, 5).map((err, i) => <li key={i}>{err}</li>)}
                          </ul>
                      </div>
                  )}
              </div>
          )}

          <div className="flex justify-end gap-3">
              <button className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
              <button 
                onClick={handleSendNow}
                disabled={sending}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-500/20 flex items-center gap-2 disabled:opacity-70"
              >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sending ? 'Enviando...' : 'Enviar Agora'}
              </button>
          </div>
      </div>
    </div>
  );
};

export default BulkSend;