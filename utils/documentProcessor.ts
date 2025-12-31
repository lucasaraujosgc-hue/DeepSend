
import { Company } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

// Define worker globally since we are using ESM modules in browser
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.mjs';

/**
 * Normalizes text to remove accents for better matching
 */
export const removeAccents = (text: string): string => {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

/**
 * Extracts text content from a PDF file
 */
export const extractTextFromPDF = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    // Read all pages (or limit to first few if performance is an issue)
    for (let i = 1; i <= pdf.numPages; i++) {
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
  const textLower = text.toLowerCase();

  // Priority 1: cora.com.br -> Honorários (Exclusive)
  if (textLower.includes('cora.com.br')) {
    return 'Honorários';
  }

  // Check for Nota Fiscal explicitly
  if (textLower.includes('nota fiscal')) {
    return 'Notas Fiscais';
  }

  // Priority 2: 'folha mensal' AND 'extrato mensal' -> Folha de Pagamento
  if (textLower.includes('folha mensal') && textLower.includes('extrato mensal')) {
    return 'Folha de Pagamento';
  }

  // Priority 3: 'folha mensal' -> Contracheque
  if (textLower.includes('folha mensal')) {
    return 'Contracheque';
  }

  // Standard Keyword Mapping Loop (from settings/constants)
  for (const [category, keywords] of Object.entries(keywordMap)) {
    for (const keyword of keywords) {
      if (textLower.includes(keyword.toLowerCase())) {
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
  // Regex pattern from Python script
  // Gr 1: CNPJ Completo (XX.XXX.XXX/XXXX-XX)
  // Gr 2: CPF Completo (XXX.XXX.XXX-XX)
  // Gr 3: CNPJ Simples (14 digitos)
  // Gr 4: CPF Simples (11 digitos)
  // Gr 5: CNPJ Parcial 1 (XX.XXX.XXX) - 8 digitos formatado
  // Gr 6: CPF Parcial 1 (XXX.XXX.XXX) - 9 digitos formatado
  // Gr 7: CNPJ Parcial 2 (8 digitos)
  // Gr 8: CPF Parcial 2 (9 digitos)
  const pattern = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})|(\d{3}\.\d{3}\.\d{3}-\d{2})|(\d{14})|(\d{11})|(\d{2}\.\d{3}\.\d{3})|(\d{3}\.\d{3}\.\d{3})|(\d{8})|(\d{9})/g;
  
  const matches = [...text.matchAll(pattern)];
  
  const foundDocs: {type: 'CNPJ' | 'CPF', val: string}[] = [];

  for (const match of matches) {
      // match[0] is the full match, match[1]..match[8] are groups
      const [full, cnpjFull, cpfFull, cnpjSimple, cpfSimple, cnpjPart1, cpfPart1, cnpjPart2, cpfPart2] = match;

      if (cnpjFull) {
          const clean = cnpjFull.replace(/\D/g, '');
          foundDocs.push({ type: 'CNPJ', val: clean.substring(0, 8) });
      } else if (cpfFull) {
          const clean = cpfFull.replace(/\D/g, '');
          foundDocs.push({ type: 'CPF', val: clean });
      } else if (cnpjSimple) {
          foundDocs.push({ type: 'CNPJ', val: cnpjSimple.substring(0, 8) });
      } else if (cpfSimple) {
          foundDocs.push({ type: 'CPF', val: cpfSimple });
      } else if (cnpjPart1) {
          const clean = cnpjPart1.replace(/\D/g, '');
          foundDocs.push({ type: 'CNPJ', val: clean }); // Assumes 8 digits
      } else if (cpfPart1) {
           const clean = cpfPart1.replace(/\D/g, '');
           foundDocs.push({ type: 'CPF', val: clean });
      } else if (cnpjPart2) {
           foundDocs.push({ type: 'CNPJ', val: cnpjPart2 });
      } else if (cpfPart2) {
           foundDocs.push({ type: 'CPF', val: cpfPart2 });
      }
  }

  // Remove duplicates handled by logic below implicitly by iterating foundDocs

  // 1. Search in DB by Doc
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
  const textLower = removeAccents(text.toLowerCase());
  for (const company of companies) {
    const nameLower = removeAccents(company.name.toLowerCase());
    
    // Check if company name is in text (simple includes)
    if (textLower.includes(nameLower)) {
        return company;
    }
  }

  return null;
};
