# RPG Hub — integração com Supabase experimental

**Projeto-alvo:** `yeuqfdbmcncilfrsxppm`  
**URL:** `https://yeuqfdbmcncilfrsxppm.supabase.co`  
**Branch:** `integrate/new-supabase-project`  
**Pull request:** [#3 — integração Supabase](https://github.com/Olivzx/RPG-Hub-by-Carlos-H/pull/3)

Esta configuração foi aplicada exclusivamente ao projeto experimental. Nenhuma migration foi aplicada ao banco de produção e nenhuma mudança foi mesclada na branch `main`.

## Estrutura criada

A migration-base cria as tabelas centrais de perfil, campanha, participantes, convites, locais, andares, salas, fichas, NPCs, entidades do mapa, sessões, rolagens, chat, áudio, regras, inventário, habilidades, histórico, combate e exploração. As migrations incrementais completam o VTT, combate, paredes, visão e camadas de mapa.

O banco ficou com **38 tabelas no schema `public`**, todas com Row Level Security (RLS) habilitado. As políticas separam:
- **Mestre:** administra a própria campanha, participantes, convites, cenário e informações privadas.
- **Jogador:** lê os dados compartilhados da campanha, participa do chat e altera a própria ficha/personagem; não pode alterar fichas de outros jogadores.
- **Usuário externo:** não lê a campanha nem participa dos canais Realtime associados a ela.

### Dados privados do mestre

Informações privadas não devem ficar em colunas/JSON consultáveis pelos participantes. Foram criadas tabelas separadas:
- `location_private_notes`
- `floor_private_notes`
- `room_private_notes`
- `npc_private_notes`
- `character_private_data`

Os códigos de convite ficam em `campaign_invites`, fora da linha pública da campanha. As RPCs `get_campaign_invite`, `regenerate_campaign_invite` e `join_campaign_by_code` controlam a consulta, renovação e utilização desses códigos.

A migration também instala um trigger que cria o registro em `profiles` após o cadastro em Supabase Auth. Quando um campo customizado de ficha muda para não visível aos jogadores, o valor é movido de `characters.attributes/sheet_data` para `character_private_data`; ao voltar a ser visível, o processo é revertido. O JavaScript lê e grava esse formato privado separado.

## Realtime e Storage

Todos os canais encontrados no cliente são criados com `config.private: true`. A política em `realtime.messages` autoriza somente os prefixos de campanha/sessão reconhecidos e somente quando o usuário pertence à campanha. Os tópicos cobertos incluem campanha, presença, combate, ações de combate, mundo, auditoria, dados, VTT, visão, loadout e sessão.

As tabelas públicas necessárias à sincronização foram adicionadas à publicação `supabase_realtime`. A tabela interna `realtime.messages` já é criada pelo Supabase com RLS habilitado; a migration adiciona as políticas de autorização sem tentar alterar a propriedade dessa tabela gerenciada.

O bucket `rpg-media` foi criado para as mídias do RPG. A leitura é pública para exibição das imagens; escrita, atualização e exclusão exigem autenticação e que a primeira pasta do caminho seja o UUID do próprio usuário. Uploads TUS maiores também apontam para o novo projeto Supabase.

## Migrations aplicadas

As 15 migrations abaixo estão registradas no projeto experimental, nesta ordem:

1. `20260928000000_rpg_hub_base_schema.sql`
2. `20260929000100_add_combat_started_by_index.sql`
3. `20260929043000_add_vtt_map_layers_and_tools.sql`
4. `20260929050000_add_vtt_floor_foreign_key_indexes.sql`
5. `20260929050500_fix_campaign_activity_trigger_record_handling.sql`
6. `20260929051500_account_switching_weapons_and_npc_types.sql`
7. `20260929053000_realtime_campaign_broadcast.sql`
8. `20260929053500_restrict_campaign_world_rpc_execute.sql`
9. `20260929054000_make_campaign_world_rpc_invoker.sql`
10. `20260929054500_combat_actions_and_rpc.sql`
11. `20260929055000_optimize_combat_actions.sql`
12. `20260929061000_add_real_token_vision.sql`
13. `20260929062000_index_uncovered_foreign_keys.sql`
14. `20260929062500_fix_campaign_owner_insert_returning.sql`
15. `20260929063000_fix_campaign_join_code_rpc.sql`

Correções incluídas durante a revisão:
- Os triggers de `map_walls` e `vision_sources` foram movidos para depois da criação dessas tabelas.
- O GRANT da RPC `resolve_combat_attack` passou a usar a assinatura real de 16 argumentos e os privilégios necessários de `combat_actions`.
- Índices foram adicionados às chaves estrangeiras que ainda não tinham índice cobrindo a coluna.
- A política SELECT de campanhas passou a reconhecer diretamente o proprietário da linha nova, para permitir `INSERT ... RETURNING`.
- A RPC `join_campaign_by_code` usa `ON CONFLICT DO NOTHING` sem ambiguidade com o parâmetro de saída `campaign_id`.

## Validação realizada

- **38/38** tabelas públicas com RLS habilitado.
- **15/15** migrations registradas no banco experimental.
- A consulta estrutural não encontrou chaves estrangeiras públicas sem índice de cobertura após a migration de índices.
- A trigger de criação de perfil foi exercitada com usuários Auth temporários; os perfis foram criados corretamente.
- **18/18** verificações de RLS passaram em uma transação isolada, que foi revertida ao final. Os cenários cobriram criação da campanha com `RETURNING`, criação de membership e convite, entrada por código, leitura compartilhada, chat, atualização da própria ficha, bloqueio de ficha alheia, privacidade das anotações/fichas do mestre e bloqueio de usuário externo nos tópicos.
- Os usuários sintéticos de teste foram removidos depois. O banco terminou sem contas, perfis, campanhas ou memberships de teste.
- A prévia Vercel da branch compilou com estado `READY`.

### Avisos dos Advisors

- **Security Advisor:** 4 avisos para RPCs `SECURITY DEFINER` acessíveis a `authenticated`: `delete_campaign`, `get_campaign_invite`, `join_campaign_by_code` e `regenerate_campaign_invite`. São RPCs de escopo restrito; as operações verificam a sessão e/ou propriedade da campanha. Devem continuar sob revisão ao evoluir as funções.
- **Performance Advisor:** o aviso restante é `unused_index`. Como o banco está vazio e ainda não recebeu tráfego real, os índices não tiveram oportunidade de ser usados. Eles não foram removidos. O aviso de chaves estrangeiras sem índice deixou de aparecer.

## O que ainda falta para homologação completa

**Login real ainda não foi testado.** O projeto experimental está sem usuários Auth. A trigger de perfil e as políticas foram exercitadas com identidades temporárias no banco, mas isso não é um login feito pelo formulário do site.

**Multiplayer real por WebSocket ainda não foi testado com duas sessões de navegador.** A autorização dos tópicos foi validada no PostgreSQL, e as subscrições encontradas no JavaScript usam canais privados; ainda falta confirmar handshake, presença e propagação de eventos com duas sessões Auth reais.

Para concluir a homologação:
1. Criar uma conta de teste do tipo mestre e outra do tipo jogador pelo cadastro normal do RPG Hub.
2. Entrar com o mestre, criar uma campanha e gerar o convite.
3. Entrar com o jogador em uma segunda janela/perfil de navegador, usar o convite e abrir a mesma campanha.
4. Confirmar presença, chat, mudança de cena, movimento de tokens e sincronização de combate nas duas janelas.
5. Repetir os testes de isolamento com uma terceira conta que não pertença à campanha.

Não utilizar senhas pessoais em logs, scripts ou no repositório. Esta integração deve permanecer em revisão até esses passos de navegador serem concluídos.
