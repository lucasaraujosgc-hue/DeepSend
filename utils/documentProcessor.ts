
import { Company } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

// Configuração segura e isolada do Worker
const setupPdfWorker = () => {
    try {
        if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
            // Usamos a versão que já está no import map ou uma CDN segura
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
    } catch (e) {
        console.error("Erro ao configurar Worker do PDF.js:", e);
    }
};

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
 */
const containsKeyword = (text: string, keyword: string): boolean => {
  if (!keyword || keyword.length < 2) return false;
  
  if (keyword.length <= 3) {
    const regex = new RegExp(`(^|[^a-z0-9])${keyword}([^a-z0-9]|$)`, 'i');
    return regex.test(text);
  }
  
  return text.includes(keyword);
};

/**
 * Extrai texto de um PDF de forma robusta.
 */
export const extractTextFromPDF = async (file: File): Promise<string> => {
  setupPdfWorker(); // Garante que o worker está pronto apenas na hora do uso
  
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
    const maxPages = Math.min(pdf.numPages, 5);

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
    keywordMap: Record<string, string[]> = {}, 
    priorityCategories: string[] = []
): string | null => {
  
  if (!textNormalized || !keywordMap) return null;
  const scores: Record<string, number> = {};

  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (!keywords || !Array.isArray(keywords)) continue;
    
    let categoryScore = 0;
    
    for (const keyword of keywords) {
      if (!keyword) continue;
      const kwNormalized = removeAccents(keyword);
      
      if (containsKeyword(textNormalized, kwNormalized)) {
        categoryScore += (kwNormalized.length * 2);
      }
    }

    if (categoryScore > 0) {
      if (priorityCategories && priorityCategories.includes(category)) {
        categoryScore += 1000;
      }
      scores[category] = categoryScore;
    }
  }

  const sortedCategories = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  if (sortedCategories.length > 0) {
    return sortedCategories[0][0];
  }

  return null;
};

/**
 * Identifica a empresa usando match numérico (CNPJ/CPF) ou nome inteligente.
 */
export const identifyCompany = (textNormalized: string, companies: Company[] = []): Company | null => {
  if (!textNormalized || !companies) return null;

  const textOnlyNumbers = textNormalized.replace(/\D/g, '');

  for (const company of companies) {
    const companyDocClean = (company.docNumber || '').replace(/\D/g, '');
    if (companyDocClean.length < 5) continue;

    if (textOnlyNumbers.includes(companyDocClean) || 
       (companyDocClean.length >= 8 && textOnlyNumbers.includes(companyDocClean.substring(0, 8)))) {
        return company;
    }
  }

  const commonTerms = ['ltda', 's.a', 'me', 'epp', 'eireli', 'limitada', 'sa', 'cnpj', 'cpf'];
  let bestMatch: Company | null = null;
  let maxNameScore = 0;

  for (const company of companies) {
    let nameClean = removeAccents(company.name || '');
    commonTerms.forEach(term => {
        nameClean = nameClean.replace(new RegExp(`\\b${term}\\b`, 'g'), '').trim();
    });

    if (nameClean.length < 3) continue;

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
