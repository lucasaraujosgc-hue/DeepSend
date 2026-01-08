
import { Company } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

// Configura o Worker usando CDNJS que é mais estável para cross-origin e decoding
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/**
 * Normaliza o texto: remove acentos, converte para minúsculo e limpa espaços extras.
 */
export const removeAccents = (text: string): string => {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};

/**
 * Verifica se uma palavra-chave existe no texto como uma "palavra isolada" 
 * ou termo significativo, evitando matches dentro de outras palavras (ex: 'das' em 'vendas').
 */
const containsKeyword = (text: string, keyword: string): boolean => {
  if (!keyword || keyword.length < 2) return false;
  
  // Para palavras curtas (<= 3 letras), exigimos que sejam palavras isoladas
  if (keyword.length <= 3) {
    const regex = new RegExp(`(^|[^a-z0-9])${keyword}([^a-z0-9]|$)`, 'i');
    return regex.test(text);
  }
  
  // Para termos mais longos, a inclusão simples costuma ser segura o suficiente
  return text.includes(keyword);
};

/**
 * Extrai texto de um PDF de forma robusta.
 */
export const extractTextFromPDF = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
      verbosity: 0
    });

    const pdf = await loadingTask.promise;
    let fullText = '';
    const maxPages = Math.min(pdf.numPages, 5); // Lê até 5 páginas para maior precisão

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ')
        .trim();
      fullText += pageText + ' ';
    }

    return fullText.trim(); 
  } catch (error) {
    console.error(`❌ Erro ao extrair texto do PDF: ${file.name}`, error);
    return '';
  }
};

/**
 * Identifica a categoria baseada em um sistema de pontuação e pesos.
 * Obedece estritamente as configurações de prioridade do usuário.
 */
export const identifyCategory = (
    textNormalized: string, 
    keywordMap: Record<string, string[]>, 
    priorityCategories: string[] = []
): string | null => {
  
  const scores: Record<string, number> = {};

  // 1. Calcular pontuação para cada categoria
  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (!keywords || !Array.isArray(keywords)) continue;
    
    let categoryScore = 0;
    
    for (const keyword of keywords) {
      if (!keyword) continue;
      const kwNormalized = removeAccents(keyword);
      
      if (containsKeyword(textNormalized, kwNormalized)) {
        // Pontuação baseada no tamanho da keyword (palavras maiores = mais certeza)
        // Adicionamos um multiplicador para dar peso a termos compostos
        categoryScore += (kwNormalized.length * 2);
      }
    }

    if (categoryScore > 0) {
      // 2. Aplicar bônus massivo se a categoria for PRIORIDADE (Estrela nas configurações)
      if (priorityCategories.includes(category)) {
        categoryScore += 1000; // Garante que prioridades vençam quase qualquer conflito
      }
      scores[category] = categoryScore;
    }
  }

  // 3. Encontrar a categoria com maior pontuação
  const sortedCategories = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  if (sortedCategories.length > 0) {
    const [bestCategory, bestScore] = sortedCategories[0];
    console.log(`[Processor] Scores:`, scores, `-> Escolhido: ${bestCategory}`);
    return bestCategory;
  }

  return null;
};

/**
 * Identifica a empresa usando match numérico (CNPJ/CPF) ou nome inteligente.
 */
export const identifyCompany = (textNormalized: string, companies: Company[]): Company | null => {
  if (!textNormalized) return null;

  const textOnlyNumbers = textNormalized.replace(/\D/g, '');

  // 1. Prioridade Total: Match Numérico
  for (const company of companies) {
    const companyDocClean = company.docNumber.replace(/\D/g, '');
    if (companyDocClean.length < 5) continue;

    // Match exato ou Raiz CNPJ (8 dígitos)
    if (textOnlyNumbers.includes(companyDocClean) || 
       (companyDocClean.length >= 8 && textOnlyNumbers.includes(companyDocClean.substring(0, 8)))) {
        return company;
    }
  }

  // 2. Match por Nome (Lógica aprimorada)
  const commonTerms = ['ltda', 's.a', 'me', 'epp', 'eireli', 'limitada', 'sa', 'cnpj', 'cpf'];
  
  let bestMatch: Company | null = null;
  let maxNameScore = 0;

  for (const company of companies) {
    let nameClean = removeAccents(company.name);
    commonTerms.forEach(term => {
        nameClean = nameClean.replace(new RegExp(`\\b${term}\\b`, 'g'), '').trim();
    });

    if (nameClean.length < 3) continue;

    // Se o nome completo limpo está no texto
    if (textNormalized.includes(nameClean)) {
      const score = nameClean.length;
      if (score > maxNameScore) {
        maxNameScore = score;
        bestMatch = company;
      }
    }
  }

  return bestMatch;
};
