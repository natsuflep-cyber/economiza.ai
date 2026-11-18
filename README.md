# ECONOMIZA AI

Site privado para acompanhar **saldo disponível**, **gastos com almoço e janta** e **lucro (economia positiva)**.

## Entrega

- React + TypeScript + Vite; site responsivo, claro e escuro.
- Banco e login Supabase com RLS, usuário único autorizado e funções transacionais PostgreSQL.
- Vercel integrada ao GitHub.
- Sem cadastro público no site. Dados não ficam somente no navegador.
- Saldo atual editável (alteração **não** altera histórico); registros novos debitam gasto real.
- Almoço R$20, janta R$25, editáveis. Gasto zero gera 100% de lucro.
- Gasto igual ou maior que orçamento gera **lucro zero**; excesso não reduz lucro acumulado.
- Um almoço e uma janta por dia; edição/exclusão ajustam apenas diferença de saldo, atomicamente.
- Histórico mensal preservado, inclusive meses anteriores.

## 1. Supabase (obrigatório)

1. Crie um projeto em https://supabase.com e guarde a senha do banco somente com você.
2. No **SQL Editor**, execute todo o arquivo `supabase/migrations/001_acumula.sql`.
3. Em **Authentication → Users**, **crie manualmente** o seu usuário com e-mail e senha por painel administrativo. Não coloque a senha no código-fonte nem no chat. Confirme o e-mail usando o fluxo adequado do provedor.
4. Copie o **UUID (UID)** da conta criada. No SQL Editor execute a instrução abaixo, substituindo pelo UID real:
   ```sql
   insert into public.allowed_users(user_id) values ('SEU-UUID-AQUI');
   ```
   **Somente este UID terá acesso ao Acumula**. A lista `allowed_users` não é exposta ao cliente.
5. Em **Authentication → Providers → Email**, **desative "Allow new users to sign up" / "Enable signups"** (o texto pode variar na interface). Assegure que não há outras formas de cadastro habilitadas. A senha continua gerenciada por Supabase Auth.
6. Em **Authentication → URL Configuration**, defina **Site URL** com a URL publicada na Vercel e adicione as URLs de redirecionamento permitidas, por exemplo `https://SEU-SITE.vercel.app/**` e `http://localhost:5173/**` (esta apenas para desenvolvimento). Verifique o envio de e-mails de recuperação; produção pode exigir SMTP próprio.
7. Em **Project Settings → API** (ou Connect), copie **Project URL** e a **anon/public/publishable key**. **NUNCA** use `service_role` ou secret key no frontend.
8. As políticas RLS somente permitem SELECT ao usuário autorizado; INSERT/UPDATE/DELETE de refeições e ajustes de saldo ocorrem pelas funções RPC autorizadas. Se ocorrer erro de permissão, confirme UID e os passos acima.

## 2. Executar no computador

Requisitos: Node.js 20+ e npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Preencha `.env.local` com:

```ini
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica
```

Acesse `http://localhost:5173`. Arquivos `.env*` com chaves reais são ignorados pelo Git; `.env.example` pode ir ao repositório.

## 3. Publicar no GitHub e Vercel

1. Crie um repositório GitHub (recomenda-se **privado**) e envie **os arquivos desta pasta**.
2. Em https://vercel.com, use **Add New → Project → Import Git Repository** e selecione o repositório.
3. Framework: **Vite**. Build command: `npm run build`. Output directory: `dist`.
4. Em **Environment Variables**, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os valores públicos corretos.
5. Execute o deploy. Confirme a URL real no Supabase em Authentication → URL Configuration. Depois de alterar variáveis de ambiente, faça redeploy.
6. Confira o login e logout, alteração de saldo, almoço, janta, gasto zero, excesso, histórico e dados após atualizar/reabrir.

**Nota:** nenhum banco ou ambiente Vercel é provisionado automaticamente pelo código. **Sem Supabase configurado**, a interface exibe instruções de configuração em vez de simular login ou persistência.

## 4. Validação

```bash
npm run test
npm run build
```

Testes automatizados do projeto verificam cálculos, totais e validação de moeda. Não foi possível executar `npm install` e o build completo neste ambiente por indisponibilidade de acesso ao registro de dependências; apenas a sintaxe TypeScript e os cálculos fundamentais foram checados localmente. Os testes de autenticação, restauração de sessão, controle de acesso RLS, atomicidade real e persistência entre dispositivos **exigem configurar e testar um projeto Supabase real**.

### Verificações importantes após configurar

1. Defina saldo R$ 1.000. Registre janta R$ 25 (orçamento R$ 25). Confirme saldo R$ 975 e lucro R$ 0.
2. Registre almoço R$ 16 (orçamento R$ 20). Confirme saldo R$ 959 e lucro R$ 4.
3. Edite almoço R$ 16 → R$ 23. Confirme saldo R$ 952 e lucro do almoço R$ 0, sem lucro negativo.
4. Registre refeição com gasto zero: saldo não muda e lucro é igual ao orçamento.
5. Edite manualmente saldo para R$ 500. Confira que histórico e totais anteriores **não mudam**.
6. Edite ou exclua um registro anterior; saldo será ajustado somente pelo gasto alterado/restituído, mesmo após redefinição manual.
7. Tente registrar um segundo almoço na mesma data: o banco deve impedir duplicação.
8. Faça logout e login, feche e reabra o navegador. Verifique que valores e histórico permanecem (sessão pode exigir novo login se expirada/revogada).
9. Confira mês anterior e seguinte. Só indicadores mensais mudam; saldo continua.
10. Teste conta sem autorização na tabela `allowed_users`: deve receber erro de acesso.

## Regras de precisão e segurança

Os valores de dinheiro são armazenados como **centavos inteiros**. As RPCs bloqueiam a linha de saldo antes de editar refeições; alterações de saldo e de refeição são atômicas. A diferença no gasto é aplicada uma única vez em edição. Exclusão restitui o valor gasto. Uma alteração manual do saldo substitui o saldo atual, **não recalcula as despesas passadas**.

Se o gasto deixar saldo negativo, o site exige confirmação explícita. Saldo manual deve ser não negativo. A função que seleciona contas autorizadas é executada no banco e não depende de esconder botões.

O tema claro/escuro fica salvo no Supabase e em preferência local. O site evita animações de zoom, mas não bloqueia ampliação manual por acessibilidade.

## Limites de uso

Esta implementação não inclui receitas, outras categorias, metas, gráficos financeiros, nem pagamentos. A exportação de backup ainda não está implementada; mantenha o controle de backups do Supabase conforme o plano escolhido.
