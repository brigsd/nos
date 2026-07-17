# Git como infraestrutura do NÓS

> Para o coder de qualquer sessão — e para replicar em qualquer mundo novo.
> No NÓS o **repo é o banco de dados**, o **Actions é o servidor** e
> **1 batida = 1 commit, para sempre**. Isso torna o git ferramenta de
> primeira classe, não só controle de versão. Este doc reúne o ferramental
> de git que já ganhou script no repo — cada um citando o atrito real que o
> justificou (o método da bancada, `docs/CODER.md`).

Três comandos prontos, um caveat honesto cada, e uma prateleira de recursos
para o futuro.

| Comando | Resolve | Estado |
| --- | --- | --- |
| `npm run git:forensics -- <boa>` | "qual batida quebrou o mundo?" | pronto |
| `npm run git:worktree -- <branch>` | várias instâncias brigando pelo checkout | pronto |
| `npm run git:maintenance` | a Crônica só cresce e fica lenta de ler | pronto (ligar no workflow ~5k batidas) |

---

## 1. Forense — `git:forensics` (busca binária na Crônica)

*Atrito de origem: o validador do tick já pega estado inválido, mas achar
QUAL das milhares de batidas o introduziu, na mão, é inviável.*

O mundo quebrou — um `world/heart.json` inválido, uma regressão que ninguém
viu entrar. A pergunta é sempre "que batida fez isso?". Este comando embrulha
`git bisect run`: uma **busca binária** que testa candidatos com um validador
automático e aponta o commit culpado em `log2(n)` passos. 10.000 batidas →
~14 testes.

```bash
npm run git:forensics -- <batida-boa>              # validador padrão: validate-world
npm run git:forensics -- HEAD~200                  # "há 200 batidas ainda estava são"
npm run git:forensics -- v1.0 -- npm test          # outro validador (a suíte inteira)
npm run git:forensics -- abc1234 -- node scripts/meu-predicado.mjs
```

- `<batida-boa>`: um ref onde o mundo **ainda estava são** (`HEAD` é assumido
  "quebrado" — é onde o problema aparece hoje). Precisa ser ancestral de HEAD.
- **Validador** (depois do 2º `--`): opcional; padrão `npm run validate-world`
  (valida `world/heart.json` contra o schema). Sai **0 = são, ≠0 = quebrado**.
- **Segurança embutida**: recusa rodar com a árvore suja (o bisect faz
  checkout de commits antigos e perderia trabalho) e **sempre** faz
  `git bisect reset` no fim, mesmo se algo explodir no meio.

**Caveat honesto:** por padrão o validador roda como ELE ERA em cada commit
(o checkout leva junto o `engine/validate.ts` daquela época). É o certo para
"quando o DADO quebrou sob as regras da época". Se o schema mudou muito no
intervalo, **fixe o validador** passando um comando que aponte para uma
versão estável (ex.: um predicado copiado para fora da árvore, ou a suíte de
testes que é estável). O script te diz o intervalo e quantos testes fará
antes de começar.

*Amarra com a lore: é a **Reversão** ao contrário — em vez de desfazer o
mundo às cegas, encontra a batida exata que precisa ser desfeita
(`git revert <culpado>`).*

---

## 2. Worktrees — `git:worktree` (várias instâncias em paz)

*Atrito de origem (16-17/07): rodar mais de um Claude no mesmo repo faz as
sessões brigarem pelo MESMO checkout — um `git checkout` puxa o tapete da
outra; um `stash` engole trabalho não commitado da outra. Aconteceu.*

`git worktree` dá a cada branch seu **próprio diretório de trabalho**, com
índice e checkout independentes, compartilhando o mesmo `.git` (mesma
história, mesmos objetos). Duas instâncias, duas pastas, nenhuma pisa na
outra.

```bash
npm run git:worktree -- <branch> [base]   # cria/abre (base padrão origin/main)
npm run git:worktree -- list              # lista os worktrees ativos
npm run git:worktree -- remove <branch>   # remove o worktree (a branch fica salva)
```

