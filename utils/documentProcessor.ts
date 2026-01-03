
import { Company } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

// Define worker URL explicitly using the same version as the library
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.mjs';

/**
 * Normalizes text to remove accents (NFD normalization).
 */
export const removeAccents = (text: string): string => {
  if (!text) return "";
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

/**
 * Extracts text content from a PDF file without judging content length.
 * Returns whatever text is found, even if scrambled or short.
 */
export const extractTextFromPDF = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();

    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      verbosity: 0
    });

    const pdf = await loadingTask.promise;
    let fullText = '';

    // Limit to first 3 pages to save memory/time, usually header info is on page 1
    const maxPages = Math.min(pdf.numPages, 3);

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ') // Join with space to prevent glued words
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
 * Identifies the category based on text content.
 */
export const identifyCategory = (
    textNormalized: string, 
    keywordMap: Record<string, string[]>, 
    priorityCategories: string[] = []
): string | null => {
  
  const matchedCategories: string[] = [];

  // 1. Scan User Keywords (Dynamic)
  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (!keywords || !Array.isArray(keywords)) continue;
    
    for (const keyword of keywords) {
      if (!keyword) continue;
      const kwNormalized = removeAccents(keyword);
      // Check: keyword must be at least 3 chars to avoid noise
      if (kwNormalized.length > 2 && textNormalized.includes(kwNormalized)) {
        if (!matchedCategories.includes(category)) {
            matchedCategories.push(category);
        }
        break; // Found one keyword for this category, move to next category
      }
    }
  }

  // 2. Resolve Conflict using Priority
  if (matchedCategories.length > 1) {
      const priorityMatch = matchedCategories.find(cat => priorityCategories.includes(cat));
      if (priorityMatch) return priorityMatch;
  }

  return matchedCategories[0] || null;
};

/**
 * Identifies the company using Numeric Match OR Partial Name Match.
 */
export const identifyCompany = (textNormalized: string, companies: Company[]): Company | null => {
  if (!textNormalized) return null;

  // 1. LIMPEZA TOTAL PARA NUMEROS
  // Remove tudo que não é dígito para buscar CNPJ/CPF "corrido"
  const textOnlyNumbers = textNormalized.replace(/\D/g, '');

  for (const company of companies) {
    const companyDocClean = company.docNumber.replace(/\D/g, '');
    
    if (companyDocClean.length < 8) continue;

    // A. Match Numérico Exato (CNPJ completo)
    if (textOnlyNumbers.includes(companyDocClean)) {
        return company;
    }

    // B. Match Raiz CNPJ (8 primeiros dígitos)
    const root = companyDocClean.substring(0, 8);
    if (textOnlyNumbers.includes(root)) {
        return company;
    }
  }

  // 2. ESTRATÉGIA POR NOME (Parcial e Inteligente)
  const commonTerms = ['ltda', 's.a', 'me', 'epp', 'eireli', 'limitada', 'sa', '-', 'cpf:', 'cnpj:'];
  
  for (const company of companies) {
    let nameClean = removeAccents(company.name);
    
    // Remove sufixos comuns do cadastro da empresa
    commonTerms.forEach(term => {
        nameClean = nameClean.replace(new RegExp(`\\b${term}\\b`, 'g'), '').trim();
    });

    // Se o nome ficou muito curto, ignora (ex: "J A")
    if (nameClean.length < 3) continue;

    // A. Match Nome Limpo Completo
    if (textNormalized.includes(nameClean)) {
      return company;
    }

    // B. Match PRIMEIRAS DUAS PALAVRAS (Muito útil para nomes longos quebrados)
    // Ex: "VM INSTALACOES" no PDF bate com "VM INSTALACOES ELETRICAS" no banco
    const parts = nameClean.split(' ');
    if (parts.length >= 2) {
        const firstTwoWords = `${parts[0]} ${parts[1]}`;
        // Só aceita se as duas palavras somadas tiverem tamanho razoável (evita "De Da")
        if (firstTwoWords.length > 5 && textNormalized.includes(firstTwoWords)) {
            return company;
        }
    }
  }

  return null;
};
