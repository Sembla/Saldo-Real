# Segurança e privacidade

## Controles implementados

- Senhas derivadas com `scrypt`, salt aleatório individual e comparação em tempo constante.
- Token de sessão aleatório; somente o hash SHA-256 é persistido.
- Cookie `HttpOnly`, `SameSite=Strict`, `Path=/` e `Secure` configurável.
- Validade de sessão e remoção no logout.
- Autorização por proprietário em espaços, lançamentos, dívidas e metas.
- SQL parametrizado e chaves estrangeiras com exclusão em cascata.
- Validação de tipo, faixa, tamanho, moeda e datas na API.
- Limite de 1 MB por corpo JSON.
- Limite simples de tentativas de login por endereço.
- Verificação de origem em escritas e ausência de CORS aberto.
- CSP restritiva, bloqueio de frames, MIME sniffing e política de referrer.
- Erros internos não são enviados ao cliente; cada resposta recebe um request ID.
- Eventos relevantes podem ser gravados na tabela de auditoria.
- Integrações externas recebem apenas o código do país.

## Configuração de produção

1. Executar atrás de HTTPS e definir `COOKIE_SECURE=true`.
2. Definir `APP_ORIGIN` com a origem HTTPS exata.
3. Guardar o banco em volume criptografado e fazer backups testados.
4. Restringir permissões do arquivo do banco ao usuário do processo.
5. Centralizar logs sem incluir corpos de requisição ou valores financeiros.
6. Usar rate limiting distribuído antes de executar múltiplas réplicas.
7. Executar análise de dependências da imagem base e manter o runtime atualizado.

## Limites do MVP

- Não há recuperação de senha ou confirmação de e-mail.
- O rate limiting é em memória e adequado apenas a uma instância.
- SQLite não oferece criptografia nativa neste projeto.
- Não há autenticação multifator.
- Não existe Open Finance nem armazenamento de credenciais bancárias.

Esses itens precisam ser resolvidos antes de tratar a aplicação como serviço financeiro de produção.

## Relato responsável

Não publique dados pessoais ou provas de conceito destrutivas em issues. Envie uma descrição privada ao mantenedor com impacto, passos de reprodução e sugestão de correção.
