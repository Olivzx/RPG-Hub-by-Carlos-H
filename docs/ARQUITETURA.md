# Arquitetura — RPG HUB

## Stack

- HTML5
- CSS3
- JavaScript
- Supabase JS `2.117.2`
- Supabase Auth
- PostgreSQL
- Supabase Realtime
- GitHub
- Vercel

## Modelo de mundo

```text
Campanha
  └── Local
       └── Andar
            └── Cômodo
                 └── Entidades
                      └── posição / estado
```

O estado do mundo é persistente.

## Principais entidades

```text
profiles
campaigns
campaign_members
locations
floors
rooms
characters
character_field_definitions
npcs
world_entities
sessions
dice_rolls
audio_assets
audio_playlists
audio_playlist_items
campaign_audio_state
campaign_chronicles
```

## Arquivos

- `index.html` — landing.
- `login.html` — autenticação.
- `mesa.html` — interface principal.
- `styles.css` — layout e identidade visual.
- `app.js` — núcleo da aplicação.
- `supabase.js` — cliente Supabase.
- `rpg-realtime-enhancements.js` — sincronização e recursos realtime.
- `rpg-character-dice-enhancements.js` — melhorias recentes de fichas e dados personalizados.
- `README.md` — documentação principal.
- `docs/` — documentação complementar e previews.

## Realtime

O projeto possui eventos para alterações de:

- personagens;
- entidades;
- cômodos;
- posição;
- tamanho;
- rotação;
- cenário;
- sessões;
- rolagens;
- áudio;
- presença.

A ideia é manter Mestre e jogadores na mesma representação da campanha sem recarregar a página.

## Permissões

O sistema diferencia o proprietário da campanha dos demais membros. A interface protege recursos administrativos como Painel do Mestre, Crônica, gerenciamento de fichas, histórico de rolagens e controle de áudio.

O histórico de `dice_rolls` não é carregado pela interface pública dos jogadores.

> Segurança de frontend não substitui segurança de banco. Operações sensíveis devem ter políticas RLS adequadas no Supabase.

## Dados e privacidade

A aplicação utiliza autenticação do Supabase e persistência no PostgreSQL. O frontend deve usar apenas credenciais apropriadas para cliente; secrets administrativos nunca devem ser publicados.

## Desenvolvimento local

```bash
git clone https://github.com/Olivzx/RPG-Hub-by-Carlos-H.git
cd RPG-Hub-by-Carlos-H
```

Configure o cliente Supabase em `supabase.js` para o ambiente utilizado.

## Deploy

Fluxo esperado:

```text
GitHub → branch de publicação → build → Vercel → aplicação
```

Após o deploy, testar autenticação, mesa, personagens, dados, realtime, áudio, permissões e responsividade.