- Os worktrees nascem em `../nos-worktrees/<branch>` (irmão do repo, **fora**
  da árvore versionada) — somem com `remove`, nunca viram lixo commitado.
- Se a branch já existe (local ou remota), o comando só a abre; se não, cria
  a partir da base.
- **O jeito oficial de rodar instâncias paralelas**: cada uma `cd` para o seu
  worktree e trabalha isolada. Merge continua sendo do orquestrador.

---

## 3. Manutenção & commit-graph — `git:maintenance` (a Crônica rápida)

*Atrito antecipado (não vivido ainda): a Crônica só cresce — ~1 commit por
batida, para sempre. `log`/`blame`/`merge-base` andam a corrente de commits;
com dezenas de milhares de batidas, arrasta. E o servidor É o Actions rodando
git a cada batida.*

O **commit-graph** é um índice pré-calculado ao lado da história (posições,
ancestralidade, filtros de caminho). Com ele, essas consultas respondem em
tempo quase constante, não importa o tamanho da Crônica. É **puro cache de
leitura**: não altera um único commit, não reescreve história, não toca o
estado do jogo. Idempotente — rodar de novo é inofensivo.

```bash
npm run git:maintenance   # escreve o commit-graph + manutenção incremental
```

**Quando ligar de vez.** Enquanto a Crônica for pequena, não muda nada —
seria otimização prematura. O limiar recomendado (**D-39**) é **~5.000
batidas**. A partir daí, o passo entra no workflow do tick para manter o
índice fresco a cada N batidas.

**Pendência do ideador** (edições em `.github/workflows/` são bloqueadas para
o coder — `docs/CODER.md`): quando cruzarmos o limiar, adicionar ao
`.github/workflows/tick.yml`, logo após o checkout, um passo condicional:

```yaml
      # A cada 50 batidas, mantém o índice de leitura da Crônica fresco.
      # (commit-graph é cache puro; não altera história nem estado do jogo.)
      - name: Manter commit-graph (a cada 50 batidas)
        run: |
          N=$(git rev-list --count HEAD)
          if [ $((N % 50)) -eq 0 ]; then npm run git:maintenance; fi
```

O commit-graph é gravado dentro do `.git` (não versionado), então não gera
commit nem conflito — cada runner o reconstrói barato quando precisa.

---

## Na prateleira — recursos para puxar quando a dor chegar

Documentados aqui para não serem re-descobertos do zero; cada um espera o seu
atrito antes de virar ferramenta (o método da bancada).

- **`git notes`** — anexa metadados a commits existentes **sem criar commits
  novos** nem sujar a história. Candidato natural para enriquecer cada batida
  com estatísticas do mundo (população, clima, eventos) depois do fato, e um
  dia alimentar uma "Crônica" visível ao jogador. *Puxar quando:* houver
  dados por-batida que valham guardar mas não mereçam um commit.
- **`git bundle`** — a Crônica inteira num arquivo único offline
  (`git bundle create nos.bundle --all`), restaurável com `git clone`. Backup
  de desastre mais barato que existe para um jogo que vive 100% no GitHub.
  *Puxar quando:* quisermos um plano de backup fora do GitHub.
- **`git rerere`** — grava como um conflito foi resolvido e reaplica sozinho
  quando ele reaparece. *Puxar quando:* branches paralelas de feature
  passarem a colidir repetidamente nos mesmos arquivos.
- **partial clone** (`--filter=blob:none`) — clone raso de objetos para CI e
  jogadores quando a história pesar. *Puxar quando:* o `npm ci`/checkout do
  Actions começar a custar tempo pela história longa.

---

## Replicar num mundo novo

Os três scripts (`scripts/git-*.mjs`) são autocontidos de propósito — sem
dependências além do `git` e do Node. Copiar para um repo-mundo novo é levar
os três arquivos + as três linhas de `package.json` + este doc. O validador
padrão da forense (`validate-world`) é o único ponto a reapontar para o
validador daquele mundo.
