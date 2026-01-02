
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
 * Extracts text content from a PDF file.
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
      // Join with space to prevent words from sticking together
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
 * CHANGE: User settings (keywordMap) now have PRIORITY over hardcoded rules.
 */
export const identifyCategory = (text: string, keywordMap: Record<string, string[]>): string | null => {
  const textNormalized = removeAccents(text);

  // 1. Priority: Dynamic User Settings (Vinculações)
  // This ensures user configuration overrides system defaults
  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (!keywords || !Array.isArray(keywords)) continue;
    
    for (const keyword of keywords) {
      if (!keyword) continue;
      const kwNormalized = removeAccents(keyword);
      // Strict check to avoid empty string matching everything
      if (kwNormalized.length > 0 && textNormalized.includes(kwNormalized)) {
        return category;
      }
    }
  }

  // 2. Fallback: Hardcoded/System Rules (Only if no user rule matched)
  if (textNormalized.includes('cora.com.br')) return 'Honorários';
  if (textNormalized.includes('nota fiscal')) return 'Notas Fiscais';
  if (textNormalized.includes('folha mensal') && textNormalized.includes('extrato mensal')) {
    return 'Folha de Pagamento';
  }
  if (textNormalized.includes('simples nacional') && (textNormalized.includes('documento de arrecadacao') || textNormalized.includes('das'))) {
      return 'Simples Nacional';
  }
  if (textNormalized.includes('fgts') && (textNormalized.includes('guia') || textNormalized.includes('digital'))) {
      return 'FGTS';
  }

  return null;
};

/**
 * Identifies the company based on text content using Python logic translation.
 */
export const identifyCompany = (text: string, companies: Company[]): Company | null => {
  // Regex pattern EXACTLY as provided in Python.
  // Note: In JS Regex, '.' means 'any character' (except newline), which works great for OCR noise.
  // Groups mapping based on Python structure:
  // 1: CNPJ Full (\d{2}.\d{3}.\d{3}/\d{4}-\d{2})
  // 2: CPF Full (\d{3}.\d{3}.\d{3}-\d{2})
  // 3: CNPJ 14 digits (\d{14})
  // 4: CPF 11 digits (\d{11})
  // 5: CNPJ Partial 1 (\d{2}.\d{3}.\d{3})
  // 6: CPF Partial 1 (\d{3}.\d{3}.\d{3})
  // 7: CNPJ Partial 2 (\d{8})
  // 8: CPF Partial 2 (\d{9})
  const pattern = /(\d{2}.\d{3}.\d{3}\/\d{4}-\d{2})|(\d{3}.\d{3}.\d{3}-\d{2})|(\d{14})|(\d{11})|(\d{2}.\d{3}.\d{3})|(\d{3}.\d{3}.\d{3})|(\d{8})|(\d{9})/g;
  
  const matches = [...text.matchAll(pattern)];
  
  const foundDocs: {type: 'CNPJ' | 'CPF', val: string}[] = [];

  for (const match of matches) {
      const [
          fullMatch,
          cnpjCompleto,    // Group 1
          cpfCompleto,     // Group 2
          cnpjSimples,     // Group 3
          cpfSimples,      // Group 4
          cnpjParcial1,    // Group 5
          cpfParcial1,     // Group 6
          cnpjParcial2,    // Group 7
          cpfParcial2      // Group 8
      ] = match;

      // Logic mirrored from Python:
      // If CNPJ (Full or Simple), we extract the FIRST 8 DIGITS (Raiz).
      // If CPF, we extract digits.

      if (cnpjCompleto) {
          const clean = cnpjCompleto.replace(/\D/g, ''); // Remove non-digits
          foundDocs.push({ type: 'CNPJ', val: clean.substring(0, 8) }); // Python: cnpj_limpo[:8]
      } else if (cpfCompleto) {
          const clean = cpfCompleto.replace(/\D/g, '');
          foundDocs.push({ type: 'CPF', val: clean });
      } else if (cnpjSimples) {
          const clean = cnpjSimples.replace(/\D/g, '');
          foundDocs.push({ type: 'CNPJ', val: clean.substring(0, 8) }); // Python: cnpj_simples[:8]
      } else if (cpfSimples) {
          const clean = cpfSimples.replace(/\D/g, '');
          foundDocs.push({ type: 'CPF', val: clean });
      } else if (cnpjParcial1) { // 36.662.174
          const clean = cnpjParcial1.replace(/\D/g, '');
          foundDocs.push({ type: 'CNPJ', val: clean });
      } else if (cpfParcial1) { // 366.621.740
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

  // 1. Search in DB by Doc Number Partial Match
  // Python logic: Empresa.cpf_cnpj.like(f"%{parcial}%")
  // Means: Does the DATABASE DOCUMENT contain the FOUND PARTIAL?
  for (const item of uniqueFoundDocs) {
      for (const company of companies) {
          const companyDocClean = company.docNumber.replace(/\D/g, '');
          
          if (company.type === 'CNPJ' || company.type === 'MEI') {
              if (item.type === 'CNPJ') {
                  // Check if Company Doc (e.g. 58560180000100) includes the partial (e.g. 58560180)
                  if (companyDocClean.includes(item.val)) {
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
    
    // Check if company name appears in text
    if (nameNoAccents.length > 2 && textNoAccents.includes(nameNoAccents)) {
        return company;
    }
  }

  return null;
};
