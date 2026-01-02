
import { Company } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

// Define worker URL explicitly using the same version as the library to avoid version mismatch errors
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.mjs';

/**
 * Normalizes text to remove accents (NFD normalization), mimicking Python's remove_acentos
 */
export const removeAccents = (text: string): string => {
  if (!text) return "";
  // Equivalent to Python: ''.join(c for c in unicodedata.normalize('NFD', texto) if unicodedata.category(c) != 'Mn')
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
      // Join items with space to avoid glued words
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

  // Priority 1: Exclusive rules
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

  // Priority 4: Dynamic User Settings
  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (!keywords || !Array.isArray(keywords)) continue;
    
    for (const keyword of keywords) {
      if (!keyword) continue;
      const kwNormalized = removeAccents(keyword);
      if (textNormalized.includes(kwNormalized)) {
        return category;
      }
    }
  }

  return null;
};

/**
 * Identifies the company based on text content using Python logic translation.
 */
export const identifyCompany = (text: string, companies: Company[]): Company | null => {
  // Regex pattern from Python code
  // Groups:
  // 1: CNPJ Full (\d{2}.\d{3}.\d{3}/\d{4}-\d{2})
  // 2: CPF Full (\d{3}.\d{3}.\d{3}-\d{2})
  // 3: CNPJ 14 digits (\d{14})
  // 4: CPF 11 digits (\d{11})
  // 5: CNPJ Partial 1 (\d{2}.\d{3}.\d{3}) -> 8 digits with dots
  // 6: CPF Partial 1 (\d{3}.\d{3}.\d{3}) -> 9 digits with dots
  // 7: CNPJ Partial 2 (\d{8})
  // 8: CPF Partial 2 (\d{9})
  // Note: Using '.' as wildcard to match Python logic, though usually \. is preferred for dots.
  const pattern = /(\d{2}.\d{3}.\d{3}\/\d{4}-\d{2})|(\d{3}.\d{3}.\d{3}-\d{2})|(\d{14})|(\d{11})|(\d{2}.\d{3}.\d{3})|(\d{3}.\d{3}.\d{3})|(\d{8})|(\d{9})/g;
  
  const matches = [...text.matchAll(pattern)];
  
  const foundDocs: {type: 'CNPJ' | 'CPF', val: string}[] = [];

  for (const match of matches) {
      const cnpjCompleto = match[1];
      const cpfCompleto = match[2];
      const cnpjSimples = match[3];
      const cpfSimples = match[4];
      const cnpjParcial1 = match[5]; 
      const cpfParcial1 = match[6];
      const cnpjParcial2 = match[7]; 
      const cpfParcial2 = match[8];

      if (cnpjCompleto) {
          const clean = cnpjCompleto.replace(/[./-]/g, '');
          foundDocs.push({ type: 'CNPJ', val: clean.substring(0, 8) }); // First 8 digits
      } else if (cpfCompleto) {
          const clean = cpfCompleto.replace(/[.-]/g, '');
          foundDocs.push({ type: 'CPF', val: clean });
      } else if (cnpjSimples) {
          foundDocs.push({ type: 'CNPJ', val: cnpjSimples.substring(0, 8) }); // First 8 digits
      } else if (cpfSimples) {
          foundDocs.push({ type: 'CPF', val: cpfSimples });
      } else if (cnpjParcial1) {
          const clean = cnpjParcial1.replace(/\./g, '');
          foundDocs.push({ type: 'CNPJ', val: clean });
      } else if (cpfParcial1) {
          const clean = cpfParcial1.replace(/\./g, '');
          foundDocs.push({ type: 'CPF', val: clean });
      } else if (cnpjParcial2) {
          foundDocs.push({ type: 'CNPJ', val: cnpjParcial2 });
      } else if (cpfParcial2) {
          foundDocs.push({ type: 'CPF', val: cpfParcial2 });
      }
  }

  // Remove duplicates (using JSON stringify hack or simple filter)
  const uniqueFoundDocs = foundDocs.filter((v, i, a) => a.findIndex(t => (t.type === v.type && t.val === v.val)) === i);

  // 1. Search in DB by Doc Number Partial Match
  for (const item of uniqueFoundDocs) {
      for (const company of companies) {
          const companyDocClean = company.docNumber.replace(/\D/g, '');
          
          if (company.type === item.type) {
             // Simulate SQL 'LIKE %parcial%'
             if (companyDocClean.includes(item.val)) {
                 return company;
             }
          } else if (item.type === 'CNPJ' && company.type === 'MEI') {
              // MEI also has CNPJ
              if (companyDocClean.includes(item.val)) {
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
    // Ensure name is long enough to avoid false positives with short common words
    if (nameNoAccents.length > 2 && textNoAccents.includes(nameNoAccents)) {
        return company;
    }
  }

  return null;
};
