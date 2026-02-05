import React, { useState, useEffect } from 'react';
import { Mail, Inbox, Send, RefreshCw, Plus, Trash, Search, Paperclip, X, ChevronLeft, Loader2, File } from 'lucide-react';
import { api } from '../services/api';

const EmailClient: React.FC = () => {
  const [activeBox, setActiveBox] = useState<'INBOX' | 'Sent'>('INBOX');
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [readingEmail, setReadingEmail] = useState<any | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [composing, setComposing] = useState(false);

  // Compose State
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
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
      alert("Erro ao buscar e-mails. Verifique se o servidor suporta IMAP.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, [activeBox]);

  const handleReadEmail = async (email: any) => {
    setLoadingContent(true);
    try {
      const fullContent = await api.getEmailContent(email.id, activeBox);
      setReadingEmail({ ...email, ...fullContent });
    } catch (e) {
      console.error(e);
      alert("Erro ao carregar conteúdo do e-mail.");
    } finally {
      setLoadingContent(false);
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
    // Simples conversão de quebra de linha para HTML BR para envio básico
    const htmlBody = body.replace(/\n/g, '<br>');
    formData.append('htmlBody', htmlBody);
    
    attachments.forEach(file => {
      formData.append('attachments', file);
    });

    try {
      await api.sendEmailDirect(formData);
      alert("E-mail enviado com sucesso e salvo em Itens Enviados!");
      setComposing(false);
      setTo('');
      setSubject('');
      setBody('');
      setAttachments([]);
      if (activeBox === 'Sent') fetchEmails(); // Refresh se estiver na caixa de saída
    } catch (error: any) {
      alert("Erro ao enviar: " + error.message);
    } finally {
      setSending(false);
    }
  };

  const renderSidebar = () => (
    <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-full">
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
            <Send className="w-4 h-4" /> Enviados
          </div>
        </button>
      </nav>
    </div>
  );

  const renderEmailList = () => (
    <div className={`flex-1 flex flex-col h-full bg-white ${readingEmail ? 'hidden md:flex md:w-1/3 md:border-r' : 'w-full'}`}>
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white sticky top-0 z-10">
        <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
            {activeBox === 'INBOX' ? 'Entrada' : 'Enviados'}
            {loading && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
        </h2>
        <button onClick={fetchEmails} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full" title="Atualizar">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {emails.length === 0 && !loading && (
            <div className="p-8 text-center text-gray-400">
                A pasta está vazia.
            </div>
        )}
        {emails.map((email) => (
          <div 
            key={email.id}
            onClick={() => handleReadEmail(email)}
            className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${readingEmail?.id === email.id ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : ''}`}
          >
            <div className="flex justify-between items-start mb-1">
              <span className="font-semibold text-gray-800 text-sm truncate w-2/3">
                  {email.from}
              </span>
              <span className="text-xs text-gray-500">
                  {new Date(email.date).toLocaleDateString()}
              </span>
            </div>
            <div className="font-medium text-sm text-gray-700 mb-1 truncate">
                {email.subject}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderEmailContent = () => {
    if (!readingEmail && !loadingContent) {
        return (
            <div className="hidden md:flex flex-1 items-center justify-center bg-gray-50 text-gray-400 flex-col gap-4">
                <Mail className="w-16 h-16 text-gray-300" />
                <p>Selecione um e-mail para ler</p>
            </div>
        );
    }

    if (loadingContent) {
        return (
            <div className="flex-1 flex items-center justify-center bg-white">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
            </div>
        );
    }

    return (
        <div className={`flex-1 flex flex-col h-full bg-white absolute inset-0 md:static z-20 ${!readingEmail ? 'hidden' : ''}`}>
            <div className="p-4 border-b border-gray-200 flex items-center gap-3">
                <button onClick={() => setReadingEmail(null)} className="md:hidden p-2 hover:bg-gray-100 rounded-full">
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex-1">
                    <h2 className="text-xl font-bold text-gray-800">{readingEmail.subject}</h2>
                </div>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
                <div className="flex justify-between items-start mb-6 pb-6 border-b border-gray-100">
                    <div>
                        <div className="font-bold text-gray-800 text-lg">{readingEmail.from}</div>
                        <div className="text-sm text-gray-500">Para: {readingEmail.to}</div>
                    </div>
                    <div className="text-sm text-gray-500 text-right">
                        {new Date(readingEmail.date).toLocaleString()}
                    </div>
                </div>

                <div 
                    className="prose max-w-none text-gray-800 text-sm"
                    dangerouslySetInnerHTML={{ __html: readingEmail.html || readingEmail.textAsHtml || readingEmail.text || '' }}
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
                                    <span className="text-xs text-gray-400">({Math.round(att.size / 1024)} KB)</span>
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
        </div>
    );
  };

  return (
    <div className="h-[calc(100vh-100px)] -m-6 flex bg-white border-t border-gray-200">
      {renderSidebar()}
      {renderEmailList()}
      {renderEmailContent()}

      {composing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-2xl h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 className="font-bold text-gray-800">Nova Mensagem</h3>
                    <button onClick={() => setComposing(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded-full">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <form onSubmit={handleSendEmail} className="flex-1 flex flex-col">
                    <div className="p-4 space-y-4 flex-1 overflow-y-auto">
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
                        <textarea 
                            className="w-full h-full min-h-[200px] resize-none outline-none mt-4 text-gray-700"
                            placeholder="Escreva sua mensagem aqui..."
                            value={body}
                            onChange={e => setBody(e.target.value)}
                        ></textarea>
                        
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