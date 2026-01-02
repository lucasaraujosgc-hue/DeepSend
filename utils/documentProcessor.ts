
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
 * Extracts text content from a PDF file preserving layout structure.
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
      
      let lastY: number | null = null;
      let pageText = '';

      // Advanced extraction preserving visual lines
      for (const item of textContent.items as any[]) {
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
          pageText += '\n'; // Add newline on significant vertical shift
        }
        pageText += item.str + ' ';
        lastY = item.transform[5];
      }

      fullText += pageText + '\n';
    }
    
    // Normalize return: Remove accents, collapse multiple spaces to single space, trim
    return removeAccents(fullText).replace(/\s+/g, ' ').trim();

  } catch (error) {
    console.error("Erro ao ler PDF:", error);
    return "";
  }
};

/**
 * Identifies the category based on text content, keywords map, and priority rules.
 * 
 * Logic:
 * 1. Find ALL categories that match the keywords.
 * 2. If multiple matches, check priorityCategories.
 * 3. If a match is in priorityCategories, it wins.
 */
export const identifyCategory = (
    text: string, 
    keywordMap: Record<string, string[]>, 
    priorityCategories: string[] = []
): string | null => {
  
  // Note: Text is already normalized by extractTextFromPDF (accents removed, lowercased)
  // But we run removeAccents again just to be safe if passed raw string
  const textNormalized = removeAccents(text);
  const matchedCategories: string[] = [];

  // 1. Scan User Keywords
  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (!keywords || !Array.isArray(keywords)) continue;
    
    for (const keyword of keywords) {
      if (!keyword) continue;
      const kwNormalized = removeAccents(keyword);
      if (kwNormalized.length > 0 && textNormalized.includes(kwNormalized)) {
        if (!matchedCategories.includes(category)) {
            matchedCategories.push(category);
        }
        break; // Found this category, move to next category
      }
    }
  }

  // 2. Scan Hardcoded Fallbacks (Robust check)
  
  // Honorários
  if (textNormalized.includes('cora.com.br') && !matchedCategories.includes('Honorários')) {
      matchedCategories.push('Honorários');
  }
  
  // Notas Fiscais (Expanded keywords)
  if (
      (textNormalized.includes('nota fiscal') || 
       textNormalized.includes('danfe') || 
       textNormalized.includes('nf-e')) && 
      !matchedCategories.includes('Notas Fiscais')
  ) {
      matchedCategories.push('Notas Fiscais');
  }

  // Folha
  if (
      textNormalized.includes('folha mensal') && 
      textNormalized.includes('extrato mensal') && 
      !matchedCategories.includes('Folha de Pagamento')
  ) {
      matchedCategories.push('Folha de Pagamento');
  }

  // Simples Nacional
  if (
      textNormalized.includes('simples nacional') && 
      (textNormalized.includes('documento de arrecadacao') || textNormalized.includes('das')) && 
      !matchedCategories.includes('Simples Nacional')
  ) {
      matchedCategories.push('Simples Nacional');
  }

  // FGTS
  if (
      textNormalized.includes('fgts') && 
      (textNormalized.includes('guia') || textNormalized.includes('digital')) && 
      !matchedCategories.includes('FGTS')
  ) {
      matchedCategories.push('FGTS');
  }

  if (matchedCategories.length === 0) return null;
  if (matchedCategories.length === 1) return matchedCategories[0];

  // 3. Resolve Conflict using Priority
  // Find the first matched category that exists in the priority list
  const priorityMatch = matchedCategories.find(cat => priorityCategories.includes(cat));
  
  if (priorityMatch) {
      return priorityMatch;
  }

  // Default: Return the first match found
  return matchedCategories[0];
};

/**
 * Identifies the company based on text content using strict Regex logic.
 */
