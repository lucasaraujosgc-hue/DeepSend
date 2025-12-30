import { Company } from '../types';

/**
 * Normalizes text to remove accents for better matching
 */
const removeAccents = (text: string): string => {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

/**
 * Identifies the category based on text content and keywords map.
 * Implements strict priority rules defined in the requirement.
 */
export const identifyCategory = (text: string, keywordMap: Record<string, string[]>): string | null => {
  const textLower = text.toLowerCase();

  // Priority 1: cora.com.br -> Honorários (Exclusive)
  if (textLower.includes('cora.com.br')) {
    return 'Honorários';
  }

  // Check for Nota Fiscal explicitly as per logic
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

  // Standard Keyword Mapping Loop
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
 * Tries to find CNPJ/CPF or Company Name in the text.
 */
export const identifyCompany = (text: string, companies: Company[]): Company | null => {
  const textLower = removeAccents(text.toLowerCase());
  
  // 1. Try to find by Doc Number (removing formatting)
  const cleanText = text.replace(/\D/g, ''); // Text with only numbers
  
  for (const company of companies) {
    const cleanDoc = company.docNumber.replace(/\D/g, '');
    
    // Exact match on Doc Number (or first 8 digits for CNPJ root)
    if (cleanText.includes(cleanDoc) || (cleanDoc.length > 8 && cleanText.includes(cleanDoc.substring(0, 8)))) {
        return company;
    }
  }

  // 2. Try to find by Name
  for (const company of companies) {
    const nameLower = removeAccents(company.name.toLowerCase());
    
    // Check if company name is in text
    if (textLower.includes(nameLower)) {
        return company;
    }
  }

  return null;
};