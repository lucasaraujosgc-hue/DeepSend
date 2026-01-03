
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Kanban from './components/Kanban';
import Companies from './components/Companies';
import WhatsAppConnect from './components/WhatsAppConnect';
import Documents from './components/Documents';
import Upload from './components/Upload';
import BulkSend from './components/BulkSend';
import ScheduledMessages from './components/ScheduledMessages';
import Settings from './components/Settings';
import Send from './components/Send'; 
import Login from './components/Login';
import { DEFAULT_USER_SETTINGS, MOCK_DOCUMENTS, DOCUMENT_CATEGORIES as DEFAULT_CATEGORIES } from './constants';
import { UserSettings, Document, UploadedFile } from './types';
import { api } from './services/api';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activePage, setActivePage] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [documents, setDocuments] = useState<Document[]>(MOCK_DOCUMENTS);
  const [uploadPreFill, setUploadPreFill] = useState<{companyId: number, competence: string} | null>(null);

  // Computes the full list of categories (Default + Custom from settings)
  const fullCategoriesList = [
      ...DEFAULT_CATEGORIES,
      ...(userSettings.customCategories || [])
  ];

  useEffect(() => {
    const token = localStorage.getItem('cm_auth_token');
    if (token) {
        setIsAuthenticated(true);
        loadSettings();
    }
  }, []);

  const loadSettings = async () => {
      try {
          const settings = await api.getSettings();
          if (settings) {
              // Merge with default to ensure structure integrity
              setUserSettings({ ...DEFAULT_USER_SETTINGS, ...settings });
          }
      } catch (e) {
          console.error("Failed to load settings", e);
      }
  };

  const handleLoginSuccess = (token?: string, remember?: boolean) => {
      if (remember && token) {
          localStorage.setItem('cm_auth_token', token);
      }
      setIsAuthenticated(true);
      loadSettings();
  };

  const handleLogout = () => {
      localStorage.removeItem('cm_auth_token');
      setIsAuthenticated(false);
      setActivePage('dashboard');
      setUserSettings(DEFAULT_USER_SETTINGS);
  };

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const handleNavigateToUpload = (companyId: number, competence: string) => {
    setUploadPreFill({ companyId, competence });
    setActivePage('upload');
  };

  const handleNavigateToDocuments = () => {
    setActivePage('documents');
  }

  const handleUploadSuccess = (files: UploadedFile[], companyId: number, competence: string) => {
      const newDocs: Document[] = files.map(f => ({
          id: Date.now() + Math.random(),
          name: f.name,
          category: f.category,
          competence: competence,
          dueDate: f.dueDate,
          status: 'pending', 
          companyId: companyId,
          companyName: 'Loading...', 
          file: f.file,
          serverFilename: f.serverFilename
      }));
      setDocuments(prev => [...prev, ...newDocs]);
  };

  const handleSaveSettings = async (newSettings: UserSettings) => {
      try {
          await api.saveSettings(newSettings);
          setUserSettings(newSettings);
      } catch (e) {
          alert("Erro ao salvar configurações");
      }
  };

  const handleToggleStatus = (companyId: number, category: string, competence: string) => {
      setDocuments(prev => {
          const existingIndex = prev.findIndex(d => 
              d.companyId === companyId && 
              d.category === category && 
              d.competence === competence
          );

          if (existingIndex >= 0) {
              const newDocs = [...prev];
              newDocs[existingIndex] = {
                  ...newDocs[existingIndex],
                  status: newDocs[existingIndex].status === 'sent' ? 'pending' : 'sent'
              };
              return newDocs;
          } else {
              const newDoc: Document = {
                  id: Date.now(),
                  name: `Manual - ${category}`,
                  category: category,
                  competence: competence,
                  dueDate: '',
                  status: 'sent', 
                  companyId: companyId,
                  companyName: 'Manual Entry',
                  isManual: true
              };
              return [...prev, newDoc];
          }
      });
  };

  const handleSendDocuments = (docIds: number[]) => {
      setDocuments(prev => prev.map(doc => {
          if (docIds.includes(doc.id)) {
              return { ...doc, status: 'sent' };
          }
          return doc;
      }));
  };

  const handleDeleteDocument = (id: number) => {
      if(window.confirm("Tem certeza que deseja remover este arquivo da lista de envio?")) {
          setDocuments(prev => prev.filter(d => d.id !== id));
      }
  };

  const handleClearPendingDocuments = (competenceFilter: string) => {
      if(window.confirm(`Tem certeza que deseja excluir TODOS os arquivos pendentes da competência ${competenceFilter}?`)) {
          setDocuments(prev => prev.filter(d => !(d.status === 'pending' && d.competence === competenceFilter)));
      }
  };

  const renderContent = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard />;
      case 'companies':
        return <Companies />;
      case 'whatsapp':
        return <WhatsAppConnect />;
      case 'documents':
        // TODO: Pass fullCategoriesList to Documents if needed for dropdowns, 
        // though it uses userSettings.visibleDocumentCategories mainly
        return <Documents 
                  userSettings={userSettings} 
                  onNavigateToUpload={handleNavigateToUpload}
                  documents={documents}
                  onToggleStatus={handleToggleStatus}
                  onUploadSuccess={handleUploadSuccess}
               />;
      case 'upload':
        return <Upload 
                  preFillData={uploadPreFill} 
                  onUploadSuccess={handleUploadSuccess}
                  userSettings={userSettings}
               />;
      case 'send':
        return <Send 
                  documents={documents}
                  onSendDocuments={handleSendDocuments}
                  onNavigateToDocuments={handleNavigateToDocuments}
                  userSettings={userSettings}
                  onDeleteDocument={handleDeleteDocument}
                  onClearPendingDocuments={handleClearPendingDocuments}
               />;
      case 'bulksend':
        return <BulkSend />;
      case 'scheduled':
        return <ScheduledMessages />;
      case 'settings':
        return <Settings 
                  settings={userSettings} 
                  onSave={handleSaveSettings} 
                  availableCategories={fullCategoriesList} 
                />;
      default:
        return <div>Página não encontrada</div>;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar 
        activePage={activePage} 
        setActivePage={setActivePage} 
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        onLogout={handleLogout}
      />
      
      <main className="flex-1 overflow-auto w-full relative">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-30">
          <h2 className="text-lg font-semibold text-gray-700 capitalize">
            {activePage === 'bulksend' ? 'Envio em Massa' : activePage === 'settings' ? 'Usuário' : activePage === 'send' ? 'Envio' : activePage}
          </h2>
          <div className="flex items-center gap-4">
             <div className="text-sm text-right hidden sm:block">
                <p className="font-bold text-gray-700">Usuário</p>
                <p className="text-gray-500 text-xs">Conectado</p>
             </div>
             <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold border-2 border-white shadow-sm">
                US
             </div>
          </div>
        </header>

        <div className="p-6 max-w-7xl mx-auto pb-20">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;
