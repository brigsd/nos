# Cliente do NÓS — O Coração

Cliente visual (canvas 2D) d'O Coração, publicado no GitHub Pages em **https://brigsd.github.io/nos**.

## Rodar localmente

```bash
cd site
npm ci
npm run dev      # servidor de desenvolvimento
npm run build    # build de produção (usado pelo deploy do Pages)
npm run preview  # serve o build de produção
```

O cliente lê o estado do mundo de `world/heart.json` e desenha o mapa com os sprites de `assets/sprites/`. O deploy é feito pelo workflow `.github/workflows/pages.yml` a cada push que toca `site/`, `world/` ou `assets/`.
