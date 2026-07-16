# art-mcp — estúdio de arte sistematizado do NÓS

Toolkit que dá a uma IA o ciclo completo de criação de arte FPS em pixel art:
**criar → renderizar → OLHAR → auditar → corrigir → repetir**.

Alvo: a arte do protótipo de primeira pessoa (`prototipos/fps/`, branch
`claude/fps-prototipo`) — texturas de parede tileáveis, chão, billboards e
personagens em 8 direções. Paleta fixa: Resurrect 64 (`assets/palette.json`).
Zero dependências npm (reusa `assets/tools/lib/`).

---

## Se você é uma IA e vai criar arte: comece aqui

A regra número 1: **você não cria arte às cegas.** Toda tool devolve um
caminho de PNG — **abra e olhe o PNG** (tool `Read`) depois de CADA passo.
A regra número 2: **o crítico algorítmico decide o que seu olho não pega**
(costura de 1px, índice fora da paleta). `error` = não mescla; `warn` =
julgamento seu.

### O loop mínimo, copiável (CLI)

```bash
# 1. GERAR uma textura de parede a partir de um preset
node tools/art-mcp/cli.cjs gen --preset tijolo_rubro --size 64 --seed minha-v1
#    → grava tools/art-mcp/qa/tijolo_rubro.json  (fonte: matriz de índices)
#    → grava tools/art-mcp/qa/tijolo_rubro_tiled.png  (wrap 3x3)
#    → imprime os achados da auditoria (JSON)

# 2. OLHAR — abra o PNG _tiled com a tool Read. Pergunte-se:
#    a repetição incomoda? a costura aparece como linha? lê como o material?

# 3. VER IN-ENGINE — como o jogador veria, com o fog/perspectiva do protótipo:
node tools/art-mcp/cli.cjs preview --wall tools/art-mcp/qa/tijolo_rubro.json
#    → tools/art-mcp/qa/preview_tijolo_rubro.png  (ABRA e olhe)

# 4. CORRIGIR — mude seed/params e regenere, ou edite a matriz JSON à mão.
#    Depois de editar à mão, SEMPRE:
node tools/art-mcp/cli.cjs audit --src tools/art-mcp/qa/tijolo_rubro.json --tileable

# 5. COMPARAR — antes/depois com heatmap do que mudou:
node tools/art-mcp/cli.cjs diff --before v1.json --after v2.json
```

Pelo MCP (se esta sessão carregou o servidor `nos-art-toolkit` do
`.mcp.json` da raiz), as mesmas operações são as tools `gen_texture`,
`view_sprite`, `view_tiled`, `preview_scene`, `audit_sprite`,
`contact_sheet`, `diff_sprites`, `turnaround`, `list_presets` — mesmos
parâmetros, mesmos retornos.

### Onde cada coisa entra no fluxo do repo

- Fonte de verdade de um sprite = **sprite-src JSON** (matriz de índices da
  paleta), nunca o PNG. O PNG é derivado.
- Antes de propor arte num PR: auditoria sem `error`, wrap 3x3 olhado,
  preview in-engine olhado. Anexe os PNGs de evidência em `tools/art-mcp/qa/`
  (padrão do repo: evidência visual curada é committada, como `site/qa/`).

---

## Formatos (o contrato de dados)

### sprite-src (o mesmo de `assets/sprites/src/`)

```json
{
  "name": "tijolo_rubro",
  "kind": "wall",
  "width": 64, "height": 64,
  "notes": "texto livre para humanos",
  "frames": [ { "pixels": [[3, 3, 11, ...], ...] } ]
}
```

- `pixels`: `height` linhas × `width` colunas de **índices da paleta**
  (0–63); `-1` = transparente.
- `kind` muda o comportamento do crítico:
  - `wall` / `tile` → checa costura de wrap; NÃO checa pixels órfãos
    (salpicado é material em terreno).
  - `object` / `billboard` → checa órfãos e silhueta; costura só se você
    passar `--tileable`.
- Multi-frame (animação): mais objetos em `frames`, layout horizontal.

### figura de turnaround (boneco-de-caixas)

```json
{
  "name": "guarda",
  "boxes": [
    { "c": [0, -3.1, 0], "s": [1.6, 1.6, 1.6], "color": [171, 148, 122] },
    { "c": [0, -1.2, 0], "s": [2.0, 2.4, 1.1], "color": [72, 74, 119] }
  ]
}
```

- `c` = centro [x, y, z], `s` = tamanho [larg, alt, prof], `color` = RGB.
- Eixo y cresce PRA BAIXO (como tela); unidades livres (auto-escala).
- Sem figura, `turnaround` usa um humanoide default (cabeça/tronco/braços/
  pernas) — bom ponto de partida: copie e deforme.

---

## As tools, uma a uma

| Tool (MCP / CLI) | O que faz | O que você recebe |
|---|---|---|
| `gen_texture` / `gen` | Gera textura tileável de um preset + overrides | sprite-src JSON + PNG 3x3 + achados |
| `audit_sprite` / `audit` | Crítico algorítmico | lista de `{level, check, msg}` |
| `view_sprite` / `view` | Frame(s) ampliado(s) com grid, sobre fundo escuro E claro, legenda da paleta usada | PNG (ABRA) |
| `view_tiled` / `tiled` | Wrap 3x3 em 2x — costura vira linha visível | PNG (ABRA) |
| `preview_scene` / `preview` | Corredor renderizado com a matemática do protótipo FPS; `--wall` obrigatório, `--floor`/`--billboard` opcionais (billboard sai em 3 distâncias) | PNG 320×180 (ABRA) |
| `contact_sheet` / `sheet` | Todos os sprite-src de um diretório numa folha — consistência de estilo | PNG (ABRA) |
| `diff_sprites` / `diff` | Antes/depois lado a lado + heatmap vermelho dos pixels alterados | PNG (ABRA) |
| `turnaround` / `turnaround` | Boneco 3D em 8 vistas (S/SO/O/NO/N/NE/L/SE), luz fixa | PNG-andaime (pinte por cima) |
| `list_presets` / `presets` | Lista presets com a intenção de cada um | JSON |

O CLI sai com código 1 se houver achado `error` — use como gate de CI.

---

## Geradores: "programar o pintor" (texgen.cjs)

Você não pinta pixel a pixel primeiro — você **parametriza um gerador** e
itera nos parâmetros. Presets atuais:

| Preset | Material | Truques |
|---|---|---|
| `ruina_pedra` | pedra de ruína (ameixa/cinza) | fBm + rachaduras |
| `tijolo_rubro` | parede de tijolos | grade+argamassa, tom por tijolo, sombra de borda |
| `madeira_escura` | tábuas verticais | grain anisotrópico |
| `metal_frio` | chapas metálicas | grade larga, dither alto |
| `musgo_vivo` | pedra musgosa | fBm denso nos verdes |

Parâmetros (todos via `params` no MCP; `--size/--seed/--name` no CLI):
`size`, `seed`, `ramp` (índices escuro→claro; use `assets/tools/lib/`
`palette-names.cjs` pra ler por nome), `baseFreq` (células de ruído),
`octaves`, `contrast`, `dither` (0–1), `bricks` (`{rows, cols, mortarIdx,
mortarPx, offset}`), `grain` (0–1), `cracks` (0–1).

**Invariantes que o gerador garante (não quebre ao editar):**
- Determinismo: mesma seed ⇒ mesma textura, byte a byte (tem teste).
- Tileabilidade por construção: o ruído embrulha em períodos INTEIROS do
  lattice. O `grain` estica período, NUNCA espreme coordenada — espremer
  coordenada quebra o wrap (bug real pego pelos testes; não reintroduza).
- Só cores da paleta, via `ramp`.

