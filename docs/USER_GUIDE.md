# Manual completo do usuário

Este guia acompanha o manual visual de dez páginas disponível no aplicativo. Ele foi organizado em três trilhas para atender usuários iniciantes e experientes sem sobrecarregar a primeira leitura.

- **Essencial:** primeiro acesso, configuração e leitura inicial.
- **Entenda melhor:** regras dos cálculos, exemplo completo e simulações.
- **Técnico:** segurança dos dados, limitações e diagnóstico.

O Saldo Real é um aplicativo educativo. Ele não movimenta dinheiro, não consulta contas bancárias, não concede crédito e não recomenda investimentos.

## 1. Primeira projeção

1. Na tela inicial, selecione **Experimentar sem conta** ou crie uma conta.
2. No Painel, use **Ajustar saldo**.
3. Informe o dinheiro disponível e a reserva mínima que não deve ser gasta.
4. Cadastre as próximas entradas e despesas com datas reais.
5. Revise o saldo seguro, a agenda e o gráfico de 30 dias.

### Exemplo guiado

| Informação | Valor | Cadastro |
|---|---:|---|
| Saldo atual | R$ 3.000 | Disponível hoje |
| Reserva mínima | R$ 500 | Valor protegido |
| Aluguel | - R$ 1.200 | Dia 28, mensal |
| Salário | + R$ 2.500 | Dia 1, confiança 100% |

Antes de confiar no resultado, compare a agenda do aplicativo com as contas e os valores reais.

## 2. Movimentos financeiros

Um movimento possui quatro informações essenciais:

| Campo | Opções | Efeito |
|---|---|---|
| Tipo | Entrada ou saída | Soma ou reduz o saldo |
| Data | Dia em que ocorre | Define quando o saldo muda |
| Recorrência | Não repetir, semanal, mensal ou anual | Cria ocorrências futuras |
| Confiança | 50%, 80% ou 100% | Ajusta somente entradas |

### Confiança das entradas

- Uma entrada de R$ 1.000 com **100%** contribui com R$ 1.000.
- Uma entrada de R$ 1.000 com **80%** contribui com R$ 800.
- Uma entrada de R$ 1.000 com **50%** contribui com R$ 500.
- Despesas sempre entram com **100% do valor**.

O campo rápido aceita frases como:

```text
aluguel R$ 1.200 dia 28 todo mês
receber freela R$ 1.000 dia 15
```

Depois de usar **Interpretar e adicionar**, abra **Lançamentos** e confirme o resultado. Frases ambíguas podem exigir correção manual.

## 3. Indicadores do Painel

### Saldo seguro

É o valor que pode permanecer livre depois de considerar o pior ponto dos próximos 30 dias e proteger a reserva mínima.

```text
saldo seguro = pior saldo projetado - reserva mínima
```

Se o resultado for negativo, o aplicativo mostra R$ 0,00.

### Saldo atual

É o valor informado como disponível agora. Ele não considera sozinho as contas futuras.

### Em 30 dias

É o saldo encontrado no último dia da projeção. Um saldo final positivo não elimina a possibilidade de aperto antes dessa data.

### Saúde do fluxo

É um indicador educativo com metodologia 1.0.0. A nota considera:

| Fator | Impacto possível |
|---|---:|
| Saldo negativo no período | até -35 pontos |
| Reserva tocada | até -18 pontos |
| Parcelas mínimas em relação à renda | até -30 pontos |
| Reserva inferior a um mês de renda | até -18 pontos |
| Pouco histórico no aplicativo | até -8 pontos |

As faixas atuais são:

- 80 a 100: fluxo consistente.
- 60 a 79: pede atenção.
- 0 a 59: fluxo frágil.

Essa nota não é uma análise de crédito.

## 4. Exemplo completo do cálculo

No exemplo inicial:

1. Maria começa com R$ 3.000.
2. O aluguel reduz o saldo para R$ 1.800.
3. O salário aumenta o saldo para R$ 4.300.
4. O pior saldo é R$ 1.800.
5. A reserva é R$ 500.
6. O saldo seguro é R$ 1.800 - R$ 500 = **R$ 1.300**.

O aplicativo procura o menor saldo do período porque uma pessoa pode terminar o mês com dinheiro e ainda enfrentar falta de caixa antes da próxima entrada.

## 5. Decisão Segura

Abra **Decidir** e informe descrição, valor, data desejada e quantidade de parcelas. O aplicativo compara:

1. Pagar agora.
2. Esperar a data desejada.
3. Parcelar mensalmente.
4. Construir uma meta quando nenhum cenário preserva a reserva.

Cada cenário informa:

- Se a reserva foi preservada.
- O pior saldo encontrado.
- A primeira data de risco.
- O valor que ainda precisa ser construído.
- Uma contribuição mensal aproximada para o plano.

Parcelar só é considerado seguro quando todas as parcelas cabem na projeção. O aplicativo não adiciona juros ou taxas que não estejam incluídos no valor informado.

## 6. Planos e rotina

Depois de uma simulação, use **Transformar em plano**. Em **Planos**, acompanhe valor-alvo, prazo e progresso acumulado.

Rotina recomendada:

- Corrija uma informação sempre que valor ou data mudar.
- Uma vez por semana, compare a agenda com as contas reais.
- Antes de uma compra importante, faça uma nova simulação.
- Uma vez por mês, atualize planos, reserva e backup.

Erros que mais distorcem a projeção:

- Saldo inicial desatualizado.
- Conta cadastrada duas vezes.
- Renda incerta marcada como 100%.
- Recorrência ou data incorreta.

## 7. Sem conta ou com conta

| Aspecto | Sem conta | Com conta |
|---|---|---|
| Armazenamento | Neste navegador | Banco de dados do Saldo Real |
| E-mail | Não solicitado | Necessário para entrar |
| Outro dispositivo | Não continua automaticamente | Acesso com login |
| Cópia dos dados | Backup local em JSON | Exportação da conta em JSON |
| Principal risco | Limpar o navegador sem backup | Perder acesso à conta |
| Migração | Pode criar conta e levar os dados | Importação para conta nova e vazia |

### Preservação dos dados

- Sem conta: **Conta > Baixar backup local**.
- Para migrar: **Criar conta e levar meus dados**.
- Com conta: **Conta > Baixar meus dados**.

Nunca compartilhe backups, senhas ou dados financeiros em grupos, comentários ou redes sociais.

## 8. Diagnóstico

| Problema | Verificação |
|---|---|
| O saldo parece errado | Revise saldo atual, duplicatas e datas |
| Uma conta não aparece | Confira data, recorrência e horizonte |
| A renda entrou menor | Confira a confiança da entrada |
| O gráfico tocou a reserva | Localize o primeiro dia de risco na agenda |
| Perdi dados sem conta | Restaure o backup local |

Sem um arquivo de backup, dados apagados do navegador não podem ser recuperados.

## 9. Limitações

O Saldo Real:

- Não consulta o saldo bancário.
- Não garante que uma renda acontecerá.
- Não inclui juros ou taxas não informados.
- Não substitui orientação financeira profissional.
- Não recomenda crédito ou investimentos.
- Depende da precisão dos dados inseridos.

## 10. Glossário

- **Saldo seguro:** valor livre depois do pior ponto e da reserva.
- **Pior saldo:** menor saldo encontrado no período projetado.
- **Reserva mínima:** valor que deve permanecer protegido.
- **Confiança:** percentual aplicado somente a uma entrada.
- **Horizonte:** quantidade de dias observados pelo cálculo.

O [manual visual em PDF](../public/manual-saldo-real.pdf) contém a mesma jornada em formato diagramado para leitura e download.
