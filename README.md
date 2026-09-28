# RPG HUB

Plataforma web para organização e condução de campanhas de RPG de mesa, com mapa de cenário, fichas, sessões, rolagens, áudio compartilhado, NPCs, mundo persistente e ferramentas privadas para o mestre.

> **Estado atual:** aplicação web funcional baseada em HTML, CSS e JavaScript, com Supabase para autenticação, persistência e recursos em tempo real.

## Visão geral

O RPG HUB concentra a gestão visual e operacional da campanha em um único lugar. O mestre controla a mesa, cenário, personagens, sessões, áudio e informações privadas; os jogadores acompanham o estado da campanha em tempo real.

A arquitetura central do mundo segue:

`Campanha → Local → Andar → Cômodo → Entidades → Posição/Estado`

O estado do mundo é persistente: trocar de cômodo ou andar não recria o cenário nem perde as posições salvas.

---

## Funcionalidades

### Autenticação e contas

- Login integrado ao Supabase Auth.
- Perfil do usuário com nome e avatar.
- Tipos de conta de mestre e jogador.
- Controle de acesso baseado no proprietário da campanha.
- Menu de perfil com edição de perfil e saída da conta.
- Redirecionamento para login quando a sessão expira ou é encerrada.

### Campanhas

- Criação e seleção de campanhas.
- Descrição, sistema e informações básicas da campanha.
- Troca de campanha pela barra lateral.
- Convite para jogadores por código.
- Entrada em campanhas através de código.
- Identificação do papel do usuário dentro da campanha.
- Exclusão de campanha pelo mestre.
- Integração opcional com informações do Discord.

### Mesa da campanha

- Visão principal da mesa em formato de mapa.
- Indicador de sessão ativa.
- Quantidade de usuários online.
- Mapa organizado por local e andar.
- Troca de andares diretamente no mapa.
- Zoom do cenário.
- Ferramenta para movimentação de entidades.
- Ferramenta de estrutura para edição do cenário.
- Painel lateral de controle do andar atual.
- Lista de cômodos e entidades presentes no andar.
- Seleção de cômodos e entidades para inspeção/edição.
- Rolagem rápida diretamente na mesa.

### Mundo persistente e mapa de cenário

- Locais/cenários persistentes.
- Andares personalizados.
- Cômodos nomeados.
- Criação de novos cômodos.
- Posicionamento dos cômodos no mapa.
- Redimensionamento dos cômodos.
- Rotação dos cômodos em tempo real.
- Entidades arrastáveis no cenário.
- Persistência de posição e estado.
- Atualização dos jogadores sem necessidade de F5.
- Alterações do mestre propagadas em tempo real para a campanha.
- Troca de andar sincronizada durante a sessão.

### Personagens e fichas

- Criação e gerenciamento de personagens.
- Fichas vinculadas aos jogadores.
- Campos personalizados de ficha definidos pelo mestre.
- Consulta das fichas pela área de personagens.
- Visualização rápida das fichas no Painel do Mestre.
- Acompanhamento de HP e defesa/CA.
- Atualização das alterações de personagem em tempo real.
- Possibilidade de o mestre excluir fichas/personagens.
- Personagens que chegam a 0 HP podem ser retirados do mapa sem apagar seus dados históricos, preservando o registro do acontecimento.

### Sessões

- Criação de sessões.
- Numeração e organização das sessões.
- Status da sessão.
- Histórico das sessões da campanha.
- Sessão ativa compartilhada entre os participantes.
- Andar e cômodo ativos associados à sessão.
- Mudanças de cena sincronizadas em tempo real.

### Sistema de dados

- Rolagem de dados diretamente pelo navegador.
- d4, d6, d8, d10, d12, d20 e d100.
- Quantidade variável de dados.
- Modificador positivo ou negativo.
- Rolagem normal.
- Vantagem.
- Desvantagem.
- Presets de rolagem rápida.
- Exibição dos resultados individuais.
- Resultado final calculado.
- Registro das rolagens no banco de dados.
- Identificação do jogador responsável pela rolagem.
- Identificação do personagem usado na rolagem.
- Histórico das rolagens atualizado em tempo real para o mestre.

#### Privacidade das rolagens

