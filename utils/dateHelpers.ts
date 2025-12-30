// Fixed holidays list (Day-Month) based on the Python snippet
// (1, 1) -> "01-01"
const FIXED_HOLIDAYS = [
  '01-01', // Ano Novo
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalho
  '09-07', // Independência
  '10-12', // Nossa Senhora Aparecida
  '11-02', // Finados
  '11-15', // Proclamação da República
  '12-25'  // Natal
];

export const formatarData = (date: Date): string => {
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const ano = date.getFullYear();
  return `${dia}/${mes}/${ano}`;
};

export const isDiaUtil = (date: Date): boolean => {
  const diaSemana = date.getDay(); // 0=Sunday, 6=Saturday
  
  // Python: if date.weekday() >= 5: return False
  if (diaSemana === 0 || diaSemana === 6) {
    return false;
  }
  
  // Python: (date.month, date.day) not in feriados_fixos
  // Note: Month in JS is 0-indexed for Date object methods, but 1-indexed for display strings usually.
  // Using getMonth() + 1 to match the "01-01" format.
  const diaMes = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  
  if (FIXED_HOLIDAYS.includes(diaMes)) {
    return false;
  }
  
  return true;
};

// Helper to get next month year/month pair
const getNextMonth = (mes: number, ano: number): { mes: number, ano: number } => {
  // mes input is expected to be 1-12
  if (mes === 12) {
    return { mes: 1, ano: ano + 1 };
  }
  return { mes: mes + 1, ano: ano };
};

export const calcularQuintoDiaUtil = (mes: number, ano: number): string => {
  const next = getNextMonth(mes, ano);
  
  let dia = 1;
  let diasUteisEncontrados = 0;
  let finalDate = new Date(next.ano, next.mes - 1, 1);
  
  // Loop until we find the 5th business day
  while (diasUteisEncontrados < 5) {
      const date = new Date(next.ano, next.mes - 1, dia);
      
      // Safety check to prevent infinite loop if month overflows (unlikely)
      if (date.getMonth() !== (next.mes - 1)) break; 

      if (isDiaUtil(date)) {
          diasUteisEncontrados++;
          finalDate = date;
      }
      
      if (diasUteisEncontrados < 5) {
          dia++;
      }
  }
  
  return formatarData(finalDate);
};

export const calcularVencimentoComRegra = (mes: number, ano: number, diaVencimento: number, regra: 'antecipado' | 'postergado'): string => {
  const next = getNextMonth(mes, ano);
  
  // Create date object for the target due day
  let date = new Date(next.ano, next.mes - 1, diaVencimento);
  
  // Python logic port:
  if (!isDiaUtil(date)) {
      if (regra === 'antecipado') {
          // Move backward until business day found
          while (!isDiaUtil(date)) {
              date.setDate(date.getDate() - 1);
          }
      } else if (regra === 'postergado') {
          // Move forward until business day found
          while (!isDiaUtil(date)) {
              date.setDate(date.getDate() + 1);
          }
      }
  }
  
  return formatarData(date);
};

export const calcularUltimoDiaUtil = (mes: number, ano: number): string => {
  const next = getNextMonth(mes, ano);
  
  // Get the last day of the *next* month
  // Date(year, month, 0) gives the last day of the *previous* month index passed.
  // next.mes is 1-12. Date constructor uses 0-11. 
  // So new Date(ano, mes, 0) -> last day of mes.
  const ultimoDiaDoMes = new Date(next.ano, next.mes, 0).getDate();
  
  let date = new Date(next.ano, next.mes - 1, ultimoDiaDoMes);
  
  while (!isDiaUtil(date)) {
      date.setDate(date.getDate() - 1);
  }
  
  return formatarData(date);
};

export const calcularTodosVencimentos = (competencia: string): Record<string, string> => {
  if (!competencia || !competencia.includes('/')) return {};
  
  const [mesStr, anoStr] = competencia.split('/');
  const mes = parseInt(mesStr);
  const ano = parseInt(anoStr);

  if (isNaN(mes) || isNaN(ano)) return {};

  return {
      'Contracheque': calcularQuintoDiaUtil(mes, ano),
      'Folha de Pagamento': calcularQuintoDiaUtil(mes, ano), // Assuming same as Contracheque
      'FGTS': calcularVencimentoComRegra(mes, ano, 20, 'antecipado'),
      'INSS': calcularVencimentoComRegra(mes, ano, 20, 'antecipado'),
      'Simples Nacional': calcularVencimentoComRegra(mes, ano, 20, 'postergado'),
      'Parcelamento': calcularUltimoDiaUtil(mes, ano),
      // Default rule for others (e.g., Honorarios might be day 10 postponed/anticipated depending on contract)
      'Honorários': calcularVencimentoComRegra(mes, ano, 10, 'postergado'), 
  };
};