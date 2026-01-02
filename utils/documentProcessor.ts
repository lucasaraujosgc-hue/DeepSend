
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
        .join(' ')
        .trim();

      fullText += pageText + ' ';
    }

    // Retorna o que achou, sem validar tamanho. 
    // O Python fazia exatamente isso (extract_text() + " ").
    return fullText.trim(); 
  } catch (error) {
    console.error(`❌ Erro ao extrair texto do PDF: ${file.name}`, error);
    return '';
  }
};

/**
 * Identifies the category based on text content, keywords map, and priority rules.
 * Expects normalized text input.
 */
export const identifyCategory = (
    textNormalized: string, 
    keywordMap: Record<string, string[]>, 
    priorityCategories: string[] = []
): string | null => {
  
  // Text is assumed to be already normalized by caller for performance/consistency
  const matchedCategories: string[] = [];

  // 1. Scan User Keywords (Dynamic)
  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (!keywords || !Array.isArray(keywords)) continue;
    
    for (const keyword of keywords) {
      if (!keyword) continue;
      // Keywords should be normalized in settings, but safety check here
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
  
  if (
      (textNormalized.includes('nota fiscal') || 
       textNormalized.includes('danfe') || 
       textNormalized.includes('nf-e'))
  ) {
      if (!matchedCategories.includes('Notas Fiscais')) matchedCategories.push('Notas Fiscais');
  }

  if (
      (textNormalized.includes('folha') && textNormalized.includes('pagamento')) ||
      (textNormalized.includes('resumo') && textNormalized.includes('folha')) ||
      textNormalized.includes('extrato mensal')
  ) {
      if (!matchedCategories.includes('Folha de Pagamento')) matchedCategories.push('Folha de Pagamento');
  }

  if (
      textNormalized.includes('documento de arrecadacao') && 
      (textNormalized.includes('simples nacional') || textNormalized.includes('das'))
  ) {
      if (!matchedCategories.includes('Simples Nacional')) matchedCategories.push('Simples Nacional');
  }

  if (
      textNormalized.includes('fgts') && 
      (textNormalized.includes('guia') || textNormalized.includes('digital') || textNormalized.includes('fundo de garantia'))
  ) {
      if (!matchedCategories.includes('FGTS')) matchedCategories.push('FGTS');
  }

  if (matchedCategories.length === 0) return null;
  if (matchedCategories.length === 1) return matchedCategories[0];

  // 3. Resolve Conflict using Priority
  const priorityMatch = matchedCategories.find(cat => priorityCategories.includes(cat));
  if (priorityMatch) return priorityMatch;

  return matchedCategories[0];
};

/**
 * Identifies the company using STRICT version provided.
 * Expects normalized text input.
 */
export const identifyCompany = (textNormalized: string, companies: Company[]): Company | null => {
  if (!textNormalized) return null;

  // 1. Extrai TODOS os blocos numéricos possíveis (mesmo quebrados)
  const numericGroups = textNormalized
    .replace(/[^\d]/g, ' ')
    .split(' ')
    .filter(n => n.length >= 4);

  // Junta tudo também (fallback)
  const fullNumeric = numericGroups.join('');

  for (const company of companies) {
    const companyDocClean = company.docNumber.replace(/\D/g, '');
    if (companyDocClean.length < 8) continue;

    const root = companyDocClean.substring(0, 8);

    // ✔ Match direto
    if (fullNumeric.includes(root)) return company;

    // ✔ Match fragmentado (PDF quebrado)
    for (const group of numericGroups) {
      if (group.includes(root) || root.includes(group)) {
        return company;
      }
    }
  }

  // 2. Fallback por nome (seguro) - textNormalized já contém o nome do arquivo concatenado se o caller fez certo
  for (const company of companies) {
    const nameNoAccents = removeAccents(company.name);
    if (nameNoAccents.length > 4 && textNormalized.includes(nameNoAccents)) {
      return company;
    }
  }

  return null;
};
