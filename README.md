# RPG HUB

> Mesa virtual para organizar, narrar e jogar campanhas de RPG em tempo real.

**Mapa · Fichas · Dados · Áudio · Sessões · NPCs · Mundo persistente · Painel do Mestre · Realtime**

## Visão geral

O RPG HUB centraliza em uma aplicação web recursos que normalmente ficam espalhados entre Discord, planilhas, sites de dados, mapas e documentos. O Mestre controla a campanha e os jogadores acompanham o estado compartilhado sem depender de F5.

```text
Campanha → Local → Andar → Cômodo → Entidades → Posição/Estado
```

## Preview

> Previews ilustrativos baseados na interface atual.

![Mesa](docs/preview/mesa.svg)

![Dados](docs/preview/dados.svg)

![Ficha](docs/preview/personagem.svg)

![Painel do Mestre](docs/preview/mestre.svg)

## Como usar

### Mestre

1. Criar conta.
2. Criar campanha.
3. Compartilhar código com os jogadores.
4. Preparar locais, andares e cômodos.
5. Criar/iniciar uma sessão.
6. Criar/revisar fichas.
7. Abrir a Mesa.
8. Usar mapa, dados, áudio, NPCs e Crônica durante a aventura.

### Jogador

1. Criar conta.
2. Entrar com o código da campanha.
3. Criar/acessar a ficha.
4. Entrar na Mesa.
5. Rolar dados e acompanhar o estado da sessão.

## Funcionalidades

- Autenticação e perfis com Supabase Auth.
- Campanhas, convites e membros.
- Mestre e jogadores com recursos diferentes.
- Mapa persistente com locais, andares e cômodos.
- Movimento, resize e rotação de elementos.
- Personagens, fichas, HP, atributos, equipamentos e campos personalizados.
- Exclusão de fichas pelo Mestre.
- Personagem em 0 HP pode sair do mapa sem perder o histórico.
- Sessões e cenas.
- NPCs e monstros.
- Crônica privada do Mestre.
- Dados comuns e personalizados.
- Dados personalizados de d2 a d1000.
- Normal, Vantagem e Desvantagem.
- Modificadores e resultados individuais.
- Histórico de rolagens privado do Mestre.
- Áudio compartilhado, playlists e assets.
- Painel privado do Mestre com dados, áudio e fichas.
- Presença de jogadores online.
- Supabase Realtime para atualizações sem F5.
- Sidebar desktop fixa e navegação mobile.

## Dados personalizados

Exemplos:

```text
1d20
2d20 + 4
3d6 - 1
1d37
2d127
1d999
```

O resultado mostra total, dados individuais, fórmula, modificador e regra.

## Realtime

Eventos de personagens, entidades, cômodos, movimento, resize, rotação, cenário, sessões, rolagens, áudio e presença podem ser sincronizados entre os participantes.

```text
Alteração → Supabase → Realtime → Participantes → Interface sem F5
```

## Painel do Mestre

Área privada com histórico das rolagens, jogador responsável, personagem utilizado, dados individuais, resultado, data/hora, controle de áudio, lista de fichas, HP, defesa e acesso às fichas.

O histórico não fica na área pública de Utilitários.

## Arquitetura

**HTML5 · CSS3 · JavaScript · Supabase JS 2.117.2 · PostgreSQL · Supabase Auth · Supabase Realtime · GitHub · Vercel**

Principais entidades:

```text
profiles · campaigns · campaign_members · locations · floors · rooms
characters · character_field_definitions · npcs · world_entities
sessions · dice_rolls · audio_assets · audio_playlists
campaign_audio_state · campaign_chronicles
```

## Arquivos principais

```text
index.html
login.html
mesa.html
styles.css
app.js
supabase.js
rpg-realtime-enhancements.js
rpg-character-dice-enhancements.js
docs/
```

## Privacidade

O sistema diferencia Mestre e jogador. Painel do Mestre, Crônica e histórico completo de rolagens são recursos administrativos. A aplicação usa verificações de permissão no frontend; operações sensíveis também devem ser protegidas por RLS no Supabase.

## Evolução recente

O projeto recebeu mundo persistente, realtime, rotação de cômodos, sincronização de personagens, HP/remoção visual, exclusão de fichas, áudio compartilhado, Painel do Mestre, histórico privado, dados personalizados, reformulação visual das fichas, sidebar fixa e correção do erro `room.appendChild is not a function` em determinado fluxo de personagem.

## Documentação

- [Guia completo de uso](docs/GUIA-DE-USO.md)
- [Arquitetura e segurança](docs/ARQUITETURA.md)
- [Histórico de evolução](docs/HISTORICO.md)

## Estado

Projeto em desenvolvimento ativo.

```text
main
deploy/rpg-hub-stable
```

## Desenvolvimento

```bash
git clone https://github.com/Olivzx/RPG-Hub-by-Carlos-H.git
cd RPG-Hub-by-Carlos-H
```

Configure o cliente Supabase em `supabase.js` e nunca publique secrets administrativos no frontend.

## Deploy

```text
GitHub → branch de publicação → build → Vercel → aplicação
```

Após publicar, testar autenticação, Mesa, personagens, dados, realtime, áudio, permissões e responsividade.

---

**RPG HUB — Mapa. Fichas. Dados. Áudio. Sessões. Realtime. Tudo na mesma mesa.**
