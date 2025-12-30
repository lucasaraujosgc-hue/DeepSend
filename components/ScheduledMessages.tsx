import React, { useState } from 'react';
import { CalendarClock, Edit, Trash, Plus, CheckCircle, XCircle } from 'lucide-react';
import { MOCK_MESSAGES, MOCK_COMPANIES } from '../constants';
import { ScheduledMessage } from '../types';

const ScheduledMessages: React.FC = () => {
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [messages, setMessages] = useState(MOCK_MESSAGES);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Mock form state for editing
  const [formData, setFormData] = useState<Partial<ScheduledMessage>>({});

  const handleEdit = (msg: ScheduledMessage) => {
      setFormData(msg);
      setEditingId(msg.id);
      setView('edit');
  };

  const handleNew = () => {
      setFormData({
          title: '',
          message: '',
          nextRun: '',
          recurrence: 'mensal',
          active: true,
          type: 'message',
          targetType: 'normal'
      });
      setEditingId(null);
      setView('edit');
  };

  if (view === 'edit') {
      return (
          <div className="space-y-6">
              <div className="card bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="card-header bg-blue-600 text-white p-4 flex justify-between items-center">
                      <h5 className="font-bold flex items-center gap-2">
                          <Edit className="w-5 h-5" /> {editingId ? 'Editar Agendamento' : 'Novo Agendamento'}
                      </h5>
                  </div>
                  <div className="p-6 space-y-6">
                      <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Título</label>
                          <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2" defaultValue={formData.title} />
                      </div>

                      <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Mensagem</label>
                          <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 h-32" defaultValue={formData.message}></textarea>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">Recorrência</label>
                              <select className="w-full border border-gray-300 rounded-lg px-3 py-2" defaultValue={formData.recurrence}>
                                  <option value="unico">Envio Único</option>
                                  <option value="mensal">Mensal</option>
                                  <option value="trimestral">Trimestral</option>
                                  <option value="anual">Anual</option>
                              </select>
                          </div>
                          <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">Próximo Envio</label>
                              <input type="datetime-local" className="w-full border border-gray-300 rounded-lg px-3 py-2" defaultValue={formData.nextRun?.replace(' ', 'T')} />
                          </div>
                      </div>

                      <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Empresas Alvo</label>
                          <select className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3">
                              <option value="normal">Todas Empresas Normais</option>
                              <option value="mei">Todas Empresas MEI</option>
                              <option value="selected">Empresas Selecionadas</option>
                          </select>
                          
                          <div className="border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto bg-gray-50">
                                {MOCK_COMPANIES.map(c => (
                                    <label key={c.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-100 px-2 rounded">
                                        <input type="checkbox" className="rounded text-blue-600" />
                                        <span className="text-sm">{c.name}</span>
                                    </label>
                                ))}
                          </div>
                      </div>

                      <div className="flex items-center justify-between border-t pt-4">
                           <div className="flex items-center gap-4">
                               <label className="flex items-center gap-2">
                                   <input type="checkbox" defaultChecked className="toggle-checkbox" />
                                   <span className="text-sm font-medium">Ativo</span>
                               </label>
                               <label className="flex items-center gap-2">
                                   <input type="checkbox" defaultChecked />
                                   <span className="text-sm">E-mail</span>
                               </label>
                               <label className="flex items-center gap-2">
                                   <input type="checkbox" />
                                   <span className="text-sm">WhatsApp</span>
                               </label>
                           </div>
                           <div className="flex gap-2">
                               <button onClick={() => setView('list')} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                               <button onClick={() => setView('list')} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Salvar</button>
                           </div>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <CalendarClock className="w-6 h-6 text-blue-600" /> Agendamentos
            </h1>
            <p className="text-gray-500">Gerencie envios automáticos e recorrentes.</p>
        </div>
        <button onClick={handleNew} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 shadow-sm">
            <Plus className="w-4 h-4" /> Novo Agendamento
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
          {messages.map(msg => (
              <div key={msg.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 hover:shadow-md transition-shadow">
                  <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                          {msg.active ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-gray-300" />}
                          <h3 className="font-bold text-gray-800">{msg.title}</h3>
                          <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full border border-blue-100 uppercase font-semibold">{msg.recurrence}</span>
                      </div>
                      <p className="text-sm text-gray-500 flex items-center gap-2">
                          <CalendarClock className="w-3 h-3" /> Próximo envio: {msg.nextRun}
                      </p>
                  </div>
                  <div className="flex gap-2">
                      <button onClick={() => handleEdit(msg)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg border border-transparent hover:border-blue-100 transition-colors">
                          <Edit className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-red-500 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100 transition-colors">
                          <Trash className="w-4 h-4" />
                      </button>
                  </div>
              </div>
          ))}
      </div>
    </div>
  );
};

export default ScheduledMessages;