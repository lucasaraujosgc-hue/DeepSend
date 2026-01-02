
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

    for (let i = 1; i <= pdf.numPages; i++) {
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

  // 1. Scan User Keywords
  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (!keywords || !Array.isArray(keywords)) continue;
    
    for (const keyword of keywords) {
      if (!keyword) continue;
      const kwNormalized = removeAccents(keyword);
      if (kwNormalized.length > 2 && textNormalized.includes(kwNormalized)) {
        if (!matchedCategories.includes(category)) {
            matchedCategories.push(category);
        }
        break; 
      }
    }
  }

  // 2. Scan Hardcoded Fallbacks
  if (textNormalized.includes('cora.com.br') || textNormalized.includes('honorarios')) {
      if (!matchedCategories.includes('Honorários')) matchedCategories.push('Honorários');
  }
  
  if (textNormalized.includes('nota fiscal') || textNormalized.includes('danfe') || textNormalized.includes('nf-e')) {
      if (!matchedCategories.includes('Notas Fiscais')) matchedCategories.push('Notas Fiscais');
  }

  if (
      (textNormalized.includes('folha') && textNormalized.includes('pagamento')) ||
      (textNormalized.includes('resumo') && textNormalized.includes('folha')) ||
      textNormalized.includes('extrato mensal')
  ) {
      if (!matchedCategories.includes('Folha de Pagamento')) matchedCategories.push('Folha de Pagamento');
  }

  if (textNormalized.includes('documento de arrecadacao') && (textNormalized.includes('simples nacional') || textNormalized.includes('das'))) {
      if (!matchedCategories.includes('Simples Nacional')) matchedCategories.push('Simples Nacional');
  }

  if (textNormalized.includes('fgts') && (textNormalized.includes('guia') || textNormalized.includes('digital') || textNormalized.includes('fundo de garantia'))) {
      if (!matchedCategories.includes('FGTS')) matchedCategories.push('FGTS');
  }

  if (matchedCategories.length === 0) return null;
  if (matchedCategories.length === 1) return matchedCategories[0];

  const priorityMatch = matchedCategories.find(cat => priorityCategories.includes(cat));
  if (priorityMatch) return priorityMatch;

  return matchedCategories[0];
};

/**
 * Identifies the company using STRICT numeric matching OR Loose Name matching.
 */
export const identifyCompany = (textNormalized: string, companies: Company[]): Company | null => {
  if (!textNormalized) return null;

  // 1. ESTRATÉGIA NUMÉRICA "BRUTA"
  // Remove TUDO que não for número do texto do PDF. 
  // Ex: "CNPJ: 12.345.678/0001-90" vira "12345678000190"
  // Isso resolve o problema de formatação, espaços extras ou quebras de linha no meio do número.
  const textOnlyNumbers = textNormalized.replace(/\D/g, '');

  for (const company of companies) {
    const companyDocClean = company.docNumber.replace(/\D/g, '');
    
    // Ignora empresas com cadastro incompleto
    if (companyDocClean.length < 8) continue;

    // A. Match Completo (Ex: CPF ou CNPJ inteiro)
    if (textOnlyNumbers.includes(companyDocClean)) {
        return company;
    }

    // B. Match Raiz CNPJ (Primeiros 8 dígitos)
    // Útil se o PDF tiver a filial diferente ou erro no final
    const root = companyDocClean.substring(0, 8);
    if (textOnlyNumbers.includes(root)) {
        return company;
    }
  }

  // 2. ESTRATÉGIA POR NOME (Fallback)
  // Remove termos comuns que atrapalham o match exato
  const commonTerms = ['ltda', 's.a', 'me', 'epp', 'eireli', 'limitada', 'sa'];
  
  for (const company of companies) {
    let nameClean = removeAccents(company.name);
    
    // Remove sufixos comuns do nome da empresa para buscar o "nome fantasia" implícito
    commonTerms.forEach(term => {
        nameClean = nameClean.replace(new RegExp(`\\b${term}\\b`, 'g'), '').trim();
    });

    // Só busca se sobrar um nome relevante (> 4 letras)
    if (nameClean.length > 4 && textNormalized.includes(nameClean)) {
      return company;
    }
  }

  return null;
};
