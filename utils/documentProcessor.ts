
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
 * Extracts text content from a PDF file using Visual Layout Reconstruction (XY Sorting).
 * This fixes issues where text from different columns gets mixed up or words are broken.
 */
export const extractTextFromPDF = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = "";

    const maxPages = Math.min(pdf.numPages, 5);
    
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // 1. Map items with their coordinates
      const items = textContent.items.map((item: any) => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        w: item.width,
        hasEOL: item.hasEOL
      }));

      // 2. Group items into visual lines based on Y coordinate tolerance
      const lines: { y: number; items: typeof items }[] = [];
      const TOLERANCE_Y = 6;

      for (const item of items) {
        const existingLine = lines.find(l => Math.abs(l.y - item.y) < TOLERANCE_Y);
        if (existingLine) {
          existingLine.items.push(item);
        } else {
          lines.push({ y: item.y, items: [item] });
        }
      }

      // 3. Sort lines Top-to-Bottom
      lines.sort((a, b) => b.y - a.y);

      // 4. Sort items within each line Left-to-Right (Ascending X) and join
      const pageStrings = lines.map(line => {
        line.items.sort((a, b) => a.x - b.x);
        return line.items.map(item => item.str).join(' ');
      });

      fullText += pageStrings.join('\n') + '\n';
    }
    
    // Normalize return: Remove accents, collapse multiple spaces to single space
    return removeAccents(fullText).replace(/\s+/g, ' ').trim();

  } catch (error) {
    console.error("Erro ao ler PDF:", error);
    return "";
  }
};

/**
 * Identifies the category based on text content, keywords map, and priority rules.
 */
export const identifyCategory = (
    text: string, 
    keywordMap: Record<string, string[]>, 
    priorityCategories: string[] = []
): string | null => {
  
  const textNormalized = removeAccents(text);
  const matchedCategories: string[] = [];

  // 1. Scan User Keywords (Dynamic)
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
 * Identifies the company using REVERSE SEARCH strategy.
 * Instead of trying to regex the PDF for a CNPJ format, we iterate through the DB companies
 * and check if their CNPJ (stripped of punctuation) exists in the PDF text (also stripped).
 */
export const identifyCompany = (text: string, companies: Company[]): Company | null => {
  if (!text) return null;

  // 1. Create a "haystack" of just numbers from the text
  // This handles cases where PDF has "12.345.678/0001-99" or "12345678000199" or even "12 345 678"
  const textNumeric = text.replace(/\D/g, ''); 
  
  // 2. Normalize text for name fallback
  const textNormalized = removeAccents(text);

  // --- STRATEGY 1: ROOT MATCH (8 Digits) ---
  // Most reliable. We check if the first 8 digits of any company CNPJ exist in the text.
  for (const company of companies) {
      // Clean DB Document
      const companyDocClean = company.docNumber.replace(/\D/g, '');
      
      // We need at least 8 digits to compare a root safely
      if (companyDocClean.length < 8) continue;

      // Extract Root (first 8 digits)
      const companyRoot = companyDocClean.substring(0, 8);

      // Check if this root exists anywhere in the numeric stream of the document
      if (textNumeric.includes(companyRoot)) {
          return company;
      }
  }

  // --- STRATEGY 2: NAME MATCH (Fallback) ---
  // Only used if CNPJ match fails.
  for (const company of companies) {
    const nameNoAccents = removeAccents(company.name);
    // Strict name check: must be longer than 4 chars to avoid matching short common words
    if (nameNoAccents.length > 4 && textNormalized.includes(nameNoAccents)) {
        return company;
    }
  }

  return null;
};
