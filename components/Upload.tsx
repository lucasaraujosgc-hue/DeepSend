
import React, { useState, useEffect } from 'react';
import { Upload as UploadIcon, X, FileText, Calendar, AlertCircle, Loader2 } from 'lucide-react';
import { DOCUMENT_CATEGORIES } from '../constants';
import { calcularTodosVencimentos } from '../utils/dateHelpers';
import { UploadedFile, Company, UserSettings } from '../types';
import { api } from '../services/api';
import { identifyCategory, extractTextFromPDF } from '../utils/documentProcessor'; 
import { DEFAULT_USER_SETTINGS } from '../constants';

interface UploadProps {
  preFillData?: {
    companyId: number;
    competence: string;
  } | null;
  onUploadSuccess: (files: UploadedFile[], companyId: number, competence: string) => void;
  userSettings?: UserSettings; 
}

const Upload: React.FC<UploadProps> = ({ preFillData, onUploadSuccess, userSettings = DEFAULT_USER_SETTINGS }) => {
  const [competence, setCompetence] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | string>('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [calculatedDates, setCalculatedDates] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  useEffect(() => {
    setLoadingCompanies(true);
    api.getCompanies()
        .then(data => setCompanies(data))
        .catch(err => console.error("Erro ao buscar empresas", err))
        .finally(() => setLoadingCompanies(false));

    if (preFillData) {
      setCompetence(preFillData.competence);
      setSelectedCompanyId(preFillData.companyId);
    } else {
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yyyy = now.getFullYear();
      setCompetence(`${mm}/${yyyy}`);
    }
  }, [preFillData]);

  useEffect(() => {
    if (competence.match(/^\d{2}\/\d{4}$/)) {
        const dates = calcularTodosVencimentos(competence, userSettings.categoryRules);
        setCalculatedDates(dates);
        setFiles(prev => prev.map(f => {
            if (dates[f.category]) {
                return { ...f, dueDate: dates[f.category] };
            }
            return f;
        }));
    }
  }, [competence, userSettings]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(Array.from(e.target.files));
    }
  };

  const processFiles = async (fileList: File[]) => {
    setIsProcessing(true);
    
    // Process files sequentially or in parallel, but await text extraction
    const newFiles: UploadedFile[] = [];

    for (const file of fileList) {
        let textContent = file.name; // Padrão: nome do arquivo

        // Se for PDF, tenta extrair o texto
        if (file.type === 'application/pdf') {
            try {
                const extracted = await extractTextFromPDF(file);
                if (extracted && extracted.length > 10) {
                    textContent += " " + extracted; // Concatena para ter mais contexto
                }
            } catch (err) {
                console.warn(`Erro lendo PDF ${file.name}`, err);
            }
        }

        let category = '';
        // Pass user settings priority
        const identified = identifyCategory(textContent, userSettings.categoryKeywords, userSettings.priorityCategories);
        
        if (identified) {
            category = identified;
        } else {
            // Fallback: Primeira categoria
            category = DOCUMENT_CATEGORIES[0];
        }

        let dueDate = '';
        if (category && calculatedDates[category]) {
            dueDate = calculatedDates[category];
        }

        newFiles.push({
            name: file.name,
            size: file.size,
            category: category,
            dueDate: dueDate,
            file: file
        });
    }

    setFiles(prev => [...prev, ...newFiles]);
    setIsProcessing(false);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const updateFileCategory = (index: number, newCategory: string) => {
    setFiles(prev => prev.map((f, i) => {
        if (i === index) {
            const newDate = calculatedDates[newCategory] || f.dueDate;
            return { ...f, category: newCategory, dueDate: newDate };
        }
        return f;
    }));
  };

  const handleUploadClick = async () => {
    if (!selectedCompanyId || !competence) {
        alert('Selecione uma empresa e uma competência');
        return;
    }
    
    setIsUploading(true);
    try {
        const uploadedFilesWithServerNames = await Promise.all(files.map(async (f) => {
            const res = await api.uploadFile(f.file);
            return {
                ...f,
                serverFilename: res.filename
            };
        }));

        onUploadSuccess(uploadedFilesWithServerNames, Number(selectedCompanyId), competence);
        
        setFiles([]);
        setIsSuccess(true);
        setTimeout(() => setIsSuccess(false), 3000);
    } catch (error) {
        console.error("Erro no upload", error);
        alert("Erro ao enviar arquivos para o servidor.");
    } finally {
        setIsUploading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Upload de Documentos</h1>
          <p className="text-gray-500">Envie arquivos e o sistema calculará os vencimentos automaticamente.</p>
        </div>
      </div>

      {isSuccess && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">Sucesso!</strong>
            <span className="block sm:inline"> Arquivos enviados com sucesso para a aba de Envio.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
            <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-blue-500" /> Informações Básicas
            </h3>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                        Empresa {loadingCompanies && <Loader2 className="w-3 h-3 animate-spin" />}
                    </label>
                    <select 
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        value={selectedCompanyId}
                        onChange={e => setSelectedCompanyId(e.target.value)}
                        disabled={loadingCompanies}
                    >
                        <option value="">Selecione uma empresa...</option>
                        {companies.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.docNumber})</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Competência (MM/AAAA)</label>
                    <input 
                        type="text"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="MM/AAAA"
                        value={competence}
                        onChange={e => {
                            let val = e.target.value.replace(/\D/g, '');
                            if (val.length > 2) val = val.substring(0, 2) + '/' + val.substring(2, 6);
                            setCompetence(val);
                        }}
                    />
                </div>
            </div>
        </div>

        <div 
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors
                ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 bg-gray-50'}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <UploadIcon className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800">Arraste arquivos aqui</h3>
            <p className="text-gray-500 mb-4">ou clique para selecionar do computador</p>
            <input type="file" multiple className="hidden" id="file-input" onChange={handleFileSelect} />
            <label htmlFor="file-input" className="bg-blue-600 text-white px-6 py-2 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
                Selecionar Arquivos
            </label>
        </div>
      </div>

      {isProcessing && (
          <div className="text-center p-4">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500" />
              <p className="text-sm text-gray-500 mt-2">Lendo arquivos e identificando categorias...</p>
          </div>
      )}

      {files.length > 0 && !isProcessing && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50">
                  <h3 className="font-bold text-gray-700">Arquivos Selecionados ({files.length})</h3>
              </div>
              <div className="p-4 space-y-3">
                  {files.map((file, idx) => (
                      <div key={idx} className="flex flex-col md:flex-row gap-4 p-4 border border-gray-200 rounded-lg bg-white items-start md:items-center">
                          <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                  <FileText className="w-4 h-4 text-gray-400" />
                                  <span className="font-medium text-gray-800 truncate">{file.name}</span>
                              </div>
                              <span className="text-xs text-gray-500">{formatSize(file.size)}</span>
                          </div>
                          <div className="flex-1 w-full md:w-auto">
                              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Categoria</label>
                              <select className="w-full text-sm border-gray-300 rounded px-2 py-1.5 border" value={file.category} onChange={(e) => updateFileCategory(idx, e.target.value)}>
                                  {DOCUMENT_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                              </select>
                          </div>
                          <div className="w-full md:w-40">
                              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Vencimento</label>
                              <input type="text" className="w-full text-sm border-gray-300 rounded px-2 py-1.5 border" value={file.dueDate} placeholder="DD/MM/AAAA" onChange={(e) => { const newFiles = [...files]; newFiles[idx].dueDate = e.target.value; setFiles(newFiles); }} />
                          </div>
                          <button onClick={() => removeFile(idx)} className="text-gray-400 hover:text-red-500 p-2"><X className="w-5 h-5" /></button>
                      </div>
                  ))}
              </div>
              <div className="p-4 border-t border-gray-100 flex justify-end">
                  <button 
                    onClick={handleUploadClick}
                    disabled={isUploading}
                    className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 shadow-lg shadow-green-900/20 font-medium flex items-center gap-2 disabled:opacity-70"
                  >
                      {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadIcon className="w-5 h-5" />}
                      {isUploading ? 'Enviando...' : 'Enviar Todos'}
                  </button>
              </div>
          </div>
      )}
    </div>
  );
};

export default Upload;
