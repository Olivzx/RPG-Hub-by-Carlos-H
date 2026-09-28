# Guia de uso — RPG HUB

## Fluxo recomendado

1. Crie sua conta pelo Supabase Auth.
2. Crie uma campanha como Mestre ou entre usando o código de convite.
3. Crie os personagens da mesa.
4. Prepare locais, andares e cômodos.
5. Crie uma sessão.
6. Abra a Mesa e conduza a aventura.
7. Use dados, áudio, fichas, NPCs e crônica durante a sessão.

## Mestre

O Mestre é o proprietário da campanha e possui as ferramentas administrativas. Ele pode preparar o mapa, gerenciar personagens, controlar sessões e áudio, consultar o histórico de rolagens e acessar a Crônica.

### Painel do Mestre

O painel privado reúne:

- Histórico de dados.
- Jogador responsável por cada rolagem.
- Personagem usado.
- Dados individuais e resultado final.
- Controle do áudio.
- Lista rápida de fichas.
- HP e defesa dos personagens.
- Abertura das fichas completas.
- Sessão conectada.

## Jogador

O jogador acompanha a mesa, usa sua ficha, rola dados, utiliza dados personalizados e acompanha o estado compartilhado da sessão. Recursos administrativos do Mestre não aparecem para ele.

## Campanhas

Cada campanha possui seus próprios membros, personagens, mundo, sessões, NPCs, rolagens, áudio e crônica. O código de convite permite que novos jogadores entrem na campanha.

## Mesa e mapa

A Mesa é o centro da sessão. O Mestre pode trabalhar com:

- Locais.
- Andares.
- Cômodos.
- Entidades.
- Personagens.
- Posição.
- Tamanho.
- Rotação.
- Cena atual.

As alterações são persistidas e sincronizadas por Realtime.

## Personagens

Uma ficha pode conter:

- Nome.
- Jogador responsável.
- Classe/função.
- Origem/ancestralidade.
- Nível.
- HP atual e máximo.
- Defesa/CA.
- Sorte e pontos de sorte.
- Força.
- Destreza.
- Constituição.
- Inteligência.
- Sabedoria.
- Carisma.
- Avatar.
- Ficha complementar.
- Itens/equipamentos.
- Campos personalizados.

O Mestre pode excluir fichas. Quando um personagem chega a 0 HP, ele pode ser retirado do mapa sem apagar os dados históricos.

## Dados

Há presets de d2 a d1000, além de dados personalizados.

Exemplos:

```text
1d20
2d20 + 4
3d6 - 1
1d37
2d127
```

Regras: Normal, Vantagem e Desvantagem.

Os resultados mostram dados individuais, fórmula, modificador e total.

## Histórico de dados

O jogador rola normalmente, mas o histórico completo fica no Painel do Mestre. O histórico não é exibido na área pública de Utilitários.

## Áudio

O Mestre controla música, ambientes, efeitos e playlists. O estado de áudio é compartilhado pela campanha e sincronizado em tempo real.

A entrada na sala é preparada para acompanhar o estado atual do áudio; entretanto, navegadores podem bloquear autoplay até que o usuário interaja com a página.

## Sessões

Sessões organizam a aventura por número, status e cena atual. Local, andar e cômodo podem acompanhar a sessão.

## NPCs e monstros

A área de NPCs permite cadastrar, organizar e consultar criaturas e personagens importantes da campanha.

## Crônica

A Crônica é um espaço privado do Mestre para registrar acontecimentos, descobertas, conflitos, decisões e consequências.

## Realtime

Eventos de personagens, mapa, cômodos, sessões, rolagens, áudio e presença podem chegar aos participantes sem F5.

Fluxo:

```text
Alteração → Supabase → Realtime → participantes → interface atualizada
```

## Interface

A aplicação possui navegação desktop e mobile. A sidebar desktop é fixa para manter perfil e logout acessíveis mesmo em páginas longas.
