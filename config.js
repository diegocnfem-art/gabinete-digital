// =====================================================================
// CONFIGURAÇÃO — preencha com os dados do SEU projeto Supabase
// (Supabase → Project Settings → API). A chave pode ser a "anon" ou a "publishable".
//
// A "anon key" é pública por natureza: ela fica no navegador de qualquer
// forma. Quem protege os dados são as regras do banco (Row Level Security),
// não o segredo desta chave. NUNCA coloque aqui a "service_role key".
// =====================================================================
export const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
export const SUPABASE_ANON_KEY = 'COLE-AQUI-A-ANON-KEY';

// Nome exibido no topo das telas
export const NOME_SISTEMA = 'Gabinete Digital';

// Limite de cartões "Em andamento" no Kanban (método Kanban: limitar o trabalho em curso)
export const LIMITE_EM_ANDAMENTO = 10;
