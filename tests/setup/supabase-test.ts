import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import type { Database } from "@/lib/database.types";

/**
 * Carrega variáveis de `.env.local` (raiz do projeto) para `process.env` caso
 * ainda não estejam definidas. O Next.js faz isso automaticamente para
 * `next dev`/`next build`, mas o Vitest roda fora desse pipeline — sem isso,
 * `TEST_SUPABASE_URL`/`TEST_SUPABASE_ANON_KEY` ficariam vazias ao rodar
 * `npx vitest run` diretamente.
 */
function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

// Deliberadamente um projeto Supabase DEDICADO a testes, isolado do projeto
// de produção (NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY, usados
// pelo app real) — nunca cair de volta silenciosamente nas vars NEXT_PUBLIC_
// aqui, isso reintroduziria o risco de sujar/expor dados de produção.
const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "TEST_SUPABASE_URL/TEST_SUPABASE_ANON_KEY ausentes. " +
      "Configure .env.local com as credenciais de um projeto Supabase DEDICADO a testes " +
      "(nunca o mesmo projeto de produção) antes de rodar os testes de RLS."
  );
}

/**
 * Retry com backoff pra "Request rate limit reached" do GoTrue — o teto de
 * auth do tier Free do Supabase não é totalmente controlável pelo valor
 * configurado em Authentication > Rate Limits (ver deferred-items do Plan
 * 03-04/03-06); mesmo num projeto de teste isolado com o limite subido pra
 * 500/5min, rajadas de signUp/signIn ainda esbarram num teto de plataforma
 * mais baixo. Isso só reduz flakiness da suíte local — nunca usado em
 * produção.
 */
async function retryOnRateLimit<T extends { error: { message: string } | null }>(
  fn: () => Promise<T>,
  attempts = 5,
  baseDelayMs = 1500
): Promise<T> {
  let result = await fn();
  for (let attempt = 1; attempt < attempts && result.error?.message.includes("Request rate limit reached"); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    result = await fn();
  }
  return result;
}

/**
 * Client service_role — bypassa RLS e o rate limit de signup do GoTrue.
 * Usado EXCLUSIVAMENTE dentro deste arquivo para criar a conta de teste
 * (admin.createUser); nunca usado para ler/escrever dados de teste — isso
 * continua só através do client autenticado por signInWithPassword, para
 * que a policy RLS real seja de fato exercitada (Padrão 4 do
 * 01-RESEARCH.md). Nunca importar/reexportar este client fora de
 * tests/setup/ nem usá-lo em código de produção.
 */
function createAdminClient(): TestClient {
  return createSupabaseClient<Database>(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type TestClient = SupabaseClient<Database>;

/**
 * Client Supabase anônimo (sem sessão) — usa apenas a anon key pública, nunca
 * a service_role. Útil para operações que não exigem autenticação.
 */
export function createAnonClient(): TestClient {
  return createSupabaseClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
}

export interface SeededAccount {
  /** Client Supabase autenticado como este usuário (anon key + sessão real). */
  client: TestClient;
  userId: string;
  email: string;
}

/**
 * Cadastra e autentica (`signInWithPassword`) uma conta real de teste. A
 * ESCRITA de dados de teste (`stores`/`store_settings` etc.) deve sempre
 * usar o client autenticado retornado aqui, nunca um client service_role,
 * para que as policies RLS reais sejam de fato exercitadas (Padrão 4 do
 * 01-RESEARCH.md). A CRIAÇÃO da conta em si usa admin.createUser via
 * service_role quando `TEST_SUPABASE_SERVICE_ROLE_KEY` está configurada —
 * isso só evita o rate limit de signup público do GoTrue (ver
 * .planning/phases/03-crud-de-produtos-e-pipeline-de-m-dia/deferred-items.md),
 * não bypassa RLS, já que a sessão usada no resto do teste vem de um
 * signInWithPassword real no client anon. Sem a chave configurada, cai de
 * volta no fluxo antigo (signUp público, ainda contra o projeto de teste
 * isolado), sem mudança de comportamento.
 */
export async function seedAuthenticatedAccount(labelForEmail: string): Promise<SeededAccount> {
  const client = createSupabaseClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
  const uniqueSuffix = `${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const email = `vitrino.rls.${labelForEmail}.${uniqueSuffix}@gmail.com`;
  const password = "TesteIsolamentoRLS123!";

  if (SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminClient();
    const { data: createData, error: createError } = await retryOnRateLimit(() =>
      admin.auth.admin.createUser({ email, password, email_confirm: true })
    );
    if (createError || !createData.user) {
      throw new Error(`Falha ao criar conta de teste via admin (${labelForEmail}): ${createError?.message}`);
    }

    const { data: signInData, error: signInError } = await retryOnRateLimit(() =>
      client.auth.signInWithPassword({ email, password })
    );
    if (signInError || !signInData.session) {
      throw new Error(`Falha ao autenticar conta de teste criada via admin (${labelForEmail}): ${signInError?.message}`);
    }
    return { client, userId: createData.user.id, email };
  }

  const { data: signUpData, error: signUpError } = await retryOnRateLimit(() => client.auth.signUp({ email, password }));
  if (signUpError) {
    throw new Error(`Falha ao cadastrar conta de teste (${labelForEmail}): ${signUpError.message}`);
  }

  let userId = signUpData.user?.id;
  let session = signUpData.session;

  if (!session) {
    // Alguns projetos Supabase exigem confirmação de email antes de emitir
    // sessão já no signUp. Tentamos signInWithPassword em seguida — só
    // funciona se "Confirm email" estiver desabilitado no projeto (D-01 do
    // 01-RESEARCH.md: cadastro dá acesso imediato, sem verificação de email).
    const { data: signInData, error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError || !signInData.session) {
      throw new Error(
        `Não foi possível autenticar a conta de teste (${labelForEmail}) após o cadastro. ` +
          'Isso normalmente indica que "Confirm email" está habilitado no projeto Supabase — ' +
          "desabilite em Authentication > Providers > Email (ou rode `supabase config push` " +
          "após `supabase login`, já que supabase/config.toml já declara enable_confirmations = false) " +
          `para rodar este teste, conforme D-01. Erro original: ${signInError?.message ?? "sessão ausente após signIn"}`
      );
    }
    session = signInData.session;
    userId = signInData.user?.id ?? userId;
  }

  if (!userId) {
    throw new Error(`Cadastro da conta de teste (${labelForEmail}) não retornou um user id.`);
  }

  return { client, userId, email };
}

/**
 * Colunas de deduplicação de `pageviews` (migration 0010) para uso em seed
 * de teste. Desde a 0010 existe um índice único em
 * (visitor_id, product_id, view_date): sem visitante distinto, N inserts
 * seguidos do mesmo produto colapsam em 1 e qualquer teste que dependa de
 * "12 views > 11 views" passa a medir outra coisa.
 *
 * Cada chamada devolve um visitante NOVO, ou seja: seedar N linhas com este
 * helper significa "N pessoas diferentes viram isso hoje" — que é
 * exatamente a semântica que a contagem passou a ter em produção.
 */
export function pageviewDedupColumns(): { visitor_id: string; view_date: string } {
  return {
    visitor_id: crypto.randomUUID(),
    view_date: new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  };
}
