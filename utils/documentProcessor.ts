import { Company } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

// Worker do PDF.js (mesma versão)
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
 * Extrai a raiz do CNPJ (8 primeiros dígitos), ignorando pontuação
 */
const getCnpjRoot = (value: string): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits.substring(0, 8);
};

/**
 * Extrai texto do PDF (máx. 2 páginas)
 * Reconstrói layout por coordenadas (XY)
 */
export const extractTextFromPDF = async (file: File): Promise<string> => {
  try {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

    let fullText = '';
    const maxPages = Math.min(pdf.numPages, 2);

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      const items = textContent.items.map((item: any) => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5]
      }));

      // Agrupar por linha (Y)
      const lines: { y: number; texts: typeof items }[] = [];
      const TOLERANCE_Y = 6;

      for (const item of items) {
        const line = lines.find(l => Math.abs(l.y - item.y) < TOLERANCE_Y);
        if (line) {
          line.texts.push(item);
        } else {
          lines.push({ y: item.y, texts: [item] });
        }
      }

      // Ordenar de cima para baixo
      lines.sort((a, b) => b.y - a.y);

      for (const line of lines) {
        line.texts.sort((a, b) => a.x - b.x);
        fullText += line.texts.map(t => t.text).join(' ') + '\n';
      }
    }

    return removeAccents(fullText).replace(/\s+/g, ' ').trim();
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

  const normalized = removeAccents(text);
  const matches: string[] = [];

  // Palavras-chave configuráveis
  for (const [category, keywords] of Object.entries(keywordMap)) {
    for (const kw of keywords || []) {
      const k = removeAccents(kw);
      if (k.length > 2 && normalized.includes(k)) {
        matches.push(category);
        break;
      }
    }
  }

  // Regras fixas
  if (normalized.includes('cora.com.br') || normalized.includes('honorarios')) {
    matches.push('Honorários');
  }

  if (
    normalized.includes('nota fiscal') ||
    normalized.includes('danfe') ||
    normalized.includes('nf-e')
  ) {
    matches.push('Notas Fiscais');
  }

  if (
    (normalized.includes('folha') && normalized.includes('pagamento')) ||
    normalized.includes('extrato mensal')
  ) {
    matches.push('Folha de Pagamento');
  }

  if (
    normalized.includes('documento de arrecadacao') &&
    normalized.includes('simples nacional')
  ) {
    matches.push('Simples Nacional');
  }

  if (
    normalized.includes('fgts') &&
    (normalized.includes('guia') || normalized.includes('fundo de garantia'))
  ) {
    matches.push('FGTS');
  }

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // Prioridade
  const priority = matches.find(m => priorityCategories.includes(m));
  return priority ?? matches[0];
};

/**
 * Identifica empresa pelo CNPJ (com ou sem pontuação)
 */
export const identifyCompany = (
  text: string,
  companies: Company[]
): Company | null => {

  // Captura CNPJ em QUALQUER formato
  const cnpjRegex =
    /\d{2}\s*\.\s*\d{3}\s*\.\s*\d{3}\s*\/\s*\d{4}\s*-\s*\d{2}|\d{14}|\d{8}/g;

  const matches = [...text.matchAll(cnpjRegex)];

  const rootsFromText = matches
    .map(m => getCnpjRoot(m[0]))
    .filter((v): v is string => !!v);

  const uniqueRoots = [...new Set(rootsFromText)];

  // Comparação CORRETA: raiz x raiz
  for (const company of companies) {
    if (company.type !== 'CNPJ' && company.type !== 'MEI') continue;

    const companyRoot = getCnpjRoot(company.docNumber);
    if (!companyRoot) continue;

    if (uniqueRoots.includes(companyRoot)) {
      return company;
    }
  }

  // Fallback por nome
  const textNorm = removeAccents(text);

  for (const company of companies) {
    const nameNorm = removeAccents(company.name);
    if (nameNorm.length > 4 && textNorm.includes(nameNorm)) {
      return company;
    }
  }

  return null;
};