export const identifyCompany = (text: string, companies: Company[]): Company | null => {
  // Regex pattern strict on dots (\.) to avoid false positives.
  // Groups:
  // 1: CNPJ Full (\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})
  // 2: CPF Full (\d{3}\.\d{3}\.\d{3}-\d{2})
  // 3: CNPJ 14 digits (\d{14})
  // 4: CPF 11 digits (\d{11})
  // 5: CNPJ Partial 1 (\d{2}\.\d{3}\.\d{3})
  // 6: CPF Partial 1 (\d{3}\.\d{3}\.\d{3})
  // 7: CNPJ Partial 2 (\d{8})
  // 8: CPF Partial 2 (\d{9})
  const pattern = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})|(\d{3}\.\d{3}\.\d{3}-\d{2})|(\d{14})|(\d{11})|(\d{2}\.\d{3}\.\d{3})|(\d{3}\.\d{3}\.\d{3})|(\d{8})|(\d{9})/g;
  
  const matches = [...text.matchAll(pattern)];
  const foundDocs: {type: 'CNPJ' | 'CPF', val: string}[] = [];

  for (const match of matches) {
      const [
          fullMatch,
          cnpjCompleto, cpfCompleto, cnpjSimples, cpfSimples, 
          cnpjParcial1, cpfParcial1, cnpjParcial2, cpfParcial2
      ] = match;

      // Logic:
      // If CNPJ -> Clean non-digits -> Take substring(0, 8)
      // If CPF -> Clean non-digits -> Keep full (usually) or partial depending on logic.
      
      if (cnpjCompleto) {
          const clean = cnpjCompleto.replace(/\D/g, ''); 
          foundDocs.push({ type: 'CNPJ', val: clean.substring(0, 8) }); 
      } else if (cpfCompleto) {
          const clean = cpfCompleto.replace(/\D/g, '');
          foundDocs.push({ type: 'CPF', val: clean });
      } else if (cnpjSimples) {
          const clean = cnpjSimples.replace(/\D/g, '');
          foundDocs.push({ type: 'CNPJ', val: clean.substring(0, 8) }); 
      } else if (cpfSimples) {
          const clean = cpfSimples.replace(/\D/g, '');
          foundDocs.push({ type: 'CPF', val: clean });
      } else if (cnpjParcial1) { 
          const clean = cnpjParcial1.replace(/\D/g, '');
          foundDocs.push({ type: 'CNPJ', val: clean }); 
      } else if (cpfParcial1) { 
          const clean = cpfParcial1.replace(/\D/g, '');
          foundDocs.push({ type: 'CPF', val: clean });
      } else if (cnpjParcial2) { // 8 digits
          const clean = cnpjParcial2.replace(/\D/g, '');
          foundDocs.push({ type: 'CNPJ', val: clean });
      } else if (cpfParcial2) { // 9 digits
          const clean = cpfParcial2.replace(/\D/g, '');
          foundDocs.push({ type: 'CPF', val: clean });
      }
  }

  // Remove duplicates
  const uniqueFoundDocs = foundDocs.filter((v, i, a) => 
      a.findIndex(t => t.type === v.type && t.val === v.val) === i
  );

  // 1. Search in DB
  for (const item of uniqueFoundDocs) {
      for (const company of companies) {
          // IMPORTANT: Clean database document number too
          const companyDocClean = company.docNumber.replace(/\D/g, '');
          
          if (company.type === 'CNPJ' || company.type === 'MEI') {
              if (item.type === 'CNPJ') {
                  // DB (Full 14 chars) vs Extracted (First 8 chars)
                  // We take first 8 of DB to compare
                  const dbRoot = companyDocClean.substring(0, 8);
                  const foundRoot = item.val; 

                  if (dbRoot === foundRoot) {
                      return company;
                  }
              }
          } 
          
          if (company.type === 'CPF') {
              if (item.type === 'CPF' && companyDocClean.includes(item.val)) {
                  return company;
              }
          }
      }
  }

  // 2. Fallback: Search by Name (removing accents)
  const textNoAccents = removeAccents(text);
  
  for (const company of companies) {
    const nameNoAccents = removeAccents(company.name);
    // Ensure name is long enough to avoid false positives
    if (nameNoAccents.length > 2 && textNoAccents.includes(nameNoAccents)) {
        return company;
    }
  }

  return null;
};
