
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
      // transform[4] is X (horizontal), transform[5] is Y (vertical)
      const items = textContent.items.map((item: any) => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        w: item.width,
        hasEOL: item.hasEOL
      }));

      // 2. Group items into visual lines based on Y coordinate tolerance
      // PDF Y-coordinates usually go from bottom to top, or top to bottom depending on origin.
      // We group items that are roughly on the same vertical level (tolerance of 5px)
      const lines: { y: number; items: typeof items }[] = [];
      const TOLERANCE_Y = 6;

      for (const item of items) {
        // Find an existing line that matches the Y coordinate within tolerance
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
        // Sort items by X
        line.items.sort((a, b) => a.x - b.x);
        // Join items with smart spacing
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
      // Ensure keyword is not just a common letter/number to avoid false positives
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
 * Identifies the company based on text content using REVERSE SEARCH logic.
 * Instead of extracting patterns from text, we check if the known company numbers exist in the text.
 */
export const identifyCompany = (text: string, companies: Company[]): Company | null => {
  // 1. Prepare the haystack: Create a version of the text containing ONLY digits
  // This allows finding "12345678000199" inside "CNPJ: 12.345.678/0001-99" or "File_12345678000199.pdf"
  const textNumeric = text.replace(/\D/g, ''); 
  const textNormalized = removeAccents(text);

  // --- STRATEGY 1: EXACT MATCH (Full CNPJ/CPF) ---
  // Highest confidence. Matches strictly the full string of digits.
  for (const company of companies) {
      const docClean = company.docNumber.replace(/\D/g, '');
      
      // Safety: Ignore empty or very short DB records to avoid false positives
      if (docClean.length < 5) continue;

      if (textNumeric.includes(docClean)) {
          return company;
      }
  }

  // --- STRATEGY 2: ROOT MATCH (CNPJ Base - First 8 digits) ---
  // Handles cases where DB has "Matriz" but doc is "Filial" (or vice versa), or generic invoices.
  // We first extract "Candidates" from text that LOOK like CNPJs (14 digits) to compare safely.
  // We don't want to match a phone number "99999999" with a CNPJ root.
  
  // Find sequences of 14 digits in the numeric text
  // We can't rely on regex on 'textNumeric' easily for boundaries, so we rely on the original text regex
  // to find CANDIDATE blocks, then strip them.
  const regexCandidates = /(\d{2}\s*\.\s*\d{3}\s*\.\s*\d{3}\s*\/\s*\d{4}\s*-\s*\d{2})|(\d{14})/g;
  const matches = [...text.matchAll(regexCandidates)];
  
  for (const match of matches) {
      const candidateFull = match[0].replace(/\D/g, '');
      
      // Only verify roots if we found a valid 14-digit block
      if (candidateFull.length === 14) {
          const candidateRoot = candidateFull.substring(0, 8);
          
          for (const company of companies) {
              if (company.type === 'CPF') continue; // Skip CPFs for root logic
              
              const companyClean = company.docNumber.replace(/\D/g, '');
              const companyRoot = companyClean.substring(0, 8);

              if (companyRoot === candidateRoot) {
                  return company;
              }
          }
      }
  }

  // --- STRATEGY 3: NAME MATCH (Fallback) ---
  for (const company of companies) {
    const nameNoAccents = removeAccents(company.name);
    // Strict name check: must be longer than 4 chars to avoid matching short words
    if (nameNoAccents.length > 4 && textNormalized.includes(nameNoAccents)) {
        return company;
    }
  }

  return null;
};