O histórico completo das rolagens não fica exposto aos jogadores. O carregamento de `dice_rolls` é restrito à área de controle do mestre da campanha, e o painel de histórico foi removido da seção pública de Utilitários.

### Painel do Mestre

Área privada criada especificamente para o mestre da mesa.

O painel reúne:

- Histórico completo das rolagens dos jogadores.
- Nome de quem realizou cada rolagem.
- Personagem utilizado.
- Dados obtidos.
- Fórmula da rolagem.
- Resultado final.
- Data/hora da rolagem.
- Atualização das rolagens em tempo real.
- Controle do áudio da mesa.
- Acesso rápido às fichas dos personagens.
- HP e defesa dos personagens.
- Abertura direta de fichas individuais.
- Indicador da sessão conectada.

O acesso ao painel é condicionado ao mestre proprietário da campanha.

### Sistema de áudio da sessão

- Sistema de som integrado à mesa.
- Áudio compartilhado entre os participantes da campanha.
- Música, ambientes e efeitos sonoros.
- Estado de áudio sincronizado em tempo real.
- Controle do áudio pelo mestre.
- Camadas/estados de áudio persistidos na campanha.
- Ativação dos sons para jogadores.
- Entrada na sala preparada para acompanhar o áudio atual da campanha.
- Sistema de playlists e itens de playlist.
- Assets de áudio vinculados à campanha.

### NPCs e monstros

- Cadastro de NPCs e monstros.
- Organização do bestiário da campanha.
- Informações privadas destinadas ao mestre.
- Listagem visual em cards.
- Criação e edição através da mesa.

### Crônica da mesa

- Área privada do mestre.
- Documento vivo da campanha.
- Registro de acontecimentos, personagens, descobertas, conflitos e consequências.
- Salvamento persistente no Supabase.
- Atalho de teclado para salvar.
- Conteúdo não disponibilizado aos jogadores.

### Realtime

O projeto utiliza Supabase Realtime para sincronizar a campanha sem exigir atualização manual da página.

Eventos tratados incluem:

- Movimentação de entidades.
- Movimentação de cômodos.
- Redimensionamento de cômodos.
- Rotação de cômodos.
- Mudança de cenário/cena.
- Estado do áudio.
- Criação de rolagens.
- Alterações de personagens.
- Alterações de sessão.
- Presença/usuários online.

Fluxo esperado:

`Mestre altera → Supabase Realtime → jogadores recebem a atualização → interface atualiza sem F5`

---

## Interface e responsividade

- Layout desktop com barra lateral de navegação.
- Barra lateral fixa para manter perfil e saída acessíveis mesmo quando o conteúdo cresce.
- Navegação mobile própria.
- Interface adaptada para telas menores.
- Painel contextual da mesa.
- Cards, estados vazios, indicadores de conexão e notificações.
- Identidade visual escura voltada para uso prolongado durante sessões.

---

## Arquitetura atual

### Frontend

- HTML5
- CSS3
- JavaScript
- Interface responsiva
- Supabase JS `2.117.2`

### Backend / dados

- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Realtime
- Persistência de campanhas, sessões, personagens, mundo, rolagens e áudio

### Estrutura principal de dados

O aplicativo trabalha, entre outras, com entidades/tabelas para:

- `profiles`
- `campaigns`
- `campaign_members`
- `locations`
- `floors`
- `rooms`
- `characters`
- `character_field_definitions`
- `npcs`
- `world_entities`
- `sessions`
- `dice_rolls`
- `audio_assets`
- `audio_playlists`
- `audio_playlist_items`
- `campaign_audio_state`
- `campaign_chronicles`

---

## Arquivos principais

- `index.html` — página inicial/landing.
- `login.html` — autenticação.
- `mesa.html` — interface principal da mesa e todas as áreas da campanha.
- `styles.css` — identidade visual, layout, responsividade e componentes.
- `app.js` — estado da aplicação, autenticação, CRUD, mapa, personagens, sessões, rolagens, áudio, realtime e renderização.
- `supabase.js` — configuração/conexão do cliente Supabase.
- `README.md` — documentação do projeto.

---

## Principais mudanças e evoluções

O projeto começou como um protótipo visual de mesa com mundo persistente e evoluiu para uma aplicação conectada ao Supabase.

### Evoluções do mapa

