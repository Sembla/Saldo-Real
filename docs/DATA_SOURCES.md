# Fontes de dados

## Princípio

O Saldo Real separa **dados pessoais inseridos pelo usuário** de **contexto econômico externo**. O contexto informa e educa; nunca altera automaticamente o saldo seguro e nunca é apresentado como recomendação.

## Fontes globais

| Fonte | Uso | Integração atual |
|---|---|---|
| [World Bank Indicators API](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation) | Inflação, desemprego e PIB per capita por país | Automática, cache de 12 horas |
| [Global Findex 2025](https://www.worldbank.org/en/publication/globalfindex) | Inclusão financeira, pagamentos, poupança e crédito | Referência de descoberta |
| [OECD/INFE 2023](https://www.oecd.org/en/publications/oecd-infe-2023-international-survey-of-adult-financial-literacy_56003a32-en.html) | Alfabetização e comportamento financeiro comparáveis | Referência de descoberta |
| [IMF Financial Access Survey](https://data.imf.org/en/datasets/IMF.STA%3AFAS) | Acesso e uso de serviços financeiros | Adaptador futuro |

## Fontes brasileiras

| Fonte | Uso | Integração atual |
|---|---|---|
| [Banco Central — SGS](https://dadosabertos.bcb.gov.br/dataset/11-taxa-de-juros---selic) | Selic e séries macroeconômicas | Selic automática, cache de 12 horas |
| [IBGE — SIDRA API](https://servicodados.ibge.gov.br/api/docs/agregados?versao=3) | Renda, trabalho e inflação oficial | Adaptador futuro |
| [CNC — PEIC](https://portaldocomercio.org.br/acoes-institucionais/cnc-endividamento-e-o-maior-da-serie-historica/) | Endividamento e inadimplência das famílias | Referência de descoberta |
| [Serasa — Mapa da Inadimplência](https://www.serasa.com.br/limpa-nome-online/blog/mapa-da-inadimplencia-e-renogociacao-de-dividas-no-brasil/) | Panorama da inadimplência | Referência de descoberta |
| [ANBIMA — Raio X do Investidor](https://www.anbima.com.br/pt_br/especial/raio-x-do-investidor-brasileiro.htm) | Poupança, reserva e investimento | Referência de descoberta |

## Contrato de qualidade

Cada adaptador deve:

1. usar fonte primária ou instituição responsável;
2. expor instituição, URL, data de referência e data de consulta;
3. definir timeout e falhar sem bloquear o núcleo financeiro;
4. guardar cache com validade explícita;
5. testar transformação e ausência de dados;
6. evitar misturar periodicidades ou unidades;
7. manter o aviso de que contexto não é aconselhamento financeiro.

## Privacidade

As APIs de contexto recebem apenas um código de país. Nenhum lançamento, saldo, e-mail ou identificador do usuário é enviado ao World Bank ou ao Banco Central.
