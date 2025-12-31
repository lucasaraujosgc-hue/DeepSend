import React, { useState, useRef, useEffect } from 'react';
import { Upload, CalendarCheck, Search, FileText, Check, X, Play, Settings as SettingsIcon, Filter, FolderArchive, Loader2, FilePlus } from 'lucide-react';
import { DOCUMENT_CATEGORIES } from '../constants';
import { UserSettings, Document, Company, UploadedFile } from '../types';
import { identifyCategory, identifyCompany, extractTextFromPDF } from '../utils/documentProcessor';
import { api } from '../services/api';
import { calcularTodosVencimentos } from '../utils/dateHelpers';
import JSZip from 'jszip';

interface DocumentsProps {
  userSettings: UserSettings;
  onNavigateToUpload: (companyId: number, competence: string) => void;
  documents: Document[];
  onToggleStatus: (companyId: number, category: string, competence: string) => void;
  onUploadSuccess: (files: UploadedFile[], companyId: number, competence: string) => void;
}

const Documents: React.FC<DocumentsProps> = ({ 
  userSettings, 
  onNavigateToUpload, 
  documents: initialDocuments,
  onToggleStatus,
  onUploadSuccess
}) => {
  // Helper to get current competence formatted MM/YYYY
  const getCurrentCompetence = () => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    return `${mm}/${yyyy}`;
  };

  const [competence, setCompetence] = useState(getCurrentCompetence());
  const [activeCompetence, setActiveCompetence] = useState(getCurrentCompetence()); // Drives the matrix
  
  // Real Data State
  const [companies, setCompanies] = useState<Company[]>([]);
  const [dbStatuses, setDbStatuses] = useState<any[]>([]); // Statuses from DB
  const [loading, setLoading] = useState(true);

  // Processing State
  const [localPath, setLocalPath] = useState('');
  const [processingCompetence, setProcessingCompetence] = useState(getCurrentCompetence());
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

  // Fetch Data
  const fetchData = async () => {
      setLoading(true);
      try {
          const [comps, statuses] = await Promise.all([
              api.getCompanies(),
              api.getDocumentStatuses(activeCompetence)
          ]);
          setCompanies(comps);
          setDbStatuses(statuses);
      } catch (error) {
          console.error("Error fetching documents data", error);
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
      fetchData();
  }, [activeCompetence]);

  // Use visible categories from settings for the Matrix Columns
  const visibleMatrixCategories = userSettings.visibleDocumentCategories.length > 0 
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
        const files: File[] = Array.from(e.target.files);
        
        // Update display text
        if (files.length === 1) {
            setLocalPath(files[0].name);
        } else {
            setLocalPath(`${files.length} arquivos selecionados`);
        }

        // Check if user selected a ZIP file
        const zipFile = files.find(f => f.name.endsWith('.zip') || f.name.endsWith('.rar'));
        
        if (zipFile) {
             if (files.length > 1) {
                 alert("Ao selecionar um arquivo ZIP, selecione apenas ele.");
                 return;
             }
             await processZipFile(zipFile);
        } else {
             // Process regular files (PDFs, Images, etc.)
             await processMultipleFiles(files);
        }
    }
  };

  // Process a list of standard files
  const processMultipleFiles = async (fileList: File[]) => {
      setProcessing(true);
      setProcessingResults(null);
      
      const calculatedDates = calcularTodosVencimentos(processingCompetence);
      let processedCount = 0;
      let filteredCount = 0;

      try {
          for (const file of fileList) {
             // 1. Extract Text from PDF content (simulating Python logic)
             let textContent = file.name; // Fallback to filename
             if (file.type === 'application/pdf') {
                 const extracted = await extractTextFromPDF(file);
                 if (extracted && extracted.length > 10) {
                     textContent = extracted + " " + file.name; // Use both content and filename
                 }
             }

             // 2. Identify Category & Company using content
             const category = identifyCategory(textContent, userSettings.categoryKeywords);
             const company = identifyCompany(textContent, companies);

             // 3. Filters
             const categoryFilter = selectedCategories.length > 0 ? selectedCategories : [];
             const companyFilter = selectedCompanies.length > 0 ? selectedCompanies : [];

             if (!category || (categoryFilter.length > 0 && !categoryFilter.includes(category))) {
                 console.log(`Arquivo filtrado/ignorado (Categoria): ${file.name} -> ${category || 'Não identificada'}`);
                 filteredCount++;
                 continue;
             }

             if (!company || (companyFilter.length > 0 && !companyFilter.includes(String(company.id)))) {
                 console.log(`Arquivo filtrado/ignorado (Empresa): ${file.name} -> ${company?.name || 'Não identificada'}`);
                 filteredCount++;
                 continue;
             }

             // 4. Real Upload
             try {
                const uploadRes = await api.uploadFile(file);
                
                const uploadedFile: UploadedFile = {
                    name: file.name,
                    size: file.size,
                    category: category,
                    dueDate: calculatedDates[category] || '',
                    file: file,
                    serverFilename: uploadRes.filename
                };
                
                // Add to App state
                onUploadSuccess([uploadedFile], company.id, processingCompetence);
                processedCount++;
             } catch (err) {
                 console.error(`Falha ao enviar arquivo ${file.name}`, err);
                 filteredCount++; // Consider upload fail as filtered/error
             }
          }

          setProcessingResults({
              total: fileList.length,
              processed: processedCount,
              filtered: filteredCount
          });

      } catch (e) {
          console.error("Erro processando arquivos", e);
          alert("Erro ao processar arquivos.");
      } finally {
          setProcessing(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  const processZipFile = async (zipFile: File) => {
      setProcessing(true);
      setProcessingResults(null);
      const calculatedDates = calcularTodosVencimentos(processingCompetence);

      try {
        const zip = await JSZip.loadAsync(zipFile);
        const entries: {name: string, obj: any}[] = [];

        zip.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir && !zipEntry.name.startsWith('__MACOSX') && !zipEntry.name.endsWith('.DS_Store')) {
                entries.push({ name: zipEntry.name, obj: zipEntry });
            }
        });

        let processedCount = 0;
        let filteredCount = 0;

        for (const entry of entries) {
            const fileName = entry.name;
            const simpleName = fileName.split('/').pop() || fileName;

            // Convert ZipObject to Blob/File to read content
            const blob = await entry.obj.async("blob");
            const file = new File([blob], simpleName, { type: blob.type || 'application/pdf' });

            // 1. Extract Text
            let textContent = simpleName; 
            if (simpleName.toLowerCase().endsWith('.pdf')) {
                 const extracted = await extractTextFromPDF(file);
                 if (extracted && extracted.length > 10) {
                     textContent = extracted + " " + simpleName;
                 }
            }

            // 2. Identify
            const category = identifyCategory(textContent, userSettings.categoryKeywords);
            const company = identifyCompany(textContent, companies);

            const categoryFilter = selectedCategories.length > 0 ? selectedCategories : [];
            const companyFilter = selectedCompanies.length > 0 ? selectedCompanies : [];

            if (!category || (categoryFilter.length > 0 && !categoryFilter.includes(category))) {
                filteredCount++;
                continue;
            }

            if (!company || (companyFilter.length > 0 && !companyFilter.includes(String(company.id)))) {
                filteredCount++;
                continue;
            }

            try {
                const uploadRes = await api.uploadFile(file);
                
                const uploadedFile: UploadedFile = {
                    name: simpleName,
                    size: file.size,
                    category: category,
                    dueDate: calculatedDates[category] || '',
                    file: file,
                    serverFilename: uploadRes.filename
                };

                onUploadSuccess([uploadedFile], company.id, processingCompetence);
                processedCount++;
            } catch (err) {
                 console.error(`Falha ao enviar arquivo extraído ${simpleName}`, err);
                 filteredCount++;
            }
        }

        setProcessingResults({
            total: entries.length,
            processed: processedCount,
            filtered: filteredCount
        });

      } catch (error) {
          console.error("Error reading zip", error);
          alert("Erro ao ler o arquivo ZIP.");
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
    if (selectedCompanies.length === companies.length) {
      setSelectedCompanies([]);
    } else {
      setSelectedCompanies(companies.map(c => String(c.id)));
    }
  };

  // Category Filter Logic
  const toggleCategorySelection = (cat: string) => {
    setSelectedCategories(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };
  const toggleSelectAllCategories = () => {
    if (selectedCategories.length === DOCUMENT_CATEGORIES.length) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories(DOCUMENT_CATEGORIES);
    }
  };

  // --- Matrix Helpers ---

  // 1. Get Status from DB State
  const getStatus = (companyId: number, category: string) => {
      // Check DB statuses first
      const dbStatus = dbStatuses.find(s => 
          s.companyId === companyId && 
          s.category === category && 
          s.competence === activeCompetence
      );
      
      if (dbStatus) return dbStatus.status;

      // Fallback to Documents passed via props (local state for upload session)
      const doc = initialDocuments.find(d => 
        d.companyId === companyId && 
        d.category === category && 
        d.competence === activeCompetence
      );
      return doc ? doc.status : 'pending';
  };

  const handleToggleStatusLocal = async (companyId: number, category: string) => {
      const currentStatus = getStatus(companyId, category);
      const newStatus = currentStatus === 'sent' ? 'pending' : 'sent';
      
      // Optimistic update locally
      const updatedDbStatuses = [...dbStatuses];
      const existingIdx = updatedDbStatuses.findIndex(s => s.companyId === companyId && s.category === category);
      
      if (existingIdx >= 0) {
          updatedDbStatuses[existingIdx].status = newStatus;
      } else {
          updatedDbStatuses.push({ companyId, category, competence: activeCompetence, status: newStatus });
      }
      setDbStatuses(updatedDbStatuses);

      // Persist to API
      try {
          await api.updateDocumentStatus(companyId, category, activeCompetence, newStatus);
          // Also call parent handler to keep sync if needed
          onToggleStatus(companyId, category, activeCompetence);
      } catch (e) {
          console.error("Failed to update status");
          // Revert optimistic update? For now we just log.
      }
  };

  // 2. Determine Columns (Categories) based on Matrix Filter
  const getMatrixCategories = () => {
      if (matrixCategoryFilter !== 'all') {
          return [matrixCategoryFilter];
      }
      return visibleMatrixCategories;
  };

  // 3. Filter Rows (Companies) based on Matrix Filters
  const getMatrixCompanies = () => {
      return companies.filter(company => {
          // Name Filter
          const matchesName = company.name.toLowerCase().includes(matrixSearch.toLowerCase());
          if (!matchesName) return false;

          // Status Filter
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

  if (loading && companies.length === 0) {
     return <div className="flex justify-center p-10"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

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
                
                {/* Path Input */}
                <div className="lg:col-span-1">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Arquivos (ZIP ou Múltiplos)</label>
                    <div className="input-group flex items-center border border-gray-300 rounded-lg overflow-hidden bg-white cursor-pointer hover:bg-gray-50" onClick={handleProcessClick}>
                         <span className="px-3 text-gray-400 bg-gray-50 border-r py-2"><FolderArchive className="w-4 h-4" /></span>
                         <input 
                            type="text" 
                            className="flex-1 px-3 py-2 outline-none text-sm cursor-pointer"
                            placeholder="Selecione arquivos ou ZIP..."
                            value={localPath}
                            readOnly
                         />
                         <input 
                            type="file" 
                            multiple
                            accept=".zip,.rar,.pdf,.png,.jpg,.jpeg,.doc,.docx"
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
                
                {/* Company Filter */}
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
                            checked={selectedCompanies.length === companies.length}
                            onChange={toggleSelectAllCompanies}
                          />
                          <span className="text-sm font-bold text-gray-700">Selecionar Todas</span>
                        </label>
                        {companies.map(c => (
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

                {/* Category Filter */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Filtrar Categorias</label>
                  <div className="relative group">
                    <button className="w-full text-left border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white flex justify-between items-center">
                      <span className="truncate">
                        {selectedCategories.length === 0 ? 'Todas as Categorias' : `${selectedCategories.length} selecionadas`}
                      </span>
                    </button>
                    <div className="absolute top-full left-0 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 hidden group-hover:block hover:block p-2 max-h-96 overflow-y-auto">
                        <label className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer border-b mb-1 pb-1">
                          <input 
                            type="checkbox" 
                            className="rounded text-blue-600"
                            checked={selectedCategories.length === DOCUMENT_CATEGORIES.length}
                            onChange={toggleSelectAllCategories}
                          />
                          <span className="text-sm font-bold text-gray-700">Todas</span>
                        </label>
                        {DOCUMENT_CATEGORIES.map(cat => (
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
                        <><Loader2 className="animate-spin rounded-full h-4 w-4" /> Lendo Conteúdo e Processando...</>
                    ) : (
                        <><Play className="w-5 h-5" /> Iniciar Processamento Automático</>
                    )}
                 </button>
                 {processingResults && (
                   <div className="mt-4 text-sm text-gray-600 bg-gray-50 p-2 rounded border border-gray-200 text-center">
                      <p><strong>Resultado do Processamento:</strong> {processingResults.total} arquivos analisados.</p>
                      <div className="flex gap-4 justify-center mt-1">
                          <span className="text-green-600 font-bold">{processingResults.processed} aceitos e enviados</span>
                          <span className="text-red-500 font-bold">{processingResults.filtered} filtrados/erros</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Os arquivos aceitos já estão disponíveis na aba "Envio".</p>
                   </div>
                 )}
            </div>
        </div>
      </div>

      {/* Document Matrix Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        
        <div className="p-4 border-b border-gray-100 bg-gray-50">
           {/* Filters Bar */}
           <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-700">
                Matriz de Status - <span className="text-blue-600">{activeCompetence}</span>
              </h3>
              <div className="flex gap-3 text-sm">
                <span className="flex items-center gap-1 text-green-600"><Check className="w-4 h-4" /> Enviado</span>
                <span className="flex items-center gap-1 text-red-500"><X className="w-4 h-4" /> Pendente</span>
              </div>
           </div>
           
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
                   {visibleMatrixCategories.map(cat => (
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
                            onClick={() => handleToggleStatusLocal(company.id, cat)}
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