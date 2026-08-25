export const OFFICIAL_SOURCES = [
  {
    id: 'world-bank-indicators',
    scope: 'global',
    institution: 'World Bank',
    title: 'World Development Indicators API',
    url: 'https://api.worldbank.org/v2/',
    purpose: 'Inflação, desemprego, PIB per capita e outros indicadores por país.',
    automated: true,
  },
  {
    id: 'global-findex',
    scope: 'global',
    institution: 'World Bank',
    title: 'Global Findex Database 2025',
    url: 'https://www.worldbank.org/en/publication/globalfindex',
    purpose: 'Inclusão financeira, poupança, crédito e pagamentos digitais.',
    automated: false,
  },
  {
    id: 'oecd-infe',
    scope: 'global',
    institution: 'OECD/INFE',
    title: 'International Survey of Adult Financial Literacy',
    url: 'https://www.oecd.org/en/publications/oecd-infe-2023-international-survey-of-adult-financial-literacy_56003a32-en.html',
    purpose: 'Comparação internacional de conhecimento e comportamento financeiro.',
    automated: false,
  },
  {
    id: 'imf-fas',
    scope: 'global',
    institution: 'IMF',
    title: 'Financial Access Survey',
    url: 'https://data.imf.org/en/datasets/IMF.STA%3AFAS',
    purpose: 'Acesso e uso de serviços financeiros em diversas economias.',
    automated: false,
  },
  {
    id: 'bcb-sgs',
    scope: 'BR',
    institution: 'Banco Central do Brasil',
    title: 'SGS — Sistema Gerenciador de Séries Temporais',
    url: 'https://dadosabertos.bcb.gov.br/dataset/11-taxa-de-juros---selic',
    purpose: 'Taxa Selic e séries macroeconômicas brasileiras.',
    automated: true,
  },
  {
    id: 'ibge-sidra',
    scope: 'BR',
    institution: 'IBGE',
    title: 'SIDRA API',
    url: 'https://servicodados.ibge.gov.br/api/docs/agregados?versao=3',
    purpose: 'Inflação, trabalho, renda e estatísticas oficiais brasileiras.',
    automated: false,
  },
  {
    id: 'cnc-peic',
    scope: 'BR',
    institution: 'CNC',
    title: 'Pesquisa de Endividamento e Inadimplência do Consumidor',
    url: 'https://portaldocomercio.org.br/acoes-institucionais/cnc-endividamento-e-o-maior-da-serie-historica/',
    purpose: 'Endividamento e inadimplência das famílias brasileiras.',
    automated: false,
  },
  {
    id: 'serasa-map',
    scope: 'BR',
    institution: 'Serasa',
    title: 'Mapa da Inadimplência e Negociação de Dívidas',
    url: 'https://www.serasa.com.br/limpa-nome-online/blog/mapa-da-inadimplencia-e-renogociacao-de-dividas-no-brasil/',
    purpose: 'Panorama da inadimplência do consumidor.',
    automated: false,
  },
  {
    id: 'anbima-raiox',
    scope: 'BR',
    institution: 'ANBIMA',
    title: 'Raio X do Investidor Brasileiro',
    url: 'https://www.anbima.com.br/pt_br/especial/raio-x-do-investidor-brasileiro.htm',
    purpose: 'Hábitos de poupança, reserva e investimento.',
    automated: false,
  },
];

const WORLD_BANK_INDICATORS = {
  inflation: { code: 'FP.CPI.TOTL.ZG', label: 'Inflação ao consumidor', unit: '%' },
  unemployment: { code: 'SL.UEM.TOTL.ZS', label: 'Desemprego', unit: '%' },
  gdpPerCapita: { code: 'NY.GDP.PCAP.CD', label: 'PIB per capita', unit: 'USD' },
};

async function fetchJson(url, timeoutMs = 6_000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Fonte respondeu HTTP ${response.status}.`);
  return response.json();
}

export async function fetchWorldBankContext(countryCode) {
  const normalized = String(countryCode).trim().toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(normalized)) throw new TypeError('Código de país inválido.');

  const entries = await Promise.all(Object.entries(WORLD_BANK_INDICATORS).map(async ([key, indicator]) => {
    const url = `https://api.worldbank.org/v2/country/${normalized}/indicator/${indicator.code}?format=json&per_page=8`;
    const payload = await fetchJson(url);
    const record = Array.isArray(payload?.[1])
      ? payload[1].find((item) => item.value !== null)
      : null;
    return [key, record ? {
      code: indicator.code,
      label: indicator.label,
      value: record.value,
      year: record.date,
      unit: indicator.unit,
    } : null];
  }));

  return {
    countryCode: normalized,
    indicators: Object.fromEntries(entries),
    source: OFFICIAL_SOURCES.find((source) => source.id === 'world-bank-indicators'),
    retrievedAt: new Date().toISOString(),
    disclaimer: 'Contexto educativo; não é previsão nem recomendação de investimento.',
  };
}

export async function fetchLatestSelic() {
  const end = new Date();
  const start = new Date(end.valueOf() - 14 * 86_400_000);
  const format = (date) => new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(date);
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados?formato=json&dataInicial=${format(start)}&dataFinal=${format(end)}`;
  const payload = await fetchJson(url);
  const latest = Array.isArray(payload) ? payload.at(-1) : null;
  if (!latest) throw new Error('Série Selic sem observações recentes.');
  return {
    countryCode: 'BR',
    indicator: 'selicDaily',
    value: Number(String(latest.valor).replace(',', '.')),
    unit: '% ao dia',
    referenceDate: latest.data,
    source: OFFICIAL_SOURCES.find((source) => source.id === 'bcb-sgs'),
    retrievedAt: new Date().toISOString(),
    disclaimer: 'Contexto educativo; não é recomendação de investimento.',
  };
}

export async function getCountryContext({ repository, countryCode, outboundEnabled = true }) {
  const normalized = String(countryCode).toUpperCase();
  const cacheKey = `country-context:${normalized}`;
  const cached = repository.getCache(cacheKey);
  if (cached) return cached;
  if (!outboundEnabled) {
    return {
      countryCode: normalized,
      unavailable: true,
      reason: 'Integrações externas desativadas.',
      sources: OFFICIAL_SOURCES.filter((source) => source.scope === 'global' || source.scope === normalized),
    };
  }

  const worldBank = await fetchWorldBankContext(normalized);
  let centralBank = null;
  if (normalized === 'BR') {
    try { centralBank = await fetchLatestSelic(); } catch { centralBank = null; }
  }
  return repository.setCache(cacheKey, 'world-bank-indicators', { ...worldBank, centralBank }, 43_200);
}
