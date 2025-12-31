import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileText,
  Loader2
} from 'lucide-react';
import { Task, TaskStatus } from '../types';
import Kanban from './Kanban';
import { api } from '../services/api';

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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recentSends, setRecentSends] = useState<any[]>([]);
  const [companiesCount, setCompaniesCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [t, c, s] = await Promise.all([
          api.getTasks(),
          api.getCompanies(),
          api.getRecentSends()
        ]);
        setTasks(t);
        setCompaniesCount(c.length);
        setRecentSends(s);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const pendingTasks = tasks.filter(t => t.status !== TaskStatus.DONE).length;

  // Filtra tarefas urgentes: Prioridade 'alta' E Status não 'concluida'
  const urgentTasks = tasks.filter(t => t.priority === 'alta' && t.status !== TaskStatus.DONE);

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard Geral</h1>
        <p className="text-gray-500">Visão geral das atividades e pendências.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Empresas Ativas" 
          value={companiesCount} 
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
          title="Tarefas Urgentes" 
          value={urgentTasks.length} 
          icon={AlertCircle} 
          color="bg-red-500" 
        />
        <StatCard 
          title="Envios Recentes" 
          value={recentSends.length} 
          icon={CheckCircle2} 
          color="bg-green-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Documents Table (Max 3 via API) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-500" />
              Últimos Envios
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 font-medium">
                <tr>
                  <th className="px-6 py-3">Empresa</th>
                  <th className="px-6 py-3">Documento</th>
                  <th className="px-6 py-3">Data</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentSends.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-4 text-gray-400">Nenhum envio recente.</td></tr>
                ) : recentSends.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">{log.companyName}</td>
                    <td className="px-6 py-4 text-gray-500">{log.docName}</td>
                    <td className="px-6 py-4 text-gray-500">{new Date(log.sentAt).toLocaleDateString('pt-BR')}</td>
                    <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-700 font-medium">Sucesso</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Urgent Tasks */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-500" />
              Tarefas Urgentes
            </h3>
            <span className="bg-red-100 text-red-600 px-2 py-1 rounded text-xs font-bold">{urgentTasks.length}</span>
          </div>
          <div className="p-6 space-y-4 max-h-[300px] overflow-y-auto">
            {urgentTasks.length === 0 ? (
                <div className="text-center text-gray-400 py-4">Nenhuma tarefa urgente pendente.</div>
            ) : urgentTasks.map(task => (
              <div key={task.id} className="flex items-center gap-4 p-3 rounded-lg border border-gray-100 hover:border-blue-200 transition-colors">
                <div className="w-2 h-12 rounded-full" style={{ backgroundColor: task.color }}></div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-800">{task.title}</h4>
                  <p className="text-xs text-gray-500">{task.description}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-1 rounded font-medium bg-red-100 text-red-700`}>
                    ALTA
                  </span>
                  {task.dueDate && (
                      <div className="text-xs text-gray-400 mt-1">
                          Vence: {new Date(task.dueDate).toLocaleDateString('pt-BR')}
                      </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-gray-200">
          <Kanban />
      </div>

    </div>
  );
};

export default Dashboard;