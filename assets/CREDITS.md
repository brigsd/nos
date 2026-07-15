# Créditos — assets/

## Paleta

- **Resurrect 64** por Kerrie Lake — <https://lospec.com/palette-list/resurrect-64>. Licença: CC0 (conforme a listagem no Lospec). Os 64 hex codes estão em `palette.json`, obtidos via WebFetch da página do Lospec e conferidos de forma independente contra `https://lospec.com/palette-list/resurrect-64.json` (API bruta) — as duas fontes bateram exatamente, então os valores foram tratados como confirmados, não incertos.

## Sprites (T7 — kit visual da v1)

Todos os sprites em `sprites/src/*.json` (campina, flores de campina, floresta, água, ruína, caminho de terra, Núcleo) são **originais**, desenhados como código (matrizes de índices de paleta) pelo pixel-artist deste projeto — nenhum pack CC0 externo (Kenney ou similar) foi adaptado nesta leva. Nenhum outro asset externo foi usado.

## Refinos de arte (T7.1 — issue #12)

- `campina_3.json`: terceira variação sutil de campina, mesma técnica e mesmo pixel-artist das duas primeiras (`genCampina3` em `tools/author-sprites.cjs`).
- `margem_agua_4dir.json`: rim arenoso/molhado para a transição campina→água. Original, código próprio; 4 quadros são só rotações de 90° de uma única borda desenhada à mão (`rotateGridCW`), não 4 desenhos separados.
- Nenhum asset externo foi usado nestes dois sprites.

## Ferramentas

`tools/` (encoder PNG manual + compositor) é código original deste projeto, sem dependências externas (só `fs`, `path`, `zlib` do Node).
