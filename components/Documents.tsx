import React, { useState, useRef } from 'react';
import { Upload, CalendarCheck, Search, FileText, Check, X, Play, Settings as SettingsIcon, Filter, FolderArchive } from 'lucide-react';
import { MOCK_COMPANIES, DOCUMENT_CATEGORIES } from '../constants';
import { UserSettings, Document } from '../types';
import { identifyCategory, identifyCompany } from '../utils/documentProcessor';
import JSZip from 'jszip';

interface DocumentsProps {
  userSettings: UserSettings;
  onNavigateToUpload: (companyId: number, competence: string) => void;
  documents: Document[];
  onToggleStatus: (companyId: number, category: string, competence: string) => void;
}

const Documents: React.FC<DocumentsProps> = ({ 
  userSettings, 
  onNavigateToUpload, 
  documents,
  onToggleStatus
}) => {
  const [competence, setCompetence] = useState('09/2023');
  const [activeCompetence, setActiveCompetence] = useState('09/2023'); // Drives the matrix
  
  // Processing State
  const [localPath, setLocalPath] = useState('');
  const [processingCompetence, setProcessingCompetence] = useState('09/2023');
  const [processing, setProcessing] = useState(false);
  const [processingResults, setProcessingResults] = useState<{total: number, processed: number, filtered: number} | null>(null);
  
  // Matrix Filters
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixStatusFilter, setMatrixStatusFilter] = useState<'all' | 'pending' | 'sent'>('all');
  const [matrixCategoryFilter, setMatrixCategoryFilter] = useState<string>('all');

  // Processing Filters
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Ref for the hidden file input
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use visible categories from settings, fall back to all if empty
  const defaultVisibleCategories = userSettings.visibleDocumentCategories.length > 0 
    ? userSettings.visibleDocumentCategories 
    : DOCUMENT_CATEGORIES.slice(0, 8);

  const handleProcessClick = () => {
    // Trigger hidden file input
    if (fileInputRef.current) {
        fileInputRef.current.click();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        setLocalPath(file.name);
        
        // Check if zip
        if (file.name.endsWith('.zip') || file.name.endsWith('.rar')) {
            await processZipFile(file);
        } else {
             // Fallback for individual files if needed, but UI emphasizes Zip
             alert("Por favor selecione um arquivo .ZIP");
        }
    }
  };

  const processZipFile = async (zipFile: File) => {
      setProcessing(true);
      setProcessingResults(null);

      try {
        const zip = await JSZip.loadAsync(zipFile);
        const fileNames: string[] = [];

        zip.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir) {
                // We use the file name for identification based on the Python logic
                // which simulated text extraction. 
                // In a full implementation, we could also extract content using zipEntry.async('string')
                // but for matching keywords in filenames, the name is sufficient.
                fileNames.push(zipEntry.name);
            }
        });

        let processedCount = 0;
        let filteredCount = 0;

        // Process extracted filenames
        fileNames.forEach(fileName => {
            // 1. "Text" Content (Using filename for simulation)
            const textContent = fileName; 
            
            // 2. Identify Category
            const category = identifyCategory(textContent, userSettings.categoryKeywords);
            
            // 3. Identify Company
            const company = identifyCompany(textContent, MOCK_COMPANIES);

            // Filter Logic
            const categoryFilter = selectedCategories.length > 0 ? selectedCategories : [];
            const companyFilter = selectedCompanies.length > 0 ? selectedCompanies : [];

            // Apply Filters
            if (!category || (categoryFilter.length > 0 && !categoryFilter.includes(category))) {
                filteredCount++;
                return;
            }

            if (!company || (companyFilter.length > 0 && !companyFilter.includes(String(company.id)))) {
                filteredCount++;
                return;
            }

            // Success
            processedCount++;
            console.log(`✅ Processed form ZIP: ${fileName} -> ${company.name} | ${category} | Competence: ${processingCompetence}`);
        });

        setProcessingResults({
            total: fileNames.length,
            processed: processedCount,
            filtered: filteredCount
        });

      } catch (error) {
          console.error("Error reading zip", error);
          alert("Erro ao ler o arquivo ZIP. Verifique se é um arquivo válido.");
      } finally {
          setProcessing(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  // Company Filter Logic
  const toggleCompanySelection = (id: string) => {
    setSelectedCompanies(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };
  const toggleSelectAllCompanies = () => {
    if (selectedCompanies.length === MOCK_COMPANIES.length) {
      setSelectedCompanies([]);
    } else {
      setSelectedCompanies(MOCK_COMPANIES.map(c => String(c.id)));
    }
  };

  // Category Filter Logic
  const toggleCategorySelection = (cat: string) => {
    setSelectedCategories(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };
  const toggleSelectAllCategories = () => {
    if (selectedCategories.length === defaultVisibleCategories.length) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories(defaultVisibleCategories);
    }
  };

  // --- Matrix Helpers ---

  // 1. Get Status from Global State
  const getStatus = (companyId: number, category: string) => {
      const doc = documents.find(d => 
        d.companyId === companyId && 
        d.category === category && 
        d.competence === activeCompetence
      );
      return doc ? doc.status : 'pending';
  };

  // 2. Determine Columns (Categories) based on Matrix Filter
  const getMatrixCategories = () => {
      if (matrixCategoryFilter !== 'all') {
          return [matrixCategoryFilter];
      }
      return defaultVisibleCategories;
  };

  // 3. Filter Rows (Companies) based on Matrix Filters
  const getMatrixCompanies = () => {
      return MOCK_COMPANIES.filter(company => {
          // Name Filter
          const matchesName = company.name.toLowerCase().includes(matrixSearch.toLowerCase());
          if (!matchesName) return false;

          // Status Filter
          // If status filter is active, show company ONLY if it has at least one column matching that status
          if (matrixStatusFilter !== 'all') {
              const visibleCategories = getMatrixCategories();
              const hasMatchingStatus = visibleCategories.some(cat => {
                  const status = getStatus(company.id, cat);
                  return status === matrixStatusFilter;
              });
              if (!hasMatchingStatus) return false;
          }

          return true;
      });
  };

  const handleSearchCompetence = (e: React.FormEvent) => {
      e.preventDefault();
      setActiveCompetence(competence);
  };

  return (
    <div className="space-y-6">
      
      {/* Competence Selection Card */}
      <div className="bg-white rounded-xl shadow-sm border-0 overflow-hidden mb-4">
        <div className="bg-blue-600 text-white py-3 px-6">
            <h5 className="mb-0 flex items-center gap-2 font-bold">
                <CalendarCheck className="w-5 h-5" /> Verificar Documentos por Competência (Normal)
            </h5>
        </div>
        <div className="p-6">
            <form onSubmit={handleSearchCompetence}>
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1">
                        <label htmlFor="competencia" className="block text-sm font-semibold text-gray-700 mb-2">Digite a competência (MM/AAAA)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                <CalendarCheck className="w-5 h-5" />
                            </span>
                            <input 
                                type="text" 
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" 
                                id="competencia" 
                                placeholder="Ex: 05/2023" 
                                value={competence}
                                onChange={(e) => {
                                    let val = e.target.value.replace(/\D/g, '');
                                    if (val.length > 2) val = val.substring(0, 2) + '/' + val.substring(2, 6);
                                    setCompetence(val);
                                }}
                                required 
                            />
                        </div>
                    </div>
                    <div className="flex-1 md:flex-none md:w-48">
                        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 font-medium">
                            <Search className="w-4 h-4" /> Verificar
                        </button>
                    </div>
                </div>
            </form>
        </div>
      </div>

      {/* Automatic Processing Card */}
      <div className="bg-white rounded-xl shadow-sm border border-blue-100 overflow-hidden">
        <div className="bg-blue-50 p-4 border-b border-blue-100 flex items-center gap-2 text-blue-800">
            <SettingsIcon className="w-5 h-5" />
            <h3 className="font-bold">Processamento Automático</h3>
        </div>
        <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                
                {/* Path Input (Now Zip Input) */}
                <div className="lg:col-span-1">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Arquivo ZIP / RAR</label>
                    <div className="input-group flex items-center border border-gray-300 rounded-lg overflow-hidden bg-white cursor-pointer hover:bg-gray-50" onClick={handleProcessClick}>
                         <span className="px-3 text-gray-400 bg-gray-50 border-r py-2"><FolderArchive className="w-4 h-4" /></span>
                         <input 
                            type="text" 
                            className="flex-1 px-3 py-2 outline-none text-sm cursor-pointer"
                            placeholder="Selecionar arquivo .zip..."
                            value={localPath}
                            readOnly
                         />
                         <input 
                            type="file" 
                            accept=".zip,.rar"
                            ref={fileInputRef} 
                            className="hidden" 
                            onChange={handleFileSelect} 
                        />
                    </div>
                </div>

                {/* Processing Competence */}
                <div>
                   <label className="block text-sm font-semibold text-gray-700 mb-1">Competência do Processamento</label>
                   <input 
                        type="text" 
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="MM/AAAA"
                        value={processingCompetence}
                        onChange={(e) => {
                            let val = e.target.value.replace(/\D/g, '');
                            if (val.length > 2) val = val.substring(0, 2) + '/' + val.substring(2, 6);
                            setProcessingCompetence(val);
                        }}
                    />
                </div>
                
                {/* Company Filter (Dropdown with increased height) */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Filtrar Empresas</label>
                  <div className="relative group">
                    <button className="w-full text-left border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white flex justify-between items-center">
                      <span className="truncate">
                        {selectedCompanies.length === 0 ? 'Todas as Empresas' : `${selectedCompanies.length} selecionadas`}
                      </span>
                    </button>
                    <div className="absolute top-full left-0 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 hidden group-hover:block hover:block p-2 max-h-96 overflow-y-auto">
                        <label className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer border-b mb-1 pb-1">
                          <input 
                            type="checkbox" 
                            className="rounded text-blue-600"
                            checked={selectedCompanies.length === MOCK_COMPANIES.length}
                            onChange={toggleSelectAllCompanies}
                          />
                          <span className="text-sm font-bold text-gray-700">Selecionar Todas</span>
                        </label>
                        {MOCK_COMPANIES.map(c => (
                          <label key={c.id} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="rounded text-blue-600"
                              checked={selectedCompanies.includes(String(c.id))}
                              onChange={() => toggleCompanySelection(String(c.id))}
                            />
                            <span className="text-sm text-gray-600 truncate">{c.name}</span>
                          </label>
                        ))}
                    </div>
                  </div>
                </div>

                {/* Category Filter (Dropdown with increased height) */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Filtrar Categorias</label>
                  <div className="relative group">
                    <button className="w-full text-left border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white flex justify-between items-center">
                      <span className="truncate">
                        {selectedCategories.length === 0 ? 'Padrão (Configurações)' : `${selectedCategories.length} selecionadas`}
                      </span>
                    </button>
                    <div className="absolute top-full left-0 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 hidden group-hover:block hover:block p-2 max-h-96 overflow-y-auto">
                        <label className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer border-b mb-1 pb-1">
                          <input 
                            type="checkbox" 
                            className="rounded text-blue-600"
                            checked={selectedCategories.length === defaultVisibleCategories.length}
                            onChange={toggleSelectAllCategories}
                          />
                          <span className="text-sm font-bold text-gray-700">Padrão</span>
                        </label>
                        {defaultVisibleCategories.map(cat => (
                          <label key={cat} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="rounded text-blue-600"
                              checked={selectedCategories.includes(cat)}
                              onChange={() => toggleCategorySelection(cat)}
                            />
                            <span className="text-sm text-gray-600 truncate">{cat}</span>
                          </label>
                        ))}
                    </div>
                  </div>
                </div>
            </div>
            
            <div className="mt-6 flex flex-col items-center">
                 <button 
                    onClick={handleProcessClick}
                    disabled={processing}
                    className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-500/20 font-bold flex items-center gap-2 disabled:opacity-70 transition-all"
                 >
                    {processing ? (
                        <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div> Lendo Arquivo ZIP...</>
                    ) : (
                        <><Play className="w-5 h-5" /> Iniciar Processamento Automático</>
                    )}
                 </button>
                 {processingResults && (
                   <div className="mt-4 text-sm text-gray-600 bg-gray-50 p-2 rounded border border-gray-200">
                      <strong>Resultado do ZIP:</strong> {processingResults.total} arquivos encontrados. 
                      <span className="text-green-600 font-bold ml-2">{processingResults.processed} aceitos</span>. 
                      <span className="text-red-500 font-bold ml-2">{processingResults.filtered} filtrados</span>.
                   </div>
                 )}
            </div>
        </div>
      </div>

      {/* Document Matrix Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        
        <div className="p-4 border-b border-gray-100 bg-gray-50">
           <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-700">
                Matriz de Status - <span className="text-blue-600">{activeCompetence}</span>
              </h3>
              <div className="flex gap-3 text-sm">
                <span className="flex items-center gap-1 text-green-600"><Check className="w-4 h-4" /> Enviado</span>
                <span className="flex items-center gap-1 text-red-500"><X className="w-4 h-4" /> Pendente</span>
              </div>
           </div>
           
           {/* Matrix Filters Bar */}
           <div className="flex flex-col md:flex-row gap-4 p-3 bg-white border border-gray-200 rounded-lg">
              <div className="flex-1">
                 <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Buscar Empresa</label>
                 <div className="relative">
                    <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="text" 
                      className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="Nome da empresa..."
                      value={matrixSearch}
                      onChange={(e) => setMatrixSearch(e.target.value)}
                    />
                 </div>
              </div>
              <div className="flex-1">
                 <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Filtrar Categoria</label>
                 <select 
                   className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none"
                   value={matrixCategoryFilter}
                   onChange={(e) => setMatrixCategoryFilter(e.target.value)}
                 >
                   <option value="all">Todas as Categorias</option>
                   {defaultVisibleCategories.map(cat => (
                     <option key={cat} value={cat}>{cat}</option>
                   ))}
                 </select>
              </div>
              <div className="flex-1">
                 <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Filtrar Status</label>
                 <select 
                   className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none"
                   value={matrixStatusFilter}
                   onChange={(e) => setMatrixStatusFilter(e.target.value as any)}
                 >
                   <option value="all">Todos</option>
                   <option value="pending">Pendente (Exibir se houver)</option>
                   <option value="sent">Enviado (Exibir se houver)</option>
                 </select>
              </div>
           </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-6 py-4 text-left font-semibold text-gray-600 bg-gray-50 min-w-[200px] sticky left-0 shadow-sm z-10">Empresa</th>
                {getMatrixCategories().map(cat => (
                  <th key={cat} className="px-4 py-4 text-center font-semibold text-gray-600 min-w-[100px]">{cat}</th>
                ))}
                <th className="px-4 py-4 text-center font-semibold text-gray-600 bg-gray-50 min-w-[100px] sticky right-0 shadow-sm z-10 border-l">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {getMatrixCompanies().map((company) => (
                <tr key={company.id} className="hover:bg-gray-50 group">
                  <td className="px-6 py-4 font-medium text-gray-900 bg-white group-hover:bg-gray-50 sticky left-0 shadow-sm">
                    {company.name}
                  </td>
                  {getMatrixCategories().map((cat) => {
                     const status = getStatus(company.id, cat);
                     const isSent = status === 'sent';
                     return (
                      <td key={cat} className="px-4 py-4 text-center">
                        <button 
                            onClick={() => onToggleStatus(company.id, cat, activeCompetence)}
                            className={`w-8 h-8 rounded-full inline-flex items-center justify-center transition-all duration-200 cursor-pointer
                            ${isSent 
                                ? 'bg-green-100 text-green-600 hover:bg-green-200 hover:scale-110' 
                                : 'bg-red-50 text-red-500 hover:bg-red-100 hover:scale-110'}`}
                            title={isSent ? 'Clique para marcar como Pendente' : 'Clique para marcar como Enviado'}
                        >
                            {isSent ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                        </button>
                      </td>
                     );
                  })}
                  <td className="px-4 py-4 text-center bg-white group-hover:bg-gray-50 sticky right-0 shadow-sm border-l">
                      <button 
                        onClick={() => onNavigateToUpload(company.id, activeCompetence)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Fazer Upload para esta empresa"
                      >
                          <Upload className="w-5 h-5" />
                      </button>
                  </td>
                </tr>
              ))}
              {getMatrixCompanies().length === 0 && (
                <tr>
                   <td colSpan={getMatrixCategories().length + 2} className="px-6 py-8 text-center text-gray-500">
                      Nenhuma empresa encontrada com os filtros selecionados.
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Documents;