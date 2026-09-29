# Atualização — Multiplayer + Combate em tempo real

## Combate

O RPG HUB agora possui uma camada de resolução de ataques integrada ao combate persistente.

### Fluxo do Mestre

1. Selecionar atacante.
2. Selecionar alvo.
3. Informar a ação.
4. Informar o modificador de ataque.
5. Informar a expressão de dano, por exemplo `1d8+3`.
6. O sistema rola o d20.
7. A defesa/CA do alvo é considerada.
8. A chance matemática de acerto é exibida antes da resolução.
9. Natural 1 falha automaticamente.
10. Natural 20 acerta e gera crítico.
11. O dano é calculado automaticamente.
12. O HP do alvo é atualizado de forma atômica no banco.
13. O sistema registra a ação, rolagem, dano, HP antes/depois e percentual de vida perdido.

### Percentuais

- **Chance de acerto:** quantidade de resultados possíveis no d20 que acertariam a CA, respeitando 1 natural como falha e 20 natural como acerto.
- **Percentual de impacto:** dano aplicado em relação ao HP máximo do alvo.
- **Percentual de vida perdida:** dano aplicado em relação ao HP que o alvo possuía antes do ataque.

Isso evita transformar porcentagens arbitrárias em regra do sistema: os percentuais apresentados são métricas calculadas a partir da rolagem e dos valores reais da ficha.

## Multiplayer de baixa latência

Foi criada uma camada adicional de multiplayer para a Mesa:

- Presença por campanha com Supabase Realtime Presence.
- Lista de jogadores conectados com nome, tipo de conta e seção atual.
- Atualização de presença ao trocar de seção.
- Canal dedicado para ações de combate.
- O Mestre publica a ação imediatamente após a resolução.
- Jogadores recebem a ação sem F5.
- O histórico de combate é persistido no banco e também distribuído por Realtime.
- A camada existente de Broadcast continua responsável pelas mudanças de mapa, entidades, cenas, áudio e estado da campanha.

## Banco

Nova tabela:

```text
combat_actions
```

Nova função:

```text
resolve_combat_attack(...)
```

A função valida que somente o proprietário da campanha pode resolver ataques, atualiza o HP do alvo e registra o resultado da ação na mesma operação do banco.

A tabela possui RLS para permitir leitura aos participantes da campanha, enquanto a criação das ações fica restrita ao Mestre.

## Arquivos

- `rpg-multiplayer-combat.js` — presença, lista de jogadores e resolução/visualização das ações de combate.
- `supabase.js` — carregamento da camada multiplayer adicional.
- `supabase/migrations/20260929054500_combat_actions_and_rpc.sql` — tabela, RLS e função de resolução de ataques.
- `rpg-combat-system.js` — rastreador de iniciativa, turnos, HP e condições já existente.

## Observação

A arquitetura prioriza sincronização por Realtime e mantém o banco como fonte de verdade. O cliente pode atualizar a interface imediatamente, mas o resultado persistente continua sendo confirmado pelo Supabase.