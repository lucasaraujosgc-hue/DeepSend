
import { Company } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

// Configura o Worker usando CDNJS que é mais estável para cross-origin e decoding
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/**
 * Normalizes text to remove accents (NFD normalization).
 */
export const removeAccents = (text: string): string => {
  if (!text) return "";
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

/**
 * Extracts text content from a PDF file.
 * Includes CMap configuration to handle governmental PDFs correctly.
 */
export const extractTextFromPDF = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();

    // Configuração robusta para carregar fontes customizadas (comuns em guias de governo)
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
      verbosity: 0
    });

    const pdf = await loadingTask.promise;
    let fullText = '';

    // Lê até 3 páginas para garantir que pegamos cabeçalhos e rodapés
    const maxPages = Math.min(pdf.numPages, 3);

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ') // Join with space to prevent glued words like "CNPJ:123"
        .trim();

      fullText += pageText + ' ';
    }

    return fullText.trim(); 
  } catch (error) {
    console.error(`❌ Erro CRÍTICO ao extrair texto do PDF: ${file.name}`, error);
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
        break; 
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
 * Identifies the company using Numeric Match OR Smart Name Match.
 */
export const identifyCompany = (textNormalized: string, companies: Company[]): Company | null => {
  if (!textNormalized) return null;

  // 1. LIMPEZA TOTAL PARA NUMEROS
  // Remove tudo que não é dígito para buscar CNPJ/CPF "corrido"
  const textOnlyNumbers = textNormalized.replace(/\D/g, '');

  for (const company of companies) {
    const companyDocClean = company.docNumber.replace(/\D/g, '');
    
    if (companyDocClean.length < 5) continue; // Ignora docs inválidos

    // A. Match Numérico Exato (CNPJ completo)
    if (textOnlyNumbers.includes(companyDocClean)) {
        return company;
    }

    // B. Match Raiz CNPJ (8 primeiros dígitos)
    // Ex: PDF tem 36662174 (raiz) mas no banco é 366621740001XX
    if (companyDocClean.length >= 8) {
        const root = companyDocClean.substring(0, 8);
        if (textOnlyNumbers.includes(root)) {
            return company;
        }
    }
  }

  // 2. ESTRATÉGIA POR NOME (Parcial e Inteligente)
  const commonTerms = ['ltda', 's.a', 'me', 'epp', 'eireli', 'limitada', 'sa', '-', 'cpf:', 'cnpj:', 'do', 'da', 'de'];
  
  for (const company of companies) {
    let nameClean = removeAccents(company.name);
    
    // Remove termos comuns para limpar o nome
    commonTerms.forEach(term => {
        nameClean = nameClean.replace(new RegExp(`\\b${term}\\b`, 'g'), '').trim();
    });

    if (nameClean.length < 3) continue;

    // A. Match Nome Limpo Completo
    // Ex: "VM INSTALACOES ELETRICAS"
    if (textNormalized.includes(nameClean)) {
      return company;
    }

    // B. Match PRIMEIRAS DUAS PALAVRAS (Crucial para nomes longos ou quebrados)
    // Ex: No PDF: "VM INSTALACOES" ... quebra de linha ...
    //     No Banco: "VM INSTALACOES ELETRICAS LTDA"
    const parts = nameClean.split(/\s+/); // Split por qualquer espaço
    if (parts.length >= 2) {
        const firstTwoWords = `${parts[0]} ${parts[1]}`;
        // Só aceita se as duas palavras somadas tiverem tamanho seguro (> 4 chars)
        if (firstTwoWords.length > 4 && textNormalized.includes(firstTwoWords)) {
            return company;
        }
    }
    
    // C. Match ÚNICA PALAVRA (Apenas se for uma palavra muito específica e longa)
    // Ex: "MICROSOFT"
    if (parts.length === 1 && parts[0].length > 6) {
        if (textNormalized.includes(parts[0])) {
            return company;
        }
    }
  }

  return null;
};
