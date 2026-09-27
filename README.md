# RPG HUB

Protótipo inicial da plataforma para organização e condução de campanhas de RPG de mesa.

## Conceito

O RPG HUB não tenta substituir o Discord. O Discord fica responsável por voz e comunicação; o HUB cuida da campanha e da mesa visual.

### Núcleo do produto

- Campanhas
- Sessões
- Personagens
- Mundo persistente
- Andares
- Cômodos nomeados
- Entidades arrastáveis
- Estado persistente por local
- Troca de andares durante a sessão
- Integração visual com Discord

## Arquitetura do mundo

`Campanha → Local → Andar → Cômodo → Entidades → Posição/Estado`

O mundo não reinicia quando o mestre muda de cômodo ou andar. A posição de personagens e NPCs permanece associada ao local onde eles estavam.

## Protótipo atual

Esta primeira versão é estática e roda diretamente no navegador:

- `index.html` — landing page
- `mesa.html` — mesa da sessão
- `styles.css` — identidade visual e layout
- `app.js` — estado, troca de andares, cômodos e tokens

O estado do protótipo é armazenado em `localStorage`.

## Próximo marco técnico

Migrar para:

- Next.js + React + TypeScript
- Supabase / PostgreSQL
- Supabase Auth
- Supabase Realtime
- Storage para assets
- Motor 2D dedicado para a mesa
- Permissões de mestre, co-mestre e jogador
- Motor de dados/regras para Sorte, Azar, vantagem, desvantagem e críticos

## Deploy

A versão estática pode ser publicada diretamente na Vercel como site estático. A próxima etapa do projeto é migrar a interface para Next.js mantendo a mesma experiência visual.
