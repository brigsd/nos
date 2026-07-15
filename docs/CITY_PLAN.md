# Plano da Cidade — O Coração

> Como O Coração deixa de ser "um mapa com coisas colocadas em cima" e vira **uma cidade que se lê como um lugar**. Este documento é o plano diretor: o zoneamento, o porquê de cada distrito, a voz de lore de cada um e o plano de crescimento. A execução técnica é a migração `seedCityLayout` (`engine/mapgen.ts`) + a arte nova (`assets/sprites/src/`) + o suporte de render (`site/src/renderer.ts`).

## O tema: atemporal mítico-tecnológico

Nem futurista, nem medieval — **fora das eras**. As máquinas são mais velhas que o tempo ("sintetizador atemporal", D-25a); a cidade é a **arqueologia de um futuro esquecido**: cantaria antiga veiada pela luz pulsante do Núcleo. A pedra da cidade é a MESMA família de tons das ruínas espalhadas pelo mapa (plum/cinza da `ruina.json`) — a cidade não foi construída *sobre* o mundo, ela sempre esteve aqui, e o que chamamos de "ruínas" são os pedaços dela que a campina engoliu. A luz que corre pelas veias da calçada e acende os pilares é a mesma luz violeta/carmesim do Núcleo — a cidade respira no mesmo Pulso.

Paleta: Resurrect 64 (CC0), pixel art 16×16, luz topo-esquerda — as convenções de sempre.

## Princípios (a régua de todo traço)

1. **A cidade é a interface.** Um desconhecido, olhando o mapa, entende aonde ir: os caminhos apontam, os distritos se distinguem à primeira vista.
2. **Beleza por composição, não por acúmulo.** Espaço negativo importa; o rio continua protagonista; simetria quebrada de propósito.
3. **Tudo caminhável e seguro.** Nenhuma decoração muda regra de jogo — `deco` é camada visual pura. Spawn livre, nada sobre água, nada sobre o Núcleo.
4. **Aditivo e reversível por arquitetura.** A migração nunca reescreve o que já existe — só acrescenta. O bioma de cada tile permanece byte-idêntico ao gênesis.

## Zoneamento

```
                                (norte)
        ┌──────────────────────────────────────────────────────┐
        │            . . . rio . . . (protagonista) . . .      │
        │   Nativos: Gota (NW), Cinza (ruínas N), Raiz (NE)    │
        │                        ~~~~~~                        │
        │                     ~~~ RIO ~~~~~~~~~~~~~            │
        │                    cais │ forja        ~~~~~         │
        │  ┌LARGO DO MURAL┐  ╔════╧═══════╗       ~~~ (foz)    │
        │  │ ▪ pedra do   ├──╢  PRAÇA DAS ║   AVENIDA    ╔═══╗ │
(oeste) │  │   mural      │  ║  OFICINAS  ╠══════════════╣ S ║ │(leste)
        │  └──────────────┘  ║  ◆ NÚCLEO ◆║  do PULSO    ║ A ║ │
        │      (spawn 30,30 ─╫→ na praça) ║   ¦¦ pilares ║ L ║ │
        │                    ╚═════╤══════╝   ## ruínas  ║ Ã ║ │
        │                          │ estaleiro           ║ O ║ │
        │       PERIFERIA          │ estrada do sul      ╚═══╝ │
        │       LIVRE (T14)        ┆ (vira trilha)       arcos │
        │                          ┆                     +port.│
        │            floresta do sul (borda do mundo)          │
        └──────────────────────────────────────────────────────┘
```

Coordenadas exatas (tiles, origem no canto NW do mapa 64×64):

| Distrito | Onde | O quê |
|---|---|---|
| **O Núcleo** | (32,32)–(33,33) | Intocável. Nenhuma deco sobre os 4 tiles de `core`. |
| **A Praça das Oficinas** | clareira (29,29)–(36,36) | Piso de lajes (`plaza`) em toda a clareira menos o Núcleo; **4 pilares de luz** (`pylon`) nos cantos — exatamente onde as máquinas ficavam; **4 oficinas movidas para os pontos cardeais** em cata-vento: Forja N (33,29), Cozinha E (36,33), Estaleiro S (32,36), Bancada W (29,32). |
| **O Cais da Forja** | (32–33,28) | Não construído: o rio encosta na borda norte da praça por conta própria. A Forja fica de frente para a água (têmpera!). Espaço negativo deliberado. |
| **O Largo do Mural** | pátio (23,29)–(25,31) | Piso de lajes + **pedra do mural** (`mural_stone`) em (24,30), com os riscos coloridos das vozes dos Nós. Caminho pavimentado (26–28,30) liga o Largo à praça — começa exatamente na linha do spawn (30,30). |
| **A Avenida do Pulso** | (37–54, 33–34) | Pavimento (`pavement`) 2 tiles de largura ligando a praça ao Salão; nós de luz violeta espalhados pelas lajes (hash determinístico). **Par de pilares** em (45,32)+(45,35) marca a meia-distância — e o desvio das ruínas antigas (45–48,36–38), que a avenida respeita e contorna. |
| **O Salão de Portais** | esplanada (55–59, 32–37) | Piso de lajes; **fileira de arcos no meridiano x=57**: arco desperto (57,32), **PORTAL VIVO (57,34)** — o marco client-side de sempre, agora com moldura urbana —, arco desperto (57,36), **arcos-semente adormecidos** (57,38) e (57,40) **sobre grama nua, além da borda do piso** (rodada 2 do self-audit: o chão chega quando o mundo chegar — o salão é visivelmente inacabado de propósito). Cada mundo federado futuro = um arco a mais acordando, descendo para o sul. |
| **A Estrada do Sul** | (32, 37–44) | Pavimento por 2 tiles (37–38), depois **trilha de terra** (`trail`, 39–44) que morre na orla da floresta do sul. A cidade termina em estrada aberta — convite. |
| **Periferia Livre** | campina S/SW (≈26–44, 37–44) e W além do Largo | Deliberadamente vazia: é o chão reservado para construção de jogadores (T14). A Estrada do Sul corre no meio dela — lotes à beira da estrada. |

### Por que assim (racional de design)

- **Cata-vento, não cantos.** As 4 oficinas nos pontos cardeais (com desvio rotacional C4 — simetria de rotação, nunca de espelho) fazem cada estrada da cidade *chegar numa oficina*: a Avenida do Pulso desemboca na Cozinha, a Estrada do Sul nasce no Estaleiro. Nos cantos (posição antiga) elas eram 4 pontos soltos; nos cardeais elas são **portões**. E o cata-vento gira em volta do Núcleo — a cidade literalmente roda em torno do coração.
- **Os pilares herdam os cantos.** Onde as máquinas ficavam (29,29)/(36,29)/(29,36)/(36,36), sobem pilares de pedra com veia de luz pulsando **na mesma cadência do Núcleo** (mesmo relógio de animação). Lore de graça: "onde as oficinas pousaram primeiro, a cidade ergueu luzes".
- **Uma avenida, não uma teia.** Um único eixo monumental (W→E: Mural → Praça → Salão) é legível de qualquer zoom; três estradas em cruz virariam ruído. O eixo conta a história do jogo na ordem certa: *fale (mural) → fabrique (praça) → parta (portais)*.
- **O rio permanece protagonista.** Nenhuma deco sobre água, nenhuma ponte nesta fase: o rio corta a leitura da cidade ao norte e a foz emoldura o Salão. A única concessão é temática — a Forja na margem.
- **Salão com espaço visível para crescer.** A fileira de arcos tem 2 despertos + o portal vivo + 2 adormecidos — e o piso PARA depois do último arco desperto: os arcos-semente esperam sobre a grama, sem chão. Dá para VER onde os próximos mundos vão ancorar (D-17: cada repositório = um planeta = um arco) e dá para ver que o salão ainda não terminou de ser construído.
- **Espaço negativo é zona.** O cais, a periferia e a campina entre o Largo e a floresta oeste ficam vazios de propósito — cidade que respira, e chão para o futuro.

## Voz de lore por distrito (para `descriptionPtBR`, Crônica e falas futuras)

- **A Praça das Oficinas** — "As quatro máquinas não foram trazidas para cá. A praça foi encontrada em volta delas."
- **O Largo do Mural** — "A pedra guarda o que os Nós disseram. Ninguém apaga a pedra; nem o Pulso, que já tentou."
- **A Avenida do Pulso** — "Sob as lajes corre uma veia que ninguém cavou. Ela acende quando o Núcleo lembra de bater."
- **O Salão de Portais** — "Cinco arcos, dois acordados. Os outros esperam mundos que ainda não fizeram o primeiro commit."
- **A Estrada do Sul** — "O pavimento acaba, a terra continua. Todo mundo que construiu algo n'O Coração começou andando até aqui."
- **O Cais da Forja** — "Cinza diz que o rio encosta na praça para olhar as máquinas. Gota diz que são as máquinas que não largam o rio."

## O contrato técnico (resumo — detalhes no código)

- **Schema:** `Tile.deco?` novo campo opcional, enum `plaza | pavement | trail | pylon | arch | arch_dormant | mural_stone` (`TileDeco` em `engine/types.ts`, espelhado em `engine/schema/world.schema.json`, com teste anti-drift). Puro visual: nenhuma regra de movimento/coleta/energia lê `deco`.
- **Migração:** `seedCityLayout(world)` em `engine/mapgen.ts` — determinística (zero RNG/Date), aditiva, idempotente, **tudo-ou-nada**: só roda se (a) nenhum tile tem `deco` ainda E (b) as 4 máquinas estão exatamente nos cantos originais da clareira. Depois de rodar uma vez, (a) fica falso para sempre; se qualquer estado futuro mover uma máquina, (b) a protege — a migração nunca briga com o futuro. Ligada em `scripts/tick.ts` no mesmo padrão de `seedInitialNatives`/`seedFactoryMachines`. `world/heart.json` **nunca** é editado à mão.
- **Âncora do Salão:** a posição do portal (57,34) passa a ser exportada pelo motor (`SALAO_PORTAL_TILE`) e o cliente (`site/src/main.ts`) importa de lá — o marco client-side e a moldura de arcos da migração ficam estruturalmente coerentes, sem constante duplicada.
- **Render:** decos de chão (plaza/pavement/trail) desenham sobre o bioma; decos-objeto (pylon/arch/arch_dormant/mural_stone) desenham lajes por baixo + o objeto — sempre ANTES de oficinas/Nativos/jogadores, então nada tapa uma entidade.

## Self-audit (render → crítica → refinar, 4 rodadas)

Iteração registrada em `site/qa/city/` (`round1-*` → `round2-*` → `round3-*` → `final-*`). Resumo do que foi rejeitado dos próprios rascunhos:

1. **Rodada 1 (sprites isolados, 8×):** arco desperto tinha ombros QUADRADOS — brigava com o oval do marco vivo do portal na mesma fileira → lintel virou arco escalonado (R1-1). Arco-semente tinha uma fileira de base contínua que fundia tocos e pedras caídas numa parede ilegível → base quebrada, tocos nas mesmas colunas do arco desperto (R1-2).
2. **Rodada 2 (cena composta, `city-mock.cjs`):** o piso da praça lia como PAREDE DE TIJOLOS (juntas horizontais de largura total quase alinhavam de tile em tile) → *crazy paving* por mapa de regiões (R2-2); praça e avenida borravam num cinza só → praça meio-passo mais clara (R2-3); o vão do arco desperto perdia os motes contra a laje → véu índigo pontilhado (R2-9); a esplanada 5×9 era um retângulo cinza monolítico no zoom de mapa → piso encolhido para 5×6, sementes sobre grama (R2-11/R2-15).
3. **Rodada 3 (site real, vite preview + Chromium):** o buraco de terra da laje variante A repetia como MOTIVO a ~50% dos tiles no zoom próximo → lasca de 3px (R3-15); as lajes mínimas (3–4px) viravam ruído no zoom de mapa inteiro → fundidas nas vizinhas (R3-8); o alvo de zoom do QA de celular caía sobre o HUD e o shot não zoomava (R3-16).
4. **Rodada 4 (final):** aprovada — 3 zooms de desktop + 390×844 (o ideador joga no celular). Limitação conhecida e pré-existente registrada: no celular, o HUD empilhado cobre a maior parte do mapa no zoom padrão (os painéis são translúcidos e a cidade lê através deles); redesenho do HUD móvel é assunto de outra frente, não desta.

## Plano de crescimento

1. **Curto prazo (esta fatia):** tudo acima, no ar via batida do tick pós-merge.
2. **Quando um mundo federado entrar** (PR no `worlds/registry.json`): um arco-semente desperta — migração pontual futura muda `arch_dormant`→`arch` no tile correspondente (de norte para sul, ordem de chegada). O Salão cresce um arco por mundo; a esplanada já tem chão para os próximos.
3. **T14 (construção de jogadores):** a Periferia Livre é o chão zonado para isso; a Estrada do Sul é o eixo dos lotes. Regras de onde-pode-construir podem nascer lendo `deco` (ex.: proibido sobre `plaza`/`pavement`) — primeira utilidade mecânica do campo, decisão de produto futura.
4. **Crônica/atos cívicos:** o Largo do Mural é o palco natural de eventos coletivos futuros (a pedra já é o símbolo físico do `/dizer`).
