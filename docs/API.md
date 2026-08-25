# API

Base local: `http://localhost:3000/api`. Respostas usam JSON. Rotas autenticadas esperam o cookie `saldo_session`.

## Autenticação

| Método | Rota | Uso |
|---|---|---|
| `POST` | `/auth/register` | Cria usuário e espaço pessoal |
| `POST` | `/auth/login` | Inicia sessão |
| `GET` | `/auth/me` | Retorna usuário e espaços |
| `POST` | `/auth/logout` | Encerra sessão |

Exemplo:

```json
{
  "name": "Maria",
  "email": "maria@example.com",
  "password": "SenhaForte2026"
}
```

## Espaços e projeção

| Método | Rota | Uso |
|---|---|---|
| `GET/POST` | `/spaces` | Lista ou cria espaço |
| `PATCH/DELETE` | `/spaces/:id` | Atualiza ou remove espaço |
| `GET` | `/spaces/:id/dashboard` | Projeções, saúde, agenda, dívidas e metas |

Um espaço aceita `name`, `kind` (`personal` ou `business`), `currency`, `locale`, `currentBalanceCents` e `emergencyBufferCents`.

## Lançamentos

| Método | Rota | Uso |
|---|---|---|
| `GET/POST` | `/spaces/:id/entries` | Lista ou cria lançamentos |
| `PATCH/DELETE` | `/entries/:id` | Atualiza ou remove lançamento |
| `POST` | `/entries/parse` | Interpreta uma frase curta em português |

```json
{
  "title": "Projeto freelance",
  "type": "income",
  "amountCents": 180000,
  "category": "income",
  "date": "2026-09-02",
  "recurrence": "none",
  "confidence": 0.8
}
```

`confidence` afeta somente entradas; despesas sempre usam 100% do valor.

## Dívidas e metas

| Método | Rota | Uso |
|---|---|---|
| `GET/POST` | `/spaces/:id/debts` | Lista ou cria dívida |
| `DELETE` | `/debts/:id` | Remove dívida |
| `GET/POST` | `/spaces/:id/goals` | Lista ou cria meta |
| `DELETE` | `/goals/:id` | Remove meta |

## Dados externos

| Método | Rota | Uso |
|---|---|---|
| `GET` | `/sources` | Catálogo de fontes oficiais |
| `GET` | `/context/:country` | Indicadores para ISO alfa-2, como `BR` ou `US` |
| `GET` | `/health` | Saúde do serviço |

## Erros

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Valor deve ser um número inteiro.",
    "requestId": "..."
  }
}
```

Status usuais: `400`, `401`, `403`, `404`, `409`, `413`, `415`, `422`, `429` e `500`.
