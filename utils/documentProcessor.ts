
import { Company } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

// Define worker URL explicitly using the same version as the library to avoid version mismatch errors
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
      // Join items with space, but also handle cases where letters are split
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
 */
export const identifyCategory = (text: string, keywordMap: Record<string, string[]>): string | null => {
  const textNormalized = removeAccents(text);

  // Priority 1: Exclusive rules (Hardcoded overrides)
  if (textNormalized.includes('cora.com.br')) return 'Honorários';
  if (textNormalized.includes('nota fiscal')) return 'Notas Fiscais';

  // Priority 2: Combinations
  if (textNormalized.includes('folha mensal') && textNormalized.includes('extrato mensal')) {
    return 'Folha de Pagamento';
  }

  // Priority 3: Specific single keywords
  if (textNormalized.includes('folha mensal')) {
    return 'Contracheque';
  }

  // Priority 4: Dynamic User Settings (The most important part for custom bindings)
  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (!keywords || !Array.isArray(keywords)) continue;
    
    for (const keyword of keywords) {
      if (!keyword) continue;
      const kwNormalized = removeAccents(keyword);
      // Check if the normalized text contains the normalized keyword
      if (textNormalized.includes(kwNormalized)) {
        return category;
      }
    }
  }

  return null;
};

/**
 * Identifies the company based on text content using flexible Regex logic.
 */
export const identifyCompany = (text: string, companies: Company[]): Company | null => {
  const textNormalized = removeAccents(text);
  
  // Clean text for pure digit search as well (removing all non-digits)
  const textDigitsOnly = text.replace(/\D/g, '');

  // 1. Regex Search for CNPJ/CPF (Flexible with spaces)
  // Allows optional spaces \s* between separators and digits to catch PDF scanning issues
  // Example: 12 . 345 . 678 / 0001 - 99
  const pattern = /(\d{2}\s*\.\s*\d{3}\s*\.\s*\d{3}\s*\/\s*\d{4}\s*-\s*\d{2})|(\d{3}\s*\.\s*\d{3}\s*\.\s*\d{3}\s*-\s*\d{2})/g;
  
  const matches = [...text.matchAll(pattern)];
  
  const foundDocs: {type: 'CNPJ' | 'CPF', val: string}[] = [];

  // Method A: Check Regex Matches
  for (const match of matches) {
      const [full] = match;
      const clean = full.replace(/\D/g, ''); // Remove spaces and symbols
      
      if (clean.length === 14) { // CNPJ
          foundDocs.push({ type: 'CNPJ', val: clean.substring(0, 8) }); // Root
      } else if (clean.length === 11) { // CPF
          foundDocs.push({ type: 'CPF', val: clean });
      }
  }

  // Method B: Brute Force check against Company DB
  // If regex failed (due to weird formatting), checking if the company's clean doc number exists in the text's digit stream
  for (const company of companies) {
      const companyDocClean = company.docNumber.replace(/\D/g, '');
      if (companyDocClean.length > 5 && textDigitsOnly.includes(companyDocClean)) {
           return company;
      }
  }

  // Check found regex docs against DB
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
    // Split name into parts to avoid matching common words, match only if significant part matches
    // But for full name search:
    if (nameNormalized.length > 4 && textNormalized.includes(nameNormalized)) {
        return company;
    }
  }

  return null;
};
