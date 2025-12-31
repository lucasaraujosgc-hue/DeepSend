import React, { useState, useEffect } from 'react';
import { Mail, MessageCircle, Calendar, Send, CheckSquare, Square, ArrowLeft, Loader2 } from 'lucide-react';
import { Company } from '../types';
import { api } from '../services/api';

const BulkSend: React.FC = () => {
  const [companyType, setCompanyType] = useState<'normal' | 'mei'>('normal');
  const [schedule, setSchedule] = useState(false);
  
  // Real Data
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState<number[]>([]);

  useEffect(() => {
    setLoading(true);
    api.getCompanies()
        .then(data => {
            setCompanies(data);
            // Default select all matches current type logic if needed, but safer to start clean
            // Or select all of the default type
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
          // Deselect only the visible ones
          setSelectedCompanies(prev => prev.filter(id => !filteredIds.includes(id)));
      } else {
          // Add missing visible ones
          const newSelection = [...new Set([...selectedCompanies, ...filteredIds])];
          setSelectedCompanies(newSelection);
      }
  };

  const toggleCompany = (id: number) => {
      if (selectedCompanies.includes(id)) {
          setSelectedCompanies(prev => prev.filter(cid => cid !== id));
      } else {
          setSelectedCompanies(prev => [...prev, id]);
      }
  };
  
  // Check if all filtered are selected
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
                  <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" defaultValue="Comunicado Importante" />
              </div>
              <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Opções de Envio</label>
                  <div className="flex gap-4 pt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" className="rounded text-blue-600 w-4 h-4" defaultChecked />
                          <span className="flex items-center gap-1 text-sm"><Mail className="w-4 h-4" /> E-mail</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" className="rounded text-green-600 w-4 h-4" />
                          <span className="flex items-center gap-1 text-sm"><MessageCircle className="w-4 h-4" /> WhatsApp</span>
                      </label>
                  </div>
              </div>
          </div>

          <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Mensagem</label>
              <textarea 
                className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 h-32"
                defaultValue={`Prezados,\n\nGostaríamos de informar que...\n\nAtenciosamente,\nEquipe Contábil`}
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

          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input 
                    type="checkbox" 
                    checked={schedule} 
                    onChange={(e) => setSchedule(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600" 
                  />
                  <span className="font-semibold text-gray-700 flex items-center gap-1">
                      <Calendar className="w-4 h-4" /> Agendar Envio
                  </span>
              </label>
              {schedule && (
                  <div className="mt-3 pl-6">
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Data e Hora</label>
                      <input type="datetime-local" className="border border-gray-300 rounded-lg px-3 py-2 outline-none text-sm bg-white" />
                  </div>
              )}
          </div>

          <div className="flex justify-end gap-3">
              <button className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
              <button className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-500/20 flex items-center gap-2">
                  {schedule ? 'Agendar Envio' : 'Enviar Agora'} <Send className="w-4 h-4" />
              </button>
          </div>
      </div>
    </div>
  );
};

export default BulkSend;