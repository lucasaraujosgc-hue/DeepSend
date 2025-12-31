
import { Company } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

// Define worker globally since we are using ESM modules in browser
// Using a specific version to match the library version
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.mjs';

/**
 * Normalizes text to remove accents and special chars for better matching
 */
export const removeAccents = (text: string): string => {
  if (!text) return "";
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

/**
 * Extracts text content from a PDF file
 */
export const extractTextFromPDF = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = "";

    // Read up to 5 pages to save performance but get enough context
    const maxPages = Math.min(pdf.numPages, 5);
    
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      fullText += pageText + " ";
    }
    
    return fullText;
  } catch (error) {
    console.error("Erro ao ler PDF:", error);
    return "";
  }
};

/**
 * Identifies the category based on text content and keywords map.
 * Implements strict priority rules defined in the Python script.
 */
export const identifyCategory = (text: string, keywordMap: Record<string, string[]>): string | null => {
  const textNormalized = removeAccents(text);

  // Priority 1: Exclusive rules
  if (textNormalized.includes('cora.com.br')) return 'Honorários';
  if (textNormalized.includes('nota fiscal')) return 'Notas Fiscais';

  // Priority 2: Combinations
  // 'folha mensal' AND 'extrato mensal' -> Folha de Pagamento
  if (textNormalized.includes('folha mensal') && textNormalized.includes('extrato mensal')) {
    return 'Folha de Pagamento';
  }

  // Priority 3: Specific single keywords
  if (textNormalized.includes('folha mensal')) {
    return 'Contracheque';
  }

  // Standard Keyword Mapping Loop (from settings/constants)
  // This uses the User Settings configuration
  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (!keywords || !Array.isArray(keywords)) continue;
    
    for (const keyword of keywords) {
      const kwNormalized = removeAccents(keyword);
      if (textNormalized.includes(kwNormalized)) {
        return category;
      }
    }
  }

  return null;
};

/**
 * Identifies the company based on text content using Python logic logic.
 */
export const identifyCompany = (text: string, companies: Company[]): Company | null => {
  const textNormalized = removeAccents(text);

  // 1. Regex Search for CNPJ/CPF
  // Pattern matches various formats of CNPJ and CPF
  const pattern = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})|(\d{3}\.\d{3}\.\d{3}-\d{2})|(\d{14})|(\d{11})|(\d{2}\.\d{3}\.\d{3})|(\d{3}\.\d{3}\.\d{3})|(\d{8})|(\d{9})/g;
  
  const matches = [...text.matchAll(pattern)];
  
  const foundDocs: {type: 'CNPJ' | 'CPF', val: string}[] = [];

  for (const match of matches) {
      const [full] = match;
      const clean = full.replace(/\D/g, '');
      
      if (clean.length === 14 || clean.length === 8) { // CNPJ or CNPJ Root
          foundDocs.push({ type: 'CNPJ', val: clean.substring(0, 8) });
      } else if (clean.length === 11 || clean.length === 9) { // CPF
          foundDocs.push({ type: 'CPF', val: clean });
      }
  }

  // Search in DB by Doc Number
  for (const item of foundDocs) {
      for (const company of companies) {
          const companyDocClean = company.docNumber.replace(/\D/g, '');
          
          if (item.type === 'CNPJ') {
              // Compare first 8 digits (Root)
              if (companyDocClean.length >= 8 && companyDocClean.startsWith(item.val)) {
                  return company;
              }
          } else {
              // CPF Exact match
              if (companyDocClean === item.val) {
                  return company;
              }
          }
      }
  }

  // 2. Fallback: Search by Name (removing accents)
  for (const company of companies) {
    const nameNormalized = removeAccents(company.name);
    
    // Check if company name is in text (simple includes)
    // We check if the name is long enough to avoid false positives with short names
    if (nameNormalized.length > 3 && textNormalized.includes(nameNormalized)) {
        return company;
    }
  }

  return null;
};