- Mundo persistente.
- Locais e andares.
- Cômodos editáveis.
- Entidades posicionáveis.
- Movimento em tempo real.
- Resize e rotação de cômodos.
- Sincronização de alterações entre mestre e jogadores.

### Evoluções de personagens

- Fichas vinculadas a jogadores.
- Atualização em tempo real.
- Inserção rápida na mesa.
- Controle de HP.
- Remoção visual do mapa ao chegar a 0 HP sem apagar o histórico.
- Exclusão de fichas pelo mestre.

### Evoluções de áudio

- Sistema de áudio compartilhado por campanha.
- Controle do mestre.
- Estado sincronizado.
- Playlists e assets.
- Ativação de áudio para jogadores ao entrarem na sala.
- Integração do controle de áudio no Painel do Mestre.

### Evoluções do sistema de dados

- Rolagens para jogadores.
- Histórico persistente.
- Identificação do jogador que rolou.
- Histórico privado do mestre.
- Atualização em tempo real.
- Separação do histórico em relação aos Utilitários.
- Posterior centralização do histórico no Painel do Mestre.

### Evoluções da área do mestre

- Criação de área privada específica para o mestre.
- Histórico de dados.
- Controle de áudio.
- Consulta rápida de fichas.
- Crônica privada.
- Proteção de navegação para áreas exclusivas.

### Evoluções da navegação

- Barra lateral com funções da campanha.
- Navegação mobile.
- Barra lateral fixa no desktop.
- Perfil e logout mantidos acessíveis durante páginas longas.
- Separação entre recursos públicos e recursos exclusivos do mestre.

---

## Realtime e colaboração

O objetivo do RPG HUB é permitir que mestre e jogadores permaneçam na mesma representação da campanha durante a sessão.

Exemplos:

- O mestre adiciona um personagem à mesa → os jogadores recebem a alteração.
- O mestre move um personagem → a posição é sincronizada.
- O mestre adiciona/move/rotaciona um cômodo → os jogadores recebem a atualização.
- Um jogador cria ou atualiza sua ficha → o mestre recebe a alteração.
- Um jogador rola dados → o mestre recebe a rolagem e seu resultado.
- O mestre altera o cenário ativo → os jogadores acompanham a mudança.
- O mestre controla o áudio → a campanha recebe o estado atualizado.

---

## Segurança e permissões

A aplicação diferencia mestre e jogador na camada de interface e no carregamento dos dados.

Regras atuais incluem:

- Apenas o proprietário da campanha é considerado mestre para as ações administrativas da campanha.
- Jogadores não recebem o histórico completo de `dice_rolls` pelo carregamento normal da aplicação.
- Painel do Mestre e Crônica são áreas privadas.
- Ações administrativas passam por verificações de permissão antes da execução.
- A sessão de autenticação é mantida pelo Supabase Auth.

> **Nota técnica:** as regras de autorização do frontend devem ser complementadas por políticas RLS do Supabase para garantir segurança no nível do banco.

---

## Estado do projeto

O RPG HUB encontra-se em desenvolvimento ativo. A aplicação atual já possui a base funcional de campanha colaborativa, persistência, mapa, personagens, sessões, rolagens, áudio e ferramentas privadas do mestre.

O código atual está centralizado na branch `main`. A branch `deploy/rpg-hub-stable` também está sincronizada com o mesmo estado do projeto.

---

## Próximas evoluções possíveis

- Auditoria completa das políticas RLS.
- Separação do JavaScript em módulos para facilitar manutenção.
- Testes automatizados.
- Tratamento mais completo de erros de conexão/realtime.
- Melhorias de acessibilidade.
- Sistema de permissões mais granular, incluindo co-mestre.
- Motor de regras de RPG configurável por sistema.
- Upload e gerenciamento avançado de assets.
- Recursos adicionais de combate e iniciativa.
- Ferramentas avançadas de mapa e iluminação.

---

## Deploy

O projeto pode ser publicado como aplicação web e integrado ao GitHub/Vercel. O código de produção deve sempre ser conferido após o build/deploy para garantir que o deployment corresponde ao commit atual.

---

## Repositório

**RPG HUB — Olivzx/RPG-Hub-by-Carlos-H**

Projeto desenvolvido para centralizar a experiência visual e operacional de campanhas de RPG de mesa.
