# art-mcp — estúdio de arte sistematizado do NÓS

Toolkit que dá a uma IA o ciclo completo de criação de arte FPS (pixel art,
paleta Resurrect 64): **autorar → renderizar → OLHAR → auditar → iterar**.
Zero dependências npm (reusa `assets/tools/lib/`). Mira a arte do protótipo
de primeira pessoa (`prototipos/fps/`, branch `claude/fps-prototipo`):
texturas de parede tileáveis, chão, billboards, personagens em 8 direções.

## O loop (para a IA que for usar)

1. **Gerar/editar**: `gen_texture` (preset paramétrico) ou sprite-src JSON à mão.
2. **Olhar**: toda tool devolve um caminho de PNG. **LEIA o PNG** (visão
   multimodal) — `view_sprite` (ampliado + grid + paleta, fundo escuro E
   claro), `view_tiled` (wrap 3×3, costura salta ao olho).
3. **Auditar**: `audit_sprite` roda o crítico algorítmico — o que o olho
   deixa passar, ele pega. `error` bloqueia (CI); `warn` é julgamento.
4. **Ver in-engine**: `preview_scene` renderiza o candidato com a matemática
   EXATA do protótipo raycaster (DDA, floor casting, fog, shade). Arte de FPS
   avaliada fora do engine engana — dithering plano vira ruído em perspectiva.
5. **Iterar**: mude `params`/pixels e repita. Determinístico por seed.

## Interfaces

- **MCP** (preferida): registrado em `.mcp.json` na raiz — o Claude Code
  carrega sozinho. Tools: `gen_texture`, `audit_sprite`, `view_sprite`,
  `view_tiled`, `preview_scene`, `contact_sheet`, `diff_sprites`,
  `turnaround`, `list_presets`.
- **CLI** (shell/CI): `node tools/art-mcp/cli.cjs <cmd>` — mesmos nomes,
  `--help` implícito no erro. Sai com código 1 se a auditoria tiver `error`.

## O crítico algorítmico (lints.cjs) — calibrado contra a arte revisada

- **palette**: índice fora da Resurrect 64 = error.
- **seams**: salto de luminância no wrap comparado ao interior DO MESMO EIXO
  (textura de tijolo é lisa em X e dura em Y; comparar torto acusa costura
  falsa). > 2.2× = error.
- **orphans**: só para `object`/`billboard` — nos terrenos (tile/wall),
  salpicado é material (os tiles revisados do jogo carregam 8–18% de pixels
  sós, de propósito). Objetos revisados: 2–6 brilhos deliberados → orçamento
  `max(4, área/32)`, warn.
- **banding**: colunas duplicadas em massa, warn. (Validação: acusou nas
  margens d'água exatamente a ressalva registrada pelo art-reviewer humano.)
- **silhouette**: contorno de objeto deve sobreviver a fundo escuro E claro
  (o fog do FPS é #100c15), warn.

## Geradores (texgen.cjs) — "programar o pintor"

Presets: `ruina_pedra`, `tijolo_rubro`, `madeira_escura`, `metal_frio`,
`musgo_vivo`. Parâmetros: `size`, `seed`, `ramp` (índices da paleta,
escuro→claro), `baseFreq`, `octaves`, `contrast`, `dither`, `bricks`
(grade+argamassa), `grain` (veio anisotrópico — NUNCA espreme coordenada,
só o período inteiro do lattice: tileabilidade por construção), `cracks`.
Ruído fractal tileável semeado por string (noise.cjs).

## Turnaround 8 direções (turntable.cjs)

Boneco-de-caixas (`{name, boxes:[{c,s,color}]}`) rasterizado em S/SO/O/NO/
N/NE/L/SE com luz fixa em relação à câmera (convenção de sprite de
raycaster). O resultado é ANDAIME de proporção/pose/luz — a pixel art é
pintada por cima, com as 8 vistas consistentes por construção (o truque das
miniaturas fotografadas do DOOM, em código).

## Sincronia com o protótipo

`preview3d.cjs` porta as constantes do protótipo (320×180, FOV 0.66, fog
`1/(1+0.021d²)`, void #100c15, faces N/S escurecidas 0.8). Se o protótipo
mudar essas constantes, atualizar o bloco único no topo do arquivo.
