import { Company } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.mjs';

/**
 * Remove acentos e normaliza texto para comparação por nome
 */
export const removeAccents = (text: string): string => {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
};

/**
 * Extrai texto do PDF preservando números (CNPJ/CPF)
 */
export const extractTextFromPDF = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();

    const pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
      verbosity: 0
    }).promise;

    let fullText = '';
    const maxPages = Math.min(pdf.numPages, 3);

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      const pageText = textContent.items
        .sort((a: any, b: any) => {
          const yDiff = b.transform[5] - a.transform[5];
          if (Math.abs(yDiff) > 2) return yDiff;
          return a.transform[4] - b.transform[4];
        })
        .map((item: any) => item.str)
        .join(''); // 🔥 SEM ESPAÇO — essencial para números

      fullText += pageText + ' ';
    }

    return fullText.trim();
  } catch (error) {
    console.error(`❌ Erro ao extrair texto do PDF: ${file.name}`, error);
    return '';
  }
};

/**
 * Identifica categoria por palavras-chave
 */
export const identifyCategory = (
  textNormalized: string,
  keywordMap: Record<string, string[]>,
  priorityCategories: string[] = []
): string | null => {
  const matchedCategories: string[] = [];

  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (!Array.isArray(keywords)) continue;

    for (const keyword of keywords) {
      const kw = removeAccents(keyword);
      if (kw.length > 2 && textNormalized.includes(kw)) {
        matchedCategories.push(category);
        break;
      }
    }
  }

  if (matchedCategories.length > 1) {
    return matchedCategories.find(c => priorityCategories.includes(c)) ?? null;
  }

  return matchedCategories[0] ?? null;
};

/**
 * Identifica empresa por CNPJ/CPF ou Nome
 */
export const identifyCompany = (
  rawText: string,
  companies: Company[]
): Company | null => {
  if (!rawText) return null;

  // 🔢 NORMALIZAÇÃO NUMÉRICA (USA TEXTO BRUTO)
  const normalizedForNumbers = rawText
    .replace(/\s+/g, '')
    .replace(/[^\d]/g, '');

  // 🔤 NORMALIZAÇÃO PARA NOMES
  const textNormalized = removeAccents(rawText)
    .replace(/\s+/g, ' ')
    .trim();

  // 1️⃣ MATCH POR CNPJ / CPF
  for (const company of companies) {
    const companyDocClean = company.docNumber.replace(/\D/g, '');

    if (companyDocClean.length < 8) continue;

    if (normalizedForNumbers.includes(companyDocClean)) {
      return company;
    }

    const root = companyDocClean.substring(0, 8);
    if (normalizedForNumbers.includes(root)) {
      return company;
    }
  }

  // 2️⃣ MATCH POR NOME
  const commonTerms = [
    'ltda', 's.a', 'me', 'epp', 'eireli',
    'limitada', 'sa', 'cpf', 'cnpj', '-'
  ];

  for (const company of companies) {
    let nameClean = removeAccents(company.name);

    commonTerms.forEach(term => {
      nameClean = nameClean.replace(
        new RegExp(`\\b${term}\\b`, 'g'),
        ''
      ).trim();
    });

    if (nameClean.length < 3) continue;

    if (textNormalized.includes(nameClean)) {
      return company;
    }

    const parts = nameClean.split(' ');
    if (parts.length >= 2) {
      const firstTwo = `${parts[0]} ${parts[1]}`;
      if (firstTwo.length > 5 && textNormalized.includes(firstTwo)) {
        return company;
      }
    }
  }

  return null;
};
