import React, { useState, useEffect, useRef } from 'react';
import { Mail, Inbox, Send, RefreshCw, Plus, Trash, Search, Paperclip, X, ChevronLeft, Loader2, File, ChevronRight, Bold, Italic, List, Type, AlignLeft } from 'lucide-react';
import { api } from '../services/api';

// --- EDITOR DE TEXTO RICO SIMPLES ---
const RichTextEditor: React.FC<{ value: string, onChange: (html: string) => void }> = ({ value, onChange }) => {
    const editorRef = useRef<HTMLDivElement>(null);

    const execCmd = (cmd: string, arg?: string) => {
        document.execCommand(cmd, false, arg);
        if (editorRef.current) onChange(editorRef.current.innerHTML);
    };

    return (
        <div className="border border-gray-300 rounded-lg overflow-hidden flex flex-col flex-1 h-full">
            <div className="bg-gray-50 border-b border-gray-200 p-2 flex gap-2">
                <button type="button" onClick={() => execCmd('bold')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Negrito"><Bold className="w-4 h-4" /></button>
                <button type="button" onClick={() => execCmd('italic')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Itálico"><Italic className="w-4 h-4" /></button>
                <div className="w-px bg-gray-300 mx-1"></div>
                <button type="button" onClick={() => execCmd('insertUnorderedList')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Lista"><List className="w-4 h-4" /></button>
                <button type="button" onClick={() => execCmd('insertParagraph')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Parágrafo"><AlignLeft className="w-4 h-4" /></button>
                <div className="w-px bg-gray-300 mx-1"></div>
                <select onChange={(e) => execCmd('fontSize', e.target.value)} className="text-xs border border-gray-300 rounded px-1 outline-none bg-white h-7">
                    <option value="3">Normal</option>
                    <option value="1">Pequeno</option>
                    <option value="5">Grande</option>
                    <option value="7">Enorme</option>
                </select>
            </div>
            <div 
                ref={editorRef}
                contentEditable
                className="flex-1 p-4 outline-none overflow-y-auto text-sm"
                onInput={(e) => onChange(e.currentTarget.innerHTML)}
                dangerouslySetInnerHTML={{ __html: value }}
                style={{ minHeight: '200px' }}
            ></div>
        </div>
    );
};

const EmailClient: React.FC = () => {
  const [activeBox, setActiveBox] = useState<'INBOX' | 'Sent'>('INBOX');
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Reading State
  const [readingEmail, setReadingEmail] = useState<any | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [showReadModal, setShowReadModal] = useState(false);

  // Compose State
  const [composing, setComposing] = useState(false);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('<div><br></div>'); // Start empty div
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const fetchEmails = async () => {
    setLoading(true);
    setReadingEmail(null);
    try {
      const data = await api.getEmails(activeBox);
      setEmails(data);
    } catch (e) {
      console.error(e);
      alert("Erro ao buscar e-mails.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, [activeBox]);

  const handleReadEmail = async (email: any) => {
    setLoadingContent(true);
    setShowReadModal(true);
    try {
      const fullContent = await api.getEmailContent(email.id, activeBox);
      setReadingEmail({ ...email, ...fullContent });
    } catch (e) {
      console.error(e);
      alert("Erro ao carregar conteúdo do e-mail.");
      setShowReadModal(false);
    } finally {
      setLoadingContent(false);
    }
  };

  const handleNavigateEmail = (direction: 'prev' | 'next') => {
      if (!readingEmail) return;
      const currentIndex = emails.findIndex(e => e.id === readingEmail.id);
      if (currentIndex === -1) return;

      const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      if (nextIndex >= 0 && nextIndex < emails.length) {
          handleReadEmail(emails[nextIndex]);
      }
  };

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments(Array.from(e.target.files));
    }
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    
    const formData = new FormData();
    formData.append('to', to);
    formData.append('subject', subject);
    formData.append('htmlBody', bodyHtml);
    
    attachments.forEach(file => {
      formData.append('attachments', file);
    });

    try {
      await api.sendEmailDirect(formData);
      alert("E-mail enviado com sucesso e registrado no sistema!");
      setComposing(false);
      setTo('');
      setSubject('');
      setBodyHtml('<div><br></div>');
      setAttachments([]);
      if (activeBox === 'Sent') fetchEmails();
    } catch (error: any) {
      alert("Erro ao enviar: " + error.message);
    } finally {
      setSending(false);
    }
  };

  const renderSidebar = () => (
    <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-full flex-shrink-0">
      <div className="p-4">
        <button 
          onClick={() => setComposing(true)}
          className="w-full bg-indigo-600 text-white py-3 rounded-lg flex items-center justify-center gap-2 font-bold hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" /> Escrever
        </button>
      </div>
      <nav className="flex-1 px-2 space-y-1">
        <button 
          onClick={() => setActiveBox('INBOX')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeBox === 'INBOX' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100'}`}
        >
          <div className="flex items-center gap-3">
            <Inbox className="w-4 h-4" /> Caixa de Entrada
          </div>
        </button>
        <button 
          onClick={() => setActiveBox('Sent')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeBox === 'Sent' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100'}`}
        >
          <div className="flex items-center gap-3">
            <Send className="w-4 h-4" /> Enviados (Sistema)
          </div>
        </button>
      </nav>
    </div>
  );

  return (
    <div className="h-[calc(100vh-100px)] -m-6 flex bg-white border-t border-gray-200">
      {renderSidebar()}
      
      {/* Email List - Full Width */}
      <div className="flex-1 flex flex-col h-full bg-white">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white sticky top-0 z-10">
            <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                {activeBox === 'INBOX' ? 'Caixa de Entrada' : 'E-mails Disparados pelo Sistema'}
                {loading && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
            </h2>
            <button onClick={fetchEmails} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full" title="Atualizar">
                <RefreshCw className="w-4 h-4" />
            </button>
        </div>
        <div className="flex-1 overflow-y-auto">
            {emails.length === 0 && !loading && (
                <div className="p-10 text-center text-gray-400 flex flex-col items-center">
                    <Mail className="w-12 h-12 mb-2 opacity-20" />
                    <p>Nenhum e-mail encontrado.</p>
                </div>
            )}
            {emails.map((email) => (
            <div 
                key={email.id}
                onClick={() => handleReadEmail(email)}
                className="p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors flex justify-between items-center"
            >
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                        <span className={`font-semibold text-sm truncate max-w-[200px] ${activeBox === 'INBOX' ? 'text-gray-800' : 'text-indigo-700'}`}>
                            {email.from}
                        </span>
                        <span className="text-xs text-gray-400">
                            {new Date(email.date).toLocaleString()}
                        </span>
                    </div>
                    <div className="font-medium text-sm text-gray-700 truncate">
                        {email.subject}
                    </div>
                </div>
            </div>
            ))}
        </div>
      </div>

      {/* Read Modal */}
      {showReadModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                {/* Header with Navigation */}
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <div className="flex gap-2">
                        <button onClick={() => handleNavigateEmail('prev')} className="p-1.5 hover:bg-white rounded border border-transparent hover:border-gray-300 text-gray-600 transition-all" title="Anterior"><ChevronLeft className="w-5 h-5" /></button>
                        <button onClick={() => handleNavigateEmail('next')} className="p-1.5 hover:bg-white rounded border border-transparent hover:border-gray-300 text-gray-600 transition-all" title="Próximo"><ChevronRight className="w-5 h-5" /></button>
                    </div>
                    <h3 className="font-bold text-gray-700">Visualização de Mensagem</h3>
                    <button onClick={() => { setShowReadModal(false); setReadingEmail(null); }} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-white rounded-full">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {loadingContent || !readingEmail ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-8 bg-white">
                        <div className="border-b border-gray-100 pb-6 mb-6">
                            <h1 className="text-2xl font-bold text-gray-900 mb-4">{readingEmail.subject}</h1>
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-semibold text-gray-800 text-lg">{readingEmail.from}</div>
                                    <div className="text-sm text-gray-500">Para: {readingEmail.to}</div>
                                </div>
                                <div className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                                    {new Date(readingEmail.date).toLocaleString()}
                                </div>
                            </div>
                        </div>

                        <div 
                            className="prose max-w-none text-gray-800"
                            dangerouslySetInnerHTML={{ __html: readingEmail.html || readingEmail.text || '' }}
                        />

                        {readingEmail.attachments && readingEmail.attachments.length > 0 && (
                            <div className="mt-8 pt-4 border-t border-gray-100">
                                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                    <Paperclip className="w-4 h-4" /> Anexos ({readingEmail.attachments.length})
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                    {readingEmail.attachments.map((att: any, idx: number) => (
                                        <div key={idx} className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg text-sm border border-gray-200">
                                            <File className="w-4 h-4 text-gray-500" />
                                            <span className="truncate max-w-[150px]">{att.filename}</span>
                                            <span className="text-xs text-gray-400">({att.size ? Math.round(att.size / 1024) + ' KB' : 'N/A'})</span>
                                            {att.content && (
                                                <a 
                                                    href={`data:${att.contentType};base64,${att.content}`} 
                                                    download={att.filename}
                                                    className="text-indigo-600 hover:underline text-xs font-bold ml-2"
                                                >
                                                    Baixar
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
      )}

      {/* Compose Modal */}
      {composing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 className="font-bold text-gray-800">Nova Mensagem</h3>
                    <button onClick={() => setComposing(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded-full">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <form onSubmit={handleSendEmail} className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 space-y-4 flex-1 flex flex-col overflow-hidden">
                        <input 
                            type="email" 
                            placeholder="Para" 
                            className="w-full border-b border-gray-200 py-2 outline-none focus:border-indigo-500"
                            value={to}
                            onChange={e => setTo(e.target.value)}
                            required
                        />
                        <input 
                            type="text" 
                            placeholder="Assunto" 
                            className="w-full border-b border-gray-200 py-2 outline-none focus:border-indigo-500 font-medium"
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                            required
                        />
                        
                        <div className="flex-1 overflow-hidden mt-2">
                            <RichTextEditor value={bodyHtml} onChange={setBodyHtml} />
                        </div>
                        
                        {attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-2">
                                {attachments.map((file, idx) => (
                                    <div key={idx} className="bg-gray-100 px-3 py-1 rounded-full text-xs flex items-center gap-2 border border-gray-200">
                                        {file.name}
                                        <button type="button" onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}><X className="w-3 h-3 hover:text-red-500" /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="p-4 border-t border-gray-100 flex justify-between items-center bg-gray-50 rounded-b-xl">
                        <label className="cursor-pointer p-2 hover:bg-gray-200 rounded text-gray-600 transition-colors">
                            <Paperclip className="w-5 h-5" />
                            <input type="file" multiple className="hidden" onChange={handleAttachmentChange} />
                        </label>
                        <div className="flex gap-3">
                            <button type="button" onClick={() => setComposing(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg">Descartar</button>
                            <button 
                                type="submit" 
                                disabled={sending}
                                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold flex items-center gap-2 disabled:opacity-70"
                            >
                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                Enviar
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default EmailClient;