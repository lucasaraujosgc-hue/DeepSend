import React, { useState } from 'react';
import { Save, User, Mail, MessageCircle, FileText, Check, LayoutTemplate, Link as LinkIcon, Plus, Trash } from 'lucide-react';
import { UserSettings } from '../types';
import { DOCUMENT_CATEGORIES } from '../constants';

interface SettingsProps {
  settings: UserSettings;
  onSave: (newSettings: UserSettings) => void;
}

const Settings: React.FC<SettingsProps> = ({ settings, onSave }) => {
  const [activeTab, setActiveTab] = useState<'signatures' | 'documents' | 'bindings'>('signatures');
  const [formData, setFormData] = useState<UserSettings>(settings);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [selectedCategoryForKeyword, setSelectedCategoryForKeyword] = useState(DOCUMENT_CATEGORIES[0]);

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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <User className="w-6 h-6 text-blue-600" /> Configurações do Usuário
          </h1>
          <p className="text-gray-500">Gerencie assinaturas, colunas e vinculações de documentos.</p>
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
            <Mail className="w-4 h-4" /> Assinaturas & Modelos
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`px-6 py-4 font-medium text-sm flex items-center gap-2 transition-colors border-b-2 whitespace-nowrap
              ${activeTab === 'documents' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <LayoutTemplate className="w-4 h-4" /> Colunas de Documentos
          </button>
          <button
            onClick={() => setActiveTab('bindings')}
            className={`px-6 py-4 font-medium text-sm flex items-center gap-2 transition-colors border-b-2 whitespace-nowrap
              ${activeTab === 'bindings' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <LinkIcon className="w-4 h-4" /> Vinculações (Palavras-chave)
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'signatures' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Email Signature */}
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

              {/* WhatsApp Template */}
              <div className="space-y-2 pt-6 border-t border-gray-100">
                <label className="block text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" /> Modelo de Mensagem WhatsApp
                </label>
                <p className="text-xs text-gray-500">
                    Variáveis disponíveis: <code>{`{competencia}`}</code>, <code>{`{empresa}`}</code>.
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
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
               <div className="mb-6">
                 <h3 className="font-semibold text-gray-800">Visualização da Matriz de Documentos</h3>
                 <p className="text-sm text-gray-500">Selecione quais categorias devem aparecer como colunas na tabela de gerenciamento de documentos.</p>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {DOCUMENT_CATEGORIES.map(category => {
                   const isSelected = formData.visibleDocumentCategories.includes(category);
                   return (
                     <label 
                        key={category} 
                        className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all
                          ${isSelected 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                     >
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
                     </label>
                   );
                 })}
               </div>
            </div>
          )}

          {activeTab === 'bindings' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8">
               <div className="mb-6">
                 <h3 className="font-semibold text-gray-800">Mapeamento de Palavras-chave</h3>
                 <p className="text-sm text-gray-500">Defina palavras-chave que, se encontradas no texto do arquivo, identificarão automaticamente a categoria do documento.</p>
               </div>

               {/* Add New Keyword */}
               <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col md:flex-row gap-4 items-end">
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Categoria</label>
                    <select 
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none"
                      value={selectedCategoryForKeyword}
                      onChange={(e) => setSelectedCategoryForKeyword(e.target.value)}
                    >
                      {DOCUMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex-[2] w-full">
                     <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Palavra-chave ou Expressão</label>
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

               {/* List Keywords */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {Object.keys(formData.categoryKeywords).map(category => (
                   <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 font-semibold text-gray-700 flex justify-between">
                         <span>{category}</span>
                         <span className="text-xs bg-gray-200 px-2 py-0.5 rounded text-gray-600">
                           {formData.categoryKeywords[category].length} palavras
                         </span>
                      </div>
                      <div className="p-4 space-y-2 max-h-48 overflow-y-auto">
                        {formData.categoryKeywords[category].length === 0 ? (
                           <p className="text-sm text-gray-400 italic">Nenhuma palavra-chave definida.</p>
                        ) : (
                          formData.categoryKeywords[category].map((kw, idx) => (
                             <div key={idx} className="flex justify-between items-center group">
                                <span className="text-sm text-gray-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 w-full mr-2">
                                  {kw}
                                </span>
                                <button 
                                  onClick={() => removeKeyword(category, kw)}
                                  className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                   <Trash className="w-4 h-4" />
                                </button>
                             </div>
                          ))
                        )}
                      </div>
                   </div>
                 ))}
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;