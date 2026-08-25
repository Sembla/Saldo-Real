# Arquitetura

## Visão

O Saldo Real é um monólito modular para o estágio de validação. Interface, API e motor financeiro ficam no mesmo deploy, mas as regras de domínio, persistência, segurança e integrações têm fronteiras explícitas.

```mermaid
flowchart TD
  B["Browser / PWA"] -->|"JSON + cookie"| H["HTTP e validação"]
  H --> D["Domínio financeiro"]
  H --> R["Repositório"]
  H --> I["Integrações"]
  R --> S[("SQLite")]
  I --> C[("Cache")]
  I --> O["APIs oficiais"]
```

## Módulos

| Área | Responsabilidade |
|---|---|
| `public/` | Interface acessível, responsiva, instalável e sem dependências de CDN |
| `src/domain/` | Projeção, recorrência e indicador educativo; funções puras e testáveis |
| `src/db/` | Migrações idempotentes, acesso parametrizado e isolamento por proprietário |
| `src/security/` | Hash de senha, token de sessão e cookies |
| `src/data/` | Fontes oficiais, busca, normalização, timeout e cache |
| `src/app.js` | Rotas HTTP, validação, autorização e composição dos casos de uso |

## Modelo de dados

```mermaid
erDiagram
  USER ||--o{ SESSION : autentica
  USER ||--o{ SPACE : possui
  SPACE ||--o{ ENTRY : organiza
  SPACE ||--o{ DEBT : acompanha
  SPACE ||--o{ GOAL : planeja
```

Todos os valores monetários usam centavos inteiros. Datas financeiras usam `AAAA-MM-DD`; timestamps de auditoria usam ISO 8601 UTC.

## Decisões

### Node.js nativo

O runtime oferece HTTP, criptografia, testes, `fetch` e SQLite. Não depender de pacotes reduz o tempo de instalação e a superfície de supply chain para o MVP. O requisito mínimo é Node.js 24.15.

### SQLite

É suficiente para a primeira fase, facilita demo e backup e preserva transações e integridade referencial. Para escala horizontal, o contrato do repositório permite migrar para PostgreSQL sem alterar as regras do domínio.

### Monólito modular

Separar serviços agora adicionaria latência operacional sem validar a dor. A separação futura deve acontecer apenas quando volume, equipes ou requisitos de disponibilidade justificarem.

### Adaptadores oficiais

“Global” não significa coletar toda a internet. Significa um catálogo versionado de fontes oficiais, com adaptadores específicos, cache e origem exposta ao usuário.

## Evolução esperada

1. PostgreSQL e migrações versionadas quando houver múltiplas instâncias.
2. Fila para sincronizações e notificações.
3. Observabilidade com métricas, traces e logs estruturados.
4. Cofre de segredos e serviço de identidade gerenciado.
5. Open Finance apenas com consentimento granular, criptografia e revisão regulatória.
