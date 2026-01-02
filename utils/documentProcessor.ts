
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
      // In PDF.js standard output, higher Y usually means higher on the page (Cartesian), 
      // but sometimes it's inverted. We assume standard Cartesian (0,0 at bottom-left).
      // So sorting DESCENDING Y puts top lines first.
      lines.sort((a, b) => b.y - a.y);

      // 4. Sort items within each line Left-to-Right (Ascending X) and join
      const pageStrings = lines.map(line => {
        // Sort items by X
        line.items.sort((a, b) => a.x - b.x);
        
        // Join items with smart spacing
        // If the gap between previous item end and current item start is large, add space
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

  // 2. Scan Hardcoded Fallbacks (Only if no user keywords matched OR to allow priority resolution)
  // We check these loosely but give preference to user settings via 'priorityCategories'
  
  // Honorários (Banco ou Cora)
  if (textNormalized.includes('cora.com.br') || textNormalized.includes('honorarios')) {
      if (!matchedCategories.includes('Honorários')) matchedCategories.push('Honorários');
  }
  
  // Notas Fiscais
  if (
      (textNormalized.includes('nota fiscal') || 
       textNormalized.includes('danfe') || 
       textNormalized.includes('nf-e'))
  ) {
      if (!matchedCategories.includes('Notas Fiscais')) matchedCategories.push('Notas Fiscais');
  }

  // Folha de Pagamento
  if (
      (textNormalized.includes('folha') && textNormalized.includes('pagamento')) ||
      (textNormalized.includes('resumo') && textNormalized.includes('folha')) ||
      textNormalized.includes('extrato mensal')
  ) {
      if (!matchedCategories.includes('Folha de Pagamento')) matchedCategories.push('Folha de Pagamento');
  }

  // Simples Nacional
  // Caution: Many documents mention "Optante pelo Simples Nacional" in footer.
  // We look for specific document titles.
  if (
      textNormalized.includes('documento de arrecadacao') && 
      (textNormalized.includes('simples nacional') || textNormalized.includes('das'))
  ) {
      if (!matchedCategories.includes('Simples Nacional')) matchedCategories.push('Simples Nacional');
  }

  // FGTS
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

  // Default: Return the first match found
  return matchedCategories[0];
};

/**
 * Identifies the company based on text content using strict Regex logic.
 */
export const identifyCompany = (text: string, companies: Company[]): Company | null => {
  // Enhanced Regex:
  // 1. Allows optional spaces \s? around dots/slashes/dashes to handle bad OCR kerning (e.g. "58 . 560 . 180")
  // 2. Captures standard formats
  
  // We use \s* to allow 0 or more spaces around separators
  const jsPattern = /(\d{2}\s*\.\s*\d{3}\s*\.\s*\d{3}\s*\/\s*\d{4}\s*-\s*\d{2})|(\d{3}\s*\.\s*\d{3}\s*\.\s*\d{3}\s*-\s*\d{2})|(\d{14})|(\d{11})|(\d{2}\s*\.\s*\d{3}\s*\.\s*\d{3})|(\d{3}\s*\.\s*\d{3}\s*\.\s*\d{3})|(\d{8})|(\d{9})/g;

  const matches = [...text.matchAll(jsPattern)];
  const foundDocs: {type: 'CNPJ' | 'CPF', val: string}[] = [];

  for (const match of matches) {
      const fullMatch = match[0];
      const cleanNums = fullMatch.replace(/\D/g, ''); // Remove non-digits to analyze length

      // Determine Type based on length and structure
      if (cleanNums.length === 14) {
          // Full CNPJ -> Take first 8
          foundDocs.push({ type: 'CNPJ', val: cleanNums.substring(0, 8) });
      } else if (cleanNums.length === 11) {
          // Full CPF
          foundDocs.push({ type: 'CPF', val: cleanNums });
      } else if (cleanNums.length === 8) {
          // CNPJ Root or Partial
          foundDocs.push({ type: 'CNPJ', val: cleanNums });
      } else if (cleanNums.length === 9) {
          // CPF Partial
          foundDocs.push({ type: 'CPF', val: cleanNums });
      }
  }

  // Remove duplicates
  const uniqueFoundDocs = foundDocs.filter((v, i, a) => 
      a.findIndex(t => t.type === v.type && t.val === v.val) === i
  );

  // 1. Search in DB by Document Number
  for (const item of uniqueFoundDocs) {
      for (const company of companies) {
          const companyDocClean = company.docNumber.replace(/\D/g, '');
          
          if (company.type === 'CNPJ' || company.type === 'MEI') {
              if (item.type === 'CNPJ') {
                  const dbRoot = companyDocClean.substring(0, 8);
                  if (dbRoot === item.val) return company;
              }
          } 
          
          if (company.type === 'CPF') {
              if (item.type === 'CPF' && companyDocClean.includes(item.val)) {
                  return company;
              }
          }
      }
  }

  // 2. Fallback: Search by Name (Safe Check)
  // Only if name is unique enough (more than 4 chars)
  const textNoAccents = removeAccents(text);
  
  for (const company of companies) {
    const nameNoAccents = removeAccents(company.name);
    if (nameNoAccents.length > 4 && textNoAccents.includes(nameNoAccents)) {
        return company;
    }
  }

  return null;
};
