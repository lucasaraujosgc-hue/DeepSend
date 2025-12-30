import React from 'react';
import { 
  Building2, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileText,
  TrendingUp,
  MoreVertical
} from 'lucide-react';
import { MOCK_TASKS, MOCK_COMPANIES, MOCK_DOCUMENTS } from '../constants';
import { TaskStatus } from '../types';
import Kanban from './Kanban';

const StatCard: React.FC<{ title: string; value: string | number; icon: any; color: string }> = ({ title, value, icon: Icon, color }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <h3 className="text-2xl font-bold mt-2 text-gray-800">{value}</h3>
      </div>
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  const pendingTasks = MOCK_TASKS.filter(t => t.status !== TaskStatus.DONE).length;
  const pendingDocs = MOCK_DOCUMENTS.filter(d => d.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard Geral</h1>
        <p className="text-gray-500">Visão geral das atividades e pendências.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Empresas Ativas" 
          value={MOCK_COMPANIES.length} 
          icon={Building2} 
          color="bg-blue-500" 
        />
        <StatCard 
          title="Tarefas Pendentes" 
          value={pendingTasks} 
          icon={Clock} 
          color="bg-yellow-500" 
        />
        <StatCard 
          title="Documentos Pendentes" 
          value={pendingDocs} 
          icon={AlertCircle} 
          color="bg-red-500" 
        />
        <StatCard 
          title="Envios Realizados" 
          value={128} 
          icon={CheckCircle2} 
          color="bg-green-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Documents Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-500" />
              Documentos Recentes
            </h3>
            <button className="text-sm text-blue-600 hover:underline">Ver todos</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 font-medium">
                <tr>
                  <th className="px-6 py-3">Empresa</th>
                  <th className="px-6 py-3">Documento</th>
                  <th className="px-6 py-3">Vencimento</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_DOCUMENTS.map((doc) => (
                  <tr key={doc.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">{doc.companyName}</td>
                    <td className="px-6 py-4 text-gray-500">{doc.category}</td>
                    <td className="px-6 py-4 text-gray-500">{doc.dueDate}</td>
                    <td className="px-6 py-4">
                      {doc.status === 'sent' ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-700 font-medium">Enviado</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-700 font-medium">Pendente</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Tasks */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-500" />
              Tarefas Urgentes
            </h3>
            <button className="text-sm text-blue-600 hover:underline">Ver Kanban</button>
          </div>
          <div className="p-6 space-y-4">
            {MOCK_TASKS.filter(t => t.status !== TaskStatus.DONE).slice(0, 4).map(task => (
              <div key={task.id} className="flex items-center gap-4 p-3 rounded-lg border border-gray-100 hover:border-blue-200 transition-colors">
                <div className="w-2 h-12 rounded-full" style={{ backgroundColor: task.color }}></div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-800">{task.title}</h4>
                  <p className="text-xs text-gray-500">{task.description}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-1 rounded font-medium 
                    ${task.priority === 'alta' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                    {task.priority.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Kanban Section embedded in Dashboard */}
      <div className="pt-6 border-t border-gray-200">
          <Kanban />
      </div>

    </div>
  );
};

export default Dashboard;