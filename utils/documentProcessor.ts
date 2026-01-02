import { Company } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

// Worker do PDF.js (versão compatível)
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.mjs';

/**
 * Remove acentos e normaliza texto
 */
export const removeAccents = (text: string): string => {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
};

/**
 * Extrai texto de PDFs TEXTUAIS (não escaneados)
 * Reconstrói o layout usando coordenadas (XY sorting)
 * Lê no máximo 2 páginas
 */
export const extractTextFromPDF = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    let fullText = '';
    const maxPages = Math.min(pdf.numPages, 2);

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      const items = textContent.items
        .filter((item: any) => item.str?.trim())
        .map((item: any) => ({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
        }));

      const lines: { y: number; items: typeof items }[] = [];
      const Y_TOLERANCE = 6;

      for (const item of items) {
        const line = lines.find(l => Math.abs(l.y - item.y) < Y_TOLERANCE);
        if (line) {
          line.items.push(item);
        } else {
          lines.push({ y: item.y, items: [item] });
        }
      }

      // Ordena de cima para baixo
      lines.sort((a, b) => b.y - a.y);

      const pageText = lines
        .map(line =>
          line.items
            .sort((a, b) => a.x - b.x)
            .map(i => i.str)
            .join(' ')
        )
        .join('\n');

      fullText += pageText + '\n';
    }

    return removeAccents(fullText)
      .replace(/\s+/g, ' ')
      .trim();

  } catch (error) {
    console.error('Erro ao ler PDF:', error);
    return '';
  }
};

/**
 * Identifica categoria do documento
 */
export const identifyCategory = (
  text: string,
  keywordMap: Record<string, string[]>,
  priorityCategories: string[] = []
): string | null => {
  const normalizedText = removeAccents(text);
  const matches: string[] = [];

  // Palavras-chave do usuário
  for (const [category, keywords] of Object.entries(keywordMap)) {
    for (const keyword of keywords || []) {
      const kw = removeAccents(keyword);
      if (kw.length > 2 && normalizedText.includes(kw)) {
        matches.push(category);
        break;
      }
    }
  }

  // Fallbacks
  if (
    normalizedText.includes('cora.com.br') ||
    normalizedText.includes('honorarios')
  ) {
    matches.push('Honorários');
  }

  if (
    normalizedText.includes('nota fiscal') ||
    normalizedText.includes('danfe') ||
    normalizedText.includes('nf-e')
  ) {
    matches.push('Notas Fiscais');
  }

  if (
    (normalizedText.includes('folha') && normalizedText.includes('pagamento')) ||
    normalizedText.includes('extrato mensal')
  ) {
    matches.push('Folha de Pagamento');
  }

  if (
    normalizedText.includes('documento de arrecadacao') &&
    (normalizedText.includes('simples nacional') ||
      normalizedText.includes('das'))
  ) {
    matches.push('Simples Nacional');
  }

  if (
    normalizedText.includes('fgts') &&
    (normalizedText.includes('guia') ||
      normalizedText.includes('fundo de garantia'))
  ) {
    matches.push('FGTS');
  }

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  const priority = matches.find(m => priorityCategories.includes(m));
  return priority || matches[0];
};

/**
 * Identifica empresa (CPF / CNPJ / Nome)
 */
export const identifyCompany = (
  text: string,
  companies: Company[]
): Company | null => {
  const regex =
    /(\d{2}\s*\.\s*\d{3}\s*\.\s*\d{3}\s*\/\s*\d{4}\s*-\s*\d{2})|(\d{14})|(\d{11})|(\d{8})|(\d{9})/g;

  const matches = [...text.matchAll(regex)];
  const found: { type: 'CPF' | 'CNPJ'; val: string }[] = [];

  for (const m of matches) {
    const nums = m[0].replace(/\D/g, '');
    if (nums.length === 14) {
      found.push({ type: 'CNPJ', val: nums.substring(0, 8) });
    } else if (nums.length === 11) {
      found.push({ type: 'CPF', val: nums });
    } else if (nums.length === 8) {
      found.push({ type: 'CNPJ', val: nums });
    } else if (nums.length === 9) {
      found.push({ type: 'CPF', val: nums });
    }
  }

  const unique = found.filter(
    (v, i, a) =>
      a.findIndex(t => t.type === v.type && t.val === v.val) === i
  );

  for (const doc of unique) {
    for (const company of companies) {
      const clean = company.docNumber.replace(/\D/g, '');

      if (
        (company.type === 'CNPJ' || company.type === 'MEI') &&
        doc.type === 'CNPJ' &&
        clean.substring(0, 8) === doc.val
      ) {
        return company;
      }

      if (
        company.type === 'CPF' &&
        doc.type === 'CPF' &&
        clean.includes(doc.val)
      ) {
        return company;
      }
    }
  }

  // Fallback por nome
  const textNorm = removeAccents(text);
  for (const company of companies) {
    const name = removeAccents(company.name);
    if (name.length > 4 && textNorm.includes(name)) {
      return company;
    }
  }

  return null;
};
