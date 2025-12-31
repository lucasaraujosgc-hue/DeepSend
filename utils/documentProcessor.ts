import { Company } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

// Define worker globally since we are using ESM modules in browser
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.mjs';

/**
 * Normalizes text to remove accents for better matching
 */
const removeAccents = (text: string): string => {
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
 * Identifies the company based on text content (Simulated).
 * Tries to find CNPJ/CPF or Company Name in the text using Regex patterns from Python script.
 */
export const identifyCompany = (text: string, companies: Company[]): Company | null => {
  // Regex pattern from Python script (approximate JS equivalent)
  // (\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}) -> CNPJ Formatted
  // (\d{3}\.\d{3}\.\d{3}-\d{2}) -> CPF Formatted
  // (\d{14}) -> CNPJ Raw
  // (\d{11}) -> CPF Raw
  const pattern = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})|(\d{3}\.\d{3}\.\d{3}-\d{2})|(\d{14})|(\d{11})|(\d{2}\.\d{3}\.\d{3})|(\d{3}\.\d{3}\.\d{3})|(\d{8})|(\d{9})/g;
  
  const matches = text.match(pattern) || [];
  
  // 1. Try to find by Doc Number (CNPJ/CPF) found in text
  for (const match of matches) {
      const cleanMatch = match.replace(/\D/g, '');
      
      // Try to match this clean number against our companies database
      for (const company of companies) {
          const cleanDoc = company.docNumber.replace(/\D/g, '');
          
          // Match logic:
          // If match is full CNPJ (14) or CPF (11)
          if (cleanMatch === cleanDoc) return company;
          
          // If match is partial (first 8 digits of CNPJ)
          if (cleanDoc.length === 14 && cleanMatch.length >= 8 && cleanDoc.startsWith(cleanMatch.substring(0, 8))) {
              return company;
          }
      }
  }

  // 2. Fallback: Try to find by Name
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