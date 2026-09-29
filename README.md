# RPG HUB

> **Uma mesa virtual completa para organizar, preparar, narrar e jogar campanhas de RPG em tempo real.**

**Mapa · Visão Geral · Fichas · Dados · Áudio · Sessões · NPCs · Mundo persistente · Painel do Mestre · Temas personalizados · Realtime**

---

## Sobre o projeto

O **RPG HUB** foi criado por **Carlos Henrique** para centralizar em uma única aplicação as ferramentas que normalmente ficam espalhadas entre Discord, planilhas, sites de rolagem, mapas e documentos.

A proposta é simples: o Mestre prepara a campanha e controla a mesa, enquanto os jogadores acompanham as mudanças em tempo real, sem precisar atualizar a página manualmente.

```text
Campanha → Visão Geral → Mesa → Mundo → Personagens → Sessões → Aventura
```

> **Autor:** Carlos Henrique  
> **Projeto:** RPG HUB  
> **Status:** Em desenvolvimento ativo

---

## Preview

> Os previews abaixo são ilustrativos e representam a experiência visual atual do projeto.

![Visão da Mesa](docs/preview/mesa.svg)

![Sistema de Dados](docs/preview/dados.svg)

![Ficha de Personagem](docs/preview/personagem.svg)

![Painel do Mestre](docs/preview/mestre.svg)

---

## Experiência do RPG HUB

O projeto foi estruturado para separar **informação**, **preparação** e **jogo**.

### Visão Geral

A página que aparece antes da Mesa funciona como o dashboard da campanha.

Nela o usuário pode encontrar rapidamente:

- Resumo da campanha.
- Acesso à Mesa.
- Acesso aos personagens.
- Sistema de dados.
- Áudio da sessão.
- Atualizações da campanha.
- Presença dos jogadores.
- Indicadores e atalhos rápidos.

A ideia é manter a **Mesa limpa**, deixando informações administrativas e atalhos na Visão Geral.

### Mesa

A Mesa é dedicada à experiência de jogo:

- Mapa do cenário.
- Locais.
- Andares.
- Cômodos.
- Personagens.
- Entidades.
- NPCs/monstros.
- Movimento.
- Estado dos elementos.
- Recursos da campanha em tempo real.

---

# Como usar

## Para o Mestre

1. Crie sua conta.
2. Crie uma campanha.
3. Compartilhe o código da campanha com os jogadores.
4. Configure locais, andares e cômodos.
5. Prepare o mapa e os elementos do cenário.
6. Crie ou revise personagens, NPCs e monstros.
7. Inicie uma sessão.
8. Abra a Visão Geral para acompanhar a campanha.
9. Entre na Mesa para conduzir a aventura.
10. Use o Painel do Mestre para acompanhar rolagens, fichas e áudio.

## Para o jogador

1. Crie sua conta.
2. Entre em uma campanha usando o código fornecido pelo Mestre.
3. Crie ou acesse seu personagem.
4. Entre na Mesa.
5. Acompanhe o mapa e as alterações da campanha.
6. Role dados quando necessário.
7. Acompanhe o áudio da sessão.
8. Personalize a aparência da interface de acordo com sua preferência.

---

# Funcionalidades

## Autenticação e contas

- Login com Supabase Auth.
- Criação de conta.
- Recuperação de senha.
- Perfil do usuário.
- Nome de exibição.
- Tipo de conta.
- Redirecionamento automático para a Mesa quando autenticado.

## Campanhas

- Criação de campanhas.
- Entrada por código.
- Membros da campanha.
- Identificação de Mestre e jogadores.
- Controle de recursos conforme o papel do usuário.

## Visão Geral

Dashboard independente da Mesa para evitar poluição visual.

Inclui:

- Hero da campanha.
- Atalhos rápidos.
- Cards de recursos.
- Atualizações.
- Presença dos jogadores.
- Acesso rápido à Mesa.
- Acesso aos personagens.
- Dados.
- Áudio.

---

# Sistema de temas

A interface possui **personalização visual individual**.

Cada usuário pode escolher seu próprio tema sem alterar a aparência dos demais participantes da campanha.

### Temas disponíveis

- Violeta
- Azul
- Ciano
- Esmeralda
- Dourado
- Laranja
- Rosa
- Rubi

A cor escolhida funciona como **accent color**, mantendo a base escura/premium do RPG HUB.

A personalização pode influenciar:

- Sidebar.
- Navegação.
- Botões.
- Cards.
- Estados ativos.
- Inputs em foco.
- Elementos interativos.
- Destaques.
- Dashboard.
- Mesa.
- Personagens.
- Utilitários.
- Painel do Mestre.
- Autenticação e outras áreas da aplicação.

A preferência é salva no navegador do usuário.

```text
Jogador A → Azul
Jogador B → Rubi
Jogador C → Esmeralda
Mestre    → Violeta
```

Todos podem permanecer na mesma campanha simultaneamente.

---

# Mapa e mundo persistente

A estrutura do mundo segue uma hierarquia:

```text
Campanha
 └── Local
      └── Andar
           └── Cômodo
                └── Entidades
```

O sistema suporta:

- Locais.
- Andares.
- Cômodos.
- Entidades.
- Posicionamento.
- Movimento.
- Redimensionamento.
- Rotação dos cômodos.
- Alterações do cenário.
- Persistência das informações.
- Atualização em tempo real.

Quando o Mestre altera o cenário, os jogadores podem receber a atualização sem precisar apertar `F5`.

---

# Personagens e fichas

As fichas foram estruturadas para funcionar como um recurso real da campanha.

Incluem:

- Nome.
- Jogador.
- HP atual.
- HP máximo.
- Defesa.
- Atributos.
- Equipamentos.
- Informações adicionais.
- Campos personalizados.
- Estado do personagem.

### Fichas personalizáveis

O Mestre pode definir campos adicionais para adaptar as fichas ao sistema de RPG utilizado.

### HP e mapa

Quando um personagem chega a **0 HP**, ele pode ser retirado visualmente do mapa sem perder suas informações históricas.

Isso permite preservar o registro do que aconteceu durante a campanha.

### Administração

O Mestre pode:

- Criar fichas.
- Editar fichas.
- Excluir fichas.
- Acompanhar HP.
- Ver defesa.
- Consultar informações dos personagens.

---

# Sistema de dados

O RPG HUB possui rolagem integrada à Mesa.

Exemplos:

```text
1d20
2d20 + 4
3d6 - 1
1d37
2d127
1d999
```

## Dados disponíveis

A biblioteca suporta diversos tipos de dados, incluindo dados tradicionais e valores personalizados.

Exemplos:

```text
d2 · d4 · d6 · d8 · d10 · d12 · d20 · d30 · d50 · d100
```

E também dados não tradicionais, como:

```text
d37 · d127 · d999 · d1000
```

## Dados personalizados

O jogador pode criar dados personalizados definindo:

- Nome.
- Número de faces.
- Atalho para reutilização.

Os dados personalizados continuam usando o mesmo mecanismo de rolagem do sistema.

## Modos

- Normal.
- Vantagem.
- Desvantagem.
- Modificadores positivos.
- Modificadores negativos.
- Quantidade múltipla de dados.

O resultado pode apresentar:

- Fórmula.
- Dados individuais.
- Modificador.
- Total.
- Regra aplicada.

---

# Histórico de rolagens

O histórico completo das rolagens é um recurso **privado do Mestre**.

O Mestre pode visualizar:

- Quem rolou.
- Personagem utilizado.
- Dados utilizados.
- Resultados individuais.
- Resultado final.
- Modificadores.
- Data e horário.

O histórico não fica exposto na área pública de Utilitários para os jogadores.

---

# Painel do Mestre

O Mestre possui uma área própria para administração da mesa.

### Recursos

- Histórico de dados.
- Identificação do jogador que rolou.
- Consulta de personagens.
- HP.
- Defesa.
- Acesso às fichas.
- Controle de áudio.
- Recursos administrativos da campanha.

O objetivo é concentrar ferramentas que não precisam ocupar espaço na Mesa principal.

---

# Sistema de áudio

O RPG HUB possui áudio compartilhado para a sessão.

Recursos previstos na arquitetura atual:

- Controle de áudio da campanha.
- Playlists.
- Assets de áudio.
- Estado compartilhado da sessão.
- Sincronização em tempo real.

A intenção é permitir que os participantes escutem o mesmo ambiente sonoro enquanto a campanha acontece.

---

# Sessões

As campanhas podem ser divididas em sessões e cenas.

Isso permite organizar a evolução da aventura e manter o contexto da campanha estruturado.

---

# NPCs e monstros

Área dedicada à organização de personagens não jogáveis e criaturas.

Pode ser utilizada pelo Mestre para preparar encontros, inimigos e personagens relevantes para a aventura.

---

# Crônica da mesa

A campanha possui uma área de crônica para registrar acontecimentos importantes.

O recurso é pensado como um registro da narrativa e pode ser utilizado pelo Mestre para manter a história organizada ao longo das sessões.

---

# Realtime

O RPG HUB utiliza **Supabase Realtime** para sincronizar alterações entre os participantes.

Fluxo conceitual:

```text
Alteração
   ↓
Supabase
   ↓
Realtime
   ↓
Participantes da campanha
   ↓
Interface atualizada
```

Entre os eventos contemplados pela arquitetura estão:

- Personagens.
- Entidades.
- Movimento.
- Cômodos.
- Redimensionamento.
- Rotação.
- Cenário.
- Sessões.
- Rolagens.
- Áudio.
- Presença.

A proposta é reduzir ao máximo a necessidade de atualizar a página manualmente.

---

# Interface e responsividade

O projeto possui interface adaptada para diferentes tamanhos de tela.

### Desktop

- Sidebar fixa.
- Navegação completa.
- Painéis amplos.
- Dashboard com cards.
- Mapa com área de trabalho maior.

### Mobile

- Navegação adaptada.
- Layout responsivo.
- Cards reorganizados.
- Modais adaptados.
- Controles acessíveis em telas menores.

---

# Privacidade e permissões

O sistema diferencia Mestre e jogador.

Recursos administrativos incluem:

- Painel do Mestre.
- Histórico completo de rolagens.
- Crônica.
- Administração de fichas.
- Controle de recursos da campanha.

A aplicação utiliza verificações de permissão no frontend e deve utilizar **RLS no Supabase** para garantir a proteção das operações sensíveis no banco.

> Nunca coloque chaves administrativas ou secrets do Supabase no frontend.

---

# Arquitetura

Stack principal:

**HTML5 · CSS3 · JavaScript · Supabase JS 2.117.2 · PostgreSQL · Supabase Auth · Supabase Realtime · GitHub · Vercel**

### Principais entidades

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
campaign_audio_state
campaign_chronicles
```

### Arquivos principais

```text
index.html
login.html
mesa.html
styles.css
app.js
supabase.js
rpg-realtime-enhancements.js
rpg-character-dice-enhancements.js
rpg-theme-customizer.js
rpg-dashboard-ui.js
docs/
```

---

# Desenvolvimento

Clone o repositório:

```bash
git clone https://github.com/Olivzx/RPG-Hub-by-Carlos-H.git
cd RPG-Hub-by-Carlos-H
```

Configure a conexão do Supabase em `supabase.js`.

Para desenvolvimento local, utilize um servidor HTTP local em vez de abrir os arquivos diretamente pelo `file://`.

---

# Deploy

Fluxo atual:

```text
GitHub
   ↓
Branch principal / branch de publicação
   ↓
Vercel
   ↓
RPG HUB
```

Após qualquer publicação, recomenda-se testar:

- Login.
- Cadastro.
- Criação de campanha.
- Entrada de jogador.
- Visão Geral.
- Mesa.
- Personagens.
- Dados.
- Dados personalizados.
- Realtime.
- Áudio.
- Painel do Mestre.
- Permissões.
- Temas.
- Responsividade.

---

# Evolução recente

O RPG HUB passou por uma série de evoluções para sair de uma estrutura inicial e chegar a uma plataforma de mesa virtual mais completa.

Entre as principais mudanças:

- Mundo persistente.
- Supabase Realtime.
- Atualização de personagens sem F5.
- Atualização de cômodos sem F5.
- Rotação de cômodos em tempo real.
- Sincronização de cenário.
- HP e remoção visual de personagens.
- Histórico de personagens.
- Exclusão de fichas pelo Mestre.
- Áudio compartilhado.
- Painel privado do Mestre.
- Histórico de rolagens privado.
- Identificação do jogador que rolou.
- Sistema expandido de dados.
- Dados personalizados.
- Reformulação visual das fichas.
- Visão Geral separada da Mesa.
- Sidebar fixa.
- Sistema de temas personalizados.
- Temas aplicados globalmente à aplicação.
- Melhorias de responsividade.
- Correção do fluxo de criação de personagem relacionado a `room.appendChild is not a function`.
- Identificação de autoria na tela de login.

---

# Autoria

## Carlos Henrique — RPG HUB

O RPG HUB é um projeto desenvolvido por **Carlos Henrique**.

A identidade do projeto também é apresentada na tela de autenticação da aplicação para deixar clara a autoria e origem do sistema.

---

# Documentação complementar

- [Guia completo de uso](docs/GUIA-DE-USO.md)
- [Arquitetura e segurança](docs/ARQUITETURA.md)
- [Histórico de evolução](docs/HISTORICO.md)

---

# Estado atual

**Projeto em desenvolvimento ativo.**

```text
main
deploy/rpg-hub-stable
```

Novas funcionalidades continuam sendo adicionadas conforme o projeto evolui.

---

<div align="center">

### RPG HUB

**Mapa. Fichas. Dados. Áudio. Sessões. Mundo. Realtime. Tudo na mesma mesa.**

**Desenvolvido por Carlos Henrique.**

</div>
