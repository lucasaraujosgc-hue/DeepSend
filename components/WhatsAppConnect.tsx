import React, { useState, useEffect } from 'react';
import { Smartphone, RefreshCw, CheckCircle2, Loader2, Power, QrCode } from 'lucide-react';

const WhatsAppConnect: React.FC = () => {
  const [status, setStatus] = useState<'disconnected' | 'generating_qr' | 'ready' | 'connected'>('disconnected');
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<any>(null);

  // Simulates fetching status from your /status endpoint
  const checkStatus = () => {
    // In a real scenario, fetch('/status')
    // For now, we rely on local state flow
  };

  const handleConnect = () => {
    setStatus('generating_qr');
    
    // Simulating the server generating the QR Code
    setTimeout(() => {
        // Mock QR Code (Google Chart API for demo purposes, representing the Base64 from your node server)
        setQrCodeBase64('https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=WhatsApp-Session-Connect-Secure');
        setStatus('ready');
    }, 2000);
  };

  const handleSimulateScan = () => {
      // Simulating user scanning the QR Code with their phone
      setStatus('connected');
      setSessionInfo({
          name: 'Lucas Araújo',
          number: '5575981200125',
          device: 'Iphone 13'
      });
      setQrCodeBase64(null);
  };

  const handleDisconnect = () => {
      if(confirm('Tem certeza que deseja desconectar o WhatsApp?')) {
          setStatus('disconnected');
          setSessionInfo(null);
      }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-in fade-in duration-500">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 flex items-center justify-center gap-2">
            <MessageCircle className="w-8 h-8 text-green-600" /> WhatsApp Web
        </h1>
        <p className="text-gray-500 max-w-md mx-auto">
            Escaneie o QR Code para conectar seu número e permitir o envio automático de documentos.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 w-full max-w-md overflow-hidden p-8 text-center">
          
          {status === 'disconnected' && (
              <div className="space-y-6">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-400">
                      <Smartphone className="w-10 h-10" />
                  </div>
                  <div>
                      <h3 className="text-lg font-bold text-gray-800">Desconectado</h3>
                      <p className="text-sm text-gray-500 mt-2">
                          Nenhuma sessão ativa encontrada. Clique abaixo para gerar um novo QR Code.
                      </p>
                  </div>
                  <button 
                    onClick={handleConnect}
                    className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                  >
                      <QrCode className="w-5 h-5" /> Gerar QR Code
                  </button>
              </div>
          )}

          {status === 'generating_qr' && (
              <div className="py-10 space-y-4">
                  <Loader2 className="w-12 h-12 text-green-600 animate-spin mx-auto" />
                  <p className="text-gray-600 font-medium">Iniciando cliente WhatsApp...</p>
                  <p className="text-xs text-gray-400">Aguarde enquanto geramos o código.</p>
              </div>
          )}

          {status === 'ready' && qrCodeBase64 && (
              <div className="space-y-6 animate-in zoom-in-95 duration-300">
                  <div className="border-4 border-gray-800 rounded-xl p-2 inline-block bg-white relative group">
                      <img src={qrCodeBase64} alt="Scan Me" className="w-64 h-64 object-contain" />
                      
                      {/* Simulation Overlay - Remove in production */}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                          <button 
                            onClick={handleSimulateScan}
                            className="bg-white text-gray-800 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-100"
                          >
                              Simular Leitura
                          </button>
                      </div>
                  </div>
                  
                  <div className="text-left space-y-3 text-sm text-gray-600 bg-gray-50 p-4 rounded-lg">
                      <p className="font-bold text-gray-800 mb-2">Instruções:</p>
                      <ol className="list-decimal pl-4 space-y-1">
                          <li>Abra o WhatsApp no seu celular.</li>
                          <li>Toque em <strong>Menu</strong> (Android) ou <strong>Configurações</strong> (iPhone).</li>
                          <li>Selecione <strong>Aparelhos Conectados</strong>.</li>
                          <li>Toque em <strong>Conectar um aparelho</strong>.</li>
                          <li>Aponte a câmera para a tela.</li>
                      </ol>
                  </div>
              </div>
          )}

          {status === 'connected' && (
              <div className="py-6 space-y-6 animate-in zoom-in-95 duration-300">
                  <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto relative">
                      <CheckCircle2 className="w-12 h-12 text-green-600" />
                      <span className="absolute bottom-0 right-0 w-6 h-6 bg-green-500 border-4 border-white rounded-full"></span>
                  </div>
                  
                  <div>
                      <h3 className="text-2xl font-bold text-gray-800">Conectado!</h3>
                      <p className="text-gray-500 mt-1">Seu WhatsApp está pronto para envio.</p>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 text-left">
                      <div className="flex justify-between items-center border-b border-gray-200 pb-2 mb-2">
                          <span className="text-xs font-semibold text-gray-500 uppercase">Sessão</span>
                          <span className="text-sm font-bold text-green-600 flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-green-600"></span> Online
                          </span>
                      </div>
                      <div className="space-y-1">
                           <p className="text-sm text-gray-700 flex justify-between">
                               <span>Usuário:</span> <strong>{sessionInfo?.name || 'Usuário'}</strong>
                           </p>
                           <p className="text-sm text-gray-700 flex justify-between">
                               <span>Dispositivo:</span> <strong>{sessionInfo?.device || 'Web Client'}</strong>
                           </p>
                      </div>
                  </div>

                  <button 
                    onClick={handleDisconnect}
                    className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center justify-center gap-2 w-full py-2 hover:bg-red-50 rounded-lg transition-colors"
                  >
                      <Power className="w-4 h-4" /> Desconectar
                  </button>
              </div>
          )}

      </div>
      
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Smartphone className="w-4 h-4" />
        <span>Integração via WhatsApp Web.js</span>
      </div>
    </div>
  );
};

// Helper Icon
function MessageCircle(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  )
}

export default WhatsAppConnect;