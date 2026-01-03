
import React, { useState } from 'react';
import { Save, User, Mail, MessageCircle, FileText, Check, LayoutTemplate, Link as LinkIcon, Plus, Trash, Clock, CalendarDays, Star, Layers } from 'lucide-react';
import { UserSettings, CategoryRule } from '../types';
import { DOCUMENT_CATEGORIES } from '../constants';

interface SettingsProps {
  settings: UserSettings;
  onSave: (newSettings: UserSettings) => void;
  // Agora passamos todas as categorias (padrão + custom)
  availableCategories: string[];
}

const Settings: React.FC<SettingsProps> = ({ settings, onSave, availableCategories }) => {
  const [activeTab, setActiveTab] = useState<'signatures' | 'documents' | 'bindings' | 'due_dates'>('signatures');
  const [formData, setFormData] = useState<UserSettings>(settings);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Keyword State
  const [newKeyword, setNewKeyword] = useState('');
  const [selectedCategoryForKeyword, setSelectedCategoryForKeyword] = useState(availableCategories[0]);

  // Custom Category State
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleSave = () => {
    onSave(formData);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const toggleCategory = (category: string) => {
    setFormData(prev => {
      const current = prev.visibleDocumentCategories;
      if (current.includes(category)) {
        return { ...prev, visibleDocumentCategories: current.filter(c => c !== category) };
      } else {
        return { ...prev, visibleDocumentCategories: [...current, category] };
      }
    });
  };

  const togglePriority = (category: string) => {
      setFormData(prev => {
          const currentPriorities = prev.priorityCategories || [];
          if (currentPriorities.includes(category)) {
              return { ...prev, priorityCategories: currentPriorities.filter(c => c !== category) };
          } else {
              return { ...prev, priorityCategories: [...currentPriorities, category] };
          }
      });
  };

  const addKeyword = () => {
    if (!newKeyword.trim()) return;
    setFormData(prev => {
      const currentKeywords = prev.categoryKeywords[selectedCategoryForKeyword] || [];
      return {
        ...prev,
        categoryKeywords: {
          ...prev.categoryKeywords,
          [selectedCategoryForKeyword]: [...currentKeywords, newKeyword.trim()]
        }
      };
    });
    setNewKeyword('');
  };

  const removeKeyword = (category: string, keywordToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      categoryKeywords: {
        ...prev.categoryKeywords,
        [category]: prev.categoryKeywords[category].filter(k => k !== keywordToRemove)
      }
    }));
  };

  const updateRule = (category: string, field: keyof CategoryRule, value: any) => {
    setFormData(prev => ({
      ...prev,
      categoryRules: {
        ...prev.categoryRules,
        [category]: {
          ...(prev.categoryRules[category] || { day: 1, rule: 'fixo' }),
          [field]: value
        }
      }
    }));
  };

  const addCustomCategory = () => {
      if (!newCategoryName.trim()) return;
      if (availableCategories.includes(newCategoryName)) {
          alert("Categoria já existe");
          return;
      }

      setFormData(prev => ({
          ...prev,
          customCategories: [...(prev.customCategories || []), newCategoryName.trim()],
          // Auto-visível ao criar
          visibleDocumentCategories: [...prev.visibleDocumentCategories, newCategoryName.trim()]
      }));
      setNewCategoryName('');
  };

  const removeCustomCategory = (category: string) => {
      if (confirm(`Tem certeza que deseja excluir a categoria "${category}"?`)) {
          setFormData(prev => ({
              ...prev,
              customCategories: (prev.customCategories || []).filter(c => c !== category),
              visibleDocumentCategories: prev.visibleDocumentCategories.filter(c => c !== category)
          }));
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <User className="w-6 h-6 text-blue-600" /> Configurações do Usuário
          </h1>
          <p className="text-gray-500">Gerencie assinaturas, categorias e regras personalizadas.</p>
        </div>
        <button 
          onClick={handleSave}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all"
        >
          {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saveSuccess ? 'Salvo!' : 'Salvar Alterações'}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-h-[600px]">
        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 overflow-x-auto">
          <button
            onClick={() => setActiveTab('signatures')}
            className={`px-6 py-4 font-medium text-sm flex items-center gap-2 transition-colors border-b-2 whitespace-nowrap
              ${activeTab === 'signatures' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Mail className="w-4 h-4" /> Assinaturas
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`px-6 py-4 font-medium text-sm flex items-center gap-2 transition-colors border-b-2 whitespace-nowrap
              ${activeTab === 'documents' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <LayoutTemplate className="w-4 h-4" /> Categorias e Matriz
          </button>
          <button
            onClick={() => setActiveTab('bindings')}
            className={`px-6 py-4 font-medium text-sm flex items-center gap-2 transition-colors border-b-2 whitespace-nowrap
              ${activeTab === 'bindings' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <LinkIcon className="w-4 h-4" /> Palavras-chave
          </button>
          <button
            onClick={() => setActiveTab('due_dates')}
            className={`px-6 py-4 font-medium text-sm flex items-center gap-2 transition-colors border-b-2 whitespace-nowrap
              ${activeTab === 'due_dates' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <CalendarDays className="w-4 h-4" /> Vencimentos
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'signatures' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* ... (Signatures code remains same) ... */}
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Mail className="w-4 h-4" /> Assinatura de E-mail (HTML)
                  </label>
                  <p className="text-xs text-gray-500">
                    Use <code>{`{mensagem_html}`}</code> onde o corpo do email deve ser inserido.
                  </p>
                  <textarea 
                    className="w-full h-80 border border-gray-300 rounded-lg p-3 font-mono text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.emailSignature}
                    onChange={(e) => setFormData({...formData, emailSignature: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700">Pré-visualização</label>
                  <div className="w-full h-80 border border-gray-200 rounded-lg p-4 overflow-y-auto bg-gray-50">
                    <div 
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ 
                        __html: formData.emailSignature.replace('{mensagem_html}', '<p><em>[O conteúdo da mensagem será inserido aqui]</em></p>') 
                      }} 
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-6 border-t border-gray-100">
                <label className="block text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" /> Assinatura / Rodapé do WhatsApp
                </label>
                <p className="text-xs text-gray-500">
                    Este texto será adicionado automaticamente ao final de todas as mensagens do WhatsApp.
                </p>
                <textarea 
                  className="w-full h-32 border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                  value={formData.whatsappTemplate}
                  onChange={(e) => setFormData({...formData, whatsappTemplate: e.target.value})}
                />
              </div>
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8">
               
               {/* Custom Categories Creator */}
               <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col md:flex-row gap-4 items-end">
                  <div className="flex-1 w-full">
                     <label className="block text-xs font-semibold text-blue-700 uppercase mb-1 flex items-center gap-1">
                        <Layers className="w-3 h-3" /> Criar Categoria Personalizada
                     </label>
                     <input 
                        type="text" 
                        className="w-full border border-blue-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Ex: Imposto Sindical, Taxa Extra..."
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                     />
                  </div>
                  <button 
                    onClick={addCustomCategory}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Adicionar Categoria
                  </button>
               </div>

               <div>
                 <h3 className="font-semibold text-gray-800">Visualização da Matriz de Documentos</h3>
                 <p className="text-sm text-gray-500 mb-4">Selecione quais categorias devem aparecer como colunas na tabela de gerenciamento.</p>

                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                   {availableCategories.map(category => {
                     const isSelected = formData.visibleDocumentCategories.includes(category);
                     const isCustom = (formData.customCategories || []).includes(category);

                     return (
                       <div key={category} className={`flex items-center gap-2 p-4 rounded-lg border-2 transition-all group
                          ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
                          
                          <label className="flex-1 flex items-center gap-3 cursor-pointer">
                            <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors
                                ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-400'}`}>
                                {isSelected && <Check className="w-3 h-3" />}
                            </div>
                            <input 
                                type="checkbox" 
                                className="hidden" 
                                checked={isSelected} 
                                onChange={() => toggleCategory(category)}
                            />
                            <span className={`font-medium ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>{category}</span>
                            {isCustom && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 uppercase font-bold">Custom</span>}
                          </label>

                          {isCustom && (
                              <button 
                                onClick={() => removeCustomCategory(category)}
                                className="text-gray-400 hover:text-red-500 p-1 opacity-50 group-hover:opacity-100"
                                title="Excluir categoria personalizada"
                              >
                                  <Trash className="w-4 h-4" />
                              </button>
                          )}
                       </div>
                     );
                   })}
                 </div>
               </div>
            </div>
          )}

          {activeTab === 'bindings' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8">
               <div className="mb-6">
                 <h3 className="font-semibold text-gray-800">Palavras-chave e Prioridades</h3>
                 <p className="text-sm text-gray-500">
                     Configure as palavras-chave para identificar categorias nos PDFs.
                 </p>
               </div>

               {/* Add New Keyword */}
               <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col md:flex-row gap-4 items-end mb-8">
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Categoria Alvo</label>
                    <select 
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none"
                      value={selectedCategoryForKeyword}
                      onChange={(e) => setSelectedCategoryForKeyword(e.target.value)}
                    >
                      {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex-[2] w-full">
                     <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Adicionar Nova Palavra-chave</label>
                     <input 
                        type="text" 
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none"
                        placeholder="Ex: extrato mensal, das, nota fiscal..."
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                     />
                  </div>
                  <button 
                    onClick={addKeyword}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Adicionar
                  </button>
               </div>

               {/* List Categories with Keywords Only */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {availableCategories.map(category => {
                   const keywords = formData.categoryKeywords[category] || [];
                   const isPriority = (formData.priorityCategories || []).includes(category);

                   return (
                     <div key={category} className={`border rounded-lg overflow-hidden bg-white shadow-sm transition-all ${isPriority ? 'border-yellow-400 ring-1 ring-yellow-400' : 'border-gray-200'}`}>
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 font-bold text-gray-700 flex justify-between items-center">
                           <span>{category}</span>
                           <button 
                             onClick={() => togglePriority(category)}
                             className={`p-1 rounded hover:bg-gray-200 transition-colors ${isPriority ? 'text-yellow-500' : 'text-gray-300'}`}
                             title={isPriority ? "Remover Prioridade" : "Marcar como Prioridade"}
                           >
                               <Star className={`w-5 h-5 ${isPriority ? 'fill-yellow-500' : ''}`} />
                           </button>
                        </div>
                        
                        <div className="p-4">
                           <div className="bg-gray-50 rounded border border-gray-200 p-2 min-h-[80px] space-y-2">
                            {keywords.length === 0 ? (
                                <p className="text-xs text-gray-400 italic p-2">Nenhuma palavra-chave definida.</p>
                            ) : (
                                keywords.map((kw, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-white border border-gray-200 rounded px-2 py-1">
                                    <span className="text-sm text-gray-700">{kw}</span>
                                    <button 
                                        onClick={() => removeKeyword(category, kw)}
                                        className="text-gray-400 hover:text-red-500 p-1"
                                        title="Remover palavra-chave"
                                    >
                                        <Trash className="w-3 h-3" />
                                    </button>
                                    </div>
                                ))
                            )}
                           </div>
                        </div>
                     </div>
                   );
                 })}
               </div>
            </div>
          )}

          {activeTab === 'due_dates' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8">
                  <div className="mb-6">
                    <h3 className="font-semibold text-gray-800">Regras de Vencimento</h3>
                    <p className="text-sm text-gray-500">Configure como o sistema calcula a data de vencimento para cada categoria.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {availableCategories.map(category => {
                       const rule = formData.categoryRules[category] || { day: 10, rule: 'fixo' };
                       return (
                          <div key={category} className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                              <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 font-bold text-blue-800 flex justify-between items-center">
                                  <span>{category}</span>
                                  <Clock className="w-4 h-4 text-blue-400" />
                              </div>
                              <div className="p-4 space-y-4">
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Regra</label>
                                    <select 
                                      className="w-full text-sm border border-gray-300 rounded px-2 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                                      value={rule.rule}
                                      onChange={(e) => updateRule(category, 'rule', e.target.value)}
                                    >
                                      <option value="fixo">Dia Fixo</option>
                                      <option value="antecipado">Antecipar se Feriado/FDS</option>
                                      <option value="postergado">Postergar se Feriado/FDS</option>
                                      <option value="quinto_dia_util">Quinto Dia Útil</option>
                                      <option value="ultimo_dia_util">Último Dia Útil</option>
                                    </select>
                                  </div>
                                  
                                  {(rule.rule === 'fixo' || rule.rule === 'antecipado' || rule.rule === 'postergado') && (
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Dia do Vencimento</label>
                                        <input 
                                          type="number" 
                                          min="1" 
                                          max="31" 
                                          className="w-full text-sm border border-gray-300 rounded px-2 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                                          value={rule.day}
                                          onChange={(e) => updateRule(category, 'day', parseInt(e.target.value))}
                                        />
                                    </div>
                                  )}

                                  <div className="bg-gray-50 p-2 rounded text-xs text-gray-500 border border-gray-100 min-h-[40px]">
                                    {rule.rule === 'quinto_dia_util' && "Vence no 5º dia útil do mês seguinte."}
                                    {rule.rule === 'ultimo_dia_util' && "Vence no último dia útil do mês seguinte."}
                                    {rule.rule === 'antecipado' && `Vence dia ${rule.day}. Se cair em feriado/FDS, antecipa.`}
                                    {rule.rule === 'postergado' && `Vence dia ${rule.day}. Se cair em feriado/FDS, posterga.`}
                                    {rule.rule === 'fixo' && `Vence dia ${rule.day}, independente de ser útil.`}
                                  </div>
                              </div>
                          </div>
                       );
                    })}
                  </div>
              </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
