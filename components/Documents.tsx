
import React, { useState, useRef, useEffect } from 'react';
import { Upload, CalendarCheck, Search, FileText, Check, X, Play, Settings as SettingsIcon, Filter, FolderArchive, Loader2 } from 'lucide-react';
import { DOCUMENT_CATEGORIES } from '../constants';
import { UserSettings, Document, Company } from '../types';
import { identifyCategory, identifyCompany } from '../utils/documentProcessor';
import { api } from '../services/api';
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
  documents: initialDocuments,
  onToggleStatus
}) => {
  const [competence, setCompetence] = useState('09/2023');
  const [activeCompetence, setActiveCompetence] = useState('09/2023');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [dbStatuses, setDbStatuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [localPath, setLocalPath] = useState('');
  const [processingCompetence, setProcessingCompetence] = useState('09/2023');
  const [processing, setProcessing] = useState(false);
  const [processingResults, setProcessingResults] = useState<{total: number, processed: number, filtered: number} | null>(null);
  
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixStatusFilter, setMatrixStatusFilter] = useState<'all' | 'pending' | 'sent'>('all');
  const [matrixCategoryFilter, setMatrixCategoryFilter] = useState<string>('all');

  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
      setLoading(true);
      try {
          const [comps, statuses] = await Promise.all([
              api.getCompanies(),
              api.getDocumentStatuses(activeCompetence)
          ]);
          setCompanies(comps);
          setDbStatuses(statuses);
      } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [activeCompetence]);

  const visibleMatrixCategories = userSettings.visibleDocumentCategories.length > 0 
    ? userSettings.visibleDocumentCategories : DOCUMENT_CATEGORIES.slice(0, 8);

  const handleProcessClick = () => { if (fileInputRef.current) fileInputRef.current.click(); };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        // Fix: Explicitly cast Array.from result to File[] to avoid 'unknown' type issues
        const files = Array.from(e.target.files) as File[];
        setLocalPath(files.length > 1 ? `${files.length} arquivos selecionados` : files[0].name);
        
        const zipFile = files.find(f => f.name.endsWith('.zip') || f.name.endsWith('.rar'));
        if (zipFile) {
            await processZipFile(zipFile);
        } else {
            await processPdfFiles(files);
        }
    }
  };

  const processZipFile = async (zipFile: File) => {
      setProcessing(true);
      setProcessingResults(null);
      try {
        const zip = await JSZip.loadAsync(zipFile);
        const fileNames: string[] = [];
        // Fix: Cast entry to any to bypass potential library typing conflicts where entry is unknown
        zip.forEach((path, entry: any) => { if (!entry.dir) fileNames.push(entry.name); });

        let processed = 0;
        let filtered = 0;
        fileNames.forEach(name => {
            const category = identifyCategory(name, userSettings.categoryKeywords);
            const company = identifyCompany(name, companies);
            if (!category || !company) { filtered++; return; }
            processed++;
        });
        setProcessingResults({ total: fileNames.length, processed, filtered });
      } catch (e) { alert("Erro ZIP"); } finally { setProcessing(false); }
  };

  const processPdfFiles = async (pdfFiles: File[]) => {
    setProcessing(true);
    setProcessingResults(null);
    try {
        let processed = 0;
        let filtered = 0;
        pdfFiles.forEach(file => {
            const category = identifyCategory(file.name, userSettings.categoryKeywords);
            const company = identifyCompany(file.name, companies);
            if (!category || !company) { filtered++; return; }
            processed++;
        });
        setProcessingResults({ total: pdfFiles.length, processed, filtered });
    } catch (e) { alert("Erro PDF"); } finally { setProcessing(false); }
  };

  const toggleCompanySelection = (id: string) => setSelectedCompanies(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  const toggleSelectAllCompanies = () => setSelectedCompanies(selectedCompanies.length === companies.length ? [] : companies.map(c => String(c.id)));
  const toggleCategorySelection = (cat: string) => setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  const toggleSelectAllCategories = () => setSelectedCategories(selectedCategories.length === DOCUMENT_CATEGORIES.length ? [] : DOCUMENT_CATEGORIES);

  const getStatus = (companyId: number, category: string) => {
      const dbStatus = dbStatuses.find(s => s.companyId === companyId && s.category === category && s.competence === activeCompetence);
      if (dbStatus) return dbStatus.status;
      const doc = initialDocuments.find(d => d.companyId === companyId && d.category === category && d.competence === activeCompetence);
      return doc ? doc.status : 'pending';
  };

  const handleToggleStatusLocal = async (companyId: number, category: string) => {
      const current = getStatus(companyId, category);
      const newStatus = current === 'sent' ? 'pending' : 'sent';
      const updated = [...dbStatuses];
      const idx = updated.findIndex(s => s.companyId === companyId && s.category === category);
      if (idx >= 0) updated[idx].status = newStatus;
      else updated.push({ companyId, category, competence: activeCompetence, status: newStatus });
      setDbStatuses(updated);
      try {
          await api.updateDocumentStatus(companyId, category, activeCompetence, newStatus);
          onToggleStatus(companyId, category, activeCompetence);
      } catch (e) {}
  };

  const getMatrixCategories = () => matrixCategoryFilter !== 'all' ? [matrixCategoryFilter] : visibleMatrixCategories;
  const getMatrixCompanies = () => companies.filter(company => {
      if (!company.name.toLowerCase().includes(matrixSearch.toLowerCase())) return false;
      if (matrixStatusFilter !== 'all') {
          if (!getMatrixCategories().some(cat => getStatus(company.id, cat) === matrixStatusFilter)) return false;
      }
      return true;
  });

  if (loading && companies.length === 0) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="bg-blue-600 text-white p-4 font-bold flex items-center gap-2"><CalendarCheck /> Verificar por Competência</div>
        <div className="p-6">
            <form onSubmit={e => { e.preventDefault(); setActiveCompetence(competence); }} className="flex gap-4 items-end">
                <div className="flex-1">
                    <label className="text-sm font-semibold mb-1 block">Competência (MM/AAAA)</label>
                    <input type="text" className="w-full border rounded-lg p-2" value={competence} onChange={e => setCompetence(e.target.value)} required />
                </div>
                <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold">Verificar</button>
            </form>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-blue-100 overflow-hidden">
         <div className="bg-blue-50 p-4 border-b flex items-center gap-2 text-blue-800 font-bold"><SettingsIcon /> Processamento Automático</div>
        <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                    <label className="text-sm font-semibold block mb-1">Arquivos (ZIP ou PDFs)</label>
                    <div className="flex items-center border rounded-lg bg-gray-50 cursor-pointer p-2" onClick={handleProcessClick}>
                         <FolderArchive className="w-4 h-4 mr-2" />
                         <span className="text-xs truncate">{localPath || 'Selecionar...'}</span>
                         <input type="file" multiple accept=".zip,.rar,.pdf" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                    </div>
                </div>
                <div>
                   <label className="text-sm font-semibold block mb-1">Competência Alvo</label>
                   <input type="text" className="w-full border rounded-lg p-2" value={processingCompetence} onChange={e => setProcessingCompetence(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-1">Filtrar Empresas</label>
                  <button className="w-full text-left border rounded-lg p-2 text-sm bg-white truncate">
                    {selectedCompanies.length === 0 ? 'Todas' : `${selectedCompanies.length} selec.`}
                  </button>
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-1">Filtrar Categorias</label>
                  <button className="w-full text-left border rounded-lg p-2 text-sm bg-white truncate">
                    {selectedCategories.length === 0 ? 'Todas' : `${selectedCategories.length} selec.`}
                  </button>
                </div>
            </div>
            <div className="flex flex-col items-center">
                 <button onClick={handleProcessClick} disabled={processing} className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold flex items-center gap-2 shadow-lg disabled:opacity-50">
                    {processing ? <Loader2 className="animate-spin" /> : <Play />} Iniciar Processamento
                 </button>
                 {processingResults && (
                   <div className="mt-4 text-xs text-gray-600">
                      <strong>Resultado:</strong> {processingResults.total} encontrados, <span className="text-green-600 font-bold">{processingResults.processed} aceitos</span>.
                   </div>
                 )}
            </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
            <h3 className="font-bold">Matriz de Status - {activeCompetence}</h3>
            <div className="flex gap-4">
                <input type="text" placeholder="Buscar..." className="border rounded px-2 py-1 text-xs" value={matrixSearch} onChange={e => setMatrixSearch(e.target.value)} />
                <select className="border rounded px-2 py-1 text-xs" value={matrixCategoryFilter} onChange={e => setMatrixCategoryFilter(e.target.value)}>
                    <option value="all">Todas as Categorias</option>
                    {visibleMatrixCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="p-4 text-left min-w-[200px] sticky left-0 bg-gray-50 z-10">Empresa</th>
                {getMatrixCategories().map(cat => <th key={cat} className="p-4 text-center">{cat}</th>)}
                <th className="p-4 text-center sticky right-0 bg-gray-50 z-10 border-l">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {getMatrixCompanies().map(company => (
                <tr key={company.id} className="hover:bg-gray-50">
                  <td className="p-4 font-medium sticky left-0 bg-white group-hover:bg-gray-50">{company.name}</td>
                  {getMatrixCategories().map(cat => (
                      <td key={cat} className="p-4 text-center">
                        <button onClick={() => handleToggleStatusLocal(company.id, cat)} className={`w-8 h-8 rounded-full border flex items-center justify-center mx-auto ${getStatus(company.id, cat) === 'sent' ? 'bg-green-100 text-green-600 border-green-200' : 'bg-red-50 text-red-500 border-red-100'}`}>
                            {getStatus(company.id, cat) === 'sent' ? <Check size={14} /> : <X size={14} />}
                        </button>
                      </td>
                  ))}
                  <td className="p-4 text-center sticky right-0 bg-white border-l">
                      <button onClick={() => onNavigateToUpload(company.id, activeCompetence)} className="text-blue-600 hover:bg-blue-50 p-1 rounded"><Upload size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Documents;