Pra criar um preset novo: entrada em `PRESETS` (texgen.cjs) com `ramp` +
`notes`, e o teste de suite (`every preset audits clean`) passa a cobri-lo
automaticamente.

---

## O crítico (lints.cjs) — o que cada checagem significa

- **palette** (`error`): índice fora de 0..63 (e não -1). Nunca ignore.
- **seams** (`error`): salto de luminância no wrap ≥ 2.2× o salto interior
  **do mesmo eixo**. Comparar eixos misturados acusa costura falsa em
  textura de tijolo (lisa em X, juntas duras em Y) — por isso é por-eixo.
- **orphans** (`warn`, só object/billboard): pixel sem nenhum vizinho da
  mesma cor. Orçamento `max(4, área/32)`, calibrado na arte revisada do
  jogo (objetos reais têm 2–6 brilhos deliberados). Em terreno NÃO roda:
  os tiles revisados carregam 8–18% de salpicado proposital.
- **banding** (`warn`): >45% de colunas duplicadas — lê como listrado.
  (Este check reproduziu sozinho a ressalva do art-reviewer humano nas
  margens d'água — é sinal de qualidade, leve a sério.)
- **silhouette** (`warn`, só object/billboard): luminância média do contorno
  <35 some no fog escuro do FPS (#100c15); >200 faz halo. Vale porque o
  `view_sprite` mostra o sprite nos DOIS fundos — confirme no olho.

Calibração é ground truth da arte já mesclada: se o crítico brigar com uma
peça revisada e aprovada, o suspeito é o crítico — ajuste o limiar e
documente aqui, não "conserte" a arte.

---

## Preview in-engine (preview3d.cjs) — por que existe

Pixel art avaliada plana engana: dithering que funciona de perto vira ruído
em perspectiva; uma costura invisível no 1x listra a parede inteira. O
preview renderiza um corredor de auditoria com a matemática **portada 1:1
do protótipo** (`prototipos/fps/nos-fps.html`): DDA, floor casting,
projeção de billboard, fog `1/(1+0.021d²)`, void #100c15, faces N/S a 0.8,
320×180. **Se o protótipo mudar essas constantes, atualize o bloco único no
topo do preview3d.cjs** — manter a sincronia é parte de qualquer PR que
toque o render do protótipo.

## Turnaround (turntable.cjs) — como usar direito

O problema que resolve: manter anatomia/volume/luz consistentes num
personagem visto de 8 ângulos (o desafio real de sprites de raycaster).
O fluxo: (1) modele o boneco-de-caixas (proporção e pose, sem detalhe);
(2) gere a tira de 8 vistas; (3) ABRA o PNG e pinte pixel art POR CIMA de
cada vista, respeitando a silhueta e o sombreamento do andaime. A luz é
fixa em relação à CÂMERA (convenção de sprite de FPS: o lado claro
acompanha o observador). É o truque das miniaturas fotografadas do DOOM,
em código.

---

## Erros comuns (e o que fazer)

- *"gerei e ficou bom no 1x, feio no jogo"* → você pulou o `preview`. Passo
  3 do loop não é opcional.
- *"o audit acusa costura mas eu não vejo"* → abra o `view_tiled`; se nem no
  3x3 aparecer, o wrap está no limite — regenere com outra seed ou suavize
  a borda; o limiar 2.2× tem margem de propósito.
- *"quero uma cor que não está na paleta"* → não existe essa opção. Escolha
  o índice mais próximo (`palette-names.cjs`) ou proponha mudança de paleta
  como decisão de produto (GDD/D-08), fora deste toolkit.
- *"editei o JSON à mão e o PNG não mudou"* → PNGs são derivados; re-rode
  `view`/`tiled`/`preview` depois de editar.
- *"o servidor MCP não aparece"* → ele é carregado do `.mcp.json` na raiz ao
  iniciar a sessão; no meio de uma sessão, use o CLI (mesmas funções).
